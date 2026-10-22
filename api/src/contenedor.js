/**
 * Raíz de composición: el único lugar donde se eligen las implementaciones concretas
 * (PostgreSQL y conectores HTTP) para los puertos del núcleo. La API y el trabajador
 * de integración la comparten.
 */
import { randomUUID } from 'node:crypto';
import { crearServicios } from '../../core/index.js';
import { crearDbPg } from './adaptadores/db-pg.js';
import { crearClienteErpHttp, crearClienteWmsHttp } from './adaptadores/clientes-http.js';
import { crearColaRabbit } from './adaptadores/cola-rabbitmq.js';

export function crearContenedor(config) {
  const db = crearDbPg({ connectionString: config.databaseUrl });
  // La cola se conecta después (asíncrono); mientras no exista, publicar no hace nada
  // y el trabajador recoge las operaciones con el barrido de la bandeja de salida.
  const cola = {
    impl: null,
    publicar: (op) => cola.impl?.publicar(op),
    async conectar(log = console) {
      if (!config.amqpUrl) return null;
      cola.impl = await crearColaRabbit(config.amqpUrl, { log });
      return cola.impl;
    },
  };
  const servicios = crearServicios({
    db,
    cola,
    wms: crearClienteWmsHttp(config.wmsUrl, { tiempoEsperaMs: config.tiempoEsperaMs }),
    erp: crearClienteErpHttp(config.erpUrl, { tiempoEsperaMs: config.tiempoEsperaMs }),
    reloj: { ahora: () => new Date() },
    ids: { uuid: randomUUID },
    config: { maxIntentos: config.maxIntentos, backoffBaseMs: config.backoffBaseMs, tiempoEsperaMs: Math.max(30000, config.tiempoEsperaMs * 3) },
  });
  const buscarUsuario = async (usuario) =>
    (await db.pool.query('SELECT usuario, nombre, rol, clave_hash, activo FROM usuario WHERE usuario = $1', [usuario])).rows[0] ?? null;
  const verificarSalud = async () => {
    await db.pool.query('SELECT 1');
    return { base_de_datos: 'ok' };
  };
  return { db, cola, servicios, buscarUsuario, verificarSalud };
}
