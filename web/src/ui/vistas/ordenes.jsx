import { useApp, useCarga, useState, useEffect, Codigo, Estado, EtapasOrden, Boton, Campo, Tabla, Encabezado, Icono, bs, fecha, corto } from '../base.jsx';

const DESTINOS = [['evaluacion', 'Evaluación técnica'], ['reparacion', 'Reparación'], ['garantia', 'Garantía del proveedor'], ['resguardo', 'Resguardo'], ['baja', 'Baja']];
const CONDICIONES = [['desgastada', 'Desgastada'], ['danada', 'Dañada'], ['en_garantia', 'En garantía'], ['reutilizable', 'Reutilizable']];

export function VistaOrdenes() {
  const { gw, usuario, contexto, setContexto } = useApp();
  const { datos: ordenes } = useCarga(() => gw.ordenes(usuario), [usuario]);
  const elegida = contexto.orden ?? ordenes?.find((o) => !['Cerrada', 'Anulada'].includes(o.estado))?.numero ?? ordenes?.[0]?.numero;
  const formulario = Boolean(contexto.nuevaOrden);
  const alternar = () => setContexto((c) => ({ ...c, nuevaOrden: !c.nuevaOrden }));

  return (
    <>
      <div className="encabezado" style={{ alignItems: 'flex-start' }}>
        <div className="titulo-vista">
          <h1>Órdenes de mantenimiento</h1>
          <p>La orden registra la necesidad de material. Solo admite repuestos compatibles con el equipo y no se cierra mientras exista una operación sin confirmar en el WMS o el ERP.</p>
        </div>
        <Boton primario={!formulario} rol={formulario ? undefined : 'tecnico'} onClick={alternar} aria-expanded={formulario}>
          {formulario ? 'Cancelar' : <><Icono nombre="mas" />Nueva orden</>}
        </Boton>
      </div>
      {formulario ? <NuevaOrden alCrear={() => setContexto((c) => ({ ...c, nuevaOrden: false }))} /> : null}
      <div className="maestro-detalle">
        <section className="panel lista-fija">
          <Encabezado titulo="Órdenes" />
          <Tabla
            filas={ordenes ?? []}
            clave={(o) => o.numero}
            elegido={elegida}
            alElegir={(o) => setContexto((c) => ({ ...c, orden: o.numero }))}
            columnas={[
              { t: 'Orden y equipo', k: (o) => <span className="pila" style={{ gap: 4 }}><span className="ident" style={{ color: 'var(--ink)' }}>{o.numero}</span><span><Codigo valor={o.equipo} /></span></span> },
              { t: 'Estado', k: (o) => <Estado valor={o.estado} /> },
            ]}
          />
        </section>
        {elegida ? <DetalleOrden numero={elegida} /> : <section className="panel"><div className="vacio">Registre una orden para empezar.</div></section>}
      </div>
    </>
  );
}

