/**
 * Pruebas de integración: API Express + PostgreSQL real + simuladores WMS/ERP por HTTP.
 * Requiere DATABASE_URL apuntando a una base de pruebas (se reinicia el esquema mro).
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearContenedor } from '../../api/src/contenedor.js';
import { crearApp } from '../../api/src/app.js';
import { crearMocks } from '../../mocks/servidor.js';
import { CLAVE_DEMO } from '../../core/datos/semilla.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres@localhost:5432/ypfb_mro';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const escuchar = (app) => new Promise((ok) => { const s = app.listen(0, () => ok(s)); });

let api, mocks, contenedor, URL_API, URL_MOCKS;
const tokens = {};

before(async () => {
  const config = {
    databaseUrl: DATABASE_URL, jwtSecreto: 'prueba-jwt', webhookSecreto: 'prueba-webhook', tiempoEsperaMs: 800,
    maxIntentos: 3, backoffBaseMs: 40, registrarSolicitudes: false,
  };
  const mocksApp = crearMocks({ apiUrl: '', webhookSecreto: config.webhookSecreto, log: {} });
  mocks = { ...mocksApp, servidor: await escuchar(mocksApp.app) };
  URL_MOCKS = `http://127.0.0.1:${mocks.servidor.address().port}`;
  contenedor = crearContenedor({ ...config, wmsUrl: URL_MOCKS, erpUrl: URL_MOCKS });
  await contenedor.db.pool.query(readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'));
  await contenedor.db.pool.query(readFileSync(new URL('../../db/seed.sql', import.meta.url), 'utf8'));
  api = await escuchar(crearApp({ ...contenedor, config, log: { error: console.error } }));
  URL_API = `http://127.0.0.1:${api.address().port}`;
  // El WMS simulado envía sus webhooks a esta API.
  mocks.wms.emitir = async (evento) => {
    const { firmar } = await import('../../api/src/middleware/seguridad.js');
    const cuerpo = JSON.stringify(evento);
    const r = await fetch(`${URL_API}/api/integracion/webhooks/wms`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-firma': firmar(cuerpo, config.webhookSecreto) }, body: cuerpo });
    return r.json();
  };
  for (const u of ['tec.rojas', 'sup.vargas', 'alm.mamani', 'com.flores', 'adm.sistema', 'ctl.quiroga']) {
    const r = await llamar('POST', '/api/auth/login', { usuario: u, clave: CLAVE_DEMO });
    tokens[u] = r.cuerpo.token;
  }
});

after(async () => {
  await new Promise((r) => api.close(r));
  await new Promise((r) => mocks.servidor.close(r));
  await contenedor.db.cerrar();
});

async function llamar(metodo, ruta, cuerpo, usuario) {
  const res = await fetch(`${URL_API}${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(usuario ? { authorization: `Bearer ${tokens[usuario]}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: res.status, cuerpo: await res.json() };
}

/** Ciclos del trabajador de integración hasta vaciar la bandeja. */
async function drenar(max = 8) {
  const todos = [];
  for (let i = 0; i < max; i++) {
    const r = await contenedor.servicios.integracion.procesarPendientes();
    todos.push(...r);
    if (!r.length) {
      const quedan = (await contenedor.db.pool.query("SELECT count(*)::int n FROM operacion_integracion WHERE estado IN ('Pendiente','En reintento')")).rows[0].n;
      if (!quedan) break;
    }
    await esperar(200);
  }
  return todos;
}

async function crearOrdenValidada(materiales, equipo = 'CAM-VOL-014') {
  const r = await llamar('POST', '/api/ordenes', { equipo, tipo: 'correctivo', prioridad: 'alta', diagnostico: 'Pérdida de presión de aceite', fecha_requerida: '2026-10-25', materiales }, 'tec.rojas');
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.equal((await llamar('POST', `/api/ordenes/${r.cuerpo.numero}/validacion`, null, 'sup.vargas')).estado, 200);
  return r.cuerpo.numero;
}

