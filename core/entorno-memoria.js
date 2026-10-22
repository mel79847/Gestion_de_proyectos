/**
 * Entorno completo en memoria: núcleo + simuladores WMS/ERP + repositorios en memoria.
 * Lo usan las pruebas unitarias y la demostración en el navegador.
 */
import { crearServicios } from './index.js';
import * as semillaBase from './datos/semilla.js';
import { crearDbMemoria } from './adaptadores/memoria/repos.js';
import { crearClienteErpLocal, crearClienteWmsLocal } from './adaptadores/clientes-locales.js';
import { SimuladorWms } from './simuladores/wms.js';
import { SimuladorErp } from './simuladores/erp.js';

/** UUID v4; randomUUID solo existe en contextos seguros, getRandomValues en todos. */
function uuidV4() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function crearEntornoMemoria({ reloj, config = {}, latenciaMs = 0, semilla = semillaBase } = {}) {
  const relojUsado = reloj ?? { ahora: () => new Date() };
  const ids = { uuid: uuidV4 };

  const erpSim = new SimuladorErp({
    valoracion: semilla.valoracionErp,
    ordenesCompra: semilla.ordenCompraErp,
    proveedores: semilla.proveedores,
    reloj: relojUsado,
  });
  let servicios = null;
  const eventosEmitidos = [];
  const wmsSim = new SimuladorWms({
    lotes: semilla.lotesWms,
    materiales: semilla.materiales,
    reloj: relojUsado,
    ids,
    erp: erpSim,
    emitir: async (evento) => {
      eventosEmitidos.push(evento);
      await servicios.webhooks.recibirWms(evento);
    },
  });

  const db = crearDbMemoria(semilla);
  servicios = crearServicios({
    db,
    wms: crearClienteWmsLocal(wmsSim, { latenciaMs }),
    erp: crearClienteErpLocal(erpSim, { latenciaMs }),
    reloj: relojUsado,
    ids,
    config,
  });

  const usuario = (u) => semilla.usuarios.find((x) => x.usuario === u);
  return { servicios, db, wmsSim, erpSim, eventosEmitidos, usuario, semilla };
}
