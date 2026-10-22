/**
 * Escenarios de validación (tabla 14 de la fase de desarrollo) sobre el núcleo en memoria.
 * El mismo núcleo corre en la API con PostgreSQL (ver test/integracion).
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearEntornoMemoria } from '../../core/entorno-memoria.js';

function relojManual(inicio = '2026-10-21T14:00:00.000Z') {
  let t = new Date(inicio).getTime();
  return { ahora: () => new Date(t), avanzar: (ms) => (t += ms) };
}

let e, s, reloj, tec, sup, alm, com, adm;
beforeEach(() => {
  reloj = relojManual();
  e = crearEntornoMemoria({ reloj });
  s = e.servicios;
  [tec, sup, alm, com, adm] = ['tec.rojas', 'sup.vargas', 'alm.mamani', 'com.flores', 'adm.sistema'].map(e.usuario);
});

/** Ejecuta el trabajador hasta que no quede nada listo, avanzando el reloj entre ciclos. */
async function drenar(maxCiclos = 10) {
  const todos = [];
  for (let i = 0; i < maxCiclos; i++) {
    const r = await s.integracion.procesarPendientes();
    todos.push(...r);
    if (!r.length) break;
    reloj.avanzar(60_000);
  }
  return todos;
}

async function ordenValidada(materiales, equipo = 'CAM-VOL-014') {
  const o = await s.ordenes.crear(tec, {
    equipo, tipo: 'correctivo', prioridad: 'alta', diagnostico: 'Fuga de aceite en cárter', fecha_requerida: '2026-10-23', materiales,
  });
  await s.ordenes.validar(sup, o.numero);
  return o.numero;
}

describe('flujo principal', () => {
  test('orden → reserva → salida FEFO/PEPS → cambio de pieza → cierre', async () => {
    const n = await ordenValidada([{ material: 'FIL-ACE-0021', cantidad: 4 }]);
    assert.equal(n, 'OM-2026-0153');

    await s.ordenes.solicitarReservas(alm, n);
    await drenar();
    let o = await s.ordenes.obtener(alm, n);
    assert.equal(o.estado, 'Materiales reservados');
    assert.match(o.reservas[0].ref_wms, /^RES-\d+$/);

    const disp = await s.inventario.disponibilidad(alm, 'FIL-ACE-0021', 'ALM-SCZ');
    assert.deepEqual([disp.fisico, disp.reservado, disp.disponible], [28, 4, 24]);

    await s.ordenes.registrarEntrega(alm, n, { receptor: 'tec.rojas' });
    await drenar();
    o = await s.ordenes.obtener(alm, n);
    assert.equal(o.estado, 'En ejecución');
    assert.deepEqual(o.movimientos[0].lotes.map((l) => [l.lote, l.cantidad]), [['L-FA-2603', 4]]); // PEPS
    assert.equal(o.movimientos[0].costo_unitario, 88.5); // CPP del ERP

    await s.ordenes.registrarCambioPieza(tec, n, { material: 'FIL-ACE-0021', pieza_retirada: 'Filtro saturado', condicion: 'desgastada', destino: 'baja' });
    await s.ordenes.completar(tec, n);
    const cerrada = await s.ordenes.cerrar(sup, n);
    assert.equal(cerrada.estado, 'Cerrada');

    // Tras la salida la posición (24) quedó bajo el ROP (25): solicitud EOQ en borrador.
    const sol = (await s.compras.listar(com)).find((x) => x.material === 'FIL-ACE-0021');
    assert.equal(sol.estado, 'Borrador');
    assert.equal(sol.cantidad, 105);
    assert.equal(sol.metodo, 'EOQ');
  });
});

