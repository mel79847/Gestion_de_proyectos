import { useApp, useCarga, useState, Codigo, Estado, Boton, Campo, Tabla, Encabezado, bs, fecha } from '../base.jsx';

export function VistaCompras() {
  const { gw, usuario, contexto, setContexto, accion } = useApp();
  const { datos: sols } = useCarga(() => gw.solicitudes(usuario), [usuario]);
  const { datos: mats } = useCarga(() => gw.materiales(usuario), []);
  const [mat, setMat] = useState('VAL-COM-0042');
  const [evaluacion, setEvaluacion] = useState(null);
  const elegida = contexto.solicitud ?? sols?.[0]?.numero;

  const evaluar = async () => {
    const r = await accion('evaluar', (u) => gw.evaluar(u, mat), (x) => (x.creada ? `Solicitud ${x.solicitud.numero} creada` : x.requiere ? `Compra en curso ${x.solicitud.numero}: no se duplica` : 'No corresponde reponer'));
    if (r) setEvaluacion(r);
  };

  return (
    <>
      <div className="titulo-vista">
        <h1>Compras y reposición</h1>
        <p>La solución crea la solicitud de compra cuando la posición llega al punto de reorden o falta stock para una orden. La orden de compra formal la crea el ERP y vuelve como referencia; la recepción la confirma el WMS.</p>
      </div>
      <section className="panel">
        <Encabezado titulo="Evaluar reposición" detalle="Antes de crear una solicitud se revisa si ya existe una compra en curso del mismo material." />
        <div className="fila" style={{ alignItems: 'end' }}>
          <Campo etiqueta="Material">
            <select id="ev-material" value={mat} onChange={(e) => setMat(e.target.value)}>
              {(mats ?? []).map((m) => <option key={m.codigo} value={m.codigo}>{m.codigo}, {m.descripcion}</option>)}
            </select>
          </Campo>
          <Boton rol="comprador" onClick={evaluar}>Evaluar contra el ROP</Boton>
        </div>
        {evaluacion ? (
          <div className="concepto">
            <b>{evaluacion.creada ? `Se creó ${evaluacion.solicitud.numero}` : evaluacion.requiere ? `No se duplica: ${evaluacion.solicitud.numero} está en "${evaluacion.solicitud.estado}"` : 'No corresponde reponer'}</b>
            <span>Disponible {evaluacion.estado.disponible} + en tránsito {evaluacion.estado.en_transito} − requerimientos {evaluacion.estado.requerimientos_pendientes} = posición {evaluacion.estado.posicion}; ROP {evaluacion.estado.rop}.</span>
          </div>
        ) : null}
      </section>
      <div className="maestro-detalle">
        <section className="panel lista-fija">
          <Encabezado titulo="Solicitudes de compra" />
          <Tabla
            filas={sols ?? []}
            clave={(s) => s.numero}
            elegido={elegida}
            alElegir={(s) => setContexto((c) => ({ ...c, solicitud: s.numero }))}
            columnas={[
              { t: 'Solicitud y material', k: (s) => <span className="pila" style={{ gap: 4 }}><span className="ident" style={{ color: 'var(--ink)' }}>{s.numero}</span><span><Codigo valor={s.material} /></span></span> },
              { t: 'Cant.', n: true, k: 'cantidad' },
              { t: 'Estado y origen', k: (s) => <span className="pila" style={{ gap: 2 }}><Estado valor={s.estado} /><span className="tenue" style={{ fontSize: 12 }}>{s.origen === 'ROP' ? 'Punto de reorden' : 'Falta de stock'}</span></span> },
            ]}
          />
        </section>
        {elegida ? <DetalleSolicitud numero={elegida} /> : <section className="panel"><div className="vacio">Sin solicitudes.</div></section>}
      </div>
    </>
  );
}

