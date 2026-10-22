/**
 * Repositorios en memoria. Implementan el mismo contrato que los repositorios PostgreSQL
 * (api/src/adaptadores/repos-pg.js); los usan las pruebas unitarias y la demostración web.
 * Cada lectura devuelve una copia para que nadie modifique el estado sin pasar por el repositorio.
 */
import { SOLICITUD_ABIERTA } from '../../dominio/estados.js';

const copia = (x) => (x == null ? x : structuredClone(x));
const coincide = (fila, filtro) => Object.entries(filtro).every(([k, v]) => v === undefined || fila[k] === v);

class Tabla {
  constructor(pk = 'id', filas = []) {
    this.pk = pk;
    this.filas = new Map();
    this.secuencia = 0;
    for (const f of filas) this.insertar(f);
  }
  insertar(fila) {
    const f = copia(fila);
    if (f[this.pk] === undefined || f[this.pk] === null) f[this.pk] = ++this.secuencia;
    if (this.filas.has(f[this.pk])) throw new Error(`Clave duplicada ${this.pk}=${f[this.pk]}`);
    this.filas.set(f[this.pk], f);
    return copia(f);
  }
  obtener(id) {
    return copia(this.filas.get(id) ?? null);
  }
  actualizar(id, patch) {
    const f = this.filas.get(id);
    if (!f) throw new Error(`No existe ${this.pk}=${id}`);
    Object.assign(f, copia(patch));
    return copia(f);
  }
  listar(filtro = {}) {
    return [...this.filas.values()].filter((f) => coincide(f, filtro)).map(copia);
  }
}

