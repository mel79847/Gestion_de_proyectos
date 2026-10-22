/**
 * Cálculos de inventario MRO definidos en la fase conceptual.
 * Funciones puras: no leen ni escriben datos; reciben valores y devuelven resultados.
 */
import { errores } from './errores.js';

/** Factor Z por criticidad del material (nivel de servicio). */
export const NIVEL_SERVICIO = Object.freeze({
  critica: { nivel: 0.99, z: 2.33 },
  alta: { nivel: 0.95, z: 1.65 },
  media: { nivel: 0.9, z: 1.28 },
  normal: { nivel: 0.8, z: 0.84 },
});

const redondear2 = (n) => Math.round(n * 100) / 100;

/** Disponible = físico − reservado − bloqueado (nunca negativo). */
export function stockDisponible({ fisico, reservado, bloqueado }) {
  return Math.max(0, fisico - reservado - bloqueado);
}

/**
 * Posición de inventario = disponible + compras confirmadas por recibir
 * − requerimientos aprobados aún no reservados.
 */
export function posicionInventario({ disponible, enTransito = 0, requerimientosPendientes = 0 }) {
  return disponible + enTransito - requerimientosPendientes;
}

/** SS = Z × σd × √L, redondeado a la unidad. */
export function stockSeguridad({ criticidad, sigmaDiaria, plazoDias }) {
  const fila = NIVEL_SERVICIO[criticidad];
  if (!fila) throw errores.validacion(`Criticidad desconocida: ${criticidad}.`);
  return Math.round(fila.z * sigmaDiaria * Math.sqrt(plazoDias));
}

/** ROP = (d × L) + SS, redondeado a la unidad. */
export function puntoReorden({ demandaDiaria, plazoDias, stockSeguridad: ss }) {
  return Math.round(demandaDiaria * plazoDias + ss);
}

/** EOQ = √(2DS / H). Devuelve null si los datos no permiten calcularla. */
export function cantidadEconomica({ demandaAnual, costoPedido, costoMantener }) {
  if (!(demandaAnual > 0 && costoPedido > 0 && costoMantener > 0)) return null;
  return Math.round(Math.sqrt((2 * demandaAnual * costoPedido) / costoMantener));
}

/** Parámetros de reposición de un material a partir de su ficha maestra. */
export function parametrosReposicion(material) {
  const ss = stockSeguridad({
    criticidad: material.criticidad,
    sigmaDiaria: Number(material.sigma_diaria),
    plazoDias: Number(material.plazo_dias),
  });
  const rop = puntoReorden({
    demandaDiaria: Number(material.demanda_diaria),
    plazoDias: Number(material.plazo_dias),
    stockSeguridad: ss,
  });
  const eoq =
    material.metodo_reposicion === 'EOQ'
      ? cantidadEconomica({
          demandaAnual: Number(material.demanda_diaria) * 365,
          costoPedido: Number(material.costo_pedido),
          costoMantener: Number(material.costo_mantener),
        })
      : null;
  return { ss, rop, eoq, z: NIVEL_SERVICIO[material.criticidad].z };
}

/**
 * Cantidad a solicitar cuando la posición alcanza el ROP.
 * EOQ si hay datos confiables; si no, hasta el stock máximo aprobado.
 */
export function cantidadAComprar(material, posicion) {
  const { rop, eoq } = parametrosReposicion(material);
  if (eoq) {
    const minimo = Math.max(0, rop - posicion + 1);
    return { cantidad: Math.max(eoq, minimo), metodo: 'EOQ', detalle: `EOQ = ${eoq}` };
  }
  const cantidad = Math.max(0, Number(material.stock_maximo) - posicion);
  return {
    cantidad,
    metodo: 'HASTA_MAXIMO',
    detalle: `Máximo ${material.stock_maximo} − posición ${posicion}`,
  };
}

/**
 * Costo promedio ponderado tras un ingreso.
 * CPP = (valor en existencia + valor del ingreso) ÷ (unidades en existencia + unidades ingresadas)
 */
export function costoPromedioPonderado({ existencias, valor, cantidadIngreso, costoUnitario }) {
  const unidades = existencias + cantidadIngreso;
  if (unidades <= 0) return { cpp: 0, existencias: 0, valor: 0 };
  const nuevoValor = valor + cantidadIngreso * costoUnitario;
  return { cpp: redondear2(nuevoValor / unidades), existencias: unidades, valor: redondear2(nuevoValor) };
}

/** Un lote está vencido si su fecha de vencimiento es anterior a la fecha de referencia. */
export function estaVencido(lote, hoy) {
  return Boolean(lote.vence) && lote.vence < hoy;
}

/**
 * Selecciona unidades para una salida: solo lotes utilizables (no bloqueados ni vencidos);
 * FEFO si el material vence, PEPS en caso contrario. La compatibilidad se valida antes, en la orden.
 * @returns {{lote:string, serie:string|null, cantidad:number, vence:string|null}[]}
 */
export function seleccionarLotes(lotes, cantidad, { perecible, hoy }) {
  const utilizables = lotes
    .filter((l) => !l.bloqueado && !estaVencido(l, hoy) && l.cantidad > 0)
    .sort((a, b) =>
      perecible
        ? (a.vence ?? '9999').localeCompare(b.vence ?? '9999') || a.fecha_ingreso.localeCompare(b.fecha_ingreso)
        : a.fecha_ingreso.localeCompare(b.fecha_ingreso),
    );
  const asignaciones = [];
  let restante = cantidad;
  for (const lote of utilizables) {
    if (restante === 0) break;
    const toma = Math.min(lote.cantidad, restante);
    asignaciones.push({ id_lote: lote.id, lote: lote.lote, serie: lote.serie ?? null, cantidad: toma, vence: lote.vence ?? null });
    restante -= toma;
  }
  if (restante > 0) {
    throw errores.conflicto('STOCK_INSUFICIENTE', `Faltan ${restante} unidades utilizables.`, { faltante: restante });
  }
  return asignaciones;
}