describe('seguridad', () => {
  test('sin token: 401; credenciales erróneas: 401; rol sin permiso: 403', async () => {
    assert.equal((await llamar('GET', '/api/ordenes')).estado, 401);
    assert.equal((await llamar('POST', '/api/auth/login', { usuario: 'tec.rojas', clave: 'x' })).estado, 401);
    const r = await llamar('POST', '/api/ordenes/OM-2026-0152/validacion', null, 'tec.rojas');
    assert.equal(r.estado, 403);
    assert.equal(r.cuerpo.error.codigo, 'SIN_PERMISO');
  });

  test('webhook sin firma válida es rechazado', async () => {
    const r = await fetch(`${URL_API}/api/integracion/webhooks/wms`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-firma': '00' }, body: '{}' });
    assert.equal(r.status, 401);
  });

  test('la bitácora no admite UPDATE ni DELETE, ni desde SQL', async () => {
    await assert.rejects(() => contenedor.db.pool.query("UPDATE bitacora SET motivo = 'x'"), /solo inserción/);
    await assert.rejects(() => contenedor.db.pool.query('DELETE FROM bitacora'), /solo inserción/);
  });
});

describe('flujo completo por HTTP', () => {
  test('orden OM-2026-0153: reserva, salida, cambio de pieza, cierre y solicitud por ROP', async () => {
    const n = await crearOrdenValidada([{ material: 'FIL-ACE-0021', cantidad: 4 }]);
    assert.equal(n, 'OM-2026-0153');
    assert.equal((await llamar('POST', `/api/ordenes/${n}/reservas`, null, 'alm.mamani')).estado, 202);
    await drenar();
    const d = await llamar('GET', '/api/inventario/disponibilidad/FIL-ACE-0021?almacen=ALM-SCZ', null, 'alm.mamani');
    assert.deepEqual([d.cuerpo.fisico, d.cuerpo.reservado, d.cuerpo.disponible, d.cuerpo.rop], [28, 4, 24, 25]);
    assert.equal(d.cuerpo.fuente.fisico, 'WMS');

    assert.equal((await llamar('POST', `/api/ordenes/${n}/entregas`, { receptor: 'tec.rojas' }, 'alm.mamani')).estado, 202);
    await drenar();
    const cambio = await llamar('POST', `/api/ordenes/${n}/cambios-pieza`, { material: 'FIL-ACE-0021', pieza_retirada: 'Filtro saturado', condicion: 'desgastada', destino: 'baja' }, 'tec.rojas');
    assert.equal(cambio.estado, 201, JSON.stringify(cambio.cuerpo));
    assert.equal((await llamar('POST', `/api/ordenes/${n}/completar`, null, 'tec.rojas')).estado, 200);
    const cierre = await llamar('POST', `/api/ordenes/${n}/cierre`, null, 'sup.vargas');
    assert.equal(cierre.cuerpo.estado, 'Cerrada');

    const sol = await llamar('GET', '/api/compras/solicitudes?material=FIL-ACE-0021', null, 'com.flores');
    assert.equal(sol.cuerpo[0].cantidad, 105);
    const t = await llamar('GET', `/api/ordenes/${n}/trazabilidad`, null, 'ctl.quiroga');
    assert.equal(t.cuerpo.movimientos[0].costo_unitario, 88.5);
    assert.ok(t.cuerpo.bitacora.length >= 6);
  });

  test('compra: cotizaciones, OC del ERP, recepción parcial por webhook y CPP', async () => {
    const [sol] = (await llamar('GET', '/api/compras/solicitudes?material=FIL-ACE-0021', null, 'com.flores')).cuerpo;
    await llamar('POST', `/api/compras/solicitudes/${sol.numero}/cotizaciones`, { proveedor: 'PRV-001', precio: 92, plazo_dias: 10, garantia_meses: 0 }, 'com.flores');
    await llamar('POST', `/api/compras/solicitudes/${sol.numero}/cotizaciones`, { proveedor: 'PRV-002', precio: 89.5, plazo_dias: 7, garantia_meses: 0 }, 'com.flores');
    assert.equal((await llamar('POST', `/api/compras/solicitudes/${sol.numero}/aprobacion`, {}, 'com.flores')).estado, 202);
    await drenar();
    const conOc = (await llamar('GET', `/api/compras/solicitudes/${sol.numero}`, null, 'com.flores')).cuerpo;
    assert.equal(conOc.estado, 'OC creada');
    assert.equal(conOc.proveedor, 'PRV-002'); // mejor puntaje: precio y plazo
    await mocks.wms.recibir({ orden_compra: conOc.numero_oc, material: 'FIL-ACE-0021', almacen: 'ALM-SCZ', cantidad_recibida: 60, cantidad_aceptada: 58, lote: 'L-FA-2610' });
    const parcial = (await llamar('GET', `/api/compras/solicitudes/${sol.numero}`, null, 'com.flores')).cuerpo;
    assert.equal(parcial.estado, 'Recibida parcial');
    assert.equal(parcial.cantidad_recibida, 58);
    const k = (await llamar('GET', '/api/inventario/kardex/FIL-ACE-0021', null, 'com.flores')).cuerpo;
    const ingreso = k.find((x) => x.tipo === 'Ingreso');
    assert.equal(ingreso.cpp, Math.round(((24 * 88.5 + 58 * 89.5) / 82) * 100) / 100);
  });
});

describe('recuperación ante fallas', () => {
  test('WMS caído: reintentos, incidencia, cierre bloqueado y reproceso sin duplicar', async () => {
    const n = await crearOrdenValidada([{ material: 'FIL-AIR-0008', cantidad: 2 }]);
    await llamar('POST', `/api/ordenes/${n}/reservas`, null, 'alm.mamani');
    mocks.wms.fallas.caido = true;
    const r = await drenar();
    assert.deepEqual(r.map((x) => x.resultado), ['reintento', 'reintento', 'incidencia']);
    const inc = (await llamar('GET', '/api/incidencias?codigo=WMS_SIN_RESPUESTA', null, 'adm.sistema')).cuerpo;
    assert.equal(inc[0].estado, 'Abierta');
    const cierre = await llamar('POST', `/api/ordenes/${n}/cierre`, null, 'sup.vargas');
    assert.equal(cierre.cuerpo.error.codigo, 'CIERRE_BLOQUEADO');

    mocks.wms.fallas.caido = false;
    const [op] = (await llamar('GET', `/api/integracion/operaciones?orden=${n}`, null, 'adm.sistema')).cuerpo;
    assert.equal((await llamar('POST', `/api/integracion/operaciones/${op.id}/reproceso`, null, 'adm.sistema')).estado, 200);
    await drenar();
    assert.equal((await llamar('GET', `/api/ordenes/${n}`, null, 'sup.vargas')).cuerpo.estado, 'Materiales reservados');
    assert.equal([...mocks.wms.reservas.values()].filter((x) => x.orden === n).length, 1);
  });

  test('respuesta perdida (conexión cortada): se recupera por id sin reenviar', async () => {
    const n = await crearOrdenValidada([{ material: 'ACE-MOT-0003', cantidad: 9 }]);
    await llamar('POST', `/api/ordenes/${n}/reservas`, null, 'alm.mamani');
    const antes = mocks.wms.estadisticas.solicitudes;
    mocks.wms.fallas.perderRespuestas = 1;
    const r = await drenar();
    assert.deepEqual(r.map((x) => [x.resultado, x.recuperada ?? false]), [['reintento', false], ['confirmada', true]]);
    assert.equal(mocks.wms.estadisticas.solicitudes - antes, 1);
    // FEFO en la salida: L-2401 (vence 2026-12-15) antes que L-2405; L-2312 vencido no sale.
    await llamar('POST', `/api/ordenes/${n}/entregas`, { receptor: 'tec.rojas' }, 'alm.mamani');
    await drenar();
    const o = (await llamar('GET', `/api/ordenes/${n}`, null, 'sup.vargas')).cuerpo;
    assert.deepEqual(o.movimientos[0].lotes.map((l) => [l.lote, l.cantidad]), [['L-2401', 8], ['L-2405', 1]]);
  });

  test('dos órdenes por la última válvula al mismo tiempo: solo una la reserva', async () => {
    const a = await crearOrdenValidada([{ material: 'VAL-COM-0042', cantidad: 1 }], 'CMP-ARI-003');
    const b = await crearOrdenValidada([{ material: 'VAL-COM-0042', cantidad: 1 }], 'CMP-ARI-003');
    await Promise.all([llamar('POST', `/api/ordenes/${a}/reservas`, null, 'alm.mamani'), llamar('POST', `/api/ordenes/${b}/reservas`, null, 'alm.mamani')]);
    await drenar();
    const estados = await Promise.all([a, b].map(async (n) => (await llamar('GET', `/api/ordenes/${n}`, null, 'sup.vargas')).cuerpo.estado));
    assert.deepEqual(estados.sort(), ['En espera de repuestos', 'Materiales reservados']);
    // La falta de stock no duplicó la compra en curso SOL-2026-0040.
    const sols = (await llamar('GET', '/api/compras/solicitudes?material=VAL-COM-0042', null, 'com.flores')).cuerpo;
    assert.equal(sols.length, 1);
  });

  test('la base de datos impide dos compras abiertas del mismo material', async () => {
    await assert.rejects(
      () => contenedor.db.pool.query(
        "INSERT INTO solicitud_compra (numero, material, almacen, cantidad, metodo, detalle_calculo, origen, estado, creada_por) VALUES ('SOL-2026-0999','VAL-COM-0042','ALM-CBB',1,'HASTA_MAXIMO','x','ROP','Borrador','prueba')",
      ),
      /ux_solicitud_abierta/,
    );
  });
});

describe('datos maestros', () => {
  test('MDM rechaza el duplicado escrito distinto; el índice único es la segunda barrera', async () => {
    const ficha = { familia: 'FIL', subfamilia: 'ACE', unidad: 'und', criticidad: 'alta', metodo_reposicion: 'HASTA_MAXIMO', demanda_diaria: 1, sigma_diaria: 1, plazo_dias: 10, stock_maximo: 20 };
    const dup = await llamar('POST', '/api/maestros/materiales', { ...ficha, descripcion: 'FILTRO ACEITE P/ MOTOR VOLVO D-13' }, 'adm.sistema');
    assert.equal(dup.estado, 409);
    assert.equal(dup.cuerpo.error.codigo, 'MATERIAL_DUPLICADO');
    assert.equal(dup.cuerpo.error.detalle.duplicados[0].codigo, 'FIL-ACE-0021');
    const forzado = await llamar('POST', '/api/maestros/materiales', { ...ficha, descripcion: 'Filtro aceite motor Volvo D13', confirmar_distinto: true, motivo: 'prueba' }, 'adm.sistema');
    assert.equal(forzado.cuerpo.error.codigo, 'DUPLICADO');
    const ok = await llamar('POST', '/api/maestros/materiales', { ...ficha, subfamilia: 'COM', descripcion: 'Filtro separador de agua y combustible Racor 500FG' }, 'adm.sistema');
    assert.equal(ok.estado, 201);
    assert.equal(ok.cuerpo.codigo, 'FIL-COM-0001');
  });
});
