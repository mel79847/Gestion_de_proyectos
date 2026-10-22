/**
 * Puerta de enlace local: la interfaz llama al mismo núcleo que usa la API, pero en el
 * navegador, con repositorios en memoria y simuladores del WMS y del ERP.
 * Expone exactamente los mismos métodos que gateway-http.js.
 */
import { crearEntornoMemoria } from '../../core/entorno-memoria.js';

export function crearGatewayLocal({ alCambiar = () => {} } = {}) {
  const e = crearEntornoMemoria({ config: { backoffBaseMs: 1500, maxIntentos: 3, tiempoEsperaMs: 8000 }, latenciaMs: 60 });
  const s = e.servicios;
  const u = (usuario) => e.usuario(usuario);
  const cambio = async (p) => {
    try {
      return await p;
    } finally {
      alCambiar();
    }
  };

  return {
    modo: 'local',
    usuarios: e.semilla.usuarios,

    resumen: (us) => s.consultas.resumen(u(us)),
    materiales: (us) => s.maestros.listarMateriales(u(us)),
    material: (us, c) => s.maestros.obtenerMaterial(u(us), c),
    verificarMaterial: (us, f) => s.maestros.verificarMaterial(u(us), f),
    crearMaterial: (us, f) => cambio(s.maestros.crearMaterial(u(us), f)),
    equipos: (us) => s.maestros.listarEquipos(u(us)),
    compatibles: (us, eq) => s.maestros.materialesCompatibles(u(us), eq),
    proveedores: (us) => s.maestros.listarProveedores(u(us)),
    almacenes: (us) => s.maestros.listarAlmacenes(u(us)),

    ordenes: (us) => s.ordenes.listar(u(us)),
    orden: (us, n) => s.ordenes.obtener(u(us), n),
    crearOrden: (us, d) => cambio(s.ordenes.crear(u(us), d)),
    validar: (us, n) => cambio(s.ordenes.validar(u(us), n)),
    reservar: (us, n) => cambio(s.ordenes.solicitarReservas(u(us), n)),
    entregar: (us, n, receptor) => cambio(s.ordenes.registrarEntrega(u(us), n, { receptor })),
    cambioPieza: (us, n, d) => cambio(s.ordenes.registrarCambioPieza(u(us), n, d)),
    completar: (us, n) => cambio(s.ordenes.completar(u(us), n)),
    cerrar: (us, n) => cambio(s.ordenes.cerrar(u(us), n)),
    trazabilidad: (us, n) => s.consultas.trazabilidadOrden(u(us), n),

    disponibilidad: (us, m, a) => s.inventario.disponibilidad(u(us), m, a),
    kardex: (us, m) => s.inventario.kardex(u(us), m),

    solicitudes: (us) => s.compras.listar(u(us)),
    solicitud: (us, n) => s.compras.obtener(u(us), n),
    cotizar: (us, n, c) => cambio(s.compras.registrarCotizacion(u(us), n, c)),
    aprobar: (us, n) => cambio(s.compras.aprobar(u(us), n)),
    evaluar: (us, m, a) => cambio(s.compras.evaluar(u(us), m, a)),

    operaciones: (us, f) => s.integracion.listarOperaciones(u(us), f),
    reprocesar: (us, id) => cambio(s.integracion.reprocesar(u(us), id)),
    conciliar: (us) => cambio(s.integracion.conciliar(u(us))),
    alertas: (us) => s.consultas.alertas(u(us)),
    incidencias: (us) => s.consultas.incidencias(u(us)),
    bitacora: (us) => s.consultas.bitacora(u(us)),

    /** Un ciclo del trabajador; solo avisa a la interfaz si alguna operación cambió. */
    procesar: async () => {
      const r = await s.integracion.procesarPendientes();
      if (r.length) alCambiar();
      return r;
    },
    respaldo: () => cambio(s.integracion.sincronizacionRespaldo()),

    simulador: {
      estado: async () => ({ wms: e.wmsSim.instantanea(), erp: e.erpSim.instantanea() }),
      fallas: async (sistema, patch) => {
        Object.assign((sistema === 'wms' ? e.wmsSim : e.erpSim).fallas, patch);
        alCambiar();
      },
      recibir: (datos) => cambio(e.wmsSim.recibir(datos)),
      ajuste: async (datos) => {
        e.wmsSim.ajusteNoInformado(datos);
        alCambiar();
      },
      ordenesCompra: async () => e.erpSim.listarOrdenesCompra(),
      /** Envía al WMS la misma operación dos veces (prueba de idempotencia). */
      reenviar: async (id) => {
        const op = await e.db.repos.operaciones.obtener(id);
        return e.wmsSim.procesar(op.tipo, op.mensaje, op.id);
      },
    },
  };
}
