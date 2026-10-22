import { Tabla, Encabezado } from '../base.jsx';

const RUTAS = [
  ['POST', '/api/auth/login', 'Inicio de sesión; devuelve un JWT con el rol'],
  ['GET', '/api/maestros/materiales', 'Catálogo con SS, ROP y EOQ calculados'],
  ['POST', '/api/maestros/materiales', 'Alta MDM: código asignado y control de duplicados'],
  ['POST', '/api/ordenes', 'Registrar orden con materiales compatibles'],
  ['POST', '/api/ordenes/:numero/validacion', 'Validar (supervisor)'],
  ['POST', '/api/ordenes/:numero/reservas', 'Deja la reserva en la bandeja de salida (202)'],
  ['POST', '/api/ordenes/:numero/entregas', 'Deja la salida en la bandeja de salida (202)'],
  ['POST', '/api/ordenes/:numero/cambios-pieza', 'Exige salida confirmada'],
  ['POST', '/api/ordenes/:numero/cierre', 'Bloquea si hay operaciones sin confirmar'],
  ['GET', '/api/inventario/disponibilidad/:material', 'Consulta al WMS y al ERP en el momento'],
  ['GET', '/api/inventario/kardex/:material', 'Kardex valorizado del ERP'],
  ['POST', '/api/compras/solicitudes/:numero/aprobacion', 'SolPed aprobada hacia el ERP'],
  ['GET', '/api/integracion/operaciones', 'Bandeja de salida y eventos recibidos'],
  ['POST', '/api/integracion/operaciones/:id/reproceso', 'Reproceso con el mismo id'],
  ['POST', '/api/integracion/webhooks/wms', 'Recepción aceptada (firma HMAC)'],
  ['GET', '/api/bitacora', 'Bitácora de solo lectura'],
];

const DUENOS = [
  ['Stock físico, reservas, lotes, ubicaciones y movimientos', 'WMS', 'Se consulta en cada operación; nunca se guarda un saldo propio'],
  ['Orden de compra, pagos, CPP y kardex valorizado', 'ERP', 'Se guarda solo el número de OC y la fecha prometida como referencia'],
  ['Orden de mantenimiento, detalle y cambio de pieza', 'Solución', 'Tablas propias en PostgreSQL'],
  ['Solicitud de compra, cotizaciones y recepciones', 'Solución', 'Tablas propias; una sola solicitud abierta por material'],
  ['Operaciones de integración, incidencias, alertas y bitácora', 'Solución', 'Tablas propias; la bitácora es de solo inserción'],
  ['Materiales, equipos, compatibilidad y proveedores', 'Maestro (MDM)', 'Un código por artículo, compartido por todos los sistemas'],
];

