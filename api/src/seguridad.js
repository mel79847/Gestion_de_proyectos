/**
 * Contraseñas con scrypt (sal aleatoria) y tokens JWT firmados (RNF-06).
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

export function hashClave(clave) {
  const sal = randomBytes(16).toString('hex');
  const hash = scryptSync(clave, sal, 32).toString('hex');
  return `scrypt$${sal}$${hash}`;
}

export function verificarClave(clave, almacenado) {
  const [alg, sal, hash] = String(almacenado).split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const calculado = scryptSync(clave, sal, 32);
  return timingSafeEqual(calculado, Buffer.from(hash, 'hex'));
}

export const emitirToken = (usuario, secreto) =>
  jwt.sign({ sub: usuario.usuario, nombre: usuario.nombre, rol: usuario.rol }, secreto, { expiresIn: '8h' });

export function leerToken(token, secreto) {
  const p = jwt.verify(token, secreto);
  return { usuario: p.sub, nombre: p.nombre, rol: p.rol };
}
