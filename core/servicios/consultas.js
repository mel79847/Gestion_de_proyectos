/**
 * Componentes Alertas y Auditoría: alertas, incidencias, bitácora y trazabilidad (RF-18 a RF-22).
 * La bitácora no tiene operación de edición ni borrado en ningún adaptador.
 */
import { autorizar } from '../dominio/permisos.js';
import { errores } from '../dominio/errores.js';

export function crearServicioConsultas(ctx, soporte) {
  const { db } = ctx;

  return {
    async alertas(usuario, filtro = {}) {
      autorizar(usuario, 'integracion.leer');
      return db.repos.alertas.listar(filtro);
    },

    async atenderAlerta(usuario, id) {
      autorizar(usuario, 'integracion.leer');
      return db.transaccion(async (repos) => {
        const a = await repos.alertas.obtener(id);
        if (!a) throw errores.noEncontrado('Alerta', id);
        if (a.destinatario_rol !== usuario.rol && usuario.rol !== 'administrador') {
          throw errores.permiso(usuario.rol, `atender alertas de ${a.destinatario_rol}`);
        }
        await soporte.auditar(repos, usuario, 'alerta.atender', 'alerta', id, { antes: { estado: a.estado }, despues: { estado: 'Atendida' } });
        return repos.alertas.actualizar(id, { estado: 'Atendida' });
      });
    },

    async incidencias(usuario, filtro = {}) {
      autorizar(usuario, 'integracion.leer');
      return db.repos.incidencias.listar(filtro);
    },

    async resolverIncidencia(usuario, id, resolucion) {
      autorizar(usuario, 'incidencia.resolver');
      if (!resolucion) throw errores.validacion('Describa la resolución.');
      return db.transaccion(async (repos) => {
        const inc = await repos.incidencias.obtener(id);
        if (!inc) throw errores.noEncontrado('Incidencia', id);
        if (inc.estado !== 'Abierta') throw errores.regla('INCIDENCIA_CERRADA', 'La incidencia ya está resuelta.');
        await soporte.auditar(repos, usuario, 'incidencia.resolver', 'incidencia', id, { antes: { estado: inc.estado }, despues: { estado: 'Resuelta' }, motivo: resolucion });
        return repos.incidencias.actualizar(id, { estado: 'Resuelta', resuelta_en: soporte.ahoraIso(), resolucion });
      });
    },

    async bitacora(usuario, filtro = {}) {
      autorizar(usuario, 'bitacora.leer');
      return db.repos.bitacora.listar(filtro);
    },

    /** RF-20: recorrido completo de una orden: pedido, reserva, compra, recepción, salida e instalación. */
    async trazabilidadOrden(usuario, numero) {
      autorizar(usuario, 'orden.leer');
      const r = db.repos;
      const orden = await r.ordenes.obtener(numero);
      if (!orden) throw errores.noEncontrado('Orden', numero);
      const [reservas, movimientos, cambios, operaciones, bitacora, solicitudes] = await Promise.all([
        r.reservas.listarPorOrden(numero),
        r.movimientos.listarPorOrden(numero),
        r.cambios.listarPorOrden(numero),
        r.operaciones.listar({ orden: numero }),
        r.bitacora.listar({ entidad_id: numero }),
        r.solicitudes.listar({ orden_origen: numero }),
      ]);
      const recepciones = (await Promise.all(solicitudes.map((s) => r.recepciones.listarPorSolicitud(s.numero)))).flat();
      return { orden, reservas, movimientos, cambios, operaciones, solicitudes, recepciones, bitacora };
    },

    async resumen(usuario) {
      autorizar(usuario, 'orden.leer');
      const r = db.repos;
      const [ordenes, operaciones, incidencias, alertas, solicitudes] = await Promise.all([
        r.ordenes.listar({}),
        r.operaciones.listar({ direccion: 'SALIENTE' }),
        r.incidencias.listar({ estado: 'Abierta' }),
        r.alertas.listar({ estado: 'Abierta' }),
        r.solicitudes.listar({}),
      ]);
      const contar = (lista, campo) => lista.reduce((acc, x) => ({ ...acc, [x[campo]]: (acc[x[campo]] ?? 0) + 1 }), {});
      return {
        ordenes_por_estado: contar(ordenes, 'estado'),
        operaciones_por_estado: contar(operaciones, 'estado'),
        solicitudes_por_estado: contar(solicitudes, 'estado'),
        incidencias_abiertas: incidencias.length,
        alertas_abiertas: alertas.length,
      };
    },
  };
}
