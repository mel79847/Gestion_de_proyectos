/* Componentes y utilidades compartidas por las vistas. React se carga como global (UMD). */
const { createContext, useContext, useEffect, useRef, useState, useCallback } = React;

export const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

/** Roles que ejecutan cada acción cuando está activo "usar el rol de cada acción". */
export const ROL_ACCION = {
  crearOrden: 'tecnico', validar: 'supervisor', reservar: 'almacen', entregar: 'almacen', cambioPieza: 'tecnico',
  completar: 'tecnico', cerrar: 'supervisor', cotizar: 'comprador', aprobar: 'comprador', evaluar: 'comprador',
  reprocesar: 'administrador', conciliar: 'administrador', crearMaterial: 'administrador', consulta: 'control',
};

export const NOMBRE_ROL = {
  tecnico: 'Técnico', supervisor: 'Supervisor', almacen: 'Almacén', comprador: 'Comprador', control: 'Control interno',
  administrador: 'Administrador', gerencia: 'Gerencia', sistema: 'Sistema',
};

/** Carga datos y vuelve a cargarlos cada vez que el sistema cambia. */
export function useCarga(fn, deps = []) {
  const { version } = useApp();
  const [estado, setEstado] = useState({ datos: null, error: null });
  const vigente = useRef(0);
  useEffect(() => {
    const id = ++vigente.current;
    Promise.resolve()
      .then(fn)
      .then((datos) => id === vigente.current && setEstado({ datos, error: null }))
      .catch((error) => id === vigente.current && setEstado((e) => ({ datos: e.datos, error })));
  }, [version, ...deps]);
  return estado;
}

export function useIntervalo(fn, ms, activo = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!activo) return undefined;
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms, activo]);
}

const nf = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const bs = (n) => (n === null || n === undefined ? '—' : `Bs ${nf.format(n)}`);
export const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
export const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const corto = (uuid) => (uuid ? `${String(uuid).slice(0, 8)}…` : '—');

/** Código maestro como etiqueta de ubicación: familia, subfamilia y correlativo. */
export function Codigo({ valor }) {
  const partes = String(valor ?? '').split('-');
  if (partes.length !== 3) return <span className="ident">{valor}</span>;
  return (
    <span className="codigo" title={`Código maestro ${valor}`}>
      <span className="fam">{partes[0]}</span>
      <span className="sub">{partes[1]}</span>
      <span className="cor">{partes[2]}</span>
    </span>
  );
}

const TONO = {
  ok: ['Confirmada', 'Cerrada', 'Recibida', 'Materiales reservados', 'Consumida', 'Resuelta', 'OC creada', 'Conforme', 'Atendida'],
  info: ['Validada', 'En ejecución', 'Enviada al ERP', 'Aprobada', 'Enviada', 'Solicitada'],
  warn: ['En reintento', 'En espera de repuestos', 'Recibida parcial', 'Pendiente', 'Pendiente de verificación', 'Borrador', 'Con diferencia'],
  crit: ['Incidencia', 'Rechazada', 'Abierta'],
};
export function Estado({ valor, tono }) {
  const t = tono ?? Object.keys(TONO).find((k) => TONO[k].includes(valor)) ?? '';
  return <span className={`pill ${t}`}>{valor}</span>;
}

/** Iconos de trazo (geometría de Lucide, ISC), un solo grosor; nunca emoji ni glifos Unicode. */
const TRAZOS = {
  check: 'M20 6 9 17l-5-5',
  flecha: 'M5 12h14M13 6l6 6-6 6',
  alerta: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  ok: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  recargar: 'M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M3 21v-5h5',
  mas: 'M12 5v14M5 12h14',
};
export function Icono({ nombre, tam = 16, etiqueta }) {
  return (
    <svg className="icono" width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden={etiqueta ? undefined : 'true'} role={etiqueta ? 'img' : undefined} aria-label={etiqueta}>
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}

export const Fuente = ({ de }) => <span className="fuente" title={`Dato leído de ${de}`}>{de}</span>;

export function Boton({ children, rol, primario, peligro, ...p }) {
  return (
    <button type="button" className={`boton${primario ? ' primario' : ''}${peligro ? ' peligro' : ''}`} {...p}>
      {children}
      {rol ? <span className="rol">{NOMBRE_ROL[rol]}</span> : null}
    </button>
  );
}

export function Campo({ etiqueta, children }) {
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      {children}
    </label>
  );
}

export function Interruptor({ id, etiqueta, valor, alCambiar, peligro }) {
  return (
    <label className="interruptor" htmlFor={id}>
      <input id={id} type="checkbox" className={peligro ? 'crit' : ''} checked={valor} onChange={(e) => alCambiar(e.target.checked)} />
      {etiqueta}
    </label>
  );
}

