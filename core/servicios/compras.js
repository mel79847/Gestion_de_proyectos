/**
 * Componente Compras y reposición. La solución crea la solicitud de compra (SolPed);
 * la orden de compra formal la crea el ERP y vuelve como referencia.
 */
import { autorizar } from '../dominio/permisos.js';
import { errores, ErrorIntegracion } from '../dominio/errores.js';
import { cantidadAComprar } from '../dominio/calculos.js';
import { SOLICITUD, transicionar } from '../dominio/estados.js';
import { USUARIO_SISTEMA } from './soporte.js';

/** Pesos para comparar cotizaciones (RF-15). */
export const PESOS_COTIZACION = Object.freeze({ precio: 0.5, plazo: 0.25, garantia: 0.1, cumplimiento: 0.15 });

export function puntuarCotizaciones(cotizaciones) {
  if (!cotizaciones.length) return [];
  const minPrecio = Math.min(...cotizaciones.map((c) => c.precio));
  const minPlazo = Math.min(...cotizaciones.map((c) => c.plazo_dias));
  const maxGarantia = Math.max(1, ...cotizaciones.map((c) => c.garantia_meses));
  return cotizaciones
    .map((c) => ({
      ...c,
      puntaje:
        Math.round(
          (PESOS_COTIZACION.precio * (minPrecio / c.precio) +
            PESOS_COTIZACION.plazo * (minPlazo / c.plazo_dias) +
            PESOS_COTIZACION.garantia * (c.garantia_meses / maxGarantia) +
            PESOS_COTIZACION.cumplimiento * (c.cumplimiento / 100)) *
            1000,
        ) / 10,
    }))
    .sort((a, b) => b.puntaje - a.puntaje);
}

