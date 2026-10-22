import { useApp, useCarga, useState, Estado, Boton, Interruptor, Tabla, Encabezado, Codigo, corto, fecha, hora } from '../base.jsx';

const FILTROS = ['Todas', 'Pendiente', 'Enviada', 'En reintento', 'Incidencia', 'Confirmada', 'Rechazada'];

export function VistaIntegracion() {
  const { gw, usuario, accion, fallas, cambiarFalla, ciclo, ocupado } = useApp();
  const [filtro, setFiltro] = useState('Todas');
  const { datos: ops } = useCarga(() => gw.operaciones(usuario, {}), [usuario]);
  const { datos: incid } = useCarga(() => gw.incidencias(usuario), [usuario]);
  const { datos: sim } = useCarga(() => gw.simulador.estado(), []);
  const [conc, setConc] = useState(null);
  const lista = (ops ?? []).filter((o) => filtro === 'Todas' || o.estado === filtro);

  return (
    <>
      <div className="titulo-vista">
        <h1>Integración con el WMS y el ERP</h1>
        <p>Toda escritura en los sistemas oficiales sale de la bandeja de salida. Cada operación lleva su id como clave de idempotencia; si no hay respuesta se reintenta con espera creciente y, antes de reenviar, se consulta su estado por ese id.</p>
      </div>

      <div className="pila" style={{ gap: 20 }}>
        <section className="panel">
          <Encabezado titulo="Simular fallas" detalle="Para la defensa: corte el WMS o haga que pierda la próxima respuesta." />
          {['wms', 'erp'].map((s) => (
            <div key={s} className="pila" style={{ gap: 8 }}>
              <b>{s.toUpperCase()}</b>
              <div className="fila" style={{ gap: 16 }}>
                <Interruptor id={`caido-${s}`} peligro etiqueta="Sin respuesta" valor={fallas[s].caido} alCambiar={(v) => cambiarFalla(s, { caido: v })} />
                <Boton onClick={() => cambiarFalla(s, { perderRespuestas: 1 })}>Perder la próxima respuesta</Boton>
              </div>
            </div>
          ))}
          <div className="separador" />
          <div className="fila">
            <Boton onClick={ciclo} disabled={ocupado || gw.modo !== 'local'}>Ejecutar un ciclo del trabajador</Boton>
            <Boton onClick={() => accion('reprocesar', () => gw.respaldo(), (r) => `Respaldo: ${r.recuperadas.length} de ${r.revisadas} recuperadas`)}>Sincronización de respaldo</Boton>
          </div>
        </section>
        <section className="panel">
          <Encabezado titulo="Lo que recibió el WMS" detalle="Contadores del sistema externo: muestran que un reenvío no aplica la operación dos veces." />
          {sim ? (
            <div className="tabla-contenedor">
              <table>
                <thead><tr><th>Sistema</th><th className="n">Solicitudes recibidas</th><th className="n">Aplicadas</th><th className="n">Rechazadas</th><th className="n">Duplicadas evitadas</th></tr></thead>
                <tbody>
                  {['wms', 'erp'].map((k) => (
                    <tr key={k}>
                      <td>{k.toUpperCase()}</td>
                      <td className="n">{sim[k].estadisticas.solicitudes}</td>
                      <td className="n">{sim[k].estadisticas.aplicadas}</td>
                      <td className="n">{sim[k].estadisticas.rechazadas}</td>
                      <td className="n"><b>{sim[k].estadisticas.duplicadasEvitadas}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {sim?.wms?.reservas?.length ? (
            <Tabla
              filas={sim.wms.reservas.slice().reverse().slice(0, 6)}
              clave={(r) => r.ref}
              columnas={[
                { t: 'Reserva WMS', k: (r) => <span className="ident">{r.ref}</span> },
                { t: 'Orden', k: (r) => <span className="ident">{r.orden}</span> },
                { t: 'Material', k: (r) => <Codigo valor={r.material} /> },
                { t: 'Cant.', n: true, k: 'cantidad' },
                { t: 'Estado', k: 'estado' },
              ]}
            />
          ) : null}
        </section>
      </div>

      <section className="panel">
        <Encabezado titulo="Bandeja de salida y eventos recibidos">
          <select id="op-filtro" aria-label="Filtrar por estado" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: 'auto' }}>
            {FILTROS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Encabezado>
        <Tabla
          filas={lista}
          vacio="Sin operaciones con este estado."
          columnas={[
            { t: 'Id (clave de idempotencia)', k: (o) => <span className="ident" title={o.id}>{corto(o.id)}</span> },
            { t: 'Tipo', k: (o) => <span>{o.tipo}<br /><span className="tenue">{o.direccion === 'ENTRANTE' ? 'webhook recibido' : `hacia ${o.destino}`}</span></span> },
            { t: 'Referencia', k: (o) => <span className="ident">{o.orden ?? o.mensaje?.orden_compra ?? o.entidad_id}</span> },
            { t: 'Estado', k: (o) => <Estado valor={o.estado} /> },
            { t: 'Intentos', n: true, k: (o) => `${o.intentos}/${o.limite_intentos}` },
            { t: 'Próximo intento', k: (o) => (o.estado === 'En reintento' ? hora(o.proximo_intento) : '—') },
            { t: 'Causa o respuesta', k: (o) => <span className="sec" style={{ fontSize: 12.5 }}>{o.causa ?? (o.respuesta ? resumirRespuesta(o.respuesta) : '—')}</span> },
            { t: '', k: (o) => (o.estado === 'Incidencia' ? <Boton rol="administrador" onClick={() => accion('reprocesar', (u) => gw.reprocesar(u, o.id), 'Operación devuelta a la cola con el mismo id')}>Reprocesar</Boton> : null) },
          ]}
        />
      </section>

      <div className="pila" style={{ gap: 20 }}>
        <section className="panel">
          <Encabezado titulo="Incidencias" detalle="Cada falla queda con causa, responsable y resolución." />
          <Tabla
            filas={incid ?? []}
            vacio="Sin incidencias."
            columnas={[
              { t: 'Código', k: (i) => <span className="ident">{i.codigo}</span> },
              { t: 'Causa', k: (i) => <span style={{ fontSize: 12.5 }}>{i.causa}</span> },
              { t: 'Responsable', k: 'responsable_rol' },
              { t: 'Estado', k: (i) => <Estado valor={i.estado} /> },
            ]}
          />
        </section>
        <section className="panel">
          <Encabezado titulo="Conciliación" detalle="Proceso nocturno: compara existencias del WMS con las del ERP y registra las diferencias." />
          <div className="fila">
            <Boton onClick={() => accion('consulta', () => gw.simulador.ajuste({ material: 'ROD-BOM-0017', almacen: 'ALM-CBB', cantidad: -1 }), 'Ajuste de −1 en el WMS sin informar al ERP')}>Simular ajuste no informado</Boton>
            <Boton primario rol="administrador" onClick={async () => setConc(await accion('conciliar', (u) => gw.conciliar(u), 'Conciliación ejecutada'))}>Ejecutar conciliación</Boton>
          </div>
          {conc ? (
            <Tabla
              filas={conc}
              clave={(c) => c.material}
              columnas={[
                { t: 'Material', k: (c) => <Codigo valor={c.material} /> },
                { t: 'WMS', n: true, k: 'valor_wms' },
                { t: 'ERP', n: true, k: 'valor_erp' },
                { t: 'Diferencia', n: true, k: (c) => <b>{c.diferencia}</b> },
                { t: 'Estado', k: (c) => <Estado valor={c.estado} /> },
              ]}
            />
          ) : null}
          <p className="tenue" style={{ fontSize: 12 }}>Corte: {fecha(new Date().toISOString())}.</p>
        </section>
      </div>
    </>
  );
}

function resumirRespuesta(r) {
  if (r.ref_reserva) return `Reserva ${r.ref_reserva}`;
  if (r.ref_movimiento) return `Movimiento ${r.ref_movimiento}${r.lotes?.length ? `: ${r.lotes.map((l) => l.serie ?? l.lote).join(', ')}` : ''}`;
  if (r.numero_oc) return `OC ${r.numero_oc}, entrega ${r.fecha_prometida}`;
  return r.mensaje ?? r.resultado;
}
