/** Configuración desde variables de entorno (12-factor). */
const requerida = (nombre, porDefecto) => {
  const v = process.env[nombre] ?? porDefecto;
  if (v === undefined) throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
};

export function leerConfig() {
  return {
    puerto: Number(process.env.PUERTO ?? 3000),
    databaseUrl: requerida('DATABASE_URL', 'postgres://postgres@localhost:5432/ypfb_mro'),
    wmsUrl: requerida('WMS_URL', 'http://localhost:4000'),
    erpUrl: requerida('ERP_URL', 'http://localhost:4000'),
    jwtSecreto: requerida('JWT_SECRETO', 'cambiar-en-produccion'),
    webhookSecreto: requerida('WEBHOOK_SECRETO', 'secreto-webhook-demo'),
    tiempoEsperaMs: Number(process.env.TIEMPO_ESPERA_MS ?? 5000),
    maxIntentos: Number(process.env.MAX_INTENTOS ?? 3),
    backoffBaseMs: Number(process.env.BACKOFF_BASE_MS ?? 2000),
    intervaloWorkerMs: Number(process.env.INTERVALO_WORKER_MS ?? 1000),
    intervaloRespaldoMs: Number(process.env.INTERVALO_RESPALDO_MS ?? 15 * 60 * 1000),
    amqpUrl: process.env.AMQP_URL ?? null,
    intervaloBarridoMs: Number(process.env.INTERVALO_BARRIDO_MS ?? 5000),
    registrarSolicitudes: process.env.REGISTRAR_SOLICITUDES !== '0',
  };
}
