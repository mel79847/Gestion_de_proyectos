import { useApp, useCarga, Estado, Tabla, Encabezado, fecha, NOMBRE_ROL } from '../base.jsx';

const breve = (v) => {
  if (v === null || v === undefined) return '—';
  const s = JSON.stringify(v);
  return s.length > 110 ? `${s.slice(0, 110)}…` : s;
};

export function VistaAuditoria() {
  const { gw } = useApp();
  // La bitácora la consulta Control interno (solo lectura).
  const { datos: bit, error } = useCarga(() => gw.bitacora('ctl.quiroga'), []);
  const { datos: alertas } = useCarga(() => gw.alertas('ctl.quiroga'), []);

  return (
    <>
      <div className="titulo-vista">
        <h1>Auditoría y alertas</h1>
        <p>La bitácora registra quién hizo qué, cuándo, el valor anterior, el nuevo y el motivo. No tiene edición ni borrado: en PostgreSQL un disparador rechaza cualquier UPDATE o DELETE.</p>
      </div>
      <section className="panel">
        <Encabezado titulo="Alertas" detalle="Cada alerta tiene destinatario y estado." />
        <Tabla
          filas={alertas ?? []}
          vacio="Sin alertas."
          columnas={[
            { t: 'Fecha', k: (a) => fecha(a.creada_en) },
            { t: 'Tipo', k: (a) => <span className="ident">{a.tipo}</span> },
            { t: 'Para', k: (a) => NOMBRE_ROL[a.destinatario_rol] ?? a.destinatario_rol },
            { t: 'Mensaje', k: 'mensaje' },
            { t: 'Prioridad', k: 'prioridad' },
            { t: 'Estado', k: (a) => <Estado valor={a.estado} /> },
          ]}
        />
      </section>
      <section className="panel">
        <Encabezado titulo="Bitácora" detalle="Consultada como Control interno." />
        {error ? <div className="vacio">{error.message}</div> : null}
        <Tabla
          filas={bit ?? []}
          columnas={[
            { t: 'Fecha', k: (b) => fecha(b.fecha) },
            { t: 'Usuario', k: (b) => <span>{b.usuario}<br /><span className="tenue">{NOMBRE_ROL[b.rol] ?? b.rol}</span></span> },
            { t: 'Acción', k: (b) => <span className="ident">{b.accion}</span> },
            { t: 'Entidad', k: (b) => <span className="ident">{b.entidad} {String(b.entidad_id).length > 20 ? `${String(b.entidad_id).slice(0, 8)}…` : b.entidad_id}</span> },
            { t: 'Antes', k: (b) => <span className="ident">{breve(b.antes)}</span> },
            { t: 'Después', k: (b) => <span className="ident">{breve(b.despues)}</span> },
            { t: 'Motivo', k: (b) => b.motivo ?? '—' },
          ]}
        />
      </section>
    </>
  );
}
