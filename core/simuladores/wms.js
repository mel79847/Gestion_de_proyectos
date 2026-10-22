/**
 * Simulador del WMS (sistema existente, dueño del stock). En la demostración reemplaza
 * al WMS real; expone las mismas operaciones que el contrato de integración:
 *   POST /wms/reservas, POST /wms/salidas, POST /wms/liberaciones, GET /wms/operaciones/:id,
 *   GET /wms/disponibilidad. Las fallas se pueden activar para probar la recuperación.
 */
import { ErrorIntegracion } from '../dominio/errores.js';
import { estaVencido, seleccionarLotes, stockDisponible } from '../dominio/calculos.js';

const copia = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

export class SimuladorWms {
  /**
   * @param {object} o
   * @param {object[]} o.lotes         existencias iniciales
   * @param {object[]} o.materiales    catálogo (para validar códigos y saber si es perecible)
   * @param {{ahora:()=>Date}} o.reloj
   * @param {{uuid:()=>string}} o.ids
   * @param {object} [o.erp]          simulador ERP (integración propia WMS→ERP de valoración)
   * @param {(evento:object)=>Promise<void>} [o.emitir] envía webhooks a la solución
   */
  constructor({ lotes, materiales, reloj, ids, erp = null, emitir = async () => {} }) {
    this.reloj = reloj;
    this.ids = ids;
    this.erp = erp;
    this.emitir = emitir;
    this.materiales = new Map(materiales.map((m) => [m.codigo, m]));
    this.lotes = lotes.map((l, i) => ({ id: i + 1, serie: null, bloqueado: false, ...copia(l) }));
    this.reservas = new Map();
    this.operaciones = new Map();
    this.movimientos = [];
    this.secuencia = { reserva: 88411, movimiento: 51230, lote: this.lotes.length };
    this.fallas = { caido: false, perderRespuestas: 0 };
    this.estadisticas = { solicitudes: 0, aplicadas: 0, duplicadasEvitadas: 0, rechazadas: 0 };
  }

  hoy() {
    return this.reloj.ahora().toISOString().slice(0, 10);
  }

  verificarDisponible() {
    if (this.fallas.caido) throw new ErrorIntegracion('WMS', 'El WMS no respondió en el tiempo de espera.', { tiempoAgotado: true });
  }

  lotesDe(material, almacen) {
    return this.lotes.filter((l) => l.material === material && (!almacen || l.almacen === almacen) && l.cantidad > 0);
  }

  reservadoDe(material, almacen) {
    let total = 0;
    for (const r of this.reservas.values()) {
      if (r.estado === 'activa' && r.material === material && (!almacen || r.almacen === almacen)) total += r.cantidad;
    }
    return total;
  }

  /** GET /wms/disponibilidad?material=&almacen= */
  consultarDisponibilidad({ material, almacen }) {
    this.verificarDisponible();
    const hoy = this.hoy();
    const lotes = this.lotesDe(material, almacen);
    const fisico = lotes.reduce((s, l) => s + l.cantidad, 0);
    const bloqueado = lotes.filter((l) => l.bloqueado || estaVencido(l, hoy)).reduce((s, l) => s + l.cantidad, 0);
    const reservado = this.reservadoDe(material, almacen);
    return copia({
      material,
      almacen: almacen ?? null,
      fisico,
      reservado,
      bloqueado,
      disponible: stockDisponible({ fisico, reservado, bloqueado }),
      lotes: lotes.map((l) => ({
        lote: l.lote, serie: l.serie, ubicacion: l.ubicacion, almacen: l.almacen, cantidad: l.cantidad, vence: l.vence, fecha_ingreso: l.fecha_ingreso,
        estado: l.bloqueado ? 'Bloqueado' : estaVencido(l, hoy) ? 'Vencido' : 'Disponible', motivo: l.motivo_bloqueo ?? null,
      })),
    });
  }

  /**
   * Punto único de escritura. La clave de idempotencia es el id_operacion:
   * si ya se procesó, devuelve la misma respuesta sin volver a aplicar el cambio.
   */
  procesar(tipo, mensaje, clave) {
    this.verificarDisponible();
    this.estadisticas.solicitudes += 1;
    if (this.operaciones.has(clave)) {
      this.estadisticas.duplicadasEvitadas += 1;
      return copia(this.operaciones.get(clave).resultado);
    }
    const resultado = this.aplicar(tipo, mensaje);
    this.operaciones.set(clave, { tipo, mensaje: copia(mensaje), resultado, fecha: this.reloj.ahora().toISOString() });
    if (resultado.resultado === 'confirmada') this.estadisticas.aplicadas += 1;
    else this.estadisticas.rechazadas += 1;
    if (this.fallas.perderRespuestas > 0) {
      this.fallas.perderRespuestas -= 1;
      throw new ErrorIntegracion('WMS', 'La operación se aplicó en el WMS pero la respuesta se perdió.', { tiempoAgotado: true });
    }
    return copia(resultado);
  }

  /** GET /wms/operaciones/:id */
  consultarOperacion(clave) {
    this.verificarDisponible();
    const op = this.operaciones.get(clave);
    return op ? { encontrada: true, resultado: copia(op.resultado) } : { encontrada: false };
  }

  aplicar(tipo, msg) {
    const material = this.materiales.get(msg.material);
    if (!material) return rechazo('DATOS_INVALIDOS', `Material ${msg.material} no existe en el WMS.`);
    if (!(Number.isInteger(msg.cantidad) && msg.cantidad > 0) && tipo !== 'LIBERACION') return rechazo('DATOS_INVALIDOS', 'Cantidad no válida.');
    if (tipo === 'RESERVA') return this.reservar(msg);
    if (tipo === 'SALIDA') return this.registrarSalida(msg, material);
    if (tipo === 'LIBERACION') return this.liberar(msg);
    return rechazo('DATOS_INVALIDOS', `Operación ${tipo} no soportada.`);
  }

