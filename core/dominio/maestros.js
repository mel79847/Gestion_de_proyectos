/**
 * Gestión de datos maestros (MDM). Un material tiene un solo código en toda la
 * organización: FAMILIA-SUBFAMILIA-CORRELATIVO, p. ej. FIL-ACE-0021.
 * El código lo asigna el maestro; la descripción se normaliza para detectar duplicados
 * escritos de otra forma ("Filtro aceite Volvo" y "FILTRO DE ACEITE - VOLVO").
 */
import { errores } from './errores.js';

export const PATRON_CODIGO = /^[A-Z]{3}-[A-Z]{3}-\d{4}$/;
export const UNIDADES = Object.freeze(['und', 'jgo', 'bal', 'lt', 'kg', 'm']);
export const CRITICIDADES = Object.freeze(['critica', 'alta', 'media', 'normal']);
export const METODOS = Object.freeze(['EOQ', 'HASTA_MAXIMO']);
export const UMBRAL_DUPLICADO = 0.75;

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'y', 'con', 'en', 'a', 'p']);
const SINONIMOS = new Map([
  ['filtros', 'filtro'],
  ['flt', 'filtro'],
  ['aceites', 'aceite'],
  ['empaquetadura', 'empaque'],
  ['empaquetaduras', 'empaque'],
  ['juntas', 'empaque'],
  ['junta', 'empaque'],
  ['rodamientos', 'rodamiento'],
  ['ruleman', 'rodamiento'],
  ['valvula', 'valvula'],
  ['valvulas', 'valvula'],
]);

/** Minúsculas, sin tildes ni signos, sin palabras vacías, con sinónimos unificados y tokens ordenados. */
export function normalizarDescripcion(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b([a-z])[\s-]+(\d)/g, '$1$2') // "D-13" y "D 13" se leen como "d13"
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !PALABRAS_VACIAS.has(t))
    .map((t) => SINONIMOS.get(t) ?? t)
    .sort()
    .join(' ');
}

/** Similitud de Jaccard entre los tokens normalizados de dos descripciones (0 a 1). */
export function similitud(a, b) {
  const A = new Set(normalizarDescripcion(a).split(' ').filter(Boolean));
  const B = new Set(normalizarDescripcion(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const t of A) if (B.has(t)) comunes += 1;
  return comunes / (A.size + B.size - comunes);
}

/** Busca materiales existentes que probablemente sean el mismo artículo. */
export function posiblesDuplicados(descripcion, existentes) {
  return existentes
    .map((m) => ({ codigo: m.codigo, descripcion: m.descripcion, similitud: Math.round(similitud(descripcion, m.descripcion) * 100) / 100 }))
    .filter((r) => r.similitud >= UMBRAL_DUPLICADO)
    .sort((a, b) => b.similitud - a.similitud);
}

/** Construye el código a partir de familia, subfamilia y el siguiente correlativo disponible. */
export function construirCodigo(familia, subfamilia, correlativo) {
  const codigo = `${familia}-${subfamilia}-${String(correlativo).padStart(4, '0')}`;
  if (!PATRON_CODIGO.test(codigo)) {
    throw errores.validacion('Familia y subfamilia deben tener tres letras mayúsculas.', { codigo });
  }
  return codigo;
}

/** Valida la ficha de un material antes de registrarla. */
export function validarFichaMaterial(f) {
  const faltan = ['familia', 'subfamilia', 'descripcion', 'unidad', 'criticidad', 'metodo_reposicion'].filter(
    (c) => f[c] === undefined || f[c] === null || String(f[c]).trim() === '',
  );
  if (faltan.length) throw errores.validacion(`Faltan datos obligatorios: ${faltan.join(', ')}.`, { faltan });
  if (!UNIDADES.includes(f.unidad)) throw errores.validacion(`Unidad no válida: ${f.unidad}.`);
  if (!CRITICIDADES.includes(f.criticidad)) throw errores.validacion(`Criticidad no válida: ${f.criticidad}.`);
  if (!METODOS.includes(f.metodo_reposicion)) throw errores.validacion(`Método no válido: ${f.metodo_reposicion}.`);
  for (const c of ['demanda_diaria', 'sigma_diaria', 'plazo_dias', 'stock_maximo']) {
    if (!(Number(f[c]) >= 0)) throw errores.validacion(`${c} debe ser un número mayor o igual a cero.`);
  }
  if (Number(f.plazo_dias) <= 0) throw errores.validacion('El plazo de reposición debe ser mayor a cero días.');
}