export function crearServicioCompras(ctx, soporte, inventario) {
  const { db } = ctx;

  /**
   * Evalúa la posición contra el ROP (RF-13) o una falta de stock (RF-14) y crea la
   * solicitud en borrador si no hay otra compra en curso del mismo material.
   */
  async function evaluarReposicion(repos, usuario, material, { origen = 'ROP', orden = null, almacen = null } = {}) {
    const estado = await inventario.estadoMaterial(repos, material, almacen);
    if (origen === 'ROP' && !estado.bajo_rop) {
      return { requiere: false, motivo: `Posición ${estado.posicion} sobre el ROP ${estado.rop}.`, estado };
    }
    const enCurso = await repos.solicitudes.abiertaPorMaterial(material);
    if (enCurso) {
      await soporte.auditar(repos, usuario, 'reposicion.omitida', 'solicitud', enCurso.numero, {
        motivo: `Compra en curso para ${material}; no se duplica.`,
        despues: { posicion: estado.posicion, rop: estado.rop, origen, orden },
      });
      return { requiere: true, creada: false, motivo: 'COMPRA_EN_CURSO', solicitud: enCurso, estado };
    }
    const ficha = await repos.materiales.obtener(material);
    const calculo = cantidadAComprar(ficha, estado.posicion);
    const proveedor = await repos.materialProveedor.preferido(material);
    const numero = await repos.solicitudes.siguienteNumero(ctx.reloj.ahora().getFullYear());
    const solicitud = await repos.solicitudes.insertar({
      numero,
      material,
      almacen: almacen ?? proveedor?.almacen_destino ?? ctx.config.almacenPorDefecto,
      cantidad: calculo.cantidad,
      metodo: calculo.metodo,
      detalle_calculo: `${calculo.detalle}; posición ${estado.posicion}, ROP ${estado.rop}`,
      origen,
      orden_origen: orden,
      proveedor: proveedor?.proveedor ?? null,
      precio_ref: proveedor?.precio_ref ?? null,
      estado: 'Borrador',
      numero_oc: null,
      fecha_prometida: null,
      cantidad_recibida: 0,
      creada_por: usuario.usuario,
      creada_en: soporte.ahoraIso(),
    });
    await soporte.auditar(repos, usuario, 'solicitud.crear', 'solicitud', numero, { despues: solicitud, motivo: origen });
    await soporte.alertar(repos, {
      tipo: origen === 'ROP' ? 'PUNTO_REORDEN' : 'FALTA_STOCK',
      prioridad: ficha.criticidad === 'critica' ? 'alta' : 'media',
      destinatario_rol: 'comprador',
      entidad: 'solicitud',
      entidad_id: numero,
      mensaje: `${material}: posición ${estado.posicion} ≤ ROP ${estado.rop}. Solicitud ${numero} por ${calculo.cantidad} ${ficha.unidad}.`,
    });
    return { requiere: true, creada: true, solicitud, estado };
  }

  async function obtenerSolicitud(repos, numero) {
    const s = await repos.solicitudes.obtener(numero);
    if (!s) throw errores.noEncontrado('Solicitud', numero);
    return s;
  }

  return {
    evaluarReposicion,

    /** Evaluación manual o del proceso nocturno. */
    async evaluar(usuario, material, almacen) {
      autorizar(usuario, 'compra.evaluar');
      return db.transaccion((repos) => evaluarReposicion(repos, usuario, material, { origen: 'ROP', almacen }));
    },

    async listar(usuario, filtro = {}) {
      autorizar(usuario, 'compra.leer');
      return db.repos.solicitudes.listar(filtro);
    },

    async obtener(usuario, numero) {
      autorizar(usuario, 'compra.leer');
      const s = await obtenerSolicitud(db.repos, numero);
      const cotizaciones = puntuarCotizaciones(await db.repos.cotizaciones.listarPorSolicitud(numero));
      const recepciones = await db.repos.recepciones.listarPorSolicitud(numero);
      return { ...s, cotizaciones, recepciones };
    },

    async registrarCotizacion(usuario, numero, c) {
      autorizar(usuario, 'compra.cotizar');
      for (const campo of ['proveedor', 'precio', 'plazo_dias']) {
        if (!(c[campo] !== undefined && c[campo] !== '')) throw errores.validacion(`Falta ${campo} en la cotización.`);
      }
      return db.transaccion(async (repos) => {
        const s = await obtenerSolicitud(repos, numero);
        if (s.estado !== 'Borrador') throw errores.regla('SOLICITUD_NO_EDITABLE', `La solicitud está en estado ${s.estado}.`);
        const prov = await repos.proveedores.obtener(c.proveedor);
        if (!prov) throw errores.noEncontrado('Proveedor', c.proveedor);
        const cot = await repos.cotizaciones.insertar({
          solicitud: numero,
          proveedor: c.proveedor,
          precio: Number(c.precio),
          plazo_dias: Number(c.plazo_dias),
          garantia_meses: Number(c.garantia_meses ?? 0),
          cumplimiento: Number(prov.cumplimiento),
          elegida: false,
        });
        await soporte.auditar(repos, usuario, 'cotizacion.registrar', 'solicitud', numero, { despues: cot });
        return cot;
      });
    },

    /** Aprueba y deja la solicitud en la bandeja de salida hacia el ERP (RF-16). */
    async aprobar(usuario, numero, { proveedor } = {}) {
      autorizar(usuario, 'compra.aprobar');
      return db.transaccion(async (repos) => {
        const s = await obtenerSolicitud(repos, numero);
        const ranking = puntuarCotizaciones(await repos.cotizaciones.listarPorSolicitud(numero));
        const elegida = proveedor ? ranking.find((c) => c.proveedor === proveedor) : ranking[0];
        const prov = elegida?.proveedor ?? proveedor ?? s.proveedor;
        if (!prov) throw errores.validacion('Seleccione un proveedor o registre una cotización.');
        const precio = elegida?.precio ?? s.precio_ref;
        let estado = transicionar(SOLICITUD, s.estado, 'aprobar');
        const op = await soporte.encolar(repos, {
          tipo: 'SOLICITUD_COMPRA',
          destino: 'ERP',
          entidad: 'solicitud',
          entidad_id: numero,
          orden: s.orden_origen,
          mensaje: { solicitud: numero, material: s.material, cantidad: s.cantidad, proveedor: prov, precio_unitario: precio, almacen: s.almacen },
        });
        estado = transicionar(SOLICITUD, estado, 'enviar');
        if (elegida) await repos.cotizaciones.marcarElegida(numero, elegida.id);
        const actualizada = await repos.solicitudes.actualizar(numero, { estado, proveedor: prov, precio_ref: precio, aprobada_por: usuario.usuario });
        await soporte.auditar(repos, usuario, 'solicitud.aprobar', 'solicitud', numero, {
          antes: { estado: s.estado },
          despues: { estado, proveedor: prov, operacion: op.id },
        });
        return { solicitud: actualizada, operacion: op };
      });
    },

    async rechazar(usuario, numero, motivo) {
      autorizar(usuario, 'compra.aprobar');
      if (!motivo) throw errores.validacion('Indique el motivo del rechazo.');
      return db.transaccion(async (repos) => {
        const s = await obtenerSolicitud(repos, numero);
        const estado = transicionar(SOLICITUD, s.estado, 'rechazar');
        await soporte.auditar(repos, usuario, 'solicitud.rechazar', 'solicitud', numero, { antes: { estado: s.estado }, despues: { estado }, motivo });
        return repos.solicitudes.actualizar(numero, { estado });
      });
    },

    /** Reevaluación tras una salida; tolera que un sistema externo no responda. */
    async evaluarTrasSalida(repos, material, almacen) {
      try {
        return await evaluarReposicion(repos, USUARIO_SISTEMA, material, { origen: 'ROP', almacen });
      } catch (e) {
        if (!(e instanceof ErrorIntegracion)) throw e;
        await soporte.alertar(repos, {
          tipo: 'EVALUACION_DIFERIDA',
          destinatario_rol: 'comprador',
          entidad: 'material',
          entidad_id: material,
          mensaje: `No se pudo evaluar el ROP de ${material}: ${e.message}. Lo retoma el proceso nocturno.`,
        });
        return { requiere: null, diferida: true };
      }
    },
  };
}