export function VistaArquitectura() {
  return (
    <>
      <div className="titulo-vista">
        <h1>Cómo está construido</h1>
        <p>Tres capas: presentación (React), lógica (API Node.js con Express y trabajador de integración) y datos (PostgreSQL y RabbitMQ). El WMS y el ERP son sistemas existentes; en esta demostración los reemplazan simuladores con el mismo contrato.</p>
      </div>

      <section className="panel">
        <figure>
          <div className="diagrama">
            <Diagrama />
          </div>
          <figcaption>Solo el trabajador de integración escribe en el WMS y el ERP, siempre con el id de la operación como clave de idempotencia. La API consulta disponibilidad y recibe webhooks; nunca modifica stock por su cuenta.</figcaption>
        </figure>
      </section>

      <div className="grid-2">
        <section className="panel">
          <Encabezado titulo="Bajo acoplamiento" />
          <ul className="pila" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Las reglas viven en un núcleo sin Express, SQL ni HTTP. Recibe sus dependencias como puertos: repositorios, cliente WMS, cliente ERP, reloj.</li>
            <li>Esta misma página ejecuta ese núcleo en el navegador con repositorios en memoria; el servidor lo ejecuta con PostgreSQL. No se cambió una línea de las reglas.</li>
            <li>La API no llama al WMS para escribir: deja la operación en la bandeja de salida y avisa a RabbitMQ. Si el WMS cae, la API sigue atendiendo y la operación espera en la cola.</li>
            <li>El WMS y el ERP se integran por contrato (REST, webhooks y proceso nocturno), no por acceso a sus bases de datos.</li>
          </ul>
        </section>
        <section className="panel">
          <Encabezado titulo="Alta cohesión" />
          <ul className="pila" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Cada componente tiene una responsabilidad: Catálogo, Mantenimiento, Inventario y reservas, Compras, Integración, Alertas y Auditoría.</li>
            <li>Los cálculos de inventario (disponible, posición, SS, ROP, EOQ, CPP, FEFO y PEPS) están juntos en un módulo de funciones puras con pruebas.</li>
            <li>Los estados de orden, reserva, solicitud y operación están en un único módulo; ningún servicio puede saltarse una transición.</li>
            <li>La autorización por rol se aplica en el servicio, de modo que una llamada directa a la API recibe el mismo rechazo que la pantalla.</li>
          </ul>
        </section>
      </div>

      <section className="panel">
        <Encabezado titulo="Un dato, un dueño" detalle="Así se evitan datos duplicados entre sistemas." />
        <Tabla filas={DUENOS} clave={(f) => f[0]} columnas={[{ t: 'Dato', k: (f) => f[0] }, { t: 'Dueño', k: (f) => <b>{f[1]}</b> }, { t: 'Tratamiento en la solución', k: (f) => f[2] }]} />
      </section>

      <section className="panel">
          <Encabezado titulo="Recorrido de una solicitud en Express" />
          <ol className="pila" style={{ margin: 0, paddingLeft: 20 }}>
            <li><span className="ruta"><span className="metodo POST">POST</span>/api/ordenes/OM-2026-0153/reservas</span></li>
            <li>Middleware: identificador de solicitud, JSON, verificación del JWT.</li>
            <li>Ruta del componente Mantenimiento: traduce HTTP a una llamada al servicio.</li>
            <li>Servicio <span className="ident">ordenes.solicitarReservas</span>: autoriza el rol y valida el estado de la orden.</li>
            <li>Transacción: crea la reserva "Solicitada" y su operación en la bandeja de salida (todo o nada).</li>
            <li>Respuesta <b>202 Accepted</b>: aceptada, todavía no confirmada.</li>
            <li>El trabajador envía <span className="ruta">POST /wms/reservas</span> con <span className="ruta">Idempotency-Key</span> y aplica la respuesta.</li>
            <li>Errores: un manejador central devuelve <span className="ruta">{'{ error: { codigo, mensaje } }'}</span> con el código de negocio.</li>
          </ol>
      </section>
      <section className="panel">
          <Encabezado titulo="Rutas principales de la API" detalle="Cada grupo de rutas corresponde a un componente de la API; las reglas se ejecutan en el núcleo." />
          <Tabla
            filas={RUTAS}
            clave={(r) => r[0] + r[1]}
            columnas={[
              { t: 'Ruta', k: (r) => <span className="ruta"><span className={`metodo ${r[0]}`}>{r[0]}</span>{r[1]}</span> },
              { t: 'Uso', k: (r) => <span style={{ fontSize: 12.5 }}>{r[2]}</span> },
            ]}
          />
      </section>
    </>
  );
}

function Caja({ x, y, w, h, titulo, sub, lineas = [], fuerte }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="6" fill="var(--surface)" stroke="currentColor" strokeWidth={fuerte ? 2 : 1.2} />
      <text x={x + 12} y={y + 22} fontSize="13.5" fontWeight="700" fill="currentColor">{titulo}</text>
      {sub ? <text x={x + 12} y={y + 40} fontSize="11.5" fill="var(--ink-3)">{sub}</text> : null}
      {lineas.map((l, i) => (
        <text key={l} x={x + 12} y={y + 62 + i * 17} fontSize="11.5" fill="var(--ink-2)">{l}</text>
      ))}
    </g>
  );
}

function Flecha({ d, texto, tx, ty, ancla = 'middle', acento, punteada }) {
  return (
    <g>
      <path d={d} fill="none" stroke={acento ? 'var(--s-disp)' : 'currentColor'} strokeWidth={acento ? 2 : 1.3} strokeDasharray={punteada ? '5 4' : undefined} markerEnd={acento ? 'url(#punta-a)' : 'url(#punta)'} />
      <text x={tx} y={ty} fontSize="11" textAnchor={ancla} fill="var(--ink-2)" stroke="var(--surface)" strokeWidth="4" paintOrder="stroke">{texto}</text>
    </g>
  );
}

