/**
 * Errores de dominio. Cada error lleva un código estable que la API traduce a
 * un estado HTTP y que la interfaz muestra al usuario con su causa.
 */
export class ErrorDominio extends Error {
  /**
   * @param {string} codigo  Código estable, p. ej. "STOCK_INSUFICIENTE".
   * @param {string} mensaje Explicación legible para el usuario.
   * @param {number} [estadoHttp=422]
   * @param {object} [detalle] Datos adicionales para diagnóstico.
   */
  constructor(codigo, mensaje, estadoHttp = 422, detalle = undefined) {
    super(mensaje);
    this.name = 'ErrorDominio';
    this.codigo = codigo;
    this.estadoHttp = estadoHttp;
    this.detalle = detalle;
  }
}

/** Falla técnica al comunicarse con un sistema externo (sin respuesta, tiempo agotado). */
export class ErrorIntegracion extends Error {
  constructor(destino, mensaje, { tiempoAgotado = false } = {}) {
    super(mensaje);
    this.name = 'ErrorIntegracion';
    this.destino = destino;
    this.tiempoAgotado = tiempoAgotado;
  }
}

export const errores = {
  noEncontrado: (entidad, id) =>
    new ErrorDominio('NO_ENCONTRADO', `${entidad} ${id} no existe.`, 404, { entidad, id }),
  validacion: (mensaje, detalle) => new ErrorDominio('DATOS_INVALIDOS', mensaje, 400, detalle),
  conflicto: (codigo, mensaje, detalle) => new ErrorDominio(codigo, mensaje, 409, detalle),
  permiso: (rol, permiso) =>
    new ErrorDominio('SIN_PERMISO', `El rol ${rol} no tiene el permiso ${permiso}.`, 403, { rol, permiso }),
  regla: (codigo, mensaje, detalle) => new ErrorDominio(codigo, mensaje, 422, detalle),
};