export function crearReposMemoria(semilla) {
  const t = {
    materiales: new Tabla('codigo', semilla.materiales),
    equipos: new Tabla('codigo', semilla.equipos),
    compatibilidad: new Tabla('id', semilla.compatibilidad),
    proveedores: new Tabla('codigo', semilla.proveedores),
    materialProveedor: new Tabla('id', semilla.materialProveedor),
    almacenes: new Tabla('codigo', semilla.almacenes),
    ordenes: new Tabla('numero'),
    detalles: new Tabla('id'),
    reservas: new Tabla('id'),
    solicitudes: new Tabla('numero', semilla.solicitudes),
    cotizaciones: new Tabla('id'),
    recepciones: new Tabla('id'),
    movimientos: new Tabla('id'),
    cambios: new Tabla('id'),
    operaciones: new Tabla('id'),
    incidencias: new Tabla('id'),
    alertas: new Tabla('id'),
    bitacora: new Tabla('id'),
    conciliaciones: new Tabla('id'),
  };

  const conDetalles = (o) => (o ? { ...o, detalles: t.detalles.listar({ orden: o.numero }) } : null);
  const correlativo = (tabla, prefijo, base) => {
    const usados = [...tabla.filas.keys()].filter((k) => String(k).startsWith(prefijo)).map((k) => Number(String(k).slice(prefijo.length)));
    return Math.max(base, ...usados) + 1;
  };
  const ordenarFecha = (campo) => (a, b) => String(b[campo]).localeCompare(String(a[campo])) || Number(b.id ?? 0) - Number(a.id ?? 0);

  const repos = {
    materiales: {
      obtener: async (codigo) => t.materiales.obtener(codigo),
      listar: async () => t.materiales.listar().sort((a, b) => a.codigo.localeCompare(b.codigo)),
      insertar: async (m) => t.materiales.insertar(m),
      actualizar: async (codigo, patch) => t.materiales.actualizar(codigo, patch),
      siguienteCorrelativo: async (prefijo) => correlativo(t.materiales, `${prefijo}-`, 0),
    },
    equipos: {
      obtener: async (c) => t.equipos.obtener(c),
      listar: async () => t.equipos.listar(),
    },
    compatibilidad: {
      esCompatible: async (material, equipo) => t.compatibilidad.listar({ material, equipo }).length > 0,
      materialesPorEquipo: async (equipo) => t.compatibilidad.listar({ equipo }).map((c) => t.materiales.obtener(c.material)),
      equiposPorMaterial: async (material) => t.compatibilidad.listar({ material }).map((c) => t.equipos.obtener(c.equipo)),
    },
    proveedores: {
      obtener: async (c) => t.proveedores.obtener(c),
      listar: async () => t.proveedores.listar(),
    },
    materialProveedor: {
      preferido: async (material) => {
        const filas = t.materialProveedor.listar({ material });
        return filas.find((f) => f.preferido) ?? filas[0] ?? null;
      },
    },
    almacenes: {
      obtener: async (c) => t.almacenes.obtener(c),
      listar: async () => t.almacenes.listar(),
    },
    ordenes: {
      obtener: async (numero) => conDetalles(t.ordenes.obtener(numero)),
      listar: async (filtro = {}) => t.ordenes.listar(filtro).sort(ordenarFecha('creada_en')).map(conDetalles),
      insertar: async ({ detalles, ...o }) => {
        t.ordenes.insertar(o);
        for (const d of detalles) t.detalles.insertar({ ...d, orden: o.numero });
        return conDetalles(t.ordenes.obtener(o.numero));
      },
      actualizar: async (numero, patch) => {
        t.ordenes.actualizar(numero, patch);
        return conDetalles(t.ordenes.obtener(numero));
      },
      actualizarDetalle: async (id, patch) => t.detalles.actualizar(id, patch),
      siguienteNumero: async (anio) => `OM-${anio}-${String(correlativo(t.ordenes, `OM-${anio}-`, 0)).padStart(4, '0')}`,
      /** Requerimientos de órdenes aprobadas aún no reservados (entra en la posición). */
      requerimientosPendientes: async (material, almacen) => {
        let total = 0;
        for (const o of t.ordenes.listar()) {
          if (!['Validada', 'En espera de repuestos'].includes(o.estado) || (almacen && o.almacen !== almacen)) continue;
          for (const d of t.detalles.listar({ orden: o.numero, material })) total += d.cantidad - d.cantidad_reservada;
        }
        return total;
      },
    },
    reservas: {
      insertar: async (r) => t.reservas.insertar(r),
      obtener: async (id) => t.reservas.obtener(Number(id)),
      actualizar: async (id, patch) => t.reservas.actualizar(Number(id), patch),
      listarPorOrden: async (orden) => t.reservas.listar({ orden }).sort((a, b) => a.id - b.id),
    },
    solicitudes: {
      insertar: async (s) => t.solicitudes.insertar(s),
      obtener: async (numero) => t.solicitudes.obtener(numero),
      obtenerPorOc: async (oc) => t.solicitudes.listar({ numero_oc: oc })[0] ?? null,
      actualizar: async (numero, patch) => t.solicitudes.actualizar(numero, patch),
      listar: async (filtro = {}) => t.solicitudes.listar(filtro).sort(ordenarFecha('creada_en')),
      abiertaPorMaterial: async (material) => t.solicitudes.listar({ material }).find((s) => SOLICITUD_ABIERTA.includes(s.estado)) ?? null,
      siguienteNumero: async (anio) => `SOL-${anio}-${String(correlativo(t.solicitudes, `SOL-${anio}-`, 0)).padStart(4, '0')}`,
    },
    cotizaciones: {
      insertar: async (c) => t.cotizaciones.insertar(c),
      listarPorSolicitud: async (solicitud) => t.cotizaciones.listar({ solicitud }),
      marcarElegida: async (solicitud, id) => {
        for (const c of t.cotizaciones.listar({ solicitud })) t.cotizaciones.actualizar(c.id, { elegida: c.id === id });
      },
    },
    recepciones: {
      insertar: async (r) => t.recepciones.insertar(r),
      listarPorSolicitud: async (solicitud) => t.recepciones.listar({ solicitud }),
    },
    movimientos: {
      insertar: async (m) => t.movimientos.insertar(m),
      listarPorOrden: async (orden) => t.movimientos.listar({ orden }),
      listar: async (filtro = {}) => t.movimientos.listar(filtro).sort(ordenarFecha('fecha')),
    },
    cambios: {
      insertar: async (c) => t.cambios.insertar(c),
      listarPorOrden: async (orden) => t.cambios.listar({ orden }),
    },
    operaciones: {
      insertar: async (o) => t.operaciones.insertar(o),
      obtener: async (id) => t.operaciones.obtener(id),
      actualizar: async (id, patch) => t.operaciones.actualizar(id, patch),
      listar: async (filtro = {}) => t.operaciones.listar(filtro).sort(ordenarFecha('creada_en')),
      /** Equivalente a SELECT … FOR UPDATE SKIP LOCKED de la versión PostgreSQL. */
      procesables: async ({ ahora, enviadaAntesDe, limite, id }) =>
        t.operaciones
          .listar({ direccion: 'SALIENTE', ...(id ? { id } : {}) })
          .filter(
            (o) =>
              (['Pendiente', 'En reintento'].includes(o.estado) && o.proximo_intento <= ahora) ||
              (o.estado === 'Enviada' && o.enviada_en <= enviadaAntesDe),
          )
          .sort((a, b) => a.creada_en.localeCompare(b.creada_en))
          .slice(0, limite),
    },
    incidencias: {
      insertar: async (i) => t.incidencias.insertar(i),
      obtener: async (id) => t.incidencias.obtener(Number(id)),
      actualizar: async (id, patch) => t.incidencias.actualizar(Number(id), patch),
      listar: async (filtro = {}) => t.incidencias.listar(filtro).sort(ordenarFecha('creada_en')),
    },
    alertas: {
      insertar: async (a) => t.alertas.insertar(a),
      obtener: async (id) => t.alertas.obtener(Number(id)),
      actualizar: async (id, patch) => t.alertas.actualizar(Number(id), patch),
      listar: async (filtro = {}) => t.alertas.listar(filtro).sort(ordenarFecha('creada_en')),
    },
    /** Solo inserción y lectura: no existe actualizar ni eliminar. */
    bitacora: {
      registrar: async (e) => t.bitacora.insertar(e),
      listar: async (filtro = {}) => t.bitacora.listar(filtro).sort(ordenarFecha('fecha')),
    },
    conciliaciones: {
      insertar: async (c) => t.conciliaciones.insertar(c),
      listar: async () => t.conciliaciones.listar(),
    },
  };

  for (const o of semilla.ordenes ?? []) repos.ordenes.insertar(o);
  return { repos, tablas: t };
}

/**
 * Unidad de trabajo en memoria: serializa las transacciones para que dos reservas
 * simultáneas no se intercalen, igual que el bloqueo de filas en PostgreSQL.
 */
export function crearDbMemoria(semilla) {
  const { repos, tablas } = crearReposMemoria(semilla);
  const fotografiar = () => Object.fromEntries(Object.entries(tablas).map(([k, v]) => [k, { filas: structuredClone(v.filas), secuencia: v.secuencia }]));
  const restaurar = (foto) => {
    for (const [k, v] of Object.entries(foto)) Object.assign(tablas[k], v);
  };
  let cola = Promise.resolve();
  return {
    repos,
    /** Todo o nada: si fn falla, las tablas vuelven a su estado previo (rollback). */
    transaccion(fn) {
      const ejecucion = cola.then(async () => {
        const foto = fotografiar();
        const pendientes = [];
        try {
          const r = await fn({ ...repos, alConfirmar: (f) => pendientes.push(f) });
          for (const f of pendientes) Promise.resolve().then(f).catch(() => {});
          return r;
        } catch (e) {
          restaurar(foto);
          throw e;
        }
      });
      cola = ejecucion.catch(() => {});
      return ejecucion;
    },
  };
}