/** Tabla simple: columnas [{t: título, k: clave | (fila)=>nodo, n: numérica}]. */
export function Tabla({ columnas, filas, vacio = 'Sin registros.', clave = (f, i) => f.id ?? f.numero ?? f.codigo ?? i, alElegir, elegido }) {
  if (!filas?.length) return <div className="vacio">{vacio}</div>;
  return (
    <div className="tabla-contenedor">
      <table>
        <thead>
          <tr>{columnas.map((c) => <th key={c.t} className={c.n ? 'n' : ''}>{c.t}</th>)}</tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr
              key={clave(f, i)}
              className={alElegir ? 'clic' : ''}
              onClick={alElegir ? () => alElegir(f) : undefined}
              tabIndex={alElegir ? 0 : undefined}
              onKeyDown={alElegir ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), alElegir(f)) : undefined}
              aria-selected={elegido !== undefined ? clave(f, i) === elegido : undefined}
            >
              {columnas.map((c) => (
                <td key={c.t} className={c.n ? 'n' : ''}>{typeof c.k === 'function' ? c.k(f) : f[c.k] ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Encabezado({ titulo, children, detalle }) {
  return (
    <div className="encabezado">
      <div className="pila" style={{ gap: 2 }}>
        <h2>{titulo}</h2>
        {detalle ? <p>{detalle}</p> : null}
      </div>
      {children ? <div className="fila">{children}</div> : null}
    </div>
  );
}

/**
 * Barra de stock a escala: físico dividido en disponible, reservado y bloqueado, más lo que
 * está en tránsito; marcas del stock de seguridad (SS) y del punto de reorden (ROP).
 */
export function BarraStock({ d, compacta = false }) {
  const max = Math.max(d.fisico + d.en_transito, d.rop, d.stock_maximo ?? 0, 1) * 1.05;
  const W = compacta ? 260 : 600;
  const H = compacta ? 30 : 56;
  const y = compacta ? 7 : 18;
  const h = compacta ? 16 : 18;
  const x = (v) => (v / max) * W;
  const seg = [
    ['disp', d.disponible, 'var(--s-disp)'],
    ['res', d.reservado, 'var(--s-res)'],
    ['blk', d.bloqueado, 'url(#rayado)'],
  ];
  let acc = 0;
  const id = `r${String(d.material).replace(/\W/g, '')}`;
  return (
    <div className="barra">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${d.material}: disponible ${d.disponible}, reservado ${d.reservado}, bloqueado ${d.bloqueado}, en tránsito ${d.en_transito}; ROP ${d.rop}, SS ${d.ss}`}>
        <defs>
          <pattern id="rayado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--neutral-bg)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--s-blk)" strokeWidth="2.5" />
          </pattern>
          <clipPath id={id}><rect x="0" y={y} width={W} height={h} rx="3" /></clipPath>
        </defs>
        <rect x="0" y={y} width={W} height={h} rx="3" fill="var(--surface-2)" stroke="var(--line)" />
        <g clipPath={`url(#${id})`}>
          {seg.map(([k, v, fill]) => {
            const r = <rect key={k} x={x(acc)} y={y} width={Math.max(0, x(v) - (v > 0 ? 2 : 0))} height={h} fill={fill} />;
            acc += v;
            return r;
          })}
        </g>
        {d.en_transito > 0 ? (
          <rect x={x(d.fisico) + 1} y={y + 1} width={x(d.en_transito) - 2} height={h - 2} rx="2" fill="none" stroke="var(--s-disp)" strokeWidth="1.5" strokeDasharray="4 3" />
        ) : null}
        {[['SS', d.ss], ['ROP', d.rop]].map(([t, v]) => (
          <g key={t}>
            <line x1={x(v)} x2={x(v)} y1={y - 4} y2={y + h + 4} stroke="currentColor" strokeWidth={t === 'ROP' ? 2 : 1} strokeDasharray={t === 'SS' ? '2 2' : undefined} style={{ color: 'var(--ink)' }} />
            {!compacta ? (
              <text x={x(v)} y={y - 7} textAnchor={t === 'SS' ? 'end' : 'start'} dx={t === 'SS' ? -2 : 2} fontSize="11" fill="var(--ink-2)" fontWeight={t === 'ROP' ? 700 : 500}>
                {t} {v}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      {!compacta ? (
        <div className="leyenda">
          <span><i style={{ background: 'var(--s-disp)' }} />Disponible {d.disponible}</span>
          <span><i style={{ background: 'var(--s-res)' }} />Reservado {d.reservado}</span>
          <span><i style={{ background: 'var(--s-blk)' }} />Bloqueado o vencido {d.bloqueado}</span>
          <span><i style={{ border: '1.5px dashed var(--s-disp)' }} />En tránsito {d.en_transito}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Recorrido de estados de la orden con el estado actual resaltado. */
const RUTA_ORDEN = ['Registrada', 'Validada', 'Materiales reservados', 'En ejecución', 'Pendiente de verificación', 'Cerrada'];
export function EtapasOrden({ estado }) {
  const desvio = estado === 'En espera de repuestos' || estado === 'Anulada';
  const idx = desvio ? 1 : RUTA_ORDEN.indexOf(estado);
  return (
    <div className="etapas" aria-label={`Estado actual: ${estado}`}>
      {RUTA_ORDEN.map((e, i) => (
        <React.Fragment key={e}>
          <span className={`etapa${i < idx || (i === idx && desvio) ? ' hecha' : ''}${i === idx && !desvio ? ' actual' : ''}`}>
            {i < idx || (i === idx && desvio) ? <Icono nombre="check" tam={13} /> : null}
            {e}
          </span>
          {desvio && i === 1 ? <span className="etapa desvio">{estado}</span> : null}
        </React.Fragment>
      ))}
    </div>
  );
}

export { useState, useEffect, useRef, useCallback };
