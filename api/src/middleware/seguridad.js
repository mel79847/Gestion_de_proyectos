/**
 * Autenticación con JWT y verificación de firma de los webhooks (HMAC-SHA256).
 * La autorización por rol la aplica cada servicio del núcleo.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { leerToken } from '../seguridad.js';

export function autenticar(secreto) {
  return (req, res, next) => {
    const [tipo, token] = String(req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      return res.status(401).json({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Inicie sesión: falta el token Bearer.' } });
    }
    try {
      req.usuario = leerToken(token, secreto);
      return next();
    } catch {
      return res.status(401).json({ error: { codigo: 'TOKEN_INVALIDO', mensaje: 'El token no es válido o expiró.' } });
    }
  };
}

export const firmar = (cuerpo, secreto) => createHmac('sha256', secreto).update(cuerpo).digest('hex');

/** Rechaza webhooks sin firma válida: solo el WMS y el ERP conocen el secreto. */
export function verificarFirma(secreto) {
  return (req, res, next) => {
    const recibida = Buffer.from(String(req.headers['x-firma'] ?? ''), 'hex');
    const esperada = Buffer.from(firmar(req.cuerpoCrudo ?? '', secreto), 'hex');
    if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
      return res.status(401).json({ error: { codigo: 'FIRMA_INVALIDA', mensaje: 'La firma del webhook no es válida.' } });
    }
    return next();
  };
}
