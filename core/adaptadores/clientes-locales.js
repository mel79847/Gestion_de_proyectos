/**
 * Clientes del WMS y del ERP que llaman a los simuladores en el mismo proceso.
 * Cumplen el mismo puerto que los clientes HTTP de la API, de modo que los servicios
 * no distinguen si hablan con un servidor remoto o con el simulador.
 */
const esperar = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export function crearClienteWmsLocal(sim, { latenciaMs = 0 } = {}) {
  return {
    async consultarDisponibilidad(q) {
      await esperar(latenciaMs);
      return sim.consultarDisponibilidad(q);
    },
    async enviar(op) {
      await esperar(latenciaMs);
      return sim.procesar(op.tipo, op.mensaje, op.id);
    },
    async consultarOperacion(id) {
      await esperar(latenciaMs);
      return sim.consultarOperacion(id);
    },
  };
}

export function crearClienteErpLocal(sim, { latenciaMs = 0 } = {}) {
  return {
    async enviar(op) {
      await esperar(latenciaMs);
      return sim.procesar(op.tipo, op.mensaje, op.id);
    },
    async consultarOperacion(id) {
      await esperar(latenciaMs);
      return sim.consultarOperacion(id);
    },
    async consultarEnTransito(q) {
      return sim.consultarEnTransito(q);
    },
    async consultarValoracion(q) {
      return sim.consultarValoracion(q);
    },
    async consultarKardex(q) {
      return sim.consultarKardex(q);
    },
  };
}
