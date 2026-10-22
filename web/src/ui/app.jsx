import { Ctx, ROL_ACCION, NOMBRE_ROL, Interruptor, Icono, useIntervalo, useState, useRef, useCallback, useEffect } from './base.jsx';
import { VistaPanel } from './vistas/panel.jsx';
import { VistaDemostracion } from './vistas/demostracion.jsx';
import { VistaOrdenes } from './vistas/ordenes.jsx';
import { VistaInventario } from './vistas/inventario.jsx';
import { VistaCompras } from './vistas/compras.jsx';
import { VistaIntegracion } from './vistas/integracion.jsx';
import { VistaMaestros } from './vistas/maestros.jsx';
import { VistaAuditoria } from './vistas/auditoria.jsx';
import { VistaArquitectura } from './vistas/arquitectura.jsx';
import { Riel } from './vistas/riel.jsx';

const VISTAS = [
  ['panel', 'Panel', VistaPanel],
  ['demostracion', 'Validación técnica', VistaDemostracion],
  ['ordenes', 'Órdenes', VistaOrdenes],
  ['inventario', 'Inventario', VistaInventario],
  ['compras', 'Compras', VistaCompras],
  ['integracion', 'Integración', VistaIntegracion],
  ['maestros', 'Datos maestros', VistaMaestros],
  ['auditoria', 'Auditoría', VistaAuditoria],
  ['arquitectura', 'Arquitectura', VistaArquitectura],
];

const vistaInicial = () => {
  const h = (globalThis.location?.hash ?? '').slice(1);
  return VISTAS.some(([k]) => k === h) ? h : 'panel';
};

