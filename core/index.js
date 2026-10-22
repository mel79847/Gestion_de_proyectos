/**
 * Punto de entrada del núcleo. Arma los servicios a partir de sus dependencias (puertos):
 *
 *   ctx.db     { repos, transaccion(fn) }   PostgreSQL en la API, memoria en la demo y en pruebas
 *   ctx.wms    cliente del WMS              HTTP en la API, simulador en la demo
 *   ctx.erp    cliente del ERP              HTTP en la API, simulador en la demo
 *   ctx.reloj  { ahora() }
 *   ctx.ids    { uuid() }
 *   ctx.config { maxIntentos, backoffBaseMs, tiempoEsperaMs, almacenPorDefecto }
 *
 * Los servicios no conocen Express, SQL ni HTTP: por eso el mismo código corre en el
 * servidor y en el navegador (bajo acoplamiento); cada servicio agrupa una sola
 * responsabilidad del proceso (alta cohesión).
 */
import { crearSoporte } from './servicios/soporte.js';
import { crearServicioMaestros } from './servicios/maestros.js';
import { crearServicioInventario } from './servicios/inventario.js';
import { crearServicioCompras } from './servicios/compras.js';
import { crearServicioOrdenes } from './servicios/ordenes.js';
import { crearServicioIntegracion } from './servicios/integracion.js';
import { crearServicioWebhooks } from './servicios/webhooks.js';
import { crearServicioConsultas } from './servicios/consultas.js';

export const CONFIG_POR_DEFECTO = Object.freeze({
  maxIntentos: 3,
  backoffBaseMs: 2000,
  tiempoEsperaMs: 30000,
  almacenPorDefecto: 'ALM-SCZ',
});

export function crearServicios(dependencias) {
  const ctx = { ...dependencias, config: { ...CONFIG_POR_DEFECTO, ...dependencias.config } };
  const soporte = crearSoporte(ctx);
  const maestros = crearServicioMaestros(ctx, soporte);
  const inventario = crearServicioInventario(ctx);
  const compras = crearServicioCompras(ctx, soporte, inventario);
  const ordenes = crearServicioOrdenes(ctx, soporte);
  const integracion = crearServicioIntegracion(ctx, soporte, { ordenes, compras });
  const webhooks = crearServicioWebhooks(ctx, soporte, { ordenes });
  const consultas = crearServicioConsultas(ctx, soporte);
  return { maestros, inventario, compras, ordenes, integracion, webhooks, consultas };
}

export * as calculos from './dominio/calculos.js';
export * as estados from './dominio/estados.js';
export * as mdm from './dominio/maestros.js';
export { ROLES, PERMISOS, tienePermiso } from './dominio/permisos.js';
export { ErrorDominio, ErrorIntegracion } from './dominio/errores.js';
export { USUARIO_SISTEMA } from './servicios/soporte.js';
