/**
 * Servidor de simulación del WMS y del ERP (sistemas existentes de YPFB Transporte).
 * Publica el contrato REST que usa el conector y un panel de control de fallas
 * (/simulador/...) para las pruebas de recuperación.
 */
import express from 'express';
import { randomUUID } from 'node:crypto';
import { SimuladorWms } from '../core/simuladores/wms.js';
import { SimuladorErp } from '../core/simuladores/erp.js';
import { ErrorIntegracion } from '../core/dominio/errores.js';
import * as semilla from '../core/datos/semilla.js';
import { firmar } from '../api/src/middleware/seguridad.js';

export function crearMocks({ apiUrl, webhookSecreto, reloj = { ahora: () => new Date() }, log = console } = {}) {
  const erp = new SimuladorErp({ valoracion: semilla.valoracionErp, ordenesCompra: semilla.ordenCompraErp, proveedores: semilla.proveedores, reloj });

  async function enviarWebhook(ruta, evento) {
    const cuerpo = JSON.stringify(evento);
    for (let intento = 1; intento <= 3; intento++) {
      try {
        const res = await fetch(`${apiUrl}${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-firma': firmar(cuerpo, webhookSecreto) }, body: cuerpo });
        if (res.status < 500) return res.json();
      } catch (e) {
        log.warn?.(`[mocks] webhook ${evento.evento} intento ${intento} falló: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 500 * intento));
    }
    throw new Error(`No se pudo entregar el webhook ${evento.id_evento}`);
  }

  const wms = new SimuladorWms({
    lotes: semilla.lotesWms, materiales: semilla.materiales, reloj, ids: { uuid: randomUUID }, erp,
    emitir: (evento) => enviarWebhook('/api/integracion/webhooks/wms', evento),
  });

  const app = express();
  app.use(express.json());
  // El panel de simulación se usa desde la interfaz web (otro origen).
  app.use('/simulador', (req, res, next) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST');
    return req.method === 'OPTIONS' ? res.sendStatus(204) : next();
  });

  /** Ejecuta una operación del simulador; si "se pierde la respuesta" se corta la conexión. */
  const operar = (sim, tipo) => (req, res) => {
    const clave = req.headers['idempotency-key'];
    if (!clave) return res.status(400).json({ resultado: 'rechazada', causa: 'DATOS_INVALIDOS', mensaje: 'Falta Idempotency-Key.' });
    try {
      const r = sim.procesar(tipo, req.body, clave);
      const estado = r.resultado === 'confirmada' ? 201 : r.causa === 'STOCK_INSUFICIENTE' ? 409 : 422;
      return res.status(estado).json(r);
    } catch (e) {
      if (e instanceof ErrorIntegracion) return req.socket.destroy(); // sin respuesta
      throw e;
    }
  };
  const caidoAntes = (sim) => (_req, res, next) => (sim.fallas.caido ? res.status(503).json({ mensaje: 'Servicio no disponible' }) : next());
  const consultar = (sim) => (req, res) => {
    const r = sim.consultarOperacion(req.params.id);
    return r.encontrada ? res.json(r.resultado) : res.status(404).json({ mensaje: 'Operación no registrada' });
  };

  // ----- WMS -----
  app.get('/wms/disponibilidad', caidoAntes(wms), (req, res) => res.json(wms.consultarDisponibilidad({ material: req.query.material, almacen: req.query.almacen })));
  app.post('/wms/reservas', caidoAntes(wms), operar(wms, 'RESERVA'));
  app.post('/wms/salidas', caidoAntes(wms), operar(wms, 'SALIDA'));
  app.post('/wms/liberaciones', caidoAntes(wms), operar(wms, 'LIBERACION'));
  app.get('/wms/operaciones/:id', caidoAntes(wms), consultar(wms));

  // ----- ERP -----
  app.post('/erp/solicitudes-compra', caidoAntes(erp), operar(erp, 'SOLICITUD_COMPRA'));
  app.get('/erp/operaciones/:id', caidoAntes(erp), consultar(erp));
  app.get('/erp/en-transito', caidoAntes(erp), (req, res) => res.json({ cantidad: erp.consultarEnTransito({ material: req.query.material, almacen: req.query.almacen }) }));
  app.get('/erp/valoracion/:material', caidoAntes(erp), (req, res) => res.json(erp.consultarValoracion({ material: req.params.material })));
  app.get('/erp/kardex/:material', caidoAntes(erp), (req, res) => res.json(erp.consultarKardex({ material: req.params.material })));

  // ----- Panel de simulación -----
  const sims = { wms, erp };
  app.get('/simulador/:sistema/estado', (req, res) => res.json(sims[req.params.sistema].instantanea()));
  app.post('/simulador/:sistema/fallas', (req, res) => {
    const sim = sims[req.params.sistema];
    if ('caido' in req.body) sim.fallas.caido = Boolean(req.body.caido);
    if ('perderRespuestas' in req.body) sim.fallas.perderRespuestas = Number(req.body.perderRespuestas);
    res.json(sim.fallas);
  });
  app.post('/simulador/wms/recepciones', async (req, res, next) => {
    try {
      res.status(201).json(await wms.recibir(req.body));
    } catch (e) {
      next(e);
    }
  });
  app.post('/simulador/wms/ajustes', (req, res) => {
    wms.ajusteNoInformado(req.body);
    res.status(201).json({ ok: true });
  });
  app.post('/simulador/erp/reprogramaciones', async (req, res, next) => {
    try {
      const evento = { id_evento: randomUUID(), evento: 'oc.reprogramada', orden_compra: req.body.orden_compra, fecha_prometida: req.body.fecha_prometida };
      res.status(201).json(await enviarWebhook('/api/integracion/webhooks/erp', evento));
    } catch (e) {
      next(e);
    }
  });
  app.get('/simulador/erp/ordenes-compra', (_req, res) => res.json(erp.listarOrdenesCompra()));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => res.status(400).json({ mensaje: err.message }));
  return { app, wms, erp };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const puerto = Number(process.env.PUERTO_MOCKS ?? 4000);
  const { app } = crearMocks({ apiUrl: process.env.API_URL ?? 'http://localhost:3000', webhookSecreto: process.env.WEBHOOK_SECRETO ?? 'secreto-webhook-demo' });
  app.listen(puerto, () => console.log(`Simuladores WMS y ERP en http://localhost:${puerto}`));
}
