/**
 * Aplicación Express de la API de negocio. No crea dependencias: las recibe ya armadas
 * (servicios del núcleo, búsqueda de usuarios, configuración), lo que permite probarla aislada.
 */
import express from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { crearRutas } from './rutas/index.js';
import { manejadorErrores, noEncontrada } from './middleware/errores.js';

const WEB = fileURLToPath(new URL('../../web/dist/', import.meta.url));

export function crearApp({ servicios, buscarUsuario, config, log = console, verificarSalud = async () => ({}) }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] ?? randomUUID();
    res.setHeader('x-request-id', req.id);
    res.setHeader('x-content-type-options', 'nosniff');
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      if (config.registrarSolicitudes) {
        const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
        log.info?.(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)} ms`);
      }
    });
    next();
  });

  // Se conserva el cuerpo crudo para verificar la firma HMAC de los webhooks.
  app.use(express.json({ limit: '256kb', verify: (req, _res, buf) => (req.cuerpoCrudo = buf.toString('utf8')) }));

  app.get('/salud', async (_req, res) => {
    const detalle = await verificarSalud().catch((e) => ({ error: e.message }));
    res.status(detalle.error ? 503 : 200).json({ estado: detalle.error ? 'degradado' : 'ok', ...detalle });
  });

  app.use('/api', crearRutas({ servicios, buscarUsuario, config }));
  if (existsSync(WEB)) app.use(express.static(WEB));
  app.use(noEncontrada);
  app.use(manejadorErrores(log));
  return app;
}