function DetalleSolicitud({ numero }) {
  const { gw, usuario, accion } = useApp();
  const { datos: s } = useCarga(() => gw.solicitud(usuario, numero), [numero, usuario]);
  const { datos: proveedores } = useCarga(() => gw.proveedores(usuario), []);
  const [cot, setCot] = useState({ proveedor: 'PRV-001', precio: '', plazo_dias: '', garantia_meses: '6' });
  const [rec, setRec] = useState({ recibida: '', aceptada: '', lote: '', vence: '' });
  if (!s) return null;
  const saldo = s.cantidad - s.cantidad_recibida;

  const recibir = async () => {
    const datos = {
      orden_compra: s.numero_oc, material: s.material, almacen: s.almacen, cantidad_recibida: Number(rec.recibida || saldo), cantidad_aceptada: Number(rec.aceptada || rec.recibida || saldo),
      lote: rec.lote || `L-${s.material.slice(0, 2)}-${Date.now().toString().slice(-4)}`, vence: rec.vence || null,
    };
    await accion('consulta', () => gw.simulador.recibir(datos), 'El WMS registró el ingreso y notificó a la solución');
    setRec({ recibida: '', aceptada: '', lote: '', vence: '' });
  };

  return (
    <section className="panel">
      <div className="encabezado">
        <div className="pila" style={{ gap: 4 }}>
          <h2><span className="ident" style={{ fontSize: 16, color: 'var(--ink)' }}>{s.numero}</span></h2>
          <span className="fila"><Codigo valor={s.material} /> <span className="sec">{s.cantidad} unidades para {s.almacen}</span></span>
        </div>
        <Estado valor={s.estado} />
      </div>
      <div className="tabla-contenedor">
        <table>
          <tbody>
            <tr><td className="tenue">Cálculo</td><td>{s.metodo === 'EOQ' ? 'EOQ' : 'Hasta el máximo'}: {s.detalle_calculo}</td></tr>
            <tr><td className="tenue">Origen</td><td>{s.origen === 'ROP' ? 'Posición en el punto de reorden' : `Falta de stock para ${s.orden_origen}`}</td></tr>
            <tr><td className="tenue">Proveedor</td><td>{proveedores?.find((p) => p.codigo === s.proveedor)?.razon_social ?? s.proveedor ?? '—'}{s.precio_ref ? `, ${bs(s.precio_ref)} por unidad` : ''}</td></tr>
            <tr><td className="tenue">Orden de compra del ERP</td><td>{s.numero_oc ? <span className="ident">{s.numero_oc}</span> : <span className="sec">Aún no existe: la crea el ERP al recibir la solicitud aprobada</span>}{s.fecha_prometida ? `, entrega prometida ${s.fecha_prometida}` : ''}</td></tr>
            <tr><td className="tenue">Recibido y aceptado</td><td className="num">{s.cantidad_recibida} de {s.cantidad}</td></tr>
          </tbody>
        </table>
      </div>

      {s.estado === 'Borrador' ? (
        <>
          <h3>Cotizaciones</h3>
          <Tabla
            filas={s.cotizaciones}
            vacio="Registre al menos una cotización o apruebe con el proveedor preferido."
            columnas={[
              { t: 'Proveedor', k: (c) => proveedores?.find((p) => p.codigo === c.proveedor)?.razon_social ?? c.proveedor },
              { t: 'Precio', n: true, k: (c) => bs(c.precio) },
              { t: 'Plazo', n: true, k: (c) => `${c.plazo_dias} d` },
              { t: 'Garantía', n: true, k: (c) => `${c.garantia_meses} m` },
              { t: 'Cumplimiento', n: true, k: (c) => `${c.cumplimiento} %` },
              { t: 'Puntaje', n: true, k: (c) => <b>{c.puntaje}</b> },
            ]}
          />
          <p className="tenue" style={{ fontSize: 12 }}>Puntaje: precio 50 %, plazo 25 %, cumplimiento histórico 15 %, garantía 10 %.</p>
          <div className="campos" style={{ alignItems: 'end' }}>
            <Campo etiqueta="Proveedor">
              <select id="cot-prov" value={cot.proveedor} onChange={(e) => setCot({ ...cot, proveedor: e.target.value })}>
                {(proveedores ?? []).map((p) => <option key={p.codigo} value={p.codigo}>{p.razon_social}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Precio unitario (Bs)"><input id="cot-precio" type="number" value={cot.precio} onChange={(e) => setCot({ ...cot, precio: e.target.value })} /></Campo>
            <Campo etiqueta="Plazo (días)"><input id="cot-plazo" type="number" value={cot.plazo_dias} onChange={(e) => setCot({ ...cot, plazo_dias: e.target.value })} /></Campo>
            <Campo etiqueta="Garantía (meses)"><input id="cot-gar" type="number" value={cot.garantia_meses} onChange={(e) => setCot({ ...cot, garantia_meses: e.target.value })} /></Campo>
          </div>
          <div className="fila">
            <Boton rol="comprador" onClick={() => accion('cotizar', (u) => gw.cotizar(u, numero, cot), 'Cotización registrada')}>Registrar cotización</Boton>
            <Boton primario rol="comprador" onClick={() => accion('aprobar', (u) => gw.aprobar(u, numero), 'Solicitud aprobada y enviada al ERP')}>Aprobar y enviar al ERP</Boton>
          </div>
        </>
      ) : null}

      {['OC creada', 'Recibida parcial'].includes(s.estado) ? (
        <>
          <h3>Recepción en almacén</h3>
          <p className="sec" style={{ fontSize: 13 }}>Pantalla del WMS: el almacén cuenta e inspecciona. Solo lo aceptado ingresa al stock; el WMS informa al ERP (CPP) y avisa a la solución por webhook.</p>
          <div className="campos" style={{ alignItems: 'end' }}>
            <Campo etiqueta={`Recibida (saldo ${saldo})`}><input id="rec-rec" type="number" placeholder={String(saldo)} value={rec.recibida} onChange={(e) => setRec({ ...rec, recibida: e.target.value })} /></Campo>
            <Campo etiqueta="Aceptada"><input id="rec-ace" type="number" placeholder={rec.recibida || String(saldo)} value={rec.aceptada} onChange={(e) => setRec({ ...rec, aceptada: e.target.value })} /></Campo>
            <Campo etiqueta="Lote"><input id="rec-lote" type="text" placeholder="Automático" value={rec.lote} onChange={(e) => setRec({ ...rec, lote: e.target.value })} /></Campo>
            <Campo etiqueta="Vence"><input id="rec-vence" type="date" value={rec.vence} onChange={(e) => setRec({ ...rec, vence: e.target.value })} /></Campo>
          </div>
          <div className="fila"><Boton primario onClick={recibir}>Registrar recepción en el WMS</Boton></div>
        </>
      ) : null}

      {s.recepciones?.length ? (
        <Tabla
          filas={s.recepciones}
          columnas={[
            { t: 'Fecha', k: (r) => fecha(r.fecha) },
            { t: 'Recibida', n: true, k: 'cantidad_recibida' },
            { t: 'Aceptada', n: true, k: 'cantidad_aceptada' },
            { t: 'Lote', k: (r) => <span className="ident">{r.lote}</span> },
            { t: 'Ingreso WMS', k: (r) => <span className="ident">{r.ref_wms}</span> },
          ]}
        />
      ) : null}
    </section>
  );
}
