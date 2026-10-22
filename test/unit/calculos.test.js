import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cantidadEconomica,
  costoPromedioPonderado,
  parametrosReposicion,
  posicionInventario,
  puntoReorden,
  seleccionarLotes,
  stockDisponible,
  stockSeguridad,
} from '../../core/dominio/calculos.js';
import { ORDEN, transicionar } from '../../core/dominio/estados.js';
import { normalizarDescripcion, posiblesDuplicados, similitud } from '../../core/dominio/maestros.js';
import { materiales } from '../../core/datos/semilla.js';

test('disponible = físico − reservado − bloqueado', () => {
  assert.equal(stockDisponible({ fisico: 20, reservado: 4, bloqueado: 2 }), 14);
  assert.equal(stockDisponible({ fisico: 2, reservado: 4, bloqueado: 0 }), 0);
});

test('posición = disponible + en tránsito − requerimientos no reservados', () => {
  assert.equal(posicionInventario({ disponible: 24, enTransito: 0, requerimientosPendientes: 0 }), 24);
  assert.equal(posicionInventario({ disponible: 1, enTransito: 2, requerimientosPendientes: 1 }), 2);
});

test('ejemplo de la fase conceptual: SS 5, ROP 25, EOQ 105, CPP Bs 90', () => {
  const ss = stockSeguridad({ criticidad: 'alta', sigmaDiaria: 1, plazoDias: 10 });
  assert.equal(ss, 5);
  assert.equal(puntoReorden({ demandaDiaria: 2, plazoDias: 10, stockSeguridad: ss }), 25);
  assert.equal(cantidadEconomica({ demandaAnual: 730, costoPedido: 150, costoMantener: 20 }), 105);
  assert.deepEqual(costoPromedioPonderado({ existencias: 10, valor: 800, cantidadIngreso: 20, costoUnitario: 95 }), {
    cpp: 90,
    existencias: 30,
    valor: 2700,
  });
});

test('parámetros del filtro FIL-ACE-0021 coinciden con el documento', () => {
  const f = materiales.find((m) => m.codigo === 'FIL-ACE-0021');
  assert.deepEqual(parametrosReposicion(f), { ss: 5, rop: 25, eoq: 105, z: 1.65 });
});

test('FEFO: entrega primero el lote que vence antes y excluye vencidos', () => {
  const lotes = [
    { id: 1, lote: 'L-2312', fecha_ingreso: '2025-12-05', vence: '2026-10-01', cantidad: 2 },
    { id: 2, lote: 'L-2405', fecha_ingreso: '2026-05-14', vence: '2027-06-30', cantidad: 10 },
    { id: 3, lote: 'L-2401', fecha_ingreso: '2026-01-20', vence: '2026-12-15', cantidad: 8 },
  ];
  const r = seleccionarLotes(lotes, 9, { perecible: true, hoy: '2026-10-21' });
  assert.deepEqual(r.map((a) => [a.lote, a.cantidad]), [['L-2401', 8], ['L-2405', 1]]);
});

test('PEPS: sin vencimiento entrega el lote más antiguo y respeta bloqueos', () => {
  const lotes = [
    { id: 1, lote: 'B', fecha_ingreso: '2026-07-22', cantidad: 16 },
    { id: 2, lote: 'A', fecha_ingreso: '2026-03-10', cantidad: 3 },
    { id: 3, lote: 'Q', fecha_ingreso: '2026-01-01', cantidad: 5, bloqueado: true },
  ];
  const r = seleccionarLotes(lotes, 4, { perecible: false, hoy: '2026-10-21' });
  assert.deepEqual(r.map((a) => [a.lote, a.cantidad]), [['A', 3], ['B', 1]]);
  assert.throws(() => seleccionarLotes(lotes, 30, { perecible: false, hoy: '2026-10-21' }), { codigo: 'STOCK_INSUFICIENTE' });
});

test('máquina de estados: no se cierra una orden que no fue verificada', () => {
  assert.equal(transicionar(ORDEN, 'Registrada', 'validar'), 'Validada');
  assert.throws(() => transicionar(ORDEN, 'Validada', 'cerrar'), { codigo: 'TRANSICION_INVALIDA' });
});

test('MDM: la misma pieza escrita de otra forma se detecta como duplicado', () => {
  assert.equal(normalizarDescripcion('FILTRO DE ACEITE p/ motor VOLVO D-13'), normalizarDescripcion('Filtro de aceite motor Volvo D13'));
  assert.equal(similitud('Filtros aceite motor Volvo D 13', 'Filtro de aceite motor Volvo D13'), 1);
  const dup = posiblesDuplicados('Filtro aceite motor VOLVO D-13', materiales);
  assert.equal(dup[0].codigo, 'FIL-ACE-0021');
  assert.equal(posiblesDuplicados('Filtro de combustible Volvo D13', materiales).length, 0);
});
