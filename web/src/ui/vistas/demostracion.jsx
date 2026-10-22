import { useApp, useState, Boton, Icono } from '../base.jsx';
import { ESCENARIOS } from '../escenarios.js';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function VistaDemostracion() {
  const { gw, ciclo, setOcupado, cambiarFalla, bump, anotar } = useApp();
  const [elegido, setElegido] = useState(ESCENARIOS[0].id);
  const [pasos, setPasos] = useState({});
  const [corriendo, setCorriendo] = useState(null);
  const esc = ESCENARIOS.find((e) => e.id === elegido);

  /** Ejecuta ciclos del trabajador hasta que no quede nada por enviar o reintentar. */
  async function drenar({ hastaIncidencia = false } = {}) {
    const resultados = [];
    for (let i = 0; i < 24; i++) {
      resultados.push(...(await ciclo()));
      const vivas = (await gw.operaciones('adm.sistema', {})).filter((o) => o.direccion === 'SALIENTE' && ['Pendiente', 'Enviada', 'En reintento'].includes(o.estado));
      if (!vivas.length) break;
      if (hastaIncidencia && resultados.some((r) => r.resultado === 'incidencia')) break;
      const proximo = Math.min(...vivas.map((o) => new Date(o.proximo_intento).getTime()));
      await esperar(Math.max(150, Math.min(proximo - Date.now() + 60, 4000)));
    }
    return resultados;
  }

  async function ejecutar() {
    const id = esc.id;
    setCorriendo(id);
    setOcupado(true);
    setPasos((p) => ({ ...p, [id]: [] }));
    const paso = (texto, detalle = '', estado = '') => setPasos((p) => ({ ...p, [id]: [...(p[id] ?? []), { texto, detalle, estado }] }));
    anotar(`Escenario: ${esc.pregunta}`);
    try {
      await esc.ejecutar({ gw, paso, drenar, cambiarFalla });
    } catch (e) {
      paso(`Error inesperado: ${e.codigo ?? ''} ${e.message}`, '', 'error');
    } finally {
      if (['caida', 'perdida'].includes(id)) for (const sis of ['wms', 'erp']) await cambiarFalla(sis, { caido: false, perderRespuestas: 0 });
      setOcupado(false);
      setCorriendo(null);
      bump();
    }
  }

  const lista = pasos[elegido] ?? [];
  return (
    <>
      <div className="titulo-vista">
        <h1>Validación técnica del sistema</h1>
        <p>Cada escenario ejecuta una regla real del inventario y muestra el resultado paso a paso. Los cambios quedan registrados en las demás secciones para verificar stock, operaciones, incidencias y trazabilidad.</p>
      </div>
      <div className="escenarios">
        <div className="lista-escenarios" role="list" aria-label="Escenarios de validación">
          {ESCENARIOS.map((e) => (
            <button key={e.id} type="button" role="listitem" className="escenario" aria-pressed={e.id === elegido} onClick={() => setElegido(e.id)}>
              <span className="preg">{e.pregunta}</span>
              <span className="conc">{e.concepto}</span>
              {pasos[e.id]?.length ? (
                <span className="tenue hecho" style={{ fontSize: 12 }}>
                  {pasos[e.id].some((p) => p.estado === 'error') ? <Icono nombre="alerta" tam={13} /> : <Icono nombre="check" tam={13} />}
                  {pasos[e.id].some((p) => p.estado === 'error') ? 'Ejecutado con observaciones' : 'Ejecutado'}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <section className="panel" style={{ position: 'sticky', top: 76 }}>
          <div className="pila" style={{ gap: 6 }}>
            <h2>{esc.pregunta}</h2>
            <div className="concepto"><b>Concepto</b><span>{esc.concepto}</span></div>
          </div>
          <div className="fila">
            <Boton primario onClick={ejecutar} disabled={Boolean(corriendo)}>{corriendo === esc.id ? 'Ejecutando…' : lista.length ? 'Ejecutar de nuevo' : 'Ejecutar escenario'}</Boton>
            {gw.modo === 'local' ? <Boton onClick={() => globalThis.location.reload()} disabled={Boolean(corriendo)}>Reiniciar datos de ejemplo</Boton> : null}
          </div>
          {lista.length ? (
            <div className="pasos">
              {lista.map((p, i) => (
                <div key={i} className={`paso ${p.estado}`}>
                  <div className="txt">
                    <b>{p.texto}</b>
                    {p.detalle ? <span className="det">{p.detalle}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="vacio">Ejecute el escenario para ver cada paso con sus datos reales.</div>
          )}
        </section>
      </div>
    </>
  );
}
