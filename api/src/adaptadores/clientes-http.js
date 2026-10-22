/**
 * Conector HTTP con el WMS y el ERP. Traduce el contrato REST al puerto que usan los servicios.
 *  - 2xx, 409 y 422 son respuestas del sistema externo (confirmada o rechazada).
 *  - Sin respuesta, tiempo agotado o 5xx son fallas técnicas: ErrorIntegracion (se reintenta).
 */
import { ErrorIntegracion } from '../../../core/dominio/errores.js';

const RUTA_OPERACION = {
  RESERVA: '/wms/reservas',
  SALIDA: '/wms/salidas',
  LIBERACION: '/wms/liberaciones',
  SOLICITUD_COMPRA: '/erp/solicitudes-compra',
};

function crearHttp(destino, base, { tiempoEsperaMs = 5000, token } = {}) {
  return async function llamar(metodo, ruta, { cuerpo, clave } = {}) {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), tiempoEsperaMs);
    let res;
    try {
      res = await fetch(`${base}${ruta}`, {
        method: metodo,
        headers: {
          'content-type': 'application/json',
          ...(clave ? { 'idempotency-key': clave } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: control.signal,
      });
    } catch (e) {
      throw new ErrorIntegracion(destino, `${destino} sin respuesta en ${metodo} ${ruta}: ${e.name === 'AbortError' ? 'tiempo agotado' : e.cause?.code ?? e.message}`, { tiempoAgotado: true });
    } finally {
      clearTimeout(temporizador);
    }
    if (res.status >= 500) throw new ErrorIntegracion(destino, `${destino} respondió ${res.status} en ${ruta}.`);
    const datos = await res.json().catch(() => ({}));
    if (res.ok || res.status === 409 || res.status === 422 || res.status === 404) return { estado: res.status, datos };
    throw new ErrorIntegracion(destino, `${destino} respondió ${res.status} en ${ruta}.`);
  };
}

export function crearClienteWmsHttp(base, opciones) {
  const llamar = crearHttp('WMS', base, opciones);
  return {
    async consultarDisponibilidad({ material, almacen }) {
      const q = new URLSearchParams({ material, ...(almacen ? { almacen } : {}) });
      return (await llamar('GET', `/wms/disponibilidad?${q}`)).datos;
    },
    async enviar(op) {
      return (await llamar('POST', RUTA_OPERACION[op.tipo], { cuerpo: op.mensaje, clave: op.id })).datos;
    },
    async consultarOperacion(id) {
      const r = await llamar('GET', `/wms/operaciones/${id}`);
      return r.estado === 404 ? { encontrada: false } : { encontrada: true, resultado: r.datos };
    },
  };
}

export function crearClienteErpHttp(base, opciones) {
  const llamar = crearHttp('ERP', base, opciones);
  return {
    async enviar(op) {
      return (await llamar('POST', RUTA_OPERACION[op.tipo], { cuerpo: op.mensaje, clave: op.id })).datos;
    },
    async consultarOperacion(id) {
      const r = await llamar('GET', `/erp/operaciones/${id}`);
      return r.estado === 404 ? { encontrada: false } : { encontrada: true, resultado: r.datos };
    },
    async consultarEnTransito({ material, almacen }) {
      const q = new URLSearchParams({ material, ...(almacen ? { almacen } : {}) });
      return (await llamar('GET', `/erp/en-transito?${q}`)).datos.cantidad;
    },
    async consultarValoracion({ material }) {
      return (await llamar('GET', `/erp/valoracion/${encodeURIComponent(material)}`)).datos;
    },
    async consultarKardex({ material }) {
      return (await llamar('GET', `/erp/kardex/${encodeURIComponent(material)}`)).datos;
    },
  };
}
