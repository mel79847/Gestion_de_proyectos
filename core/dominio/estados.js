/**
 * Máquinas de estado de la fase de modelado. Toda transición pasa por `transicionar`,
 * de modo que ningún servicio puede dejar un objeto en un estado no previsto.
 */
import { errores } from './errores.js';

const maquina = (nombre, transiciones) => Object.freeze({ nombre, transiciones });

export const ORDEN = maquina('orden', {
  Registrada: { validar: 'Validada', anular: 'Anulada' },
  Validada: { reservaConfirmada: 'Materiales reservados', reservaRechazada: 'En espera de repuestos', anular: 'Anulada' },
  'En espera de repuestos': { reservaConfirmada: 'Materiales reservados', reservaRechazada: 'En espera de repuestos', anular: 'Anulada' },
  'Materiales reservados': { iniciar: 'En ejecución' },
  'En ejecución': { completar: 'Pendiente de verificación' },
  'Pendiente de verificación': { cerrar: 'Cerrada' },
  Cerrada: {},
  Anulada: {},
});

export const RESERVA = maquina('reserva', {
  Solicitada: { confirmar: 'Confirmada', rechazar: 'Rechazada' },
  Confirmada: { consumir: 'Consumida', liberar: 'Liberada' },
  Rechazada: {},
  Consumida: {},
  Liberada: {},
});

export const SOLICITUD = maquina('solicitud', {
  Borrador: { aprobar: 'Aprobada', rechazar: 'Rechazada' },
  Aprobada: { enviar: 'Enviada al ERP', anular: 'Anulada' },
  'Enviada al ERP': { ocCreada: 'OC creada', rechazar: 'Rechazada' },
  'OC creada': { recepcionParcial: 'Recibida parcial', recepcionTotal: 'Recibida' },
  'Recibida parcial': { recepcionParcial: 'Recibida parcial', recepcionTotal: 'Recibida' },
  Recibida: {},
  Rechazada: {},
  Anulada: {},
});

export const OPERACION = maquina('operacion', {
  Pendiente: { enviar: 'Enviada' },
  Enviada: { confirmar: 'Confirmada', rechazar: 'Rechazada', fallar: 'En reintento', agotar: 'Incidencia' },
  'En reintento': { enviar: 'Enviada', agotar: 'Incidencia' },
  Incidencia: { reprocesar: 'Pendiente', confirmar: 'Confirmada', rechazar: 'Rechazada' },
  Confirmada: {},
  Rechazada: {},
});

/** Estados de solicitud que representan una compra en curso (no se debe duplicar). */
export const SOLICITUD_ABIERTA = Object.freeze(['Borrador', 'Aprobada', 'Enviada al ERP', 'OC creada', 'Recibida parcial']);
/** Estados de operación que impiden cerrar una orden. */
export const OPERACION_PENDIENTE = Object.freeze(['Pendiente', 'Enviada', 'En reintento', 'Incidencia']);

/** Devuelve el estado siguiente o lanza TRANSICION_INVALIDA. */
export function transicionar(m, actual, evento) {
  const destino = m.transiciones[actual]?.[evento];
  if (!destino) {
    throw errores.regla(
      'TRANSICION_INVALIDA',
      `No se puede aplicar "${evento}" a ${m.nombre} en estado "${actual}".`,
      { maquina: m.nombre, actual, evento, permitidos: Object.keys(m.transiciones[actual] ?? {}) },
    );
  }
  return destino;
}

export const puede = (m, actual, evento) => Boolean(m.transiciones[actual]?.[evento]);
