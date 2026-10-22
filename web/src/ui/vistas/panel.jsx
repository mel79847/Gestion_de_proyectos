import { useApp, useCarga, Codigo, Estado, BarraStock, Fuente, Tabla, Boton, Icono } from '../base.jsx';

/** Panel: estado del proceso y del inventario de cada material, con sus fuentes oficiales. */
export function VistaPanel() {
  const { gw, usuario, ir, bump } = useApp();
  const { datos: resumen } = useCarga(() => gw.resumen(usuario), [usuario]);
  const { datos: filas, error } = useCarga(async () => {
    const mats = await gw.materiales(usuario);
    const sols = await gw.solicitudes(usuario);
    return Promise.all(
      mats.map(async (m) => {
        const d = await gw.disponibilidad(usuario, m.codigo);
        const enCurso = sols.find((s) => s.material === m.codigo && ['Borrador', 'Aprobada', 'Enviada al ERP', 'OC creada', 'Recibida parcial'].includes(s.estado));
        return { ...d, enCurso };
      }),
    );
  }, [usuario]);

  const r = resumen ?? {};
  const pendientes = ['Pendiente', 'Enviada', 'En reintento'].reduce((a, k) => a + (r.operaciones_por_estado?.[k] ?? 0), 0);
  const incid = r.operaciones_por_estado?.Incidencia ?? 0;
  const abiertas = Object.entries(r.ordenes_por_estado ?? {}).filter(([k]) => !['Cerrada', 'Anulada'].includes(k)).reduce((a, [, v]) => a + v, 0);

  // Lo que necesita atención primero: bajo el ROP sin compra, luego con compra en curso, luego cubierto.
  const peso = (f) => (f.bajo_rop && !f.enCurso ? 0 : f.enCurso ? 1 : 2);
  const ordenadas = (filas ?? []).slice().sort((a, b) => peso(a) - peso(b) || a.posicion - a.rop - (b.posicion - b.rop));
  const sinCompra = ordenadas.filter((f) => f.bajo_rop && !f.enCurso);
  const conCompra = ordenadas.filter((f) => f.enCurso);
  const consultado = filas?.[0]?.consultado_en;
  const hallazgo = !filas
    ? 'Consultando existencias al WMS y al ERP.'
    : sinCompra.length
      ? `${sinCompra.length === 1 ? '1 material está' : `${sinCompra.length} materiales están`} en o bajo su punto de reorden sin compra en curso: ${sinCompra.map((f) => f.material).join(', ')}.`
      : `Ningún material bajo el punto de reorden queda sin compra. ${conCompra.length === 1 ? '1 compra en curso' : `${conCompra.length} compras en curso`}.`;

  return (
    <>
      <div className="encabezado" style={{ alignItems: 'flex-start' }}>
        <div className="pila" style={{ gap: 4 }}>
          <h1>Panel de inventario MRO</h1>
          <p className="hallazgo">{hallazgo}</p>
          <p className="sello">
            Consultado a las {consultado ? new Date(consultado).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—'}: existencias del WMS; en tránsito y CPP del ERP. La solución no guarda copia de esos saldos.
          </p>
        </div>
        <div className="fila">
          <Boton onClick={bump} title="Volver a consultar al WMS y al ERP"><Icono nombre="recargar" />Actualizar</Boton>
          <Boton primario rol="tecnico" onClick={() => ir('ordenes', { nuevaOrden: true })}><Icono nombre="mas" />Nueva orden</Boton>
        </div>
      </div>

      <div className="indicadores" role="group" aria-label="Estado del proceso">
        <Dato etiqueta="Órdenes abiertas" valor={abiertas} />
        <Dato etiqueta="Operaciones en curso" valor={pendientes} />
        <Dato etiqueta="Operaciones en incidencia" valor={incid} tono={incid ? 'crit' : ''} />
        <Dato etiqueta="Incidencias abiertas" valor={r.incidencias_abiertas ?? 0} tono={r.incidencias_abiertas ? 'warn' : ''} />
        <Dato etiqueta="Alertas abiertas" valor={r.alertas_abiertas ?? 0} />
      </div>

      <section className="panel">
        <div className="encabezado">
          <div className="pila" style={{ gap: 2 }}>
            <h2>Existencias frente al punto de reorden</h2>
            <p className="sec">Posición = disponible + en tránsito − requerimientos aprobados sin reservar. Se compra cuando la posición llega al ROP.</p>
          </div>
          <div className="fila"><Fuente de="WMS" /><Fuente de="ERP" /><Fuente de="Solución" /></div>
        </div>
        {error ? (
          <div className="vacio" role="alert">
            <span>No se pudo consultar el inventario: {error.message}</span>
            <Boton onClick={bump}><Icono nombre="recargar" />Reintentar</Boton>
          </div>
        ) : null}
        <Tabla
          filas={ordenadas}
          clave={(f) => f.material}
          alElegir={(f) => ir('inventario', { material: f.material })}
          vacio="Consultando el WMS…"
          columnas={[
            { t: 'Material', k: (f) => <div className="pila" style={{ gap: 4, minWidth: 180 }}><span><Codigo valor={f.material} /></span><span className="sec" style={{ fontSize: 12.5 }}>{f.descripcion}</span></div> },
            { t: 'Existencias frente al ROP', k: (f) => <div style={{ minWidth: 150 }}><BarraStock d={f} compacta /></div> },
            { t: 'Físico', n: true, k: 'fisico' },
            { t: 'Disponible', n: true, k: 'disponible' },
            { t: 'En tránsito', n: true, k: (f) => (f.en_transito ? f.en_transito : <span className="tenue">0</span>) },
            { t: 'Posición', n: true, k: (f) => <b>{f.posicion}</b> },
            { t: 'ROP', n: true, k: 'rop' },
            { t: 'Situación', k: (f) => (f.enCurso ? <span className="pila" style={{ gap: 2 }}><Estado valor="Compra en curso" tono="" /><span className="ident tenue">{f.enCurso.numero}</span></span> : f.bajo_rop ? <Estado valor="Bajo el ROP" tono="warn" /> : <Estado valor="Cubierto" tono="" />) },
          ]}
        />
        <p className="tenue" style={{ fontSize: 12 }}>Marca gruesa: ROP. Marca punteada: stock de seguridad. Seleccione un material para ver sus lotes, fórmulas y kardex.</p>
      </section>
    </>
  );
}

function Dato({ etiqueta, valor, tono }) {
  return (
    <div>
      <span>{etiqueta}</span>
      <b className={valor === 0 ? 'cero' : ''} style={{ color: tono ? `var(--${tono})` : undefined }}>{valor}</b>
    </div>
  );
}