function Diagrama() {
  return (
    <svg viewBox="0 0 1030 520" role="img" aria-label="Arquitectura de tres capas: aplicación web, API Express, trabajador de integración, PostgreSQL, WMS y ERP. Solo el trabajador escribe en el WMS y el ERP.">
      <defs>
        <marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker>
        <marker id="punta-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--s-disp)" /></marker>
      </defs>
      <text x="20" y="14" fontSize="11" fill="var(--ink-3)">Presentación</text>
      <text x="310" y="100" fontSize="11" fill="var(--ink-3)">Lógica</text>
      <text x="20" y="318" fontSize="11" fill="var(--ink-3)">Datos</text>
      <text x="760" y="100" fontSize="11" fill="var(--ink-3)">Sistemas existentes</text>

      <Caja x={20} y={22} w={210} h={56} titulo="Usuarios por rol" sub="mantenimiento, almacén, compras" />
      <Caja x={20} y={136} w={210} h={60} titulo="Aplicación web" sub="React; tableta en la ventanilla" />
      <Caja x={310} y={108} w={300} h={196} titulo="API de negocio" sub="Node.js + Express, monolito modular" fuerte
        lineas={['Rutas REST y seguridad (JWT, roles)', 'Catálogo (MDM), Mantenimiento', 'Inventario y reservas, Compras (ROP)', 'Alertas, Auditoría (bitácora)', 'Acceso a datos, Bandeja de salida', 'Núcleo de reglas compartido']} />
      <Caja x={310} y={344} w={300} h={78} titulo="Trabajador de integración" sub="conector, reintentos 2ⁿ, respaldo cada 15 min" fuerte />
      <Caja x={310} y={452} w={300} h={58} titulo="RabbitMQ" sub="cola de operaciones, reintentos con TTL, fallidas" />
      <Caja x={20} y={326} w={210} h={96} titulo="PostgreSQL" sub="23 tablas propias" lineas={['bandeja de salida', 'bitácora de solo inserción']} />
      <Caja x={760} y={108} w={250} h={96} titulo="WMS" sub="dueño del stock" lineas={['reservas, lotes, movimientos']} />
      <Caja x={760} y={300} w={250} h={96} titulo="ERP" sub="dueño de la OC y del CPP" lineas={['pagos, kardex valorizado']} />

      <Flecha d="M125 78 L125 134" texto="HTTPS" tx={132} ty={110} ancla="start" />
      <Flecha d="M230 166 L308 166" texto="REST + JWT" tx={269} ty={156} />
      <Flecha d="M310 284 L170 284 L170 324" texto="SQL, transacción ACID" tx={176} ty={278} ancla="start" />
      <Flecha d="M310 384 L232 384" texto="lee la bandeja" tx={264} ty={374} />
      <Flecha d="M610 136 L758 136" texto="GET disponibilidad" tx={684} ty={128} />
      <Flecha d="M760 186 L612 186" texto="webhook firmado" tx={666} ty={178} />
      <Flecha d="M610 368 L720 368 L720 166 L758 166" texto="" tx={0} ty={0} acento />
      <text x="712" y="280" fontSize="11" fill="var(--s-disp)" fontWeight="700" transform="rotate(-90 712 280)" textAnchor="middle">escribe con Idempotency-Key</text>
      <Flecha d="M610 404 L758 362" texto="SolPed aprobada" tx={690} ty={412} acento />
      <Flecha d="M460 424 L460 450" texto="consume y reintenta" tx={468} ty={441} ancla="start" />
      <Flecha d="M310 230 L298 230 L298 480 L308 480" texto="" tx={0} ty={0} punteada />
      <text x="290" y="476" fontSize="11" fill="var(--ink-2)" textAnchor="end">API: publica el id tras el COMMIT</text>
      <Flecha d="M885 204 L885 298" texto="ingreso y consumo" tx={892} ty={256} ancla="start" punteada />
    </svg>
  );
}
