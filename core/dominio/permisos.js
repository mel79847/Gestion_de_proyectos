/**
 * Autorización por rol (RF-04). La matriz se aplica en los servicios, no en la interfaz,
 * para que una llamada directa a la API reciba el mismo rechazo.
 */
import { errores } from './errores.js';

export const ROLES = Object.freeze({
  tecnico: 'Técnico de mantenimiento',
  supervisor: 'Supervisor de mantenimiento',
  almacen: 'Personal de almacén',
  comprador: 'Comprador',
  control: 'Control interno',
  administrador: 'Administrador',
  gerencia: 'Gerencia',
});

const LECTURA = ['tecnico', 'supervisor', 'almacen', 'comprador', 'control', 'administrador', 'gerencia'];

export const PERMISOS = Object.freeze({
  'maestro.leer': LECTURA,
  'maestro.crear': ['administrador'],
  'maestro.parametros': ['administrador', 'comprador'],
  'orden.leer': LECTURA,
  'orden.crear': ['tecnico', 'supervisor'],
  'orden.validar': ['supervisor'],
  'orden.completar': ['tecnico', 'supervisor'],
  'orden.cerrar': ['supervisor'],
  'orden.anular': ['supervisor'],
  'inventario.consultar': LECTURA,
  'reserva.solicitar': ['almacen', 'supervisor'],
  'reserva.liberar': ['almacen', 'supervisor'],
  'entrega.registrar': ['almacen'],
  'cambio.registrar': ['tecnico'],
  'compra.leer': LECTURA,
  'compra.cotizar': ['comprador'],
  'compra.aprobar': ['comprador'],
  'compra.evaluar': ['comprador', 'almacen', 'administrador'],
  'integracion.leer': LECTURA,
  'integracion.reprocesar': ['administrador'],
  'integracion.conciliar': ['administrador', 'control'],
  'incidencia.resolver': ['administrador', 'almacen', 'comprador'],
  'bitacora.leer': ['control', 'administrador', 'gerencia', 'supervisor'],
});

/** Lanza SIN_PERMISO si el usuario no tiene el permiso. */
export function autorizar(usuario, permiso) {
  const roles = PERMISOS[permiso];
  if (!roles) throw new Error(`Permiso no definido: ${permiso}`);
  if (!usuario || !roles.includes(usuario.rol)) throw errores.permiso(usuario?.rol ?? 'anónimo', permiso);
}

export const tienePermiso = (usuario, permiso) => Boolean(usuario && PERMISOS[permiso]?.includes(usuario.rol));
