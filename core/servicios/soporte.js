/**
 * Servicios transversales: bitácora (auditoría), alertas, incidencias y bandeja de salida.
 * Reciben los repositorios de la transacción en curso para que el registro de auditoría
 * se confirme o se revierta junto con el cambio que documenta.
 */

/** Usuario técnico con el que actúan el trabajador de integración y los webhooks. */
export const USUARIO_SISTEMA = Object.freeze({ usuario: 'sistema', nombre: 'Trabajador de integración', rol: 'sistema' });

export function crearSoporte(ctx) {
  const ahoraIso = () => ctx.reloj.ahora().toISOString();

  /** Bitácora de solo inserción (RF-19, RNF-07). */
  async function auditar(repos, usuario, accion, entidad, entidadId, { antes = null, despues = null, motivo = null } = {}) {
    return repos.bitacora.registrar({
      fecha: ahoraIso(),
      usuario: usuario.usuario,
      rol: usuario.rol,
      accion,
      entidad,
      entidad_id: String(entidadId),
      antes,
      despues,
      motivo,
    });
  }

  /** Alerta con destinatario y estado (RF-18). */
  async function alertar(repos, { tipo, prioridad = 'media', destinatario_rol, entidad, entidad_id, mensaje }) {
    return repos.alertas.insertar({
      tipo,
      prioridad,
      destinatario_rol,
      entidad,
      entidad_id: String(entidad_id),
      mensaje,
      estado: 'Abierta',
      creada_en: ahoraIso(),
    });
  }

  /** Incidencia con causa y responsable (RF-22). */
  async function registrarIncidencia(repos, { codigo, operacion_id = null, entidad, entidad_id, causa, responsable_rol }) {
    return repos.incidencias.insertar({
      codigo,
      operacion_id,
      entidad,
      entidad_id: String(entidad_id),
      causa,
      responsable_rol,
      estado: 'Abierta',
      creada_en: ahoraIso(),
      resuelta_en: null,
      resolucion: null,
    });
  }

  /**
   * Bandeja de salida (outbox): la operación se guarda en la misma transacción que el
   * cambio de negocio. El trabajador de integración la transmite después.
   */
  async function encolar(repos, { tipo, destino, entidad, entidad_id, orden = null, mensaje }) {
    const id = ctx.ids.uuid();
    // Tras el COMMIT se avisa al broker (RabbitMQ) si existe; si el aviso falla, la
    // operación igual está guardada y el barrido periódico de la bandeja la toma.
    repos.alConfirmar?.(() => ctx.cola?.publicar({ id, tipo, destino }));
    return repos.operaciones.insertar({
      id,
      tipo,
      destino,
      direccion: 'SALIENTE',
      entidad,
      entidad_id: String(entidad_id),
      orden,
      mensaje: { id_operacion: id, ...mensaje },
      estado: 'Pendiente',
      intentos: 0,
      limite_intentos: ctx.config.maxIntentos,
      proximo_intento: ahoraIso(),
      respuesta: null,
      causa: null,
      creada_en: ahoraIso(),
      enviada_en: null,
      confirmada_en: null,
    });
  }

  return { auditar, alertar, registrarIncidencia, encolar, ahoraIso };
}
