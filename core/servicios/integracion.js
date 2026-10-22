/**
 * Trabajador de integración: transmite la bandeja de salida al WMS y al ERP.
 *
 * Garantías (RF-21, RNF-03, RNF-04):
 *  - Cada operación viaja con su id_operacion como clave de idempotencia; el reenvío usa el mismo id.
 *  - Antes de reenviar, se consulta el estado por id: si el sistema externo ya la aplicó,
 *    se recupera su respuesta y no se envía de nuevo (confirmación perdida).
 *  - Los reintentos esperan 2^n × base; al agotar el límite se registra una incidencia con causa.
 *  - Las llamadas externas se hacen fuera de la transacción; el resultado se aplica en una
 *    transacción propia, junto con su efecto en reservas, órdenes y solicitudes.
 */
import { autorizar } from '../dominio/permisos.js';
import { errores, ErrorIntegracion } from '../dominio/errores.js';
import { OPERACION, RESERVA, SOLICITUD, transicionar } from '../dominio/estados.js';
import { USUARIO_SISTEMA } from './soporte.js';

const RESPONSABLE = { WMS: 'almacen', ERP: 'comprador' };

export function crearServicioIntegracion(ctx, soporte, { ordenes, compras }) {
  const { db } = ctx;
  const destinos = { WMS: ctx.wms, ERP: ctx.erp };
  const sistema = USUARIO_SISTEMA;

  async function cambiarOperacion(repos, op, evento, patch = {}) {
    const estado = transicionar(OPERACION, op.estado, evento);
    return repos.operaciones.actualizar(op.id, { estado, ...patch });
  }

  async function resolverIncidenciasDe(repos, op, resolucion) {
    for (const inc of await repos.incidencias.listar({ operacion_id: op.id, estado: 'Abierta' })) {
      await repos.incidencias.actualizar(inc.id, { estado: 'Resuelta', resuelta_en: soporte.ahoraIso(), resolucion });
    }
  }

  // ---------- efectos de negocio de cada respuesta ----------

  const efectos = {
    async RESERVA(repos, op, r, confirmada) {
      const reserva = await repos.reservas.obtener(op.entidad_id);
      if (confirmada) {
        await repos.reservas.actualizar(reserva.id, { estado: transicionar(RESERVA, reserva.estado, 'confirmar'), ref_wms: r.ref_reserva });
        const orden = await repos.ordenes.obtener(reserva.orden);
        const d = orden.detalles.find((x) => x.id === reserva.detalle_id);
        await repos.ordenes.actualizarDetalle(d.id, { cantidad_reservada: d.cantidad_reservada + reserva.cantidad });
        await ordenes.actualizarPorReservas(repos, sistema, reserva.orden);
        return;
      }
      await repos.reservas.actualizar(reserva.id, { estado: transicionar(RESERVA, reserva.estado, 'rechazar') });
      await ordenes.actualizarPorReservas(repos, sistema, reserva.orden);
      await soporte.alertar(repos, {
        tipo: 'ORDEN_EN_ESPERA',
        prioridad: 'alta',
        destinatario_rol: 'supervisor',
        entidad: 'orden',
        entidad_id: reserva.orden,
        mensaje: `${reserva.orden} en espera: ${reserva.material} con ${r.disponible ?? 0} disponible(s) para ${reserva.cantidad} solicitada(s).`,
      });
      if (r.causa === 'STOCK_INSUFICIENTE') {
        try {
          await compras.evaluarReposicion(repos, sistema, reserva.material, { origen: 'FALTA_STOCK', orden: reserva.orden, almacen: reserva.almacen });
        } catch (e) {
          if (!(e instanceof ErrorIntegracion)) throw e;
        }
      }
    },

    async SALIDA(repos, op, r, confirmada) {
      const reserva = await repos.reservas.obtener(op.entidad_id);
      if (!confirmada) {
        await repos.reservas.actualizar(reserva.id, { operacion_salida: null });
        return;
      }
      await repos.reservas.actualizar(reserva.id, { estado: transicionar(RESERVA, reserva.estado, 'consumir') });
      const orden = await repos.ordenes.obtener(reserva.orden);
      const d = orden.detalles.find((x) => x.id === reserva.detalle_id);
      await repos.ordenes.actualizarDetalle(d.id, { cantidad_entregada: d.cantidad_entregada + reserva.cantidad });
      let cpp = null;
      try {
        cpp = (await ctx.erp.consultarValoracion({ material: reserva.material })).cpp;
      } catch (e) {
        if (!(e instanceof ErrorIntegracion)) throw e;
      }
      await repos.movimientos.insertar({
        tipo: 'SALIDA',
        orden: reserva.orden,
        reserva_id: reserva.id,
        material: reserva.material,
        almacen: reserva.almacen,
        cantidad: reserva.cantidad,
        lotes: r.lotes ?? [],
        ref_wms: r.ref_movimiento,
        receptor: op.mensaje.receptor,
        costo_unitario: cpp,
        costo_total: cpp === null ? null : Math.round(cpp * reserva.cantidad * 100) / 100,
        fecha: soporte.ahoraIso(),
      });
      await ordenes.actualizarPorSalidas(repos, sistema, reserva.orden);
      await compras.evaluarTrasSalida(repos, reserva.material, reserva.almacen);
    },

    async LIBERACION(repos, op, r, confirmada) {
      const reserva = await repos.reservas.obtener(op.entidad_id);
      if (!confirmada) {
        await repos.reservas.actualizar(reserva.id, { operacion_salida: null });
        return;
      }
      await repos.reservas.actualizar(reserva.id, { estado: transicionar(RESERVA, reserva.estado, 'liberar') });
      const orden = await repos.ordenes.obtener(reserva.orden);
      const d = orden.detalles.find((x) => x.id === reserva.detalle_id);
      await repos.ordenes.actualizarDetalle(d.id, { cantidad_reservada: Math.max(0, d.cantidad_reservada - reserva.cantidad) });
      await repos.movimientos.insertar({
        tipo: 'LIBERACION', orden: reserva.orden, reserva_id: reserva.id, material: reserva.material, almacen: reserva.almacen,
        cantidad: reserva.cantidad, lotes: [], ref_wms: r.ref_movimiento ?? null, receptor: null, costo_unitario: null, costo_total: null,
        fecha: soporte.ahoraIso(),
      });
    },

    async SOLICITUD_COMPRA(repos, op, r, confirmada) {
      const s = await repos.solicitudes.obtener(op.entidad_id);
      if (confirmada) {
        await repos.solicitudes.actualizar(s.numero, {
          estado: transicionar(SOLICITUD, s.estado, 'ocCreada'),
          numero_oc: r.numero_oc,
          fecha_prometida: r.fecha_prometida,
        });
        await soporte.auditar(repos, sistema, 'solicitud.oc_creada', 'solicitud', s.numero, { despues: { numero_oc: r.numero_oc, fecha_prometida: r.fecha_prometida } });
        return;
      }
      await repos.solicitudes.actualizar(s.numero, { estado: transicionar(SOLICITUD, s.estado, 'rechazar') });
    },
  };

  async function aplicarRespuesta(repos, opReclamada, r) {
    const op = await repos.operaciones.obtener(opReclamada.id);
    const confirmada = r.resultado === 'confirmada';
    const ahora = soporte.ahoraIso();
    await cambiarOperacion(repos, op, confirmada ? 'confirmar' : 'rechazar', {
      respuesta: r,
      causa: confirmada ? null : r.causa,
      confirmada_en: confirmada ? ahora : null,
    });
    await efectos[op.tipo](repos, op, r, confirmada);
    if (r.recuperada) {
      await soporte.registrarIncidencia(repos, {
        codigo: 'CONFIRMACION_PERDIDA',
        operacion_id: op.id,
        entidad: op.entidad,
        entidad_id: op.entidad_id,
        causa: `La respuesta de ${op.destino} no llegó; se consultó el id ${op.id} y ya estaba aplicada.`,
        responsable_rol: RESPONSABLE[op.destino],
      }).then((inc) => repos.incidencias.actualizar(inc.id, { estado: 'Resuelta', resuelta_en: ahora, resolucion: 'Recuperada por id sin reenviar.' }));
    }
    if (!confirmada) {
      await soporte.registrarIncidencia(repos, {
        codigo: r.causa ?? 'DATOS_INVALIDOS',
        operacion_id: op.id,
        entidad: op.entidad,
        entidad_id: op.entidad_id,
        causa: r.mensaje ?? `${op.destino} rechazó la operación ${op.tipo}.`,
        responsable_rol: RESPONSABLE[op.destino],
      });
    }
    await resolverIncidenciasDe(repos, op, confirmada ? 'Operación confirmada tras recuperar la comunicación.' : 'Operación rechazada por el sistema externo.');
    await soporte.auditar(repos, sistema, `operacion.${confirmada ? 'confirmada' : 'rechazada'}`, 'operacion', op.id, {
      despues: { tipo: op.tipo, destino: op.destino, intentos: op.intentos, recuperada: Boolean(r.recuperada), causa: r.causa ?? null },
    });
    return { id: op.id, tipo: op.tipo, resultado: r.resultado, recuperada: Boolean(r.recuperada) };
  }

  async function registrarFalla(repos, opReclamada, error) {
    const op = await repos.operaciones.obtener(opReclamada.id);
    if (op.intentos >= op.limite_intentos) {
      await cambiarOperacion(repos, op, 'agotar', { causa: error.message });
      const codigo = `${op.destino}_SIN_RESPUESTA`;
      await soporte.registrarIncidencia(repos, {
        codigo,
        operacion_id: op.id,
        entidad: op.entidad,
        entidad_id: op.entidad_id,
        causa: `${op.tipo} sin confirmar tras ${op.intentos} intentos: ${error.message}`,
        responsable_rol: RESPONSABLE[op.destino],
      });
      await soporte.alertar(repos, {
        tipo: codigo,
        prioridad: 'alta',
        destinatario_rol: RESPONSABLE[op.destino],
        entidad: 'operacion',
        entidad_id: op.id,
        mensaje: `${op.tipo} de ${op.orden ?? op.entidad_id} quedó en incidencia: ${op.destino} no responde.`,
      });
      return { id: op.id, tipo: op.tipo, resultado: 'incidencia' };
    }
    const espera = ctx.config.backoffBaseMs * 2 ** (op.intentos - 1);
    const proximo = new Date(ctx.reloj.ahora().getTime() + espera).toISOString();
    await cambiarOperacion(repos, op, 'fallar', { causa: error.message, proximo_intento: proximo });
    return { id: op.id, tipo: op.tipo, resultado: 'reintento', espera_ms: espera };
  }

  async function transmitir(op) {
    const cliente = destinos[op.destino];
    let respuesta = null;
    try {
      if (op.intentos > 1) {
        const consulta = await cliente.consultarOperacion(op.id);
        if (consulta.encontrada) respuesta = { ...consulta.resultado, recuperada: true };
      }
      if (!respuesta) respuesta = await cliente.enviar(op);
    } catch (e) {
      if (!(e instanceof ErrorIntegracion)) throw e;
      return db.transaccion((repos) => registrarFalla(repos, op, e));
    }
    return db.transaccion((repos) => aplicarRespuesta(repos, op, respuesta));
  }

  return {
    /** Un ciclo del trabajador: reclama operaciones listas y las transmite. */
    async procesarPendientes({ limite = 20 } = {}) {
      const ahora = ctx.reloj.ahora();
      const reclamadas = await db.transaccion(async (repos) => {
        const listas = await repos.operaciones.procesables({
          ahora: ahora.toISOString(),
          enviadaAntesDe: new Date(ahora.getTime() - ctx.config.tiempoEsperaMs).toISOString(),
          limite,
        });
        const salida = [];
        for (const op of listas) {
          const evento = op.estado === 'Enviada' ? null : 'enviar';
          const estado = evento ? transicionar(OPERACION, op.estado, evento) : op.estado;
          salida.push(await repos.operaciones.actualizar(op.id, { estado, intentos: op.intentos + 1, enviada_en: ahora.toISOString() }));
        }
        return salida;
      });
      const resultados = [];
      for (const op of reclamadas) resultados.push(await transmitir(op));
      return resultados;
    },

    /**
     * Procesa una operación concreta (la entrega el consumidor de RabbitMQ). Si otro
     * trabajador ya la tomó o aún no le toca, no hace nada: la base de datos decide.
     */
    async procesarOperacion(id) {
      const ahora = ctx.reloj.ahora();
      const op = await db.transaccion(async (repos) => {
        const [lista] = await repos.operaciones.procesables({
          ahora: ahora.toISOString(),
          enviadaAntesDe: new Date(ahora.getTime() - ctx.config.tiempoEsperaMs).toISOString(),
          limite: 1,
          id,
        });
        if (!lista) return null;
        const estado = lista.estado === 'Enviada' ? lista.estado : transicionar(OPERACION, lista.estado, 'enviar');
        return repos.operaciones.actualizar(lista.id, { estado, intentos: lista.intentos + 1, enviada_en: ahora.toISOString() });
      });
      return op ? transmitir(op) : null;
    },

    /** Sincronización de respaldo (cada 15 min): recupera por id lo que quedó en incidencia. */
    async sincronizacionRespaldo() {
      const enIncidencia = await db.repos.operaciones.listar({ estado: 'Incidencia' });
      const recuperadas = [];
      for (const op of enIncidencia) {
        try {
          const consulta = await destinos[op.destino].consultarOperacion(op.id);
          if (consulta.encontrada) {
            recuperadas.push(await db.transaccion((repos) => aplicarRespuesta(repos, op, { ...consulta.resultado, recuperada: true })));
          }
        } catch (e) {
          if (!(e instanceof ErrorIntegracion)) throw e;
        }
      }
      return { revisadas: enIncidencia.length, recuperadas };
    },

    async listarOperaciones(usuario, filtro = {}) {
      autorizar(usuario, 'integracion.leer');
      return db.repos.operaciones.listar(filtro);
    },

    /** Reproceso manual: vuelve a la cola con el mismo id (no se crea otra operación). */
    async reprocesar(usuario, id) {
      autorizar(usuario, 'integracion.reprocesar');
      return db.transaccion(async (repos) => {
        const op = await repos.operaciones.obtener(id);
        if (!op) throw errores.noEncontrado('Operación', id);
        const actualizada = await cambiarOperacion(repos, op, 'reprocesar', {
          limite_intentos: op.intentos + ctx.config.maxIntentos,
          proximo_intento: soporte.ahoraIso(),
        });
        await soporte.auditar(repos, usuario, 'operacion.reprocesar', 'operacion', id, { antes: { estado: op.estado }, despues: { estado: actualizada.estado } });
        return actualizada;
      });
    },

    /** Conciliación (RF-23): compara existencias del WMS con las del ERP y registra diferencias. */
    async conciliar(usuario) {
      autorizar(usuario, 'integracion.conciliar');
      const materiales = await db.repos.materiales.listar();
      const fecha = soporte.ahoraIso();
      const resultado = [];
      for (const m of materiales) {
        const wms = await ctx.wms.consultarDisponibilidad({ material: m.codigo });
        const erp = await ctx.erp.consultarValoracion({ material: m.codigo });
        const diferencia = wms.fisico - erp.existencias;
        const fila = { fecha_corte: fecha, material: m.codigo, valor_wms: wms.fisico, valor_erp: erp.existencias, diferencia, estado: diferencia === 0 ? 'Conforme' : 'Con diferencia' };
        resultado.push(fila);
        if (diferencia !== 0) {
          await db.transaccion(async (repos) => {
            const c = await repos.conciliaciones.insertar(fila);
            await soporte.registrarIncidencia(repos, {
              codigo: 'DIFERENCIA_CONCILIACION',
              entidad: 'conciliacion',
              entidad_id: c.id,
              causa: `${m.codigo}: WMS ${wms.fisico} y ERP ${erp.existencias} (diferencia ${diferencia}).`,
              responsable_rol: 'almacen',
            });
          });
        }
      }
      await db.transaccion((repos) => soporte.auditar(repos, usuario, 'conciliacion.ejecutar', 'conciliacion', fecha, { despues: { materiales: resultado.length, diferencias: resultado.filter((r) => r.diferencia).length } }));
      return resultado;
    },
  };
}