describe('stock y compras', () => {
  test('cantidad superior al disponible: rechazo sin tocar stock y solicitud ligada a la orden', async () => {
    const n = await ordenValidada([{ material: 'EMP-CUL-0115', cantidad: 6 }]);
    await s.ordenes.solicitarReservas(alm, n);
    await drenar();
    const o = await s.ordenes.obtener(alm, n);
    assert.equal(o.estado, 'En espera de repuestos');
    assert.equal(o.reservas[0].estado, 'Rechazada');
    assert.equal(e.wmsSim.consultarDisponibilidad({ material: 'EMP-CUL-0115' }).reservado, 0);
    const sol = (await s.compras.listar(com, { orden_origen: n }))[0];
    assert.equal(sol.origen, 'FALTA_STOCK');
    assert.equal((await s.consultas.incidencias(adm, { codigo: 'STOCK_INSUFICIENTE' })).length, 1);
  });

  test('punto de reorden con compra en curso: no se duplica la solicitud', async () => {
    const r = await s.compras.evaluar(com, 'VAL-COM-0042', 'ALM-CBB');
    assert.equal(r.creada, false);
    assert.equal(r.motivo, 'COMPRA_EN_CURSO');
    assert.equal(r.solicitud.numero, 'SOL-2026-0040');
    assert.equal(r.estado.en_transito, 2);
    assert.equal((await s.compras.listar(com, { material: 'VAL-COM-0042' })).length, 1);
  });

  test('aprobación → OC del ERP → recepción parcial y total con CPP recalculado → reintento de reserva', async () => {
    const n = await ordenValidada([{ material: 'EMP-CUL-0115', cantidad: 6 }]);
    await s.ordenes.solicitarReservas(alm, n);
    await drenar();
    const sol = (await s.compras.listar(com, { orden_origen: n }))[0];
    await s.compras.registrarCotizacion(com, sol.numero, { proveedor: 'PRV-001', precio: 1300, plazo_dias: 12, garantia_meses: 6 });
    await s.compras.registrarCotizacion(com, sol.numero, { proveedor: 'PRV-002', precio: 1240, plazo_dias: 20, garantia_meses: 3 });
    await s.compras.aprobar(com, sol.numero);
    await drenar();
    const conOc = await s.compras.obtener(com, sol.numero);
    assert.equal(conOc.estado, 'OC creada');
    assert.match(conOc.numero_oc, /^45000128\d\d$/);

    await e.wmsSim.recibir({ orden_compra: conOc.numero_oc, material: 'EMP-CUL-0115', almacen: 'ALM-SCZ', cantidad_recibida: 2, cantidad_aceptada: 1, lote: 'L-EC-2610' });
    assert.equal((await s.compras.obtener(com, sol.numero)).estado, 'Recibida parcial');
    await e.wmsSim.recibir({ orden_compra: conOc.numero_oc, material: 'EMP-CUL-0115', almacen: 'ALM-SCZ', cantidad_recibida: conOc.cantidad - 1, cantidad_aceptada: conOc.cantidad - 1, lote: 'L-EC-2611' });
    assert.equal((await s.compras.obtener(com, sol.numero)).estado, 'Recibida');

    const v = e.erpSim.consultarValoracion({ material: 'EMP-CUL-0115' });
    const precio = conOc.precio_ref;
    const esperado = Math.round(((4 * 1250 + conOc.cantidad * precio) / (4 + conOc.cantidad)) * 100) / 100;
    assert.equal(v.cpp, esperado);

    await drenar(); // la recepción reencoló la reserva
    assert.equal((await s.ordenes.obtener(alm, n)).estado, 'Materiales reservados');
  });
});

describe('integración e idempotencia', () => {
  test('envío repetido con el mismo id: el WMS aplica una sola vez', async () => {
    const n = await ordenValidada([{ material: 'FIL-AIR-0008', cantidad: 2 }]);
    const [r] = await s.ordenes.solicitarReservas(alm, n);
    const op = await e.db.repos.operaciones.obtener(r.id_operacion);
    const a = e.wmsSim.procesar(op.tipo, op.mensaje, op.id);
    const b = e.wmsSim.procesar(op.tipo, op.mensaje, op.id);
    assert.equal(a.ref_reserva, b.ref_reserva);
    assert.equal(e.wmsSim.consultarDisponibilidad({ material: 'FIL-AIR-0008' }).reservado, 2);
    assert.equal(e.wmsSim.estadisticas.duplicadasEvitadas, 1);
  });

  test('WMS sin respuesta: reintentos con espera creciente, incidencia y recuperación sin duplicar', async () => {
    const n = await ordenValidada([{ material: 'FIL-ACE-0021', cantidad: 4 }]);
    await s.ordenes.solicitarReservas(alm, n);
    e.wmsSim.fallas.caido = true;
    const r = await drenar();
    assert.deepEqual(r.map((x) => x.resultado), ['reintento', 'reintento', 'incidencia']);
    assert.equal(r[1].espera_ms, 4000);
    const [inc] = await s.consultas.incidencias(adm, { codigo: 'WMS_SIN_RESPUESTA' });
    assert.equal(inc.estado, 'Abierta');
    await assert.rejects(() => s.ordenes.cerrar(sup, n), { codigo: 'CIERRE_BLOQUEADO' });

    e.wmsSim.fallas.caido = false;
    const [op] = await s.integracion.listarOperaciones(adm, { orden: n });
    await s.integracion.reprocesar(adm, op.id);
    await drenar();
    assert.equal((await s.ordenes.obtener(alm, n)).estado, 'Materiales reservados');
    assert.equal((await s.consultas.incidencias(adm, { codigo: 'WMS_SIN_RESPUESTA' }))[0].estado, 'Resuelta');
    assert.equal(e.wmsSim.reservas.size, 1);
  });

  test('confirmación perdida: se consulta por id antes de reenviar', async () => {
    const n = await ordenValidada([{ material: 'FIL-ACE-0021', cantidad: 4 }]);
    await s.ordenes.solicitarReservas(alm, n);
    e.wmsSim.fallas.perderRespuestas = 1;
    const r = await drenar();
    assert.deepEqual(r.map((x) => x.resultado), ['reintento', 'confirmada']);
    assert.equal(r[1].recuperada, true);
    assert.equal(e.wmsSim.reservas.size, 1);
    assert.equal(e.wmsSim.estadisticas.solicitudes, 1); // no hubo reenvío
    const [inc] = await s.consultas.incidencias(adm, { codigo: 'CONFIRMACION_PERDIDA' });
    assert.equal(inc.estado, 'Resuelta');
  });

  test('dos solicitudes simultáneas por la última unidad: solo una la compromete', async () => {
    const a = await ordenValidada([{ material: 'VAL-COM-0042', cantidad: 1 }], 'CMP-ARI-003');
    const b = await ordenValidada([{ material: 'VAL-COM-0042', cantidad: 1 }], 'CMP-ARI-003');
    await Promise.all([s.ordenes.solicitarReservas(alm, a), s.ordenes.solicitarReservas(alm, b)]);
    await drenar();
    const estados = [(await s.ordenes.obtener(alm, a)).estado, (await s.ordenes.obtener(alm, b)).estado].sort();
    assert.deepEqual(estados, ['En espera de repuestos', 'Materiales reservados']);
    assert.equal(e.wmsSim.consultarDisponibilidad({ material: 'VAL-COM-0042' }).disponible, 0);
  });

  test('webhook repetido: la recepción se registra una vez', async () => {
    const ev = await e.wmsSim.recibir({ orden_compra: '4500012871', material: 'VAL-COM-0042', almacen: 'ALM-CBB', cantidad_recibida: 1, cantidad_aceptada: 1, lote: 'L-VD-2610' });
    const otra = await s.webhooks.recibirWms(ev);
    assert.equal(otra.duplicado, true);
    assert.equal((await s.compras.obtener(com, 'SOL-2026-0040')).cantidad_recibida, 1);
  });

  test('conciliación: un ajuste no informado al ERP genera diferencia e incidencia', async () => {
    e.wmsSim.ajusteNoInformado({ material: 'ROD-BOM-0017', almacen: 'ALM-CBB', cantidad: -1 });
    const r = await s.integracion.conciliar(adm);
    const fila = r.find((x) => x.material === 'ROD-BOM-0017');
    assert.equal(fila.diferencia, -1);
    assert.equal((await s.consultas.incidencias(adm, { codigo: 'DIFERENCIA_CONCILIACION' })).length, 1);
  });
});

