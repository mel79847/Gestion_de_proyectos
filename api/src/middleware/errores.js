/**
 * Traduce errores de dominio, de integración y de PostgreSQL a respuestas JSON uniformes:
 *   { "error": { "codigo": "...", "mensaje": "...", "detalle": {...} } }
 */
import { ErrorDominio, ErrorIntegracion } from '../../../core/dominio/errores.js';

const PG = {
  '23505': [409, 'DUPLICADO', 'El registro ya existe (restricción de unicidad).'],
  '23514': [400, 'DATOS_INVALIDOS', 'Un valor no cumple las reglas del modelo de datos.'],
  '23503': [400, 'DATOS_INVALIDOS', 'El registro hace referencia a un dato que no existe.'],
  '22P02': [400, 'DATOS_INVALIDOS', 'Formato de dato no válido.'],
  '42501': [403, 'OPERACION_PROHIBIDA', 'La operación no está permitida sobre este registro.'],
};

export function manejadorErrores(log) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    if (err instanceof ErrorDominio) {
      return res.status(err.estadoHttp).json({ error: { codigo: err.codigo, mensaje: err.message, detalle: err.detalle } });
    }
    if (err instanceof ErrorIntegracion) {
      return res.status(503).json({ error: { codigo: `${err.destino}_SIN_RESPUESTA`, mensaje: err.message } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { codigo: 'DATOS_INVALIDOS', mensaje: 'El cuerpo no es JSON válido.' } });
    }
    if (PG[err?.code]) {
      const [estado, codigo, mensaje] = PG[err.code];
      return res.status(estado).json({ error: { codigo, mensaje, detalle: { restriccion: err.constraint } } });
    }
    log.error({ err, ruta: req.originalUrl, id: req.id }, 'error no controlado');
    return res.status(500).json({ error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno. Consulte el identificador de la solicitud.', detalle: { solicitud: req.id } } });
  };
}

export const noEncontrada = (req, res) =>
  res.status(404).json({ error: { codigo: 'RUTA_NO_ENCONTRADA', mensaje: `No existe ${req.method} ${req.path}.` } });