export function App({ crearGateway }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const gwRef = useRef(null);
  if (!gwRef.current) gwRef.current = crearGateway({ alCambiar: bump });
  const gw = gwRef.current;

  const [vista, setVista] = useState(vistaInicial);
  const [usuario, setUsuario] = useState('sup.vargas');
  const [autoRol, setAutoRol] = useState(true);
  const [trabajador, setTrabajador] = useState(true);
  const [ocupado, setOcupado] = useState(false); // un escenario controla el trabajador
  const [avisos, setAvisos] = useState([]);
  const [registro, setRegistro] = useState([]);
  const [contexto, setContexto] = useState({}); // selección compartida entre vistas
  const [fallas, setFallas] = useState({ wms: { caido: false, perderRespuestas: 0 }, erp: { caido: false, perderRespuestas: 0 } });
  const procesando = useRef(false);

  const anotar = useCallback((texto, tono = '') => setRegistro((r) => [{ t: new Date().toISOString(), texto, tono }, ...r].slice(0, 80)), []);
  const avisar = useCallback((a) => {
    const id = Math.random();
    setAvisos((l) => [...l, { ...a, id }].slice(-3));
    setTimeout(() => setAvisos((l) => l.filter((x) => x.id !== id)), a.tipo === 'error' ? 9000 : 4000);
  }, []);

  const usuarioPara = (clave) => {
    const rol = ROL_ACCION[clave];
    if (autoRol && rol) return gw.usuarios.find((u) => u.rol === rol);
    return gw.usuarios.find((u) => u.usuario === usuario);
  };

  /** Ejecuta una acción como el usuario que corresponde; muestra el resultado o la causa del rechazo. */
  const accion = useCallback(
    async (clave, fn, mensajeOk) => {
      const u = usuarioPara(clave);
      try {
        const r = await fn(u.usuario);
        if (mensajeOk) avisar({ tipo: 'ok', titulo: typeof mensajeOk === 'function' ? mensajeOk(r) : mensajeOk, detalle: `${u.nombre}, ${NOMBRE_ROL[u.rol]}` });
        return r;
      } catch (e) {
        const rolSugerido = ROL_ACCION[clave];
        avisar({ tipo: 'error', titulo: e.message, codigo: e.codigo, sugerencia: e.codigo === 'SIN_PERMISO' && rolSugerido ? gw.usuarios.find((x) => x.rol === rolSugerido) : null });
        return undefined;
      }
    },
    [autoRol, usuario],
  );

  /** Un ciclo del trabajador de integración; deja constancia de cada resultado. */
  const ciclo = useCallback(async () => {
    if (procesando.current) return [];
    procesando.current = true;
    try {
      const r = await gw.procesar();
      for (const x of r) {
        const txt = { confirmada: 'confirmada', rechazada: 'rechazada por el sistema externo', reintento: `sin respuesta; reintento en ${(x.espera_ms / 1000).toFixed(1)} s`, incidencia: 'límite de intentos: incidencia' }[x.resultado];
        anotar(`${x.tipo} ${String(x.id).slice(0, 8)} ${txt}${x.recuperada ? ' (recuperada consultando el id)' : ''}`, x.resultado === 'confirmada' ? 'ok' : x.resultado === 'reintento' ? 'warn' : 'crit');
      }
      return r;
    } finally {
      procesando.current = false;
    }
  }, []);

  useIntervalo(ciclo, 1200, gw.modo === 'local' && trabajador && !ocupado);
  useIntervalo(bump, 2500, gw.modo === 'http');

  const cambiarFalla = async (sistema, patch) => {
    await gw.simulador.fallas(sistema, patch);
    setFallas((f) => ({ ...f, [sistema]: { ...f[sistema], ...patch } }));
    anotar(`${sistema.toUpperCase()}: ${patch.caido === true ? 'sin respuesta' : patch.caido === false ? 'en servicio' : 'perderá la próxima respuesta'}`, patch.caido ? 'crit' : '');
  };

  const ir = (k, ctx = {}) => {
    setContexto((c) => ({ ...c, ...ctx }));
    setVista(k);
    try {
      history.replaceState(null, '', `#${k}`);
    } catch {
      /* el visor puede impedir cambiar la URL */
    }
    globalThis.scrollTo?.({ top: 0 });
  };

  useEffect(() => {
    const f = () => setVista(vistaInicial());
    globalThis.addEventListener?.('hashchange', f);
    return () => globalThis.removeEventListener?.('hashchange', f);
  }, []);

  const valor = { gw, version, bump, usuario, autoRol, accion, avisar, anotar, ciclo, ir, contexto, setContexto, fallas, cambiarFalla, trabajador, setTrabajador, ocupado, setOcupado, registro };
  const Vista = VISTAS.find(([k]) => k === vista)[2];

  return (
    <Ctx.Provider value={valor}>
      <div className="marco">
        <header className="cabecera">
          <div className="marca">
            <span className="marca-banda" aria-hidden="true">MRO</span>
            <div className="marca-texto">
              <b>Trazabilidad de inventario MRO</b>
              <span>YPFB Transporte S.A. · Mantenimiento, almacén y compras{gw.modo === 'local' ? ' · modo local' : ''}</span>
            </div>
          </div>
          <div className="controles">
            <label className="campo" style={{ gridTemplateColumns: 'auto auto', alignItems: 'center', display: 'inline-grid', gap: 8 }}>
              <span>Actuar como</span>
              <select id="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} style={{ width: 'auto' }}>
                {gw.usuarios.map((u) => (
                  <option key={u.usuario} value={u.usuario}>{u.nombre} ({NOMBRE_ROL[u.rol]})</option>
                ))}
              </select>
            </label>
            <Interruptor id="autorol" etiqueta="Usar el rol de cada acción" valor={autoRol} alCambiar={setAutoRol} />
            {['wms', 'erp'].map((s) => (
              <button key={s} type="button" className={`estado-sistema${fallas[s].caido ? ' caido' : ''}`} onClick={() => cambiarFalla(s, { caido: !fallas[s].caido })} title={`Clic para ${fallas[s].caido ? 'restablecer' : 'simular la caída de'} ${s.toUpperCase()}`}>
                <i aria-hidden="true" />
                {s.toUpperCase()} {fallas[s].caido ? 'sin respuesta' : 'en servicio'}
              </button>
            ))}
          </div>
        </header>

        <div className="cuerpo">
          <nav className="nav" aria-label="Secciones">
            {VISTAS.map(([k, t]) => (
              <button key={k} type="button" aria-current={vista === k ? 'page' : undefined} onClick={() => ir(k)}>
                {t}
              </button>
            ))}
          </nav>
          <main className="principal" aria-live="polite">
            <Vista />
          </main>
          <Riel />
        </div>
      </div>

      <div className="avisos" role="status">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso ${a.tipo}`}>
            <div className="cab">
              <Icono nombre={a.tipo === 'error' ? 'alerta' : 'ok'} tam={18} />
              <div className="pila" style={{ gap: 2 }}>
                {a.codigo ? <span className="cod">{a.codigo}</span> : null}
                <b>{a.titulo}</b>
              </div>
            </div>
            {a.detalle ? <span className="tenue">{a.detalle}</span> : null}
            {a.sugerencia ? (
              <div className="fila">
                <button type="button" className="boton" onClick={() => setUsuario(a.sugerencia.usuario)}>
                  Actuar como {a.sugerencia.nombre}
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
