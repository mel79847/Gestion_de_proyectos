/**
 * Genera db/seed.sql a partir de core/datos/semilla.js (fuente única de los datos de ejemplo).
 * Uso: node scripts/generar-seed.js
 */
import { writeFileSync } from 'node:fs';
import * as S from '../core/datos/semilla.js';
import { normalizarDescripcion } from '../core/dominio/maestros.js';
import { PERMISOS, ROLES } from '../core/dominio/permisos.js';
import { hashClave } from '../api/src/seguridad.js';

const lit = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
  return `'${String(v).replaceAll("'", "''")}'`;
};
const insert = (tabla, filas, columnas) =>
  filas.length
    ? `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES\n` +
      filas.map((f) => `  (${columnas.map((c) => lit(f[c])).join(', ')})`).join(',\n') +
      ';\n'
    : '';

const roles = [...Object.entries(ROLES).map(([codigo, nombre]) => ({ codigo, nombre })), { codigo: 'sistema', nombre: 'Proceso automático' }];
const permisos = Object.entries(PERMISOS).flatMap(([permiso, rs]) => rs.map((rol) => ({ rol, permiso })));
const usuarios = S.usuarios.map((u) => ({ ...u, clave_hash: hashClave(S.CLAVE_DEMO) }));
const ubicaciones = [...new Map(S.lotesWms.map((l) => [`${l.almacen}|${l.ubicacion}`, { almacen: l.almacen, codigo: l.ubicacion }])).values()];
const materiales = S.materiales.map((m) => ({ ...m, descripcion_normalizada: normalizarDescripcion(m.descripcion) }));
const ordenes = S.ordenes.map(({ detalles, ...o }) => o);
const detalles = S.ordenes.flatMap((o) => o.detalles.map((d) => ({ ...d, orden: o.numero })));

const sql = [
  '-- Generado por scripts/generar-seed.js. No editar a mano.',
  'BEGIN;',
  'SET search_path TO mro;',
  insert('rol', roles, ['codigo', 'nombre']),
  insert('permiso', permisos, ['rol', 'permiso']),
  insert('usuario', usuarios, ['usuario', 'nombre', 'rol', 'clave_hash']),
  insert('almacen', S.almacenes, ['codigo', 'nombre', 'ciudad']),
  insert('ubicacion', ubicaciones, ['almacen', 'codigo']),
  insert('material', materiales, ['codigo', 'descripcion', 'descripcion_normalizada', 'unidad', 'criticidad', 'perecible', 'serializado', 'demanda_diaria', 'sigma_diaria', 'plazo_dias', 'stock_maximo', 'metodo_reposicion', 'costo_pedido', 'costo_mantener', 'activo']),
  insert('equipo', S.equipos, ['codigo', 'descripcion', 'tipo', 'almacen']),
  insert('compatibilidad', S.compatibilidad, ['material', 'equipo']),
  insert('proveedor', S.proveedores, ['codigo', 'razon_social', 'nit', 'plazo_dias', 'cumplimiento', 'habilitado']),
  insert('material_proveedor', S.materialProveedor, ['material', 'proveedor', 'precio_ref', 'preferido']),
  insert('orden_mantenimiento', ordenes, ['numero', 'equipo', 'tipo', 'prioridad', 'diagnostico', 'fecha_requerida', 'almacen', 'estado', 'tecnico', 'supervisor', 'creada_en', 'validada_en', 'cerrada_en']),
  insert('detalle_material', detalles, ['orden', 'material', 'cantidad', 'cantidad_reservada', 'cantidad_entregada']),
  insert('solicitud_compra', S.solicitudes, ['numero', 'material', 'almacen', 'cantidad', 'metodo', 'detalle_calculo', 'origen', 'orden_origen', 'proveedor', 'precio_ref', 'estado', 'numero_oc', 'fecha_prometida', 'cantidad_recibida', 'creada_por', 'creada_en']),
  'COMMIT;',
  '',
].join('\n');

writeFileSync(new URL('../db/seed.sql', import.meta.url), sql);
console.log(`db/seed.sql: ${roles.length} roles, ${permisos.length} permisos, ${materiales.length} materiales, ${S.equipos.length} equipos`);
