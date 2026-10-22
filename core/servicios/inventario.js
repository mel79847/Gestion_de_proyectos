/**
 * Componente Inventario y reservas: consulta de disponibilidad.
 * La solución no guarda saldos: cada valor se pide a su dueño en el momento.
 *   físico, reservado, bloqueado, lotes ............ WMS
 *   en tránsito (OC confirmadas por recibir), CPP ... ERP
 *   requerimientos aprobados no reservados .......... esta solución
 */
import { autorizar } from '../dominio/permisos.js';
import { errores, ErrorIntegracion } from '../dominio/errores.js';
import { parametrosReposicion, posicionInventario, stockDisponible } from '../dominio/calculos.js';

export function crearServicioInventario(ctx) {
  const { db } = ctx;

  /** Estado consolidado de un material en un almacén. Uso interno y para la pantalla. */
  async function estadoMaterial(repos, material, almacen) {
    const ficha = await repos.materiales.obtener(material);
    if (!ficha) throw errores.noEncontrado('Material', material);
    if (almacen && !(await repos.almacenes.obtener(almacen))) throw errores.noEncontrado('Almacén', almacen);

    const wms = await ctx.wms.consultarDisponibilidad({ material, almacen });
    const disponible = stockDisponible(wms);

    const avisos = [];
    let enTransito = 0;
    let valoracion = null;
    try {
      enTransito = await ctx.erp.consultarEnTransito({ material, almacen });
      valoracion = await ctx.erp.consultarValoracion({ material });
    } catch (e) {
      if (!(e instanceof ErrorIntegracion)) throw e;
      avisos.push('El ERP no respondió: en tránsito y CPP no disponibles en esta consulta.');
    }

    const requerimientos = await repos.ordenes.requerimientosPendientes(material, almacen);
    const posicion = posicionInventario({ disponible, enTransito, requerimientosPendientes: requerimientos });
    const parametros = parametrosReposicion(ficha);

    return {
      material: ficha.codigo,
      descripcion: ficha.descripcion,
      unidad: ficha.unidad,
      criticidad: ficha.criticidad,
      perecible: ficha.perecible,
      almacen: almacen ?? 'TODOS',
      fisico: wms.fisico,
      reservado: wms.reservado,
      bloqueado: wms.bloqueado,
      disponible,
      en_transito: enTransito,
      requerimientos_pendientes: requerimientos,
      posicion,
      ...parametros,
      stock_maximo: ficha.stock_maximo,
      bajo_rop: posicion <= parametros.rop,
      cpp: valoracion?.cpp ?? null,
      lotes: wms.lotes,
      fuente: { fisico: 'WMS', reservado: 'WMS', bloqueado: 'WMS', en_transito: 'ERP', cpp: 'ERP', requerimientos_pendientes: 'Solución' },
      consultado_en: ctx.reloj.ahora().toISOString(),
      avisos,
    };
  }

  return {
    estadoMaterial,

    async disponibilidad(usuario, material, almacen) {
      autorizar(usuario, 'inventario.consultar');
      return estadoMaterial(db.repos, material, almacen);
    },

    /** Kardex valorizado: lo calcula el ERP; la solución solo lo muestra. */
    async kardex(usuario, material) {
      autorizar(usuario, 'inventario.consultar');
      if (!(await db.repos.materiales.obtener(material))) throw errores.noEncontrado('Material', material);
      return ctx.erp.consultarKardex({ material });
    },
  };
}
