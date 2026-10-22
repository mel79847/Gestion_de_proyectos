/**
 * Simulador del ERP (sistema existente, dueño de la orden de compra, pagos y CPP).
 *   POST /erp/solicitudes-compra   crea la OC formal a partir de la SolPed aprobada
 *   GET  /erp/operaciones/:id      consulta por id de operación
 *   GET  /erp/ordenes-compra/en-transito, /erp/valoracion/:material, /erp/kardex/:material
 */
import { ErrorIntegracion } from '../dominio/errores.js';
import { costoPromedioPonderado } from '../dominio/calculos.js';

const copia = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const r2 = (n) => Math.round(n * 100) / 100;

export class SimuladorErp {
  constructor({ valoracion, ordenesCompra = [], proveedores, reloj }) {
    this.reloj = reloj;
    this.proveedores = new Map(proveedores.map((p) => [p.codigo, p]));
    this.valoracion = new Map(valoracion.map((v) => [v.material, { existencias: v.existencias, valor: v.valor, cpp: v.cpp }]));
    this.ocs = new Map(ordenesCompra.map((o) => [o.numero_oc, copia(o)]));
    this.operaciones = new Map();
    this.kardex = valoracion.map((v) => ({
      fecha: '2026-10-01T12:00:00.000Z', material: v.material, tipo: 'Saldo inicial', documento: 'Apertura', cantidad: v.existencias,
      costo_unitario: v.cpp, existencias: v.existencias, valor: v.valor, cpp: v.cpp,
    }));
    this.secuenciaOc = 4500012871;
    this.fallas = { caido: false, perderRespuestas: 0 };
    this.estadisticas = { solicitudes: 0, aplicadas: 0, duplicadasEvitadas: 0, rechazadas: 0 };
  }

  verificarDisponible() {
    if (this.fallas.caido) throw new ErrorIntegracion('ERP', 'El ERP no respondió en el tiempo de espera.', { tiempoAgotado: true });
  }

  procesar(tipo, mensaje, clave) {
    this.verificarDisponible();
    this.estadisticas.solicitudes += 1;
    if (this.operaciones.has(clave)) {
      this.estadisticas.duplicadasEvitadas += 1;
      return copia(this.operaciones.get(clave).resultado);
    }
    const resultado = tipo === 'SOLICITUD_COMPRA' ? this.crearOrdenCompra(mensaje) : rechazo('DATOS_INVALIDOS', `Operación ${tipo} no soportada.`);
    this.operaciones.set(clave, { tipo, mensaje: copia(mensaje), resultado });
    if (resultado.resultado === 'confirmada') this.estadisticas.aplicadas += 1;
    else this.estadisticas.rechazadas += 1;
    if (this.fallas.perderRespuestas > 0) {
      this.fallas.perderRespuestas -= 1;
      throw new ErrorIntegracion('ERP', 'La OC se creó en el ERP pero la respuesta se perdió.', { tiempoAgotado: true });
    }
    return copia(resultado);
  }

  consultarOperacion(clave) {
    this.verificarDisponible();
    const op = this.operaciones.get(clave);
    return op ? { encontrada: true, resultado: copia(op.resultado) } : { encontrada: false };
  }

  crearOrdenCompra(msg) {
    const prov = this.proveedores.get(msg.proveedor);
    if (!prov || !prov.habilitado) return rechazo('DATOS_INVALIDOS', `Proveedor ${msg.proveedor} no habilitado en el ERP.`);
    if (!(msg.cantidad > 0) || !(msg.precio_unitario > 0)) return rechazo('DATOS_INVALIDOS', 'Cantidad o precio no válidos.');
    const numero_oc = String(++this.secuenciaOc);
    const fecha = new Date(this.reloj.ahora().getTime() + prov.plazo_dias * 86400000).toISOString().slice(0, 10);
    this.ocs.set(numero_oc, {
      numero_oc, solicitud: msg.solicitud, material: msg.material, almacen: msg.almacen, proveedor: msg.proveedor,
      cantidad: msg.cantidad, recibido: 0, precio_unitario: msg.precio_unitario, fecha_prometida: fecha, estado: 'Abierta',
    });
    return { resultado: 'confirmada', estado: 'confirmada', numero_oc, fecha_prometida: fecha };
  }

  /** Compras confirmadas por recibir. */
  consultarEnTransito({ material, almacen }) {
    this.verificarDisponible();
    let total = 0;
    for (const oc of this.ocs.values()) {
      if (oc.estado !== 'Cerrada' && oc.material === material && (!almacen || oc.almacen === almacen)) total += oc.cantidad - oc.recibido;
    }
    return total;
  }

  consultarValoracion({ material }) {
    this.verificarDisponible();
    const v = this.valoracion.get(material) ?? { existencias: 0, valor: 0, cpp: 0 };
    return copia({ material, ...v });
  }

  consultarKardex({ material }) {
    this.verificarDisponible();
    return copia(this.kardex.filter((k) => k.material === material));
  }

  listarOrdenesCompra() {
    return copia([...this.ocs.values()]);
  }

  /** Ingreso aceptado en el WMS: el ERP recalcula el CPP con el precio de la OC. */
  registrarIngreso({ orden_compra, material, cantidad, documento }) {
    const oc = this.ocs.get(orden_compra);
    if (!oc) throw new Error(`OC ${orden_compra} no existe en el ERP.`);
    oc.recibido += cantidad;
    if (oc.recibido >= oc.cantidad) oc.estado = 'Cerrada';
    const v = this.valoracion.get(material);
    const n = costoPromedioPonderado({ existencias: v.existencias, valor: v.valor, cantidadIngreso: cantidad, costoUnitario: oc.precio_unitario });
    this.valoracion.set(material, n);
    this.kardex.push({ fecha: this.reloj.ahora().toISOString(), material, tipo: 'Ingreso', documento: `${documento}, OC ${orden_compra}`, cantidad, costo_unitario: oc.precio_unitario, ...n });
  }

  /** Consumo por salida a mantenimiento, valorizado al CPP vigente. */
  registrarConsumo({ material, cantidad, documento }) {
    const v = this.valoracion.get(material);
    const existencias = v.existencias - cantidad;
    const valor = r2(v.valor - cantidad * v.cpp);
    this.valoracion.set(material, { existencias, valor, cpp: v.cpp });
    this.kardex.push({ fecha: this.reloj.ahora().toISOString(), material, tipo: 'Salida', documento, cantidad: -cantidad, costo_unitario: v.cpp, existencias, valor, cpp: v.cpp });
  }

  instantanea() {
    return copia({ fallas: this.fallas, estadisticas: this.estadisticas, ordenes_compra: [...this.ocs.values()] });
  }
}

function rechazo(causa, mensaje) {
  return { resultado: 'rechazada', estado: 'rechazada', causa, mensaje };
}
