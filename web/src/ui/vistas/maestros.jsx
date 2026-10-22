import { useApp, useCarga, useState, useEffect, Codigo, Estado, Boton, Campo, Tabla, Encabezado, Interruptor, Icono } from '../base.jsx';

const FAMILIAS = [['FIL', 'Filtros'], ['ACE', 'Aceites y lubricantes'], ['EMP', 'Empaquetaduras'], ['VAL', 'Válvulas'], ['SEL', 'Sellos'], ['ROD', 'Rodamientos'], ['COR', 'Correas']];

export function VistaMaestros() {
  const { gw, usuario } = useApp();
  const { datos: mats } = useCarga(() => gw.materiales(usuario), [usuario]);
  const { datos: equipos } = useCarga(() => gw.equipos(usuario), []);
  const { datos: compat } = useCarga(async () => {
    const eqs = await gw.equipos(usuario);
    const pares = await Promise.all(eqs.map(async (e) => [(e.codigo), (await gw.compatibles(usuario, e.codigo)).map((m) => m.codigo)]));
    return Object.fromEntries(pares);
  }, []);
  const { datos: proveedores } = useCarga(() => gw.proveedores(usuario), []);

  return (
    <>
      <div className="titulo-vista">
        <h1>Datos maestros</h1>
        <p>Un artículo tiene un solo código en toda la empresa. El maestro asigna el código (familia, subfamilia y correlativo) y rechaza un alta si la descripción ya existe escrita de otra forma. Mantenimiento, almacén y compras usan ese mismo código.</p>
      </div>
      <NuevoMaterial />
      <section className="panel">
        <Encabezado titulo="Catálogo de materiales" detalle="La descripción normalizada es única en la base de datos: segunda barrera contra duplicados." />
        <Tabla
          filas={mats ?? []}
          clave={(m) => m.codigo}
          columnas={[
            { t: 'Código', k: (m) => <Codigo valor={m.codigo} /> },
            { t: 'Descripción', k: (m) => <span>{m.descripcion}<br /><span className="ident tenue">{m.descripcion_normalizada}</span></span> },
            { t: 'Unidad', k: 'unidad' },
            { t: 'Criticidad', k: 'criticidad' },
            { t: 'Control', k: (m) => [m.perecible ? 'vencimiento' : null, m.serializado ? 'serie' : null].filter(Boolean).join(', ') || 'lote' },
            { t: 'L (días)', n: true, k: 'plazo_dias' },
            { t: 'SS', n: true, k: (m) => m.parametros.ss },
            { t: 'ROP', n: true, k: (m) => m.parametros.rop },
            { t: 'Reposición', k: (m) => (m.metodo_reposicion === 'EOQ' ? `EOQ ${m.parametros.eoq}` : `Hasta ${m.stock_maximo}`) },
          ]}
        />
      </section>
      <div className="grid-2">
        <section className="panel">
          <Encabezado titulo="Compatibilidad material y equipo" detalle="Una orden solo acepta materiales marcados para su equipo." />
          {mats && equipos && compat ? (
            <div className="tabla-contenedor">
              <table>
                <thead>
                  <tr><th>Material</th>{equipos.map((e) => <th key={e.codigo} className="n" title={e.descripcion}>{e.codigo}</th>)}</tr>
                </thead>
                <tbody>
                  {mats.map((m) => (
                    <tr key={m.codigo}>
                      <td><Codigo valor={m.codigo} /></td>
                      {equipos.map((e) => <td key={e.codigo} className="n">{compat[e.codigo]?.includes(m.codigo) ? <span style={{ color: 'var(--ok)' }}><Icono nombre="check" etiqueta="Compatible" /></span> : <span className="tenue" aria-label="No compatible">—</span>}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        <section className="panel">
          <Encabezado titulo="Proveedores" detalle="El plazo alimenta el punto de reorden; el cumplimiento entra en la comparación de cotizaciones." />
          <Tabla
            filas={proveedores ?? []}
            clave={(p) => p.codigo}
            columnas={[
              { t: 'Código', k: (p) => <span className="ident">{p.codigo}</span> },
              { t: 'Razón social', k: 'razon_social' },
              { t: 'NIT', k: (p) => <span className="ident">{p.nit}</span> },
              { t: 'Plazo', n: true, k: (p) => `${p.plazo_dias} d` },
              { t: 'Cumplimiento', n: true, k: (p) => `${p.cumplimiento} %` },
            ]}
          />
        </section>
      </div>
    </>
  );
}

function NuevoMaterial() {
  const { gw, usuario, accion } = useApp();
  const [f, setF] = useState({
    familia: 'FIL', subfamilia: 'ACE', descripcion: 'FILTRO ACEITE P/ MOTOR VOLVO D-13', unidad: 'und', criticidad: 'alta', metodo_reposicion: 'EOQ',
    demanda_diaria: 2, sigma_diaria: 1, plazo_dias: 10, stock_maximo: 140, costo_pedido: 150, costo_mantener: 20, perecible: false, serializado: false,
  });
  const [ver, setVer] = useState(null);
  const [distinto, setDistinto] = useState(false);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      if (/^[A-Z]{3}$/.test(f.familia) && /^[A-Z]{3}$/.test(f.subfamilia)) gw.verificarMaterial(usuario, f).then(setVer).catch(() => setVer(null));
    }, 250);
    return () => clearTimeout(t);
  }, [f.familia, f.subfamilia, f.descripcion]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : k === 'familia' || k === 'subfamilia' ? e.target.value.toUpperCase().slice(0, 3) : e.target.value });
  const crear = () => accion('crearMaterial', (u) => gw.crearMaterial(u, { ...f, confirmar_distinto: distinto, motivo: motivo || undefined }), (m) => `Material ${m.codigo} registrado`);

  return (
    <section className="panel">
      <Encabezado titulo="Alta de material" detalle="Escriba una descripción: el maestro propone el código y busca equivalentes mientras escribe." />
      <div className="grid-2">
        <div className="pila">
          <div className="campos">
            <Campo etiqueta="Familia">
              <select id="mm-fam" value={f.familia} onChange={set('familia')}>
                {FAMILIAS.map(([k, t]) => <option key={k} value={k}>{k}, {t}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Subfamilia (3 letras)"><input id="mm-sub" type="text" value={f.subfamilia} onChange={set('subfamilia')} /></Campo>
            <Campo etiqueta="Unidad">
              <select id="mm-uni" value={f.unidad} onChange={set('unidad')}>{['und', 'jgo', 'bal', 'lt', 'kg', 'm'].map((u) => <option key={u}>{u}</option>)}</select>
            </Campo>
            <Campo etiqueta="Criticidad">
              <select id="mm-cri" value={f.criticidad} onChange={set('criticidad')}>{['critica', 'alta', 'media', 'normal'].map((u) => <option key={u}>{u}</option>)}</select>
            </Campo>
          </div>
          <Campo etiqueta="Descripción"><input id="mm-desc" type="text" value={f.descripcion} onChange={set('descripcion')} /></Campo>
          <div className="campos">
            <Campo etiqueta="Demanda diaria"><input id="mm-d" type="number" step="0.01" value={f.demanda_diaria} onChange={set('demanda_diaria')} /></Campo>
            <Campo etiqueta="σ diaria"><input id="mm-s" type="number" step="0.01" value={f.sigma_diaria} onChange={set('sigma_diaria')} /></Campo>
            <Campo etiqueta="Plazo L (días)"><input id="mm-l" type="number" value={f.plazo_dias} onChange={set('plazo_dias')} /></Campo>
            <Campo etiqueta="Stock máximo"><input id="mm-max" type="number" value={f.stock_maximo} onChange={set('stock_maximo')} /></Campo>
          </div>
        </div>
        <div className="pila">
          {ver ? (
            <>
              <div className="fila"><span className="tenue">Código que asignará el maestro</span> <Codigo valor={ver.codigo_propuesto} /></div>
              <div className="pila" style={{ gap: 2 }}>
                <span className="tenue" style={{ fontSize: 12 }}>Descripción normalizada (sin tildes, signos ni palabras vacías; sinónimos unificados; palabras ordenadas)</span>
                <span className="ident" style={{ color: 'var(--ink)' }}>{ver.descripcion_normalizada}</span>
              </div>
              {ver.duplicados.length ? (
                <div className="concepto" style={{ background: 'var(--crit-bg)' }}>
                  <b style={{ color: 'var(--crit)' }}>Posible duplicado</b>
                  {ver.duplicados.map((d) => (
                    <span key={d.codigo} className="fila"><Codigo valor={d.codigo} /> {d.descripcion} <Estado valor={`${Math.round(d.similitud * 100)} % igual`} tono="crit" /></span>
                  ))}
                  <span>Use el código existente. Si de verdad es otro artículo, indíquelo con su motivo.</span>
                </div>
              ) : (
                <div className="concepto" style={{ background: 'var(--ok-bg)' }}><b style={{ color: 'var(--ok)' }}>Sin equivalentes en el catálogo</b><span>El material puede registrarse con el código propuesto.</span></div>
              )}
            </>
          ) : <div className="vacio">Familia y subfamilia deben tener tres letras.</div>}
          {ver?.duplicados.length ? (
            <div className="pila" style={{ gap: 6 }}>
              <Interruptor id="mm-distinto" etiqueta="Es un artículo distinto" valor={distinto} alCambiar={setDistinto} />
              {distinto ? <Campo etiqueta="Motivo"><input id="mm-motivo" type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo> : null}
            </div>
          ) : null}
          <div className="fila"><Boton primario rol="administrador" onClick={crear}>Registrar material</Boton></div>
        </div>
      </div>
    </section>
  );
}
