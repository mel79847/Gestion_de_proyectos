/**
 * Adaptador PostgreSQL: implementa el contrato de repositorios del núcleo
 * (mismo contrato que core/adaptadores/memoria/repos.js) y la unidad de trabajo ACID.
 */
import pg from 'pg';
import { SOLICITUD_ABIERTA } from '../../../core/dominio/estados.js';

// Fechas como texto ISO y numéricos como número, igual que el adaptador en memoria.
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString()); // timestamptz
pg.types.setTypeParser(1082, (v) => v); // date
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric
pg.types.setTypeParser(20, (v) => Number(v)); // bigint

const JSONB = new Set(['mensaje', 'respuesta', 'antes', 'despues', 'lotes']);
const COLUMNA = /^[a-z_]+$/;
const valor = (c, v) => (JSONB.has(c) && v !== null && v !== undefined ? JSON.stringify(v) : v);

function columnas(obj) {
  const cols = Object.keys(obj);
  for (const c of cols) if (!COLUMNA.test(c)) throw new Error(`Columna no válida: ${c}`);
  return cols;
}

async function insertar(q, tabla, fila) {
  const cols = columnas(fila);
  const { rows } = await q.query(
    `INSERT INTO ${tabla} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    cols.map((c) => valor(c, fila[c])),
  );
  return rows[0];
}

async function actualizar(q, tabla, pk, id, patch) {
  const cols = columnas(patch);
  if (!cols.length) return (await q.query(`SELECT * FROM ${tabla} WHERE ${pk} = $1`, [id])).rows[0];
  const { rows } = await q.query(
    `UPDATE ${tabla} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE ${pk} = $1 RETURNING *`,
    [id, ...cols.map((c) => valor(c, patch[c]))],
  );
  if (!rows[0]) throw new Error(`No existe ${tabla}.${pk}=${id}`);
  return rows[0];
}

async function listar(q, tabla, filtro = {}, orden = '') {
  const pares = Object.entries(filtro).filter(([, v]) => v !== undefined);
  columnas(Object.fromEntries(pares));
  const where = pares.length ? `WHERE ${pares.map(([c], i) => `${c} = $${i + 1}`).join(' AND ')}` : '';
  const { rows } = await q.query(`SELECT * FROM ${tabla} ${where} ${orden}`, pares.map(([, v]) => v));
  return rows;
}

const uno = async (q, sql, params) => (await q.query(sql, params)).rows[0] ?? null;
const bloquear = (q, clave) => q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [clave]);

async function siguienteCorrelativo(q, tabla, columna, prefijo) {
  await bloquear(q, `${tabla}:${prefijo}`);
  const r = await uno(q, `SELECT COALESCE(MAX(substring(${columna} FROM $2::int)::int), 0) + 1 AS n FROM ${tabla} WHERE ${columna} LIKE $1`, [
    `${prefijo}%`,
    prefijo.length + 1,
  ]);
  return r.n;
}

/** Repositorios ligados a un ejecutor de consultas (pool o cliente de una transacción). */
export function reposPara(q) {
  async function conDetalles(ordenes) {
    if (!ordenes.length) return [];
    const { rows } = await q.query('SELECT * FROM detalle_material WHERE orden = ANY($1) ORDER BY id', [ordenes.map((o) => o.numero)]);
    return ordenes.map((o) => ({ ...o, detalles: rows.filter((d) => d.orden === o.numero) }));
  }

  return {
    materiales: {
      obtener: (codigo) => uno(q, 'SELECT * FROM material WHERE codigo = $1', [codigo]),
      listar: () => listar(q, 'material', {}, 'ORDER BY codigo'),
      insertar: (m) => insertar(q, 'material', m),
      actualizar: (codigo, patch) => actualizar(q, 'material', 'codigo', codigo, patch),
      siguienteCorrelativo: (prefijo) => siguienteCorrelativo(q, 'material', 'codigo', `${prefijo}-`),
    },
    equipos: {
      obtener: (c) => uno(q, 'SELECT * FROM equipo WHERE codigo = $1', [c]),
      listar: () => listar(q, 'equipo', {}, 'ORDER BY codigo'),
    },
    compatibilidad: {
      esCompatible: async (material, equipo) => Boolean(await uno(q, 'SELECT 1 FROM compatibilidad WHERE material = $1 AND equipo = $2', [material, equipo])),
      materialesPorEquipo: async (equipo) =>
        (await q.query('SELECT m.* FROM compatibilidad c JOIN material m ON m.codigo = c.material WHERE c.equipo = $1 ORDER BY m.codigo', [equipo])).rows,
      equiposPorMaterial: async (material) =>
        (await q.query('SELECT e.* FROM compatibilidad c JOIN equipo e ON e.codigo = c.equipo WHERE c.material = $1 ORDER BY e.codigo', [material])).rows,
    },
    proveedores: {
      obtener: (c) => uno(q, 'SELECT * FROM proveedor WHERE codigo = $1', [c]),
      listar: () => listar(q, 'proveedor', {}, 'ORDER BY codigo'),
    },
    materialProveedor: {
      preferido: (material) => uno(q, 'SELECT * FROM material_proveedor WHERE material = $1 ORDER BY preferido DESC, precio_ref LIMIT 1', [material]),
    },
    almacenes: {
      obtener: (c) => uno(q, 'SELECT * FROM almacen WHERE codigo = $1', [c]),
      listar: () => listar(q, 'almacen', {}, 'ORDER BY codigo'),
    },
    ordenes: {
      obtener: async (numero) => (await conDetalles(await listar(q, 'orden_mantenimiento', { numero })))[0] ?? null,
      listar: async (filtro = {}) => conDetalles(await listar(q, 'orden_mantenimiento', filtro, 'ORDER BY creada_en DESC')),
      insertar: async ({ detalles, ...o }) => {
        await insertar(q, 'orden_mantenimiento', o);
        for (const d of detalles) await insertar(q, 'detalle_material', { ...d, orden: o.numero });
        return (await conDetalles([{ ...o }]))[0];
      },
      actualizar: async (numero, patch) => (await conDetalles([await actualizar(q, 'orden_mantenimiento', 'numero', numero, patch)]))[0],
      actualizarDetalle: (id, patch) => actualizar(q, 'detalle_material', 'id', id, patch),
      siguienteNumero: async (anio) => `OM-${anio}-${String(await siguienteCorrelativo(q, 'orden_mantenimiento', 'numero', `OM-${anio}-`)).padStart(4, '0')}`,
      requerimientosPendientes: async (material, almacen) =>
        (
          await uno(
            q,
            `SELECT COALESCE(SUM(d.cantidad - d.cantidad_reservada), 0)::int AS total
               FROM detalle_material d JOIN orden_mantenimiento o ON o.numero = d.orden
              WHERE d.material = $1 AND o.estado IN ('Validada', 'En espera de repuestos')
                AND ($2::text IS NULL OR o.almacen = $2)`,
            [material, almacen ?? null],
          )
        ).total,
    },
    reservas: {
      insertar: (r) => insertar(q, 'reserva', r),
      obtener: (id) => uno(q, 'SELECT * FROM reserva WHERE id = $1', [Number(id)]),
      actualizar: (id, patch) => actualizar(q, 'reserva', 'id', Number(id), patch),
      listarPorOrden: (orden) => listar(q, 'reserva', { orden }, 'ORDER BY id'),
    },
    solicitudes: {
      insertar: (s) => insertar(q, 'solicitud_compra', s),
      obtener: (numero) => uno(q, 'SELECT * FROM solicitud_compra WHERE numero = $1', [numero]),
      obtenerPorOc: (oc) => uno(q, 'SELECT * FROM solicitud_compra WHERE numero_oc = $1', [oc]),
      actualizar: (numero, patch) => actualizar(q, 'solicitud_compra', 'numero', numero, patch),
      listar: (filtro = {}) => listar(q, 'solicitud_compra', filtro, 'ORDER BY creada_en DESC'),
      /** Serializa por material para que dos evaluaciones simultáneas no creen dos compras. */
      abiertaPorMaterial: async (material) => {
        await bloquear(q, `solicitud:${material}`);
        return uno(q, 'SELECT * FROM solicitud_compra WHERE material = $1 AND estado = ANY($2)', [material, SOLICITUD_ABIERTA]);
      },
      siguienteNumero: async (anio) => `SOL-${anio}-${String(await siguienteCorrelativo(q, 'solicitud_compra', 'numero', `SOL-${anio}-`)).padStart(4, '0')}`,
    },
    cotizaciones: {
      insertar: (c) => insertar(q, 'cotizacion', c),
      listarPorSolicitud: (solicitud) => listar(q, 'cotizacion', { solicitud }, 'ORDER BY id'),
      marcarElegida: (solicitud, id) => q.query('UPDATE cotizacion SET elegida = (id = $2) WHERE solicitud = $1', [solicitud, id]),
    },
    recepciones: {
      insertar: (r) => insertar(q, 'recepcion', r),
      listarPorSolicitud: (solicitud) => listar(q, 'recepcion', { solicitud }, 'ORDER BY id'),
    },
    movimientos: {
      insertar: (m) => insertar(q, 'movimiento', m),
      listarPorOrden: (orden) => listar(q, 'movimiento', { orden }, 'ORDER BY id'),
      listar: (filtro = {}) => listar(q, 'movimiento', filtro, 'ORDER BY fecha DESC'),
    },
    cambios: {
      insertar: (c) => insertar(q, 'cambio_pieza', c),
      listarPorOrden: (orden) => listar(q, 'cambio_pieza', { orden }, 'ORDER BY id'),
    },
    operaciones: {
      insertar: (o) => insertar(q, 'operacion_integracion', o),
      obtener: (id) => uno(q, 'SELECT * FROM operacion_integracion WHERE id::text = $1', [id]),
      actualizar: (id, patch) => actualizar(q, 'operacion_integracion', 'id', id, patch),
      listar: (filtro = {}) => listar(q, 'operacion_integracion', filtro, 'ORDER BY creada_en DESC'),
      /** Reclama operaciones listas sin bloquear a otros trabajadores. */
      procesables: async ({ ahora, enviadaAntesDe, limite, id = null }) =>
        (
          await q.query(
            `SELECT * FROM operacion_integracion
              WHERE direccion = 'SALIENTE'
                AND ($4::uuid IS NULL OR id = $4::uuid)
                AND ((estado IN ('Pendiente', 'En reintento') AND proximo_intento <= $1)
                  OR (estado = 'Enviada' AND enviada_en <= $2))
              ORDER BY creada_en
              LIMIT $3
              FOR UPDATE SKIP LOCKED`,
            [ahora, enviadaAntesDe, limite, id],
          )
        ).rows,
    },
    incidencias: {
      insertar: (i) => insertar(q, 'incidencia', i),
      obtener: (id) => uno(q, 'SELECT * FROM incidencia WHERE id = $1', [Number(id)]),
      actualizar: (id, patch) => actualizar(q, 'incidencia', 'id', Number(id), patch),
      listar: (filtro = {}) => listar(q, 'incidencia', filtro, 'ORDER BY creada_en DESC, id DESC'),
    },
    alertas: {
      insertar: (a) => insertar(q, 'alerta', a),
      obtener: (id) => uno(q, 'SELECT * FROM alerta WHERE id = $1', [Number(id)]),
      actualizar: (id, patch) => actualizar(q, 'alerta', 'id', Number(id), patch),
      listar: (filtro = {}) => listar(q, 'alerta', filtro, 'ORDER BY creada_en DESC, id DESC'),
    },
    bitacora: {
      registrar: (e) => insertar(q, 'bitacora', e),
      listar: (filtro = {}) => listar(q, 'bitacora', filtro, 'ORDER BY fecha DESC, id DESC LIMIT 500'),
    },
    conciliaciones: {
      insertar: (c) => insertar(q, 'conciliacion', c),
      listar: () => listar(q, 'conciliacion', {}, 'ORDER BY fecha_corte DESC'),
    },
  };
}

/** Crea el pool y la unidad de trabajo. */
export function crearDbPg({ connectionString, max = 10 }) {
  const pool = new pg.Pool({ connectionString, max, options: '-c search_path=mro' });
  return {
    pool,
    repos: reposPara(pool),
    async transaccion(fn) {
      const cliente = await pool.connect();
      const alConfirmar = [];
      try {
        await cliente.query('BEGIN');
        const r = await fn({ ...reposPara(cliente), alConfirmar: (f) => alConfirmar.push(f) });
        await cliente.query('COMMIT');
        for (const f of alConfirmar) Promise.resolve().then(f).catch(() => {});
        return r;
      } catch (e) {
        await cliente.query('ROLLBACK');
        throw e;
      } finally {
        cliente.release();
      }
    },
    cerrar: () => pool.end(),
  };
}
