/**
 * Rutas REST. Cada router corresponde a un componente de la API (fase de diseño, C4 nivel 3):
 * el controlador solo traduce HTTP ↔ servicio; las reglas viven en el núcleo.
 */
import { Router } from 'express';
import { emitirToken, verificarClave } from '../seguridad.js';
import { autenticar, verificarFirma } from '../middleware/seguridad.js';

/** Envuelve un controlador async para que sus errores lleguen al manejador central. */
const h = (fn, estado = 200) => (req, res, next) =>
  Promise.resolve(fn(req, res))
    .then((r) => (res.headersSent ? undefined : res.status(estado).json(r)))
    .catch(next);

export function crearRutas({ servicios: s, buscarUsuario, config }) {
  const api = Router();

  // ---------- Autenticación ----------
  api.post('/auth/login', h(async (req, res) => {
    const { usuario, clave } = req.body ?? {};
    const u = usuario ? await buscarUsuario(usuario) : null;
    if (!u || !u.activo || !verificarClave(String(clave ?? ''), u.clave_hash)) {
      return res.status(401).json({ error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Usuario o contraseña incorrectos.' } });
    }
    return { token: emitirToken(u, config.jwtSecreto), usuario: { usuario: u.usuario, nombre: u.nombre, rol: u.rol } };
  }));

  // ---------- Webhooks (WMS / ERP), autenticados por firma ----------
  api.post('/integracion/webhooks/wms', verificarFirma(config.webhookSecreto), h((req) => s.webhooks.recibirWms(req.body), 202));
  api.post('/integracion/webhooks/erp', verificarFirma(config.webhookSecreto), h((req) => s.webhooks.recibirErp(req.body), 202));

  api.use(autenticar(config.jwtSecreto));
  api.get('/auth/yo', h((req) => req.usuario));

  // ---------- Catálogo (datos maestros) ----------
  const maestros = Router();
  maestros.get('/materiales', h((req) => s.maestros.listarMateriales(req.usuario)));
  maestros.post('/materiales/verificacion', h((req) => s.maestros.verificarMaterial(req.usuario, req.body)));
  maestros.post('/materiales', h((req) => s.maestros.crearMaterial(req.usuario, req.body), 201));
  maestros.get('/materiales/:codigo', h((req) => s.maestros.obtenerMaterial(req.usuario, req.params.codigo)));
  maestros.patch('/materiales/:codigo/parametros', h((req) => s.maestros.actualizarParametros(req.usuario, req.params.codigo, req.body.cambios ?? {}, req.body.motivo)));
  maestros.get('/equipos', h((req) => s.maestros.listarEquipos(req.usuario)));
  maestros.get('/equipos/:codigo/materiales', h((req) => s.maestros.materialesCompatibles(req.usuario, req.params.codigo)));
  maestros.get('/proveedores', h((req) => s.maestros.listarProveedores(req.usuario)));
  maestros.get('/almacenes', h((req) => s.maestros.listarAlmacenes(req.usuario)));
  api.use('/maestros', maestros);

  // ---------- Mantenimiento ----------
  const ordenes = Router();
  ordenes.get('/', h((req) => s.ordenes.listar(req.usuario, { estado: req.query.estado })));
  ordenes.post('/', h((req) => s.ordenes.crear(req.usuario, req.body), 201));
  ordenes.get('/:numero', h((req) => s.ordenes.obtener(req.usuario, req.params.numero)));
  ordenes.get('/:numero/trazabilidad', h((req) => s.consultas.trazabilidadOrden(req.usuario, req.params.numero)));
  ordenes.post('/:numero/validacion', h((req) => s.ordenes.validar(req.usuario, req.params.numero)));
  ordenes.post('/:numero/reservas', h((req) => s.ordenes.solicitarReservas(req.usuario, req.params.numero), 202));
  ordenes.post('/:numero/entregas', h((req) => s.ordenes.registrarEntrega(req.usuario, req.params.numero, req.body), 202));
  ordenes.post('/:numero/cambios-pieza', h((req) => s.ordenes.registrarCambioPieza(req.usuario, req.params.numero, req.body), 201));
  ordenes.post('/:numero/completar', h((req) => s.ordenes.completar(req.usuario, req.params.numero)));
  ordenes.post('/:numero/cierre', h((req) => s.ordenes.cerrar(req.usuario, req.params.numero)));
  ordenes.post('/:numero/anulacion', h((req) => s.ordenes.anular(req.usuario, req.params.numero, req.body.motivo)));
  api.use('/ordenes', ordenes);

  // ---------- Inventario y reservas ----------
  const inventario = Router();
  inventario.get('/disponibilidad/:material', h((req) => s.inventario.disponibilidad(req.usuario, req.params.material, req.query.almacen)));
  inventario.get('/kardex/:material', h((req) => s.inventario.kardex(req.usuario, req.params.material)));
  inventario.post('/reservas/:id/liberacion', h((req) => s.ordenes.liberarReserva(req.usuario, req.params.id, req.body.motivo), 202));
  api.use('/inventario', inventario);

  // ---------- Compras y reposición ----------
  const compras = Router();
  compras.get('/solicitudes', h((req) => s.compras.listar(req.usuario, { estado: req.query.estado, material: req.query.material })));
  compras.get('/solicitudes/:numero', h((req) => s.compras.obtener(req.usuario, req.params.numero)));
  compras.post('/solicitudes/:numero/cotizaciones', h((req) => s.compras.registrarCotizacion(req.usuario, req.params.numero, req.body), 201));
  compras.post('/solicitudes/:numero/aprobacion', h((req) => s.compras.aprobar(req.usuario, req.params.numero, req.body), 202));
  compras.post('/solicitudes/:numero/rechazo', h((req) => s.compras.rechazar(req.usuario, req.params.numero, req.body.motivo)));
  compras.post('/evaluaciones/:material', h((req) => s.compras.evaluar(req.usuario, req.params.material, req.query.almacen)));
  api.use('/compras', compras);

  // ---------- Integración ----------
  const integracion = Router();
  integracion.get('/operaciones', h((req) => s.integracion.listarOperaciones(req.usuario, { estado: req.query.estado, orden: req.query.orden, destino: req.query.destino })));
  integracion.post('/operaciones/:id/reproceso', h((req) => s.integracion.reprocesar(req.usuario, req.params.id)));
  integracion.post('/conciliaciones', h((req) => s.integracion.conciliar(req.usuario)));
  api.use('/integracion', integracion);

  // ---------- Alertas y auditoría ----------
  api.get('/alertas', h((req) => s.consultas.alertas(req.usuario, { estado: req.query.estado, destinatario_rol: req.query.rol })));
  api.post('/alertas/:id/atencion', h((req) => s.consultas.atenderAlerta(req.usuario, req.params.id)));
  api.get('/incidencias', h((req) => s.consultas.incidencias(req.usuario, { estado: req.query.estado, codigo: req.query.codigo })));
  api.post('/incidencias/:id/resolucion', h((req) => s.consultas.resolverIncidencia(req.usuario, req.params.id, req.body.resolucion)));
  api.get('/bitacora', h((req) => s.consultas.bitacora(req.usuario, { entidad: req.query.entidad, entidad_id: req.query.entidad_id })));
  api.get('/resumen', h((req) => s.consultas.resumen(req.usuario)));

  return api;
}
