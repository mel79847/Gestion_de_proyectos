/**
 * Trabajador de integración (contenedor propio). Es el único proceso que escribe en el WMS y el ERP.
 *
 * Con RabbitMQ (AMQP_URL):
 *   - consume mro.operaciones: cada mensaje trae el id de una operación de la bandeja de salida;
 *   - si no hay respuesta, publica en mro.operaciones.reintento con TTL = espera 2^n;
 *   - si se agotan los intentos, publica en mro.operaciones.fallidas (además de la incidencia);
 *   - cada INTERVALO_BARRIDO_MS barre la bandeja por si algún aviso no llegó al broker.
 * Sin RabbitMQ: barre la bandeja cada INTERVALO_WORKER_MS.
 * Siempre: cada INTERVALO_RESPALDO_MS (15 min) ejecuta la sincronización de respaldo.
 * Varios trabajadores pueden correr a la vez: PostgreSQL reparte las filas con SKIP LOCKED.
 */
import { leerConfig } from '../api/src/config.js';
import { crearContenedor } from '../api/src/contenedor.js';

export async function iniciarTrabajador({ servicios, config, cola = null, log = console }) {
  let activo = true;
  let enCurso = Promise.resolve();
  const anotar = (r) => log.info?.(`[worker] ${r.tipo} ${r.id} → ${r.resultado}${r.recuperada ? ' (recuperada por id)' : ''}${r.espera_ms ? ` (reintento en ${r.espera_ms} ms)` : ''}`);

  const encadenar = (fn) => {
    enCurso = enCurso.then(fn).catch((e) => log.error?.('[worker] ciclo fallido', e));
    return enCurso;
  };
  const barrido = () => encadenar(async () => (await servicios.integracion.procesarPendientes({ limite: 25 })).forEach(anotar));
  const respaldo = () =>
    encadenar(async () => {
      const r = await servicios.integracion.sincronizacionRespaldo();
      if (r.recuperadas.length) log.info?.(`[worker] respaldo recuperó ${r.recuperadas.length} operación(es)`);
    });

  if (cola) {
    await cola.consumir(async (mensaje) => {
      const r = await servicios.integracion.procesarOperacion(mensaje.id);
      if (!r) return; // ya procesada por otro trabajador o aún no le toca
      anotar(r);
      if (r.resultado === 'reintento') await cola.reintentar(mensaje, r.espera_ms);
      if (r.resultado === 'incidencia') await cola.fallida(mensaje);
    });
  }
  const t1 = setInterval(() => activo && barrido(), cola ? config.intervaloBarridoMs : config.intervaloWorkerMs);
  const t2 = setInterval(() => activo && respaldo(), config.intervaloRespaldoMs);

  return {
    barrido,
    async detener() {
      activo = false;
      clearInterval(t1);
      clearInterval(t2);
      await enCurso;
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = leerConfig();
  const contenedor = crearContenedor(config);
  const cola = await contenedor.cola.conectar().catch((e) => {
    console.warn(`RabbitMQ no disponible (${e.message}); se usa el barrido de la bandeja de salida.`);
    return null;
  });
  const trabajador = await iniciarTrabajador({ servicios: contenedor.servicios, config, cola });
  console.log(`Trabajador de integración activo (${cola ? 'RabbitMQ + barrido cada ' + config.intervaloBarridoMs + ' ms' : 'barrido cada ' + config.intervaloWorkerMs + ' ms'}; respaldo cada ${config.intervaloRespaldoMs / 60000} min)`);
  const apagar = async () => {
    await trabajador.detener();
    await Promise.all([contenedor.db.cerrar(), cola?.cerrar()]);
    process.exit(0);
  };
  process.on('SIGTERM', apagar);
  process.on('SIGINT', apagar);
}
