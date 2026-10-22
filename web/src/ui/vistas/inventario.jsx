import { useApp, useCarga, useState, Codigo, Estado, BarraStock, Fuente, Tabla, Campo, Encabezado, bs, fecha } from '../base.jsx';
import { NIVEL_SERVICIO } from '../../../../core/dominio/calculos.js';

const f1 = (n) => Number(n).toLocaleString('es-BO', { maximumFractionDigits: 2 });

export function VistaInventario() {
  const { gw, usuario, contexto, setContexto } = useApp();
  const { datos: mats } = useCarga(() => gw.materiales(usuario), []);
  const material = contexto.material ?? 'FIL-ACE-0021';
  const [almacen, setAlmacen] = useState('');
  const { datos: d, error } = useCarga(() => gw.disponibilidad(usuario, material, almacen || undefined), [material, almacen]);
  const { datos: kardex } = useCarga(() => gw.kardex(usuario, material), [material]);
  const ficha = mats?.find((m) => m.codigo === material);

  return (
    <>
      <div className="titulo-vista">
        <h1>Inventario y reposición</h1>
        <p>Cada número indica de qué sistema proviene. La disponibilidad se pide al WMS en el momento de la consulta; el CPP y las compras en camino, al ERP.</p>
      </div>
      <div className="grid-2 igual fundamentos-inventario">
        <section className="panel resumen-conceptual">
          <h2>Tipo de inventario</h2>
          <b>Inventario MRO perpetuo por almacén</b>
          <p>Controla repuestos, materiales y consumibles utilizados en mantenimiento; no son productos para la venta. Cada entrada, reserva, salida, devolución o ajuste actualiza el registro del WMS.</p>
        </section>
        <section className="panel resumen-conceptual">
          <h2>Política de revisión</h2>
          <b>Revisión continua</b>
          <p>Después de cada consumo se compara la posición de inventario con el punto de reorden. La posición considera lo disponible, lo que está en tránsito y los requerimientos todavía no reservados.</p>
        </section>
        <section className="panel resumen-conceptual">
          <h2>Algoritmo de salida</h2>
          <b>FEFO para perecibles y PEPS para los demás</b>
          <p>FEFO prioriza el lote que vence antes. Si el material no vence, PEPS entrega primero el lote con la fecha de ingreso más antigua. Los lotes bloqueados o vencidos se excluyen.</p>
        </section>
        <section className="panel resumen-conceptual">
          <h2>Algoritmo de reposición</h2>
          <b>ROP con stock de seguridad</b>
          <p>Al llegar al punto de reorden, la cantidad se calcula con EOQ cuando existe consumo regular y costos confiables; en los demás casos se completa hasta el stock máximo aprobado.</p>
        </section>
      </div>
      <section className="panel">
        <div className="campos">
          <Campo etiqueta="Material">
            <select id="inv-material" value={material} onChange={(e) => setContexto((c) => ({ ...c, material: e.target.value }))}>
              {(mats ?? []).map((m) => <option key={m.codigo} value={m.codigo}>{m.codigo}, {m.descripcion}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Almacén">
            <select id="inv-almacen" value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
              <option value="">Todos</option>
              <option value="ALM-SCZ">ALM-SCZ, Santa Cruz</option>
              <option value="ALM-CBB">ALM-CBB, Cochabamba</option>
            </select>
          </Campo>
        </div>
        {error ? <div className="vacio">{error.codigo ? `${error.codigo}: ` : ''}{error.message}</div> : null}
        {d ? (
          <>
            <div className="encabezado">
              <div className="fila"><Codigo valor={d.material} /> <b>{d.descripcion}</b></div>
              <div className="fila">
                <Estado valor={`Criticidad ${d.criticidad}`} tono={d.criticidad === 'critica' ? 'crit' : d.criticidad === 'alta' ? 'warn' : ''} />
                <Estado valor={d.perecible ? 'Perecible: FEFO' : 'Sin vencimiento: PEPS'} tono="info" />
                {d.bajo_rop ? <Estado valor="Posición bajo el ROP" tono="warn" /> : <Estado valor="Posición sobre el ROP" tono="ok" />}
              </div>
            </div>
            <BarraStock d={d} />
            <div className="tabla-contenedor">
              <table>
                <thead><tr><th>Concepto</th><th className="n">Cantidad</th><th>Fuente</th><th>Regla</th></tr></thead>
                <tbody>
                  <tr><td>Stock físico</td><td className="n">{d.fisico}</td><td><Fuente de="WMS" /></td><td className="sec">Lo que está en los estantes, incluidos lotes bloqueados o vencidos</td></tr>
                  <tr><td>Reservado</td><td className="n">{d.reservado}</td><td><Fuente de="WMS" /></td><td className="sec">Comprometido para órdenes con reserva confirmada</td></tr>
                  <tr><td>Bloqueado o vencido</td><td className="n">{d.bloqueado}</td><td><Fuente de="WMS" /></td><td className="sec">Cuarentena, inspección o fecha vencida; no se entrega</td></tr>
                  <tr><td><b>Disponible</b></td><td className="n"><b>{d.disponible}</b></td><td><Fuente de="WMS" /></td><td className="sec">Físico − reservado − bloqueado</td></tr>
                  <tr><td>En tránsito</td><td className="n">{d.en_transito}</td><td><Fuente de="ERP" /></td><td className="sec">Órdenes de compra confirmadas pendientes de recepción</td></tr>
                  <tr><td>Requerimientos sin reservar</td><td className="n">{d.requerimientos_pendientes}</td><td><Fuente de="Solución" /></td><td className="sec">Órdenes validadas que aún no tienen reserva</td></tr>
                  <tr><td><b>Posición de inventario</b></td><td className="n"><b>{d.posicion}</b></td><td><Fuente de="Solución" /></td><td className="sec">Disponible + en tránsito − requerimientos</td></tr>
                  <tr><td>Costo promedio ponderado</td><td className="n">{bs(d.cpp)}</td><td><Fuente de="ERP" /></td><td className="sec">Valoración oficial; la solución solo la consulta</td></tr>
                </tbody>
              </table>
            </div>
            {d.avisos?.length ? <div className="concepto" style={{ background: 'var(--warn-bg)' }}>{d.avisos.join(' ')}</div> : null}
          </>
        ) : null}
      </section>

      {d && ficha ? (
        <div className="grid-2">
          <section className="panel">
            <Encabezado titulo="Parámetros de reposición" detalle="Calculados con la ficha maestra del material; cambian si cambia la ficha." />
            <div className="formulas">
              <div className="formula">
                <b>Stock de seguridad</b>
                <code>SS = Z × σd × √L = {NIVEL_SERVICIO[ficha.criticidad].z} × {f1(ficha.sigma_diaria)} × √{ficha.plazo_dias} = <span className="res">{d.ss}</span></code>
                <span className="tenue" style={{ fontSize: 12 }}>Z por criticidad</span>
                <span className="tenue" style={{ fontSize: 12 }}>Crítica 2,33 (99 %), alta 1,65 (95 %), media 1,28 (90 %), normal 0,84 (80 %)</span>
              </div>
              <div className="formula">
                <b>Punto de reorden</b>
                <code>ROP = d × L + SS = {f1(ficha.demanda_diaria)} × {ficha.plazo_dias} + {d.ss} = <span className="res">{d.rop}</span></code>
              </div>
              <div className="formula">
                <b>Cantidad a pedir</b>
                {ficha.metodo_reposicion === 'EOQ' ? (
                  <code>EOQ = √(2DS ÷ H) = √(2 × {f1(ficha.demanda_diaria * 365)} × {f1(ficha.costo_pedido)} ÷ {f1(ficha.costo_mantener)}) = <span className="res">{d.eoq}</span></code>
                ) : (
                  <code>Hasta el máximo = {ficha.stock_maximo} − posición {d.posicion} = <span className="res">{Math.max(0, ficha.stock_maximo - d.posicion)}</span></code>
                )}
                <span className="tenue" style={{ fontSize: 12 }}>Método</span>
                <span className="tenue" style={{ fontSize: 12 }}>{ficha.metodo_reposicion === 'EOQ' ? 'Consumo regular con costos confiables' : 'Consumo irregular: se completa hasta el stock máximo aprobado'}</span>
              </div>
              <div className="formula">
                <b>Decisión</b>
                <code>
                  posición {d.posicion} {d.bajo_rop ? '≤' : '>'} ROP {d.rop}: <span className="res">{d.bajo_rop ? 'corresponde reponer' : 'no corresponde reponer'}</span>
                </code>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {d ? (
        <section className="panel">
          <Encabezado titulo="Lotes en el WMS" detalle={d.perecible ? 'FEFO: sale primero el lote que vence antes; los vencidos quedan bloqueados.' : 'PEPS: sale primero el lote que ingresó antes. La compatibilidad con el equipo se valida antes, en la orden.'} />
          <Lotes d={d} />
        </section>
      ) : null}

      <section className="panel">
        <Encabezado titulo="Kardex valorizado" detalle="Lo calcula el ERP con costo promedio ponderado: cada ingreso recalcula el CPP y cada salida se valoriza al CPP vigente.">
          <Fuente de="ERP" />
        </Encabezado>
        <Tabla
          filas={(kardex ?? []).slice().reverse()}
          clave={(k, i) => i}
          columnas={[
            { t: 'Fecha', k: (k) => fecha(k.fecha) },
            { t: 'Movimiento', k: 'tipo' },
            { t: 'Documento', k: (k) => <span className="ident">{k.documento}</span> },
            { t: 'Cantidad', n: true, k: 'cantidad' },
            { t: 'Costo unitario', n: true, k: (k) => bs(k.costo_unitario) },
            { t: 'Existencias', n: true, k: 'existencias' },
            { t: 'Valor', n: true, k: (k) => bs(k.valor) },
            { t: 'CPP', n: true, k: (k) => <b>{bs(k.cpp)}</b> },
          ]}
        />
      </section>
    </>
  );
}

function Lotes({ d }) {
  const usable = d.lotes.filter((l) => l.estado === 'Disponible');
  const orden = [...usable].sort((a, b) => (d.perecible ? (a.vence ?? '9999').localeCompare(b.vence ?? '9999') || a.fecha_ingreso.localeCompare(b.fecha_ingreso) : a.fecha_ingreso.localeCompare(b.fecha_ingreso)));
  const filas = [...orden, ...d.lotes.filter((l) => l.estado !== 'Disponible')];
  return (
    <Tabla
      filas={filas}
      clave={(l) => `${l.almacen}${l.lote}${l.serie ?? ''}`}
      columnas={[
        { t: 'Salida', n: true, k: (l) => (l.estado === 'Disponible' ? orden.indexOf(l) + 1 : '—') },
        { t: 'Lote o serie', k: (l) => <span className="ident">{l.serie ?? l.lote}</span> },
        { t: 'Almacén', k: 'almacen' },
        { t: 'Ubicación', k: (l) => <span className="ident">{l.ubicacion}</span> },
        { t: 'Ingreso', k: 'fecha_ingreso' },
        { t: 'Vence', k: (l) => l.vence ?? '—' },
        { t: 'Cant.', n: true, k: 'cantidad' },
        { t: 'Estado', k: (l) => <Estado valor={l.motivo ?? l.estado} tono={l.estado === 'Disponible' ? 'ok' : 'crit'} /> },
      ]}
    />
  );
}