describe('reglas de negocio y seguridad', () => {
  test('material incompatible con el equipo es rechazado', async () => {
    await assert.rejects(
      () => s.ordenes.crear(tec, { equipo: 'CAM-MER-022', tipo: 'correctivo', prioridad: 'media', diagnostico: 'x', fecha_requerida: '2026-10-30', materiales: [{ material: 'FIL-ACE-0021', cantidad: 1 }] }),
      { codigo: 'MATERIAL_INCOMPATIBLE' },
    );
  });

  test('cierre bloqueado mientras exista una operación pendiente', async () => {
    const n = await ordenValidada([{ material: 'FIL-ACE-0021', cantidad: 1 }]);
    await s.ordenes.solicitarReservas(alm, n);
    await drenar();
    await s.ordenes.registrarEntrega(alm, n, { receptor: 'tec.rojas' });
    // la salida sigue en la bandeja; la orden no pasó a En ejecución
    await assert.rejects(() => s.ordenes.registrarCambioPieza(tec, n, { material: 'FIL-ACE-0021', pieza_retirada: 'x', condicion: 'desgastada', destino: 'baja' }), { codigo: 'ESTADO_NO_PERMITE_CAMBIO' });
    const o = await s.ordenes.obtener(sup, n);
    assert.equal(o.operaciones_pendientes, 1);
  });

  test('un rol sin permiso recibe rechazo y la bitácora no cambia', async () => {
    const antes = (await s.consultas.bitacora(adm)).length;
    await assert.rejects(() => s.ordenes.validar(tec, 'OM-2026-0152'), { codigo: 'SIN_PERMISO' });
    await assert.rejects(() => s.maestros.crearMaterial(tec, {}), { codigo: 'SIN_PERMISO' });
    assert.equal((await s.consultas.bitacora(adm)).length, antes);
  });

  test('MDM: rechaza el duplicado y asigna el código correlativo al material nuevo', async () => {
    const base = { familia: 'FIL', subfamilia: 'ACE', unidad: 'und', criticidad: 'alta', metodo_reposicion: 'HASTA_MAXIMO', demanda_diaria: 1, sigma_diaria: 1, plazo_dias: 10, stock_maximo: 20 };
    await assert.rejects(() => s.maestros.crearMaterial(adm, { ...base, descripcion: 'FILTRO ACEITE MOTOR VOLVO D-13' }), { codigo: 'MATERIAL_DUPLICADO' });
    const nuevo = await s.maestros.crearMaterial(adm, { ...base, descripcion: 'Filtro de aceite motor Scania DC13' });
    assert.equal(nuevo.codigo, 'FIL-ACE-0035');
  });

  test('transacción fallida no deja datos a medias', async () => {
    const antes = (await s.ordenes.listar(sup)).length;
    await assert.rejects(() =>
      s.ordenes.crear(tec, { equipo: 'CAM-VOL-014', tipo: 'correctivo', prioridad: 'alta', diagnostico: 'x', fecha_requerida: '2026-10-30', materiales: [{ material: 'NO-EXI-0001', cantidad: 1 }] }),
    );
    assert.equal((await s.ordenes.listar(sup)).length, antes);
  });
});