  reservar(msg) {
    const { disponible } = this.consultarDisponibilidad({ material: msg.material, almacen: msg.almacen });
    if (disponible < msg.cantidad) {
      return { ...rechazo('STOCK_INSUFICIENTE', `Disponible ${disponible}, solicitado ${msg.cantidad}.`), disponible };
    }
    const ref = `RES-${++this.secuencia.reserva}`;
    this.reservas.set(ref, { ref, orden: msg.orden, material: msg.material, almacen: msg.almacen, cantidad: msg.cantidad, estado: 'activa' });
    return { resultado: 'confirmada', estado: 'confirmada', ref_reserva: ref, disponible: disponible - msg.cantidad };
  }

  registrarSalida(msg, material) {
    const reserva = this.reservas.get(msg.ref_reserva);
    if (!reserva || reserva.estado !== 'activa') return rechazo('DATOS_INVALIDOS', `La reserva ${msg.ref_reserva} no está activa.`);
    if (reserva.cantidad !== msg.cantidad) return rechazo('DATOS_INVALIDOS', 'La cantidad no coincide con la reserva.');
    const candidatos = this.lotesDe(reserva.material, reserva.almacen);
    let asignaciones;
    try {
      asignaciones = seleccionarLotes(candidatos, msg.cantidad, { perecible: material.perecible, hoy: this.hoy() });
    } catch {
      return rechazo('STOCK_INSUFICIENTE', 'No hay unidades utilizables para la salida.');
    }
    for (const a of asignaciones) this.lotes.find((l) => l.id === a.id_lote).cantidad -= a.cantidad;
    reserva.estado = 'consumida';
    const ref = `MOV-${++this.secuencia.movimiento}`;
    this.movimientos.push({ ref, tipo: 'SALIDA', material: reserva.material, almacen: reserva.almacen, cantidad: msg.cantidad, lotes: asignaciones, orden: reserva.orden, fecha: this.reloj.ahora().toISOString() });
    this.erp?.registrarConsumo({ material: reserva.material, cantidad: msg.cantidad, documento: `${ref}, ${reserva.orden}` });
    return { resultado: 'confirmada', estado: 'confirmada', ref_movimiento: ref, lotes: asignaciones.map(({ id_lote, ...a }) => a) };
  }

  liberar(msg) {
    const reserva = this.reservas.get(msg.ref_reserva);
    if (!reserva || reserva.estado !== 'activa') return rechazo('DATOS_INVALIDOS', `La reserva ${msg.ref_reserva} no está activa.`);
    reserva.estado = 'liberada';
    const ref = `MOV-${++this.secuencia.movimiento}`;
    this.movimientos.push({ ref, tipo: 'LIBERACION', material: reserva.material, almacen: reserva.almacen, cantidad: reserva.cantidad, orden: reserva.orden, fecha: this.reloj.ahora().toISOString() });
    return { resultado: 'confirmada', estado: 'confirmada', ref_movimiento: ref };
  }

  /**
   * Recepción física en almacén (pantalla propia del WMS). Ingresa solo lo aceptado,
   * informa al ERP para el CPP y avisa a la solución con un webhook.
   */
  async recibir({ orden_compra, material, almacen, cantidad_recibida, cantidad_aceptada, lote, vence = null, ubicacion = 'R-00-1' }) {
    if (!this.materiales.has(material)) throw new Error(`Material ${material} no existe en el WMS.`);
    if (cantidad_aceptada > cantidad_recibida) throw new Error('La cantidad aceptada no puede superar la recibida.');
    const fecha = this.hoy();
    if (cantidad_aceptada > 0) {
      this.lotes.push({ id: ++this.secuencia.lote, material, almacen, ubicacion, lote, serie: null, fecha_ingreso: fecha, vence, cantidad: cantidad_aceptada, bloqueado: false });
    }
    const ref = `MOV-${++this.secuencia.movimiento}`;
    this.movimientos.push({ ref, tipo: 'ENTRADA', material, almacen, cantidad: cantidad_aceptada, lotes: [{ lote, cantidad: cantidad_aceptada, vence }], orden_compra, fecha: this.reloj.ahora().toISOString() });
    this.erp?.registrarIngreso({ orden_compra, material, cantidad: cantidad_aceptada, documento: ref });
    const evento = {
      id_evento: this.ids.uuid(),
      evento: 'recepcion.aceptada',
      orden_compra,
      material,
      almacen,
      cantidad_recibida,
      cantidad_aceptada,
      lote,
      fecha_vencimiento: vence,
      ref_ingreso: ref,
    };
    await this.emitir(evento);
    return evento;
  }

  /** Ajuste hecho directamente en el WMS sin informar al ERP (para probar la conciliación). */
  ajusteNoInformado({ material, almacen, cantidad }) {
    const lote = this.lotesDe(material, almacen)[0];
    if (!lote) throw new Error('Sin lotes para ajustar.');
    lote.cantidad = Math.max(0, lote.cantidad + cantidad);
    this.movimientos.push({ ref: `MOV-${++this.secuencia.movimiento}`, tipo: 'AJUSTE', material, almacen, cantidad, fecha: this.reloj.ahora().toISOString() });
  }

  instantanea() {
    return copia({
      fallas: this.fallas,
      estadisticas: this.estadisticas,
      reservas: [...this.reservas.values()],
      movimientos: this.movimientos.slice(-30).reverse(),
      operaciones_registradas: this.operaciones.size,
    });
  }
}

function rechazo(causa, mensaje) {
  return { resultado: 'rechazada', estado: 'rechazada', causa, mensaje };
}
