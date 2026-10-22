/**
 * Eventos que el WMS y el ERP envían a la solución (webhooks).
 * Cada evento trae un id_evento; si llega dos veces se registra una sola vez.
 */
import { errores } from '../dominio/errores.js';
import { SOLICITUD, transicionar } from '../dominio/estados.js';
import { USUARIO_SISTEMA } from './soporte.js';

export function crearServicioWebhooks(ctx, soporte, { ordenes }) {
  const { db } = ctx;
  const sistema = USUARIO_SISTEMA;

  async function registrarEntrante(repos, origen, evento) {
    if (!evento?.id_evento || !evento?.evento) throw errores.validacion('El evento debe incluir id_evento y evento.');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(evento.id_evento)) {
      throw errores.validacion('id_evento debe ser un UUID.');
    }
    const previo = await repos.operaciones.obtener(evento.id_evento);
    if (previo) return { duplicado: true, operacion: previo };
    const ahora = soporte.ahoraIso();
    const op = await repos.operaciones.insertar({
      id: evento.id_evento,
      tipo: evento.evento,
      destino: 'SOLUCION',
      direccion: 'ENTRANTE',
      entidad: 'evento',
      entidad_id: origen,
      orden: null,
      mensaje: evento,
      estado: 'Confirmada',
      intentos: 1,
      limite_intentos: 1,
      proximo_intento: ahora,
      respuesta: null,
      causa: null,
      creada_en: ahora,
      enviada_en: ahora,
      confirmada_en: ahora,
    });
    return { duplicado: false, operacion: op };
  }

  /** recepcion.aceptada: solo la cantidad aceptada por el WMS cuenta (RF-17). */
  async function recepcionAceptada(repos, e) {
    const s = await repos.solicitudes.obtenerPorOc(e.orden_compra);
    if (!s) throw errores.validacion(`La OC ${e.orden_compra} no corresponde a ninguna solicitud.`);
    const aceptada = Number(e.cantidad_aceptada);
    if (!(aceptada >= 0) || aceptada > Number(e.cantidad_recibida)) throw errores.validacion('La cantidad aceptada no puede superar la recibida.');
    await repos.recepciones.insertar({
      solicitud: s.numero,
      numero_oc: e.orden_compra,
      material: e.material,
      cantidad_recibida: Number(e.cantidad_recibida),
      cantidad_aceptada: aceptada,
      lote: e.lote ?? null,
      vence: e.fecha_vencimiento ?? null,
      ref_wms: e.ref_ingreso ?? null,
      fecha: soporte.ahoraIso(),
    });
    const acumulado = s.cantidad_recibida + aceptada;
    const evento = acumulado >= s.cantidad ? 'recepcionTotal' : 'recepcionParcial';
    const estado = transicionar(SOLICITUD, s.estado, evento);
    await repos.solicitudes.actualizar(s.numero, { estado, cantidad_recibida: acumulado });
    await soporte.auditar(repos, sistema, `solicitud.${evento}`, 'solicitud', s.numero, {
      antes: { estado: s.estado, cantidad_recibida: s.cantidad_recibida },
      despues: { estado, cantidad_recibida: acumulado },
    });
    if (evento === 'recepcionParcial') {
      await soporte.alertar(repos, {
        tipo: 'RECEPCION_PARCIAL',
        destinatario_rol: 'comprador',
        entidad: 'solicitud',
        entidad_id: s.numero,
        mensaje: `${e.orden_compra}: ingresaron ${aceptada}; saldo pendiente ${s.cantidad - acumulado}.`,
      });
    }
    // Una recepción aceptada permite reintentar la reserva de las órdenes en espera.
    const reintentos = [];
    for (const o of await repos.ordenes.listar({ estado: 'En espera de repuestos' })) {
      const orden = await repos.ordenes.obtener(o.numero);
      if (orden.detalles.some((d) => d.material === e.material && d.cantidad_reservada < d.cantidad)) {
        reintentos.push(...(await ordenes.encolarReservas(repos, sistema, orden)));
      }
    }
    return { solicitud: s.numero, estado, reservas_reintentadas: reintentos.map((r) => r.orden) };
  }

  return {
    async recibirWms(evento) {
      return db.transaccion(async (repos) => {
        const reg = await registrarEntrante(repos, 'WMS', evento);
        if (reg.duplicado) return { duplicado: true, id_evento: evento.id_evento };
        if (evento.evento === 'recepcion.aceptada') return { duplicado: false, ...(await recepcionAceptada(repos, evento)) };
        if (evento.evento === 'transferencia.vencida') {
          await soporte.alertar(repos, {
            tipo: 'TRANSFERENCIA_VENCIDA', prioridad: 'alta', destinatario_rol: 'almacen', entidad: 'material', entidad_id: evento.material,
            mensaje: `Transferencia ${evento.ref ?? ''} de ${evento.material} sin confirmar en destino.`,
          });
          return { duplicado: false };
        }
        throw errores.validacion(`Evento WMS no soportado: ${evento.evento}.`);
      });
    },

    async recibirErp(evento) {
      return db.transaccion(async (repos) => {
        const reg = await registrarEntrante(repos, 'ERP', evento);
        if (reg.duplicado) return { duplicado: true, id_evento: evento.id_evento };
        if (evento.evento === 'oc.reprogramada') {
          const s = await repos.solicitudes.obtenerPorOc(evento.orden_compra);
          if (!s) throw errores.validacion(`OC desconocida: ${evento.orden_compra}.`);
          await repos.solicitudes.actualizar(s.numero, { fecha_prometida: evento.fecha_prometida });
          await soporte.registrarIncidencia(repos, {
            codigo: 'PROVEEDOR_RETRASADO', entidad: 'solicitud', entidad_id: s.numero, responsable_rol: 'comprador',
            causa: `${evento.orden_compra}: nueva fecha ${evento.fecha_prometida} (antes ${s.fecha_prometida}).`,
          });
          await soporte.alertar(repos, {
            tipo: 'PROVEEDOR_RETRASADO', prioridad: 'alta', destinatario_rol: 'comprador', entidad: 'solicitud', entidad_id: s.numero,
            mensaje: `El proveedor reprogramó ${evento.orden_compra} al ${evento.fecha_prometida}.`,
          });
          return { duplicado: false, solicitud: s.numero };
        }
        throw errores.validacion(`Evento ERP no soportado: ${evento.evento}.`);
      });
    },
  };
}
