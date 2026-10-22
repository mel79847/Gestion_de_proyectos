import { useApp, useCarga, Estado, Interruptor, Boton, Icono, corto, hora } from '../base.jsx';

/** Bandeja de salida en vivo y registro del trabajador de integración. */
export function Riel() {
  const { gw, usuario, trabajador, setTrabajador, ciclo, ocupado, registro, ir } = useApp();
  const { datos: ops } = useCarga(() => gw.operaciones(usuario, { direccion: 'SALIENTE' }), [usuario]);
  const lista = (ops ?? []).filter((o) => o.direccion === 'SALIENTE').slice(0, 8);

  return (
    <aside className="riel" aria-label="Actividad de integración">
      <section className="panel" style={{ gap: 10 }}>
        <div className="encabezado">
          <h3>Bandeja de salida</h3>
          <button type="button" className="boton" style={{ minHeight: 28, padding: '2px 8px' }} onClick={() => ir('integracion')}>Ver todo</button>
        </div>
        {gw.modo === 'local' ? (
          <div className="fila" style={{ justifyContent: 'space-between' }}>
            <Interruptor id="trabajador" etiqueta={ocupado ? 'Trabajador: lo controla el escenario' : 'Trabajador de integración activo'} valor={trabajador && !ocupado} alCambiar={setTrabajador} />
            <Boton onClick={ciclo} disabled={ocupado} style={{ minHeight: 28, padding: '2px 8px' }}>Un ciclo</Boton>
          </div>
        ) : (
          <p className="tenue" style={{ fontSize: 12 }}>El trabajador corre en su propio proceso (worker/index.js).</p>
        )}
        <div className="actividad">
          {lista.length ? (
            lista.map((o) => (
              <div className="op" key={o.id}>
                <span className="tipo fila" style={{ gap: 4 }}>{o.tipo.replace('_', ' ')} <span className="tenue fila" style={{ gap: 4 }}><Icono nombre="flecha" tam={13} />{o.destino}</span></span>
                <Estado valor={o.estado} />
                <span className="meta">
                  <span className="ident">{corto(o.id)}</span>
                  <span>{o.orden ?? o.entidad_id}</span>
                  <span>intento {o.intentos}/{o.limite_intentos}</span>
                  {o.estado === 'En reintento' ? <span>próximo {hora(o.proximo_intento)}</span> : null}
                </span>
              </div>
            ))
          ) : (
            <div className="vacio">Sin operaciones. Al reservar, entregar o aprobar una compra aparecen aquí.</div>
          )}
        </div>
      </section>
      <section className="panel" style={{ gap: 8 }}>
        <h3>Registro del trabajador</h3>
        <div className="registro">
          {registro.length ? (
            registro.map((r, i) => (
              <div key={i}>
                <time>{hora(r.t)}</time>
                <span style={{ color: r.tono === 'crit' ? 'var(--crit)' : r.tono === 'warn' ? 'var(--warn)' : undefined }}>{r.texto}</span>
              </div>
            ))
          ) : (
            <span className="tenue">Cada envío al WMS o al ERP queda anotado aquí.</span>
          )}
        </div>
      </section>
    </aside>
  );
}
