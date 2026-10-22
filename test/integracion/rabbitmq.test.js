/**
 * Cola de operaciones en RabbitMQ: la API publica tras el COMMIT, el trabajador consume,
 * los reintentos esperan en la cola con TTL y las agotadas van a la cola de fallidas.
 * Se omite si no hay AMQP_URL.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearContenedor } from '../../api/src/contenedor.js';
import { crearMocks } from '../../mocks/servidor.js';
import { iniciarTrabajador } from '../../worker/index.js';
import { usuarios } from '../../core/datos/semilla.js';

const AMQP_URL = process.env.AMQP_URL;
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/ypfb_mro';
const u = (x) => usuarios.find((y) => y.usuario === x);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let c, mocks, servidor, trabajador;

before(async () => {
  if (!AMQP_URL) return;
  mocks = crearMocks({ apiUrl: '', webhookSecreto: 'x', log: {} });
  servidor = await new Promise((ok) => { const s = mocks.app.listen(0, () => ok(s)); });
  const url = `http://127.0.0.1:${servidor.address().port}`;
  const config = { databaseUrl: DATABASE_URL, wmsUrl: url, erpUrl: url, tiempoEsperaMs: 800, maxIntentos: 3, backoffBaseMs: 300, amqpUrl: AMQP_URL, intervaloBarridoMs: 60000, intervaloRespaldoMs: 600000 };
  c = crearContenedor(config);
  await c.db.pool.query(readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'));
  await c.db.pool.query(readFileSync(new URL('../../db/seed.sql', import.meta.url), 'utf8'));
  const cola = await c.cola.conectar({});
  trabajador = await iniciarTrabajador({ servicios: c.servicios, config, cola, log: {} });
});

after(async () => {
  if (!AMQP_URL) return;
  await trabajador.detener();
  await c.cola.impl.cerrar();
  await c.db.cerrar();
  await new Promise((r) => servidor.close(r));
});

async function ordenConReserva(material, cantidad) {
  const s = c.servicios;
  const o = await s.ordenes.crear(u('tec.rojas'), { equipo: 'CAM-VOL-014', tipo: 'correctivo', prioridad: 'alta', diagnostico: 'prueba cola', fecha_requerida: '2026-11-30', materiales: [{ material, cantidad }] });
  await s.ordenes.validar(u('sup.vargas'), o.numero);
  await s.ordenes.solicitarReservas(u('alm.mamani'), o.numero);
  return o.numero;
}

test('la reserva viaja por RabbitMQ sin barrido de la bandeja', { skip: !AMQP_URL }, async () => {
  const n = await ordenConReserva('FIL-ACE-0021', 2);
  for (let i = 0; i < 20 && (await c.servicios.ordenes.obtener(u('sup.vargas'), n)).estado !== 'Materiales reservados'; i++) await esperar(100);
  assert.equal((await c.servicios.ordenes.obtener(u('sup.vargas'), n)).estado, 'Materiales reservados');
});

test('WMS caído: reintentos por la cola con TTL y mensaje en fallidas', { skip: !AMQP_URL }, async () => {
  mocks.wms.fallas.caido = true;
  const antes = (await c.cola.impl.contar()).fallidas;
  const n = await ordenConReserva('FIL-AIR-0008', 1);
  let op;
  for (let i = 0; i < 60; i++) {
    [op] = await c.servicios.integracion.listarOperaciones(u('adm.sistema'), { orden: n });
    if (op.estado === 'Incidencia') break;
    await esperar(100);
  }
  assert.equal(op.estado, 'Incidencia');
  assert.equal(op.intentos, 3);
  assert.equal((await c.cola.impl.contar()).fallidas, antes + 1);
  mocks.wms.fallas.caido = false;
});
