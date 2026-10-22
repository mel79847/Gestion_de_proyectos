/**
 * Componente Mantenimiento: ciclo de vida de la orden, reservas, entrega,
 * cambio de pieza y cierre. Las operaciones con el WMS se dejan en la bandeja
 * de salida en la misma transacción que el cambio de la orden.
 */
import { autorizar } from '../dominio/permisos.js';
import { errores } from '../dominio/errores.js';
import { ORDEN, OPERACION_PENDIENTE, transicionar } from '../dominio/estados.js';

export const TIPOS_ORDEN = Object.freeze(['correctivo', 'preventivo']);
export const PRIORIDADES = Object.freeze(['critica', 'alta', 'media', 'normal']);
export const DESTINOS_PIEZA = Object.freeze(['evaluacion', 'reparacion', 'garantia', 'resguardo', 'baja']);
export const CONDICIONES_PIEZA = Object.freeze(['desgastada', 'danada', 'en_garantia', 'reutilizable']);

const RESERVA_ACTIVA = ['Solicitada', 'Confirmada'];

export function crearServicioOrdenes(ctx, soporte) {
  const { db } = ctx;

  async function obtener(repos, numero) {
    const o = await repos.ordenes.obtener(numero);
    if (!o) throw errores.noEncontrado('Orden', numero);
    return o;
  }

  async function cambiarEstado(repos, usuario, orden, evento, extra = {}, motivo = null) {
    const estado = transicionar(ORDEN, orden.estado, evento);
    const actualizada = await repos.ordenes.actualizar(orden.numero, { estado, ...extra });
    await soporte.auditar(repos, usuario, `orden.${evento}`, 'orden', orden.numero, {
      antes: { estado: orden.estado },
      despues: { estado, ...extra },
      motivo,
    });
    return actualizada;
  }

  /** Crea las reservas pendientes de una orden y sus operaciones hacia el WMS. */
  async function encolarReservas(repos, usuario, orden) {
    const reservas = await repos.reservas.listarPorOrden(orden.numero);
    const creadas = [];
    for (const d of orden.detalles) {
      const activa = reservas.find((r) => r.detalle_id === d.id && RESERVA_ACTIVA.includes(r.estado));
      const faltante = d.cantidad - d.cantidad_reservada;
      if (activa || faltante <= 0) continue;
      const reserva = await repos.reservas.insertar({
        orden: orden.numero,
        detalle_id: d.id,
        material: d.material,
        almacen: orden.almacen,
        cantidad: faltante,
        estado: 'Solicitada',
        ref_wms: null,
        id_operacion: null,
        operacion_salida: null,
        creada_en: soporte.ahoraIso(),
      });
      const op = await soporte.encolar(repos, {
        tipo: 'RESERVA',
        destino: 'WMS',
        entidad: 'reserva',
        entidad_id: reserva.id,
        orden: orden.numero,
        mensaje: { orden: orden.numero, material: d.material, almacen: orden.almacen, cantidad: faltante },
      });
      await repos.reservas.actualizar(reserva.id, { id_operacion: op.id });
      await soporte.auditar(repos, usuario, 'reserva.solicitar', 'reserva', reserva.id, {
        despues: { orden: orden.numero, material: d.material, cantidad: faltante, operacion: op.id },
      });
      creadas.push({ ...reserva, id_operacion: op.id });
    }
    return creadas;
  }

  return {
    encolarReservas,

    async listar(usuario, filtro = {}) {
      autorizar(usuario, 'orden.leer');
      return db.repos.ordenes.listar(filtro);
    },

    async obtener(usuario, numero) {
      autorizar(usuario, 'orden.leer');
      const repos = db.repos;
      const orden = await obtener(repos, numero);
      const [reservas, movimientos, cambios, operaciones] = await Promise.all([
        repos.reservas.listarPorOrden(numero),
        repos.movimientos.listarPorOrden(numero),
        repos.cambios.listarPorOrden(numero),
        repos.operaciones.listar({ orden: numero }),
      ]);
      const pendientes = operaciones.filter((o) => OPERACION_PENDIENTE.includes(o.estado));
      return { ...orden, reservas, movimientos, cambios, operaciones, operaciones_pendientes: pendientes.length };
    },

    /** RF-05: registra la orden; solo acepta materiales compatibles con el equipo. */
    async crear(usuario, datos) {
      autorizar(usuario, 'orden.crear');
      const { equipo, tipo, prioridad, diagnostico, fecha_requerida } = datos;
      if (!equipo || !diagnostico || !fecha_requerida) throw errores.validacion('Equipo, diagnóstico y fecha requerida son obligatorios.');
      if (!TIPOS_ORDEN.includes(tipo)) throw errores.validacion(`Tipo de orden no válido: ${tipo}.`);
      if (!PRIORIDADES.includes(prioridad)) throw errores.validacion(`Prioridad no válida: ${prioridad}.`);
      const lineas = new Map();
      for (const m of datos.materiales ?? []) {
        const cantidad = Number(m.cantidad);
        if (!Number.isInteger(cantidad) || cantidad <= 0) throw errores.validacion(`Cantidad no válida para ${m.material}.`);
        lineas.set(m.material, (lineas.get(m.material) ?? 0) + cantidad);
      }
      if (!lineas.size) throw errores.validacion('La orden debe indicar al menos un material.');

      return db.transaccion(async (repos) => {
        const eq = await repos.equipos.obtener(equipo);
        if (!eq) throw errores.noEncontrado('Equipo', equipo);
        const incompatibles = [];
        for (const material of lineas.keys()) {
          if (!(await repos.materiales.obtener(material))) throw errores.noEncontrado('Material', material);
          if (!(await repos.compatibilidad.esCompatible(material, equipo))) incompatibles.push(material);
        }
        if (incompatibles.length) {
          throw errores.regla('MATERIAL_INCOMPATIBLE', `No compatible con ${equipo}: ${incompatibles.join(', ')}.`, { incompatibles, equipo });
        }
        const numero = await repos.ordenes.siguienteNumero(ctx.reloj.ahora().getFullYear());
        const orden = await repos.ordenes.insertar({
          numero,
          equipo,
          tipo,
          prioridad,
          diagnostico: diagnostico.trim(),
          fecha_requerida,
          almacen: eq.almacen,
          estado: 'Registrada',
          tecnico: usuario.usuario,
          supervisor: null,
          creada_en: soporte.ahoraIso(),
          validada_en: null,
          cerrada_en: null,
          detalles: [...lineas].map(([material, cantidad]) => ({ material, cantidad, cantidad_reservada: 0, cantidad_entregada: 0 })),
        });
        await soporte.auditar(repos, usuario, 'orden.crear', 'orden', numero, { despues: { equipo, prioridad, materiales: Object.fromEntries(lineas) } });
        return orden;
      });
    },

    /** RF-06 */
    async validar(usuario, numero) {
      autorizar(usuario, 'orden.validar');
      return db.transaccion(async (repos) => {
        const o = await obtener(repos, numero);
        return cambiarEstado(repos, usuario, o, 'validar', { supervisor: usuario.usuario, validada_en: soporte.ahoraIso() });
      });
    },

    /** RF-08: deja en la bandeja una reserva por cada material aún no reservado. */
    async solicitarReservas(usuario, numero) {
      autorizar(usuario, 'reserva.solicitar');
      return db.transaccion(async (repos) => {
        const o = await obtener(repos, numero);
        if (!['Validada', 'En espera de repuestos'].includes(o.estado)) {
          throw errores.regla('ESTADO_NO_PERMITE_RESERVA', `La orden está en "${o.estado}"; debe estar validada.`);
        }
        const creadas = await encolarReservas(repos, usuario, o);
        if (!creadas.length) throw errores.regla('NADA_QUE_RESERVAR', 'Todos los materiales ya tienen una reserva activa o confirmada.');
        return creadas;
      });
    },

    /** RF-09: entrega en ventanilla; la salida se confirma en el WMS por la bandeja de salida. */
    async registrarEntrega(usuario, numero, { receptor }) {
      autorizar(usuario, 'entrega.registrar');
      if (!receptor) throw errores.validacion('Indique quién recibe el material.');
      return db.transaccion(async (repos) => {
        const o = await obtener(repos, numero);
        if (o.estado !== 'Materiales reservados') throw errores.regla('ESTADO_NO_PERMITE_ENTREGA', `La orden está en "${o.estado}".`);
        const reservas = (await repos.reservas.listarPorOrden(numero)).filter((r) => r.estado === 'Confirmada' && !r.operacion_salida);
        if (!reservas.length) throw errores.regla('SIN_RESERVAS', 'No hay reservas confirmadas por entregar.');
        const ops = [];
        for (const r of reservas) {
          const op = await soporte.encolar(repos, {
            tipo: 'SALIDA',
            destino: 'WMS',
            entidad: 'reserva',
            entidad_id: r.id,
            orden: numero,
            mensaje: { orden: numero, ref_reserva: r.ref_wms, material: r.material, almacen: r.almacen, cantidad: r.cantidad, receptor, entregado_por: usuario.usuario },
          });
          await repos.reservas.actualizar(r.id, { operacion_salida: op.id });
          ops.push(op);
        }
        await soporte.auditar(repos, usuario, 'entrega.registrar', 'orden', numero, { despues: { receptor, operaciones: ops.map((x) => x.id) } });
        return ops;
      });
    },

    /** RF-10: libera una reserva confirmada que ya no se usará. */
    async liberarReserva(usuario, reservaId, motivo) {
      autorizar(usuario, 'reserva.liberar');
      if (!motivo) throw errores.validacion('Indique el motivo de la liberación.');
      return db.transaccion(async (repos) => {
        const r = await repos.reservas.obtener(reservaId);
        if (!r) throw errores.noEncontrado('Reserva', reservaId);
        if (r.estado !== 'Confirmada' || r.operacion_salida) throw errores.regla('RESERVA_NO_LIBERABLE', `La reserva está en "${r.estado}".`);
        const op = await soporte.encolar(repos, {
          tipo: 'LIBERACION',
          destino: 'WMS',
          entidad: 'reserva',
          entidad_id: r.id,
          orden: r.orden,
          mensaje: { ref_reserva: r.ref_wms, orden: r.orden, material: r.material, motivo },
        });
        await repos.reservas.actualizar(r.id, { operacion_salida: op.id });
        await soporte.auditar(repos, usuario, 'reserva.liberar', 'reserva', r.id, { motivo, despues: { operacion: op.id } });
        return op;
      });
    },

    /** RF-11: exige una salida confirmada del mismo material; la pieza retirada no vuelve al stock. */
    async registrarCambioPieza(usuario, numero, datos) {
      autorizar(usuario, 'cambio.registrar');
      const { material, pieza_retirada, condicion, destino, serie_instalada = null, observacion = null } = datos;
      if (!DESTINOS_PIEZA.includes(destino)) throw errores.validacion(`Destino no válido. Use: ${DESTINOS_PIEZA.join(', ')}.`);
      if (!CONDICIONES_PIEZA.includes(condicion)) throw errores.validacion(`Condición no válida. Use: ${CONDICIONES_PIEZA.join(', ')}.`);
      if (!pieza_retirada) throw errores.validacion('Describa la pieza retirada.');
      return db.transaccion(async (repos) => {
        const o = await obtener(repos, numero);
        if (o.estado !== 'En ejecución') throw errores.regla('ESTADO_NO_PERMITE_CAMBIO', `La orden está en "${o.estado}".`);
        const salida = (await repos.movimientos.listarPorOrden(numero)).find((m) => m.tipo === 'SALIDA' && m.material === material);
        if (!salida) throw errores.regla('SIN_SALIDA_CONFIRMADA', `No existe salida confirmada de ${material} para ${numero}.`);
        const cambio = await repos.cambios.insertar({
          orden: numero,
          movimiento_id: salida.id,
          material,
          serie_instalada: serie_instalada ?? salida.lotes?.[0]?.serie ?? null,
          lote_instalado: salida.lotes?.[0]?.lote ?? null,
          pieza_retirada,
          condicion,
          destino,
          observacion,
          tecnico: usuario.usuario,
          fecha: soporte.ahoraIso(),
        });
        await soporte.auditar(repos, usuario, 'cambio.registrar', 'orden', numero, { despues: cambio });
        return cambio;
      });
    },

    async completar(usuario, numero) {
      autorizar(usuario, 'orden.completar');
      return db.transaccion(async (repos) => {
        const o = await obtener(repos, numero);
        if (o.tipo === 'correctivo' && !(await repos.cambios.listarPorOrden(numero)).length) {
          throw errores.regla('FALTA_CAMBIO_PIEZA', 'Una orden correctiva requiere registrar el cambio de pieza.');
        }
        return cambiarEstado(repos, usuario, o, 'completar');
      });
    },

    /** RF-12: bloquea el cierre e indica la causa. */
    async cerrar(usuario, numero) {
      autorizar(usuario, 'orden.cerrar');
      return db.transaccion(async (repos) => {
        const o = await obtener(repos, numero);
        const pendientes = (await repos.operaciones.listar({ orden: numero })).filter((x) => OPERACION_PENDIENTE.includes(x.estado));
        if (pendientes.length) {
          throw errores.regla(
            'CIERRE_BLOQUEADO',
            `No se puede cerrar: ${pendientes.length} operación(es) sin confirmar (${pendientes.map((p) => `${p.tipo} ${p.estado}`).join(', ')}).`,
            { pendientes: pendientes.map((p) => ({ id: p.id, tipo: p.tipo, estado: p.estado, causa: p.causa })) },
          );
        }
        const abiertas = (await repos.reservas.listarPorOrden(numero)).filter((r) => r.estado === 'Confirmada');
        if (abiertas.length) throw errores.regla('CIERRE_BLOQUEADO', `Hay ${abiertas.length} reserva(s) confirmada(s) sin entregar ni liberar.`);
        return cambiarEstado(repos, usuario, o, 'cerrar', { cerrada_en: soporte.ahoraIso() });
      });
    },

    async anular(usuario, numero, motivo) {
      autorizar(usuario, 'orden.anular');
      if (!motivo) throw errores.validacion('Indique el motivo de la anulación.');
      return db.transaccion(async (repos) => {
        const o = await obtener(repos, numero);
        const activas = (await repos.reservas.listarPorOrden(numero)).filter((r) => RESERVA_ACTIVA.includes(r.estado));
        if (activas.length) throw errores.regla('ANULACION_BLOQUEADA', 'Libere primero las reservas activas.');
        return cambiarEstado(repos, usuario, o, 'anular', {}, motivo);
      });
    },

    /** Recalcula el estado de la orden a partir de sus reservas (lo usa el trabajador). */
    async actualizarPorReservas(repos, usuario, numero) {
      const o = await obtener(repos, numero);
      if (!['Validada', 'En espera de repuestos'].includes(o.estado)) return o;
      const reservas = await repos.reservas.listarPorOrden(numero);
      const ultimaPorDetalle = o.detalles.map((d) => reservas.filter((r) => r.detalle_id === d.id).at(-1));
      if (ultimaPorDetalle.some((r) => r?.estado === 'Rechazada')) {
        return o.estado === 'En espera de repuestos' ? o : cambiarEstado(repos, usuario, o, 'reservaRechazada');
      }
      if (o.detalles.every((d) => d.cantidad_reservada >= d.cantidad)) return cambiarEstado(repos, usuario, o, 'reservaConfirmada');
      return o;
    },

    /** Pasa la orden a En ejecución cuando todas las salidas están confirmadas. */
    async actualizarPorSalidas(repos, usuario, numero) {
      const o = await obtener(repos, numero);
      if (o.estado !== 'Materiales reservados') return o;
      if (o.detalles.every((d) => d.cantidad_entregada >= d.cantidad)) return cambiarEstado(repos, usuario, o, 'iniciar');
      return o;
    },
  };
}
