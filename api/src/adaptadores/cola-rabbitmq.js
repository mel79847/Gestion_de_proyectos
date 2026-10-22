/**
 * Cola de operaciones pendientes en RabbitMQ (propuesta tecnológica, sección 4.4).
 *
 *   exchange "mro" (direct)
 *     ├─ mro.operaciones            cola principal: id de cada operación lista para enviar
 *     ├─ mro.operaciones.reintento  espera con TTL por mensaje; al vencer vuelve a la principal
 *     └─ mro.operaciones.fallidas   operaciones que agotaron los reintentos (para revisión)
 *
 * La bandeja de salida en PostgreSQL sigue siendo la fuente de verdad: el mensaje solo lleva
 * el id. Si RabbitMQ pierde un mensaje, el barrido periódico del trabajador recupera la operación.
 */
import amqp from 'amqplib';

const EXCHANGE = 'mro';
export const COLAS = Object.freeze({ principal: 'mro.operaciones', reintento: 'mro.operaciones.reintento', fallidas: 'mro.operaciones.fallidas' });

export async function crearColaRabbit(url, { log = console } = {}) {
  const conexion = await amqp.connect(url);
  const canal = await conexion.createConfirmChannel();
  await canal.assertExchange(EXCHANGE, 'direct', { durable: true });
  await canal.assertQueue(COLAS.principal, { durable: true });
  await canal.bindQueue(COLAS.principal, EXCHANGE, 'operacion');
  await canal.assertQueue(COLAS.reintento, { durable: true, arguments: { 'x-dead-letter-exchange': EXCHANGE, 'x-dead-letter-routing-key': 'operacion' } });
  await canal.assertQueue(COLAS.fallidas, { durable: true });

  const enviar = (cola, cuerpo, opciones = {}) =>
    new Promise((ok, mal) =>
      canal.sendToQueue(cola, Buffer.from(JSON.stringify(cuerpo)), { persistent: true, contentType: 'application/json', messageId: cuerpo.id, ...opciones }, (e) => (e ? mal(e) : ok())),
    );

  return {
    /** Aviso de operación nueva (lo llama la API después del COMMIT). */
    publicar: (op) => enviar(COLAS.principal, op),
    /** Reintento diferido: el mensaje vuelve a la cola principal al vencer el TTL. */
    reintentar: (op, esperaMs) => enviar(COLAS.reintento, op, { expiration: String(Math.max(1, Math.round(esperaMs))) }),
    fallida: (op) => enviar(COLAS.fallidas, op),
    /** Consume la cola principal de a un mensaje; confirma (ack) cuando el resultado quedó en la base. */
    async consumir(manejador) {
      await canal.prefetch(1);
      return canal.consume(COLAS.principal, async (msg) => {
        if (!msg) return;
        try {
          await manejador(JSON.parse(msg.content.toString()));
          canal.ack(msg);
        } catch (e) {
          log.error?.('[rabbitmq] mensaje no procesado, se reencola', e);
          canal.nack(msg, false, true);
        }
      });
    },
    async contar() {
      const r = {};
      for (const [k, q] of Object.entries(COLAS)) r[k] = (await canal.checkQueue(q)).messageCount;
      return r;
    },
    async cerrar() {
      await canal.close().catch(() => {});
      await conexion.close().catch(() => {});
    },
  };
}
