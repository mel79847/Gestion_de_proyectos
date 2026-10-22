/**
 * Componente Catálogo: materiales, equipos, compatibilidad, proveedores y almacenes.
 * Es el único punto de alta de materiales; el código lo asigna el maestro.
 */
import { autorizar } from '../dominio/permisos.js';
import { errores } from '../dominio/errores.js';
import {
  construirCodigo,
  normalizarDescripcion,
  posiblesDuplicados,
  validarFichaMaterial,
} from '../dominio/maestros.js';
import { parametrosReposicion } from '../dominio/calculos.js';

export function crearServicioMaestros(ctx, soporte) {
  const { db } = ctx;

  const conParametros = (m) => ({ ...m, parametros: parametrosReposicion(m) });

  return {
    async listarMateriales(usuario) {
      autorizar(usuario, 'maestro.leer');
      return (await db.repos.materiales.listar()).map(conParametros);
    },

    async obtenerMaterial(usuario, codigo) {
      autorizar(usuario, 'maestro.leer');
      const m = await db.repos.materiales.obtener(codigo);
      if (!m) throw errores.noEncontrado('Material', codigo);
      const compatibles = await db.repos.compatibilidad.equiposPorMaterial(codigo);
      return { ...conParametros(m), equipos_compatibles: compatibles };
    },

    /** Vista previa sin registrar: código propuesto y posibles duplicados. */
    async verificarMaterial(usuario, ficha) {
      autorizar(usuario, 'maestro.leer');
      const existentes = await db.repos.materiales.listar();
      const prefijo = `${ficha.familia}-${ficha.subfamilia}`;
      const correlativo = await db.repos.materiales.siguienteCorrelativo(prefijo);
      return {
        codigo_propuesto: construirCodigo(ficha.familia, ficha.subfamilia, correlativo),
        descripcion_normalizada: normalizarDescripcion(ficha.descripcion),
        duplicados: posiblesDuplicados(ficha.descripcion, existentes),
      };
    },

    /**
     * Alta de material (RF-01). Rechaza si la descripción coincide con un material existente,
     * salvo que el administrador confirme que es distinto e indique el motivo.
     */
    async crearMaterial(usuario, ficha) {
      autorizar(usuario, 'maestro.crear');
      validarFichaMaterial(ficha);
      return db.transaccion(async (repos) => {
        const existentes = await repos.materiales.listar();
        const duplicados = posiblesDuplicados(ficha.descripcion, existentes);
        if (duplicados.length && !ficha.confirmar_distinto) {
          throw errores.conflicto(
            'MATERIAL_DUPLICADO',
            `Ya existe un material equivalente: ${duplicados[0].codigo} (${duplicados[0].descripcion}).`,
            { duplicados },
          );
        }
        if (duplicados.length && !ficha.motivo) {
          throw errores.validacion('Para registrar un material parecido a otro indique el motivo.');
        }
        const prefijo = `${ficha.familia}-${ficha.subfamilia}`;
        const codigo = construirCodigo(ficha.familia, ficha.subfamilia, await repos.materiales.siguienteCorrelativo(prefijo));
        const material = {
          codigo,
          descripcion: ficha.descripcion.trim(),
          descripcion_normalizada: normalizarDescripcion(ficha.descripcion),
          unidad: ficha.unidad,
          criticidad: ficha.criticidad,
          perecible: Boolean(ficha.perecible),
          serializado: Boolean(ficha.serializado),
          demanda_diaria: Number(ficha.demanda_diaria ?? 0),
          sigma_diaria: Number(ficha.sigma_diaria ?? 0),
          plazo_dias: Number(ficha.plazo_dias),
          stock_maximo: Number(ficha.stock_maximo ?? 0),
          metodo_reposicion: ficha.metodo_reposicion,
          costo_pedido: Number(ficha.costo_pedido ?? 0),
          costo_mantener: Number(ficha.costo_mantener ?? 0),
          activo: true,
        };
        await repos.materiales.insertar(material);
        await soporte.auditar(repos, usuario, 'material.crear', 'material', codigo, {
          despues: material,
          motivo: ficha.motivo ?? null,
        });
        return conParametros(material);
      });
    },

    /** Cambio de parámetros de reposición con valor anterior y nuevo en bitácora. */
    async actualizarParametros(usuario, codigo, cambios, motivo) {
      autorizar(usuario, 'maestro.parametros');
      if (!motivo) throw errores.validacion('Indique el motivo del cambio de parámetros.');
      const permitidos = ['demanda_diaria', 'sigma_diaria', 'plazo_dias', 'stock_maximo', 'metodo_reposicion', 'costo_pedido', 'costo_mantener', 'criticidad'];
      const patch = Object.fromEntries(Object.entries(cambios).filter(([k]) => permitidos.includes(k)));
      return db.transaccion(async (repos) => {
        const antes = await repos.materiales.obtener(codigo);
        if (!antes) throw errores.noEncontrado('Material', codigo);
        validarFichaMaterial({ ...antes, familia: 'XXX', subfamilia: 'XXX', ...patch });
        const despues = await repos.materiales.actualizar(codigo, patch);
        await soporte.auditar(repos, usuario, 'material.parametros', 'material', codigo, { antes: pick(antes, patch), despues: patch, motivo });
        return conParametros(despues);
      });
    },

    async listarEquipos(usuario) {
      autorizar(usuario, 'maestro.leer');
      return db.repos.equipos.listar();
    },

    async materialesCompatibles(usuario, equipo) {
      autorizar(usuario, 'maestro.leer');
      if (!(await db.repos.equipos.obtener(equipo))) throw errores.noEncontrado('Equipo', equipo);
      return db.repos.compatibilidad.materialesPorEquipo(equipo);
    },

    async listarProveedores(usuario) {
      autorizar(usuario, 'maestro.leer');
      return db.repos.proveedores.listar();
    },

    async listarAlmacenes(usuario) {
      autorizar(usuario, 'maestro.leer');
      return db.repos.almacenes.listar();
    },
  };
}

const pick = (obj, ref) => Object.fromEntries(Object.keys(ref).map((k) => [k, obj[k]]));