function NuevaOrden({ alCrear }) {
  const { gw, usuario, accion, setContexto } = useApp();
  const { datos: equipos } = useCarga(() => gw.equipos(usuario), []);
  const [equipo, setEquipo] = useState('CAM-VOL-014');
  const { datos: compatibles } = useCarga(() => gw.compatibles(usuario, equipo), [equipo]);
  const [form, setForm] = useState({ tipo: 'correctivo', prioridad: 'alta', diagnostico: 'Pérdida de presión de aceite en el motor', fecha_requerida: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) });
  const [cant, setCant] = useState({});
  useEffect(() => setCant({}), [equipo]);

  const crear = async () => {
    const materiales = Object.entries(cant).filter(([, v]) => Number(v) > 0).map(([material, cantidad]) => ({ material, cantidad: Number(cantidad) }));
    const o = await accion('crearOrden', (u) => gw.crearOrden(u, { ...form, equipo, materiales }), (r) => `Orden ${r.numero} registrada`);
    if (o) {
      setCant({});
      setContexto((c) => ({ ...c, orden: o.numero }));
      alCrear?.();
    }
  };

  return (
    <section className="panel">
      <Encabezado titulo="Nueva orden" detalle="La lista de materiales sale de la tabla de compatibilidad del equipo." />
      <div className="campos">
        <Campo etiqueta="Equipo">
          <select id="no-equipo" value={equipo} onChange={(e) => setEquipo(e.target.value)}>
            {(equipos ?? []).map((e) => <option key={e.codigo} value={e.codigo}>{e.codigo}, {e.descripcion}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Tipo">
          <select id="no-tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="correctivo">Correctivo</option>
            <option value="preventivo">Preventivo</option>
          </select>
        </Campo>
        <Campo etiqueta="Prioridad">
          <select id="no-prioridad" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
            {['critica', 'alta', 'media', 'normal'].map((p) => <option key={p} value={p}>{p === 'critica' ? 'Crítica' : p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Fecha requerida">
          <input id="no-fecha" type="date" value={form.fecha_requerida} onChange={(e) => setForm({ ...form, fecha_requerida: e.target.value })} />
        </Campo>
      </div>
      <Campo etiqueta="Diagnóstico">
        <input id="no-diag" type="text" value={form.diagnostico} onChange={(e) => setForm({ ...form, diagnostico: e.target.value })} />
      </Campo>
      <div className="pila" style={{ gap: 6 }}>
        <span className="tenue" style={{ fontSize: 12, fontWeight: 550 }}>Materiales compatibles</span>
        {(compatibles ?? []).map((m) => (
          <div key={m.codigo} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) 76px', gap: 10, alignItems: 'center' }}>
            <Codigo valor={m.codigo} />
            <span className="sec" style={{ fontSize: 13 }}>{m.descripcion}</span>
            <input id={`no-c-${m.codigo}`} type="number" min="0" step="1" aria-label={`Cantidad de ${m.codigo}`} value={cant[m.codigo] ?? ''} placeholder="0" onChange={(e) => setCant({ ...cant, [m.codigo]: e.target.value })} style={{ width: 76 }} />
          </div>
        ))}
      </div>
      <div className="fila"><Boton primario rol="tecnico" onClick={crear}>Registrar orden</Boton></div>
    </section>
  );
}

function DetalleOrden({ numero }) {
  const { gw, usuario, accion } = useApp();
  const { datos: o, error } = useCarga(() => gw.orden(usuario, numero), [numero, usuario]);
  const [receptor, setReceptor] = useState('tec.rojas');
  const [cambio, setCambio] = useState({ pieza_retirada: 'Pieza original retirada en la intervención', condicion: 'desgastada', destino: 'evaluacion' });
  if (error) return <section className="panel"><div className="vacio">{error.message}</div></section>;
  if (!o) return null;

  const pendientes = o.operaciones.filter((x) => ['Pendiente', 'Enviada', 'En reintento', 'Incidencia'].includes(x.estado));
  const materialesEntregados = [...new Set(o.movimientos.filter((m) => m.tipo === 'SALIDA').map((m) => m.material))];
  const costo = o.movimientos.reduce((a, m) => a + (m.costo_total ?? 0), 0);

  return (
    <section className="panel">
      <div className="encabezado">
        <div className="pila" style={{ gap: 4 }}>
          <h2><span className="ident" style={{ fontSize: 16, color: 'var(--ink)' }}>{o.numero}</span></h2>
          <p className="sec">{o.diagnostico}. Equipo <Codigo valor={o.equipo} />, almacén {o.almacen}, prioridad {o.prioridad}, requerida para {o.fecha_requerida}.</p>
        </div>
        <Estado valor={o.estado} />
      </div>
      <EtapasOrden estado={o.estado} />
      {pendientes.length ? (
        <div className="concepto" style={{ background: 'var(--warn-bg)' }}>
          <b style={{ color: 'var(--warn)' }}>{pendientes.length} operación(es) sin confirmar</b>
          <span>{pendientes.map((p) => `${p.tipo} ${p.estado.toLowerCase()}${p.causa ? `: ${p.causa}` : ''}`).join('. ')}. El cierre queda bloqueado hasta que el sistema externo confirme.</span>
        </div>
      ) : null}

      <div className="fila">
        <Boton rol="supervisor" disabled={o.estado !== 'Registrada'} title={o.estado !== 'Registrada' ? 'Solo una orden Registrada se valida' : undefined} onClick={() => accion('validar', (u) => gw.validar(u, numero), 'Orden validada')}>Validar</Boton>
        <Boton rol="almacen" disabled={!['Validada', 'En espera de repuestos'].includes(o.estado)} title={!['Validada', 'En espera de repuestos'].includes(o.estado) ? 'Se reserva una orden Validada o En espera de repuestos' : undefined} onClick={() => accion('reservar', (u) => gw.reservar(u, numero), (r) => `${r.length} reserva(s) en la bandeja de salida`)}>Solicitar reserva al WMS</Boton>
        <span className="fila" style={{ gap: 6 }}>
          <select id="receptor" aria-label="Receptor" value={receptor} onChange={(e) => setReceptor(e.target.value)} style={{ width: 'auto' }}>
            {gw.usuarios.filter((u) => u.rol === 'tecnico' || u.rol === 'supervisor').map((u) => <option key={u.usuario} value={u.usuario}>Recibe {u.nombre}</option>)}
          </select>
          <Boton rol="almacen" disabled={o.estado !== 'Materiales reservados'} title={o.estado !== 'Materiales reservados' ? 'Se entrega cuando el WMS confirmó las reservas' : undefined} onClick={() => accion('entregar', (u) => gw.entregar(u, numero, receptor), 'Salida enviada al WMS')}>Registrar entrega</Boton>
        </span>
        <Boton rol="tecnico" disabled={o.estado !== 'En ejecución'} title={o.estado !== 'En ejecución' ? 'Se completa una orden En ejecución' : undefined} onClick={() => accion('completar', (u) => gw.completar(u, numero), 'Intervención completada')}>Completar intervención</Boton>
        <Boton primario rol="supervisor" disabled={o.estado !== 'Pendiente de verificación' && !pendientes.length} title={o.estado !== 'Pendiente de verificación' && !pendientes.length ? 'Se cierra una orden Pendiente de verificación' : undefined} onClick={() => accion('cerrar', (u) => gw.cerrar(u, numero), 'Orden cerrada')}>Cerrar orden</Boton>
      </div>

      <Tabla
        filas={o.detalles}
        columnas={[
          { t: 'Material', k: (d) => <Codigo valor={d.material} /> },
          { t: 'Requerida', n: true, k: 'cantidad' },
          { t: 'Reservada', n: true, k: 'cantidad_reservada' },
          { t: 'Entregada', n: true, k: 'cantidad_entregada' },
        ]}
      />

      <div className="grid-2">
        <div className="pila">
          <h3>Reservas en el WMS</h3>
          <Tabla
            filas={o.reservas}
            vacio="Sin reservas."
            columnas={[
              { t: 'Material', k: (r) => <Codigo valor={r.material} /> },
              { t: 'Cant.', n: true, k: 'cantidad' },
              { t: 'Estado', k: (r) => <Estado valor={r.estado} /> },
              { t: 'Ref. WMS', k: (r) => <span className="ident">{r.ref_wms ?? '—'}</span> },
            ]}
          />
        </div>
        <div className="pila">
          <h3>Salidas confirmadas</h3>
          <Tabla
            filas={o.movimientos}
            vacio="Sin salidas."
            columnas={[
              { t: 'Ref. WMS', k: (m) => <span className="ident">{m.ref_wms}</span> },
              { t: 'Lotes (FEFO/PEPS)', k: (m) => m.lotes.map((l) => `${l.serie ?? l.lote} × ${l.cantidad}`).join(', ') || '—' },
              { t: 'CPP', n: true, k: (m) => bs(m.costo_unitario) },
              { t: 'Costo', n: true, k: (m) => bs(m.costo_total) },
            ]}
          />
          {costo ? <p className="tenue" style={{ fontSize: 12 }}>Costo de materiales de la orden: <b className="num">{bs(costo)}</b>, al CPP vigente del ERP.</p> : null}
        </div>
      </div>

      {o.estado === 'En ejecución' || o.cambios.length ? (
        <div className="pila">
          <h3>Cambio de pieza</h3>
          {o.cambios.length ? (
            <Tabla
              filas={o.cambios}
              columnas={[
                { t: 'Instalada', k: (c) => <span className="fila"><Codigo valor={c.material} /> <span className="ident">{c.serie_instalada ?? c.lote_instalado}</span></span> },
                { t: 'Retirada', k: 'pieza_retirada' },
                { t: 'Condición', k: 'condicion' },
                { t: 'Destino', k: (c) => DESTINOS.find(([k]) => k === c.destino)?.[1] },
                { t: 'Técnico', k: 'tecnico' },
              ]}
            />
          ) : null}
          {o.estado === 'En ejecución'
            ? materialesEntregados
                .filter((m) => !o.cambios.some((c) => c.material === m))
                .map((m) => (
                  <div key={m} className="campos" style={{ alignItems: 'end' }}>
                    <Campo etiqueta={`Pieza retirada (se instaló ${m})`}>
                      <input id={`cp-ret-${m}`} type="text" value={cambio.pieza_retirada} onChange={(e) => setCambio({ ...cambio, pieza_retirada: e.target.value })} />
                    </Campo>
                    <Campo etiqueta="Condición">
                      <select id={`cp-cond-${m}`} value={cambio.condicion} onChange={(e) => setCambio({ ...cambio, condicion: e.target.value })}>
                        {CONDICIONES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                      </select>
                    </Campo>
                    <Campo etiqueta="Destino de la retirada">
                      <select id={`cp-dest-${m}`} value={cambio.destino} onChange={(e) => setCambio({ ...cambio, destino: e.target.value })}>
                        {DESTINOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                      </select>
                    </Campo>
                    <Boton rol="tecnico" onClick={() => accion('cambioPieza', (u) => gw.cambioPieza(u, numero, { material: m, ...cambio }), 'Cambio de pieza registrado')}>Registrar cambio</Boton>
                  </div>
                ))
            : null}
          <p className="tenue" style={{ fontSize: 12 }}>La pieza retirada no vuelve al stock: queda con su destino hasta una devolución aprobada y confirmada por el WMS.</p>
        </div>
      ) : null}

      <div className="pila">
        <h3>Operaciones de integración de esta orden</h3>
        <Tabla
          filas={o.operaciones}
          vacio="Sin operaciones."
          columnas={[
            { t: 'Id de operación (idempotencia)', k: (x) => <span className="ident" title={x.id}>{corto(x.id)}</span> },
            { t: 'Tipo', k: 'tipo' },
            { t: 'Estado', k: (x) => <Estado valor={x.estado} /> },
            { t: 'Intentos', n: true, k: (x) => `${x.intentos}/${x.limite_intentos}` },
            { t: 'Creada', k: (x) => fecha(x.creada_en) },
          ]}
        />
      </div>
    </section>
  );
}
