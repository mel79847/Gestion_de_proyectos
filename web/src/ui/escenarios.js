/**
 * Guion de la defensa: cada escenario responde una pregunta del docente ejecutando el
 * sistema de verdad (mismos servicios, mismas reglas) y narrando lo que ocurre.
 */
const TEC = 'tec.rojas';
const SUP = 'sup.vargas';
const ALM = 'alm.mamani';
const COM = 'com.flores';
const ADM = 'adm.sistema';

const manana = () => new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);

async function ordenValidada(gw, equipo, materiales, diagnostico) {
  const o = await gw.crearOrden(TEC, { equipo, tipo: 'correctivo', prioridad: 'alta', diagnostico, fecha_requerida: manana(), materiales });
  await gw.validar(SUP, o.numero);
  return o.numero;
}

async function esperaRechazo(promesa) {
  try {
    await promesa;
    return null;
  } catch (e) {
    return e;
  }
}

const bs = (n) => (n === null || n === undefined ? '—' : `Bs ${Number(n).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const ROL = { almacen: 'Personal de almacén', comprador: 'Comprador' };
const disp = (d) => `físico ${d.fisico}, reservado ${d.reservado}, bloqueado ${d.bloqueado}, disponible ${d.disponible}, en tránsito ${d.en_transito}, posición ${d.posicion}, ROP ${d.rop}`;

export const ESCENARIOS = [
  {
    id: 'flujo',
    pregunta: '¿Cómo funciona el inventario de punta a punta?',
    concepto: 'Inventario perpetuo MRO: reserva, salida PEPS, valoración CPP y reposición por punto de reorden.',
    async ejecutar({ gw, paso, drenar }) {
      const n = await ordenValidada(gw, 'CAM-VOL-014', [{ material: 'FIL-ACE-0021', cantidad: 4 }], 'Cambio de filtro por contaminación del aceite');
      paso(`Orden ${n} registrada por el técnico y validada por el supervisor`, 'El filtro FIL-ACE-0021 es compatible con el camión CAM-VOL-014; un material incompatible sería rechazado.');
      const a = await gw.disponibilidad(ALM, 'FIL-ACE-0021', 'ALM-SCZ');
      paso('Consulta al WMS antes de reservar', `${disp(a)}. La posición ya descuenta las 4 unidades que la orden validada necesita y aún no tiene reservadas.`);
      await gw.reservar(ALM, n);
      paso('Reserva solicitada', 'La API responde 202: la reserva queda en la bandeja de salida con un id único.');
      await drenar();
      const o = await gw.orden(ALM, n);
      paso(`El WMS confirmó la reserva ${o.reservas[0]?.ref_wms ?? ''}`, `La orden pasó a "${o.estado}".`, o.estado === 'Materiales reservados' ? 'ok' : 'error');
      const b = await gw.disponibilidad(ALM, 'FIL-ACE-0021', 'ALM-SCZ');
      paso('Después de reservar', `${disp(b)}. El físico no cambia; cambia lo disponible.`);
      await gw.entregar(ALM, n, TEC);
      await drenar();
      const o2 = await gw.orden(ALM, n);
      const m = o2.movimientos[0];
      paso(`Salida ${m?.ref_wms ?? ''} confirmada por el WMS`, m ? `Lotes por PEPS: ${m.lotes.map((l) => `${l.lote} × ${l.cantidad}`).join(', ')}. Costo al CPP del ERP: ${bs(m.costo_unitario)} × ${m.cantidad} = ${bs(m.costo_total)}.` : 'Sin salida.', m ? 'ok' : 'error');
      await gw.cambioPieza(TEC, n, { material: 'FIL-ACE-0021', pieza_retirada: 'Filtro saturado', condicion: 'desgastada', destino: 'baja' });
      await gw.completar(TEC, n);
      const c = await gw.cerrar(SUP, n);
      paso(`Cambio de pieza registrado y orden "${c.estado}"`, 'La pieza retirada va a baja; no vuelve al stock.');
      const sol = (await gw.solicitudes(COM)).find((s) => s.material === 'FIL-ACE-0021' && ['Borrador', 'Aprobada', 'Enviada al ERP', 'OC creada', 'Recibida parcial'].includes(s.estado));
      paso(
        sol ? `Reposición: ${sol.numero} por ${sol.cantidad} unidades (${sol.metodo === 'EOQ' ? 'EOQ' : 'hasta el máximo'})` : 'La posición sigue sobre el ROP: no se compra',
        sol ? `Tras la salida se evaluó la posición contra el ROP: ${sol.detalle_calculo}.` : '',
      );
    },
  },
  {
    id: 'mdm',
    pregunta: '¿Cómo evitan que un producto tenga dos códigos?',
    concepto: 'Datos maestros (MDM): el código lo asigna el maestro y la descripción normalizada es única.',
    async ejecutar({ gw, paso }) {
      const dup = { familia: 'FIL', subfamilia: 'ACE', descripcion: 'FILTRO ACEITE P/ MOTOR VOLVO D-13', unidad: 'und', criticidad: 'alta', metodo_reposicion: 'EOQ', demanda_diaria: 2, sigma_diaria: 1, plazo_dias: 10, stock_maximo: 140, costo_pedido: 150, costo_mantener: 20 };
      const v = await gw.verificarMaterial(ADM, dup);
      paso(`Se intenta registrar "${dup.descripcion}"`, `Descripción normalizada: "${v.descripcion_normalizada}". Coincide con ${v.duplicados.map((d) => `${d.codigo} (${Math.round(d.similitud * 100)} %)`).join(', ') || 'ninguno'}.`);
      const e = await esperaRechazo(gw.crearMaterial(ADM, dup));
      paso(e ? `Rechazado: ${e.codigo}` : 'Se registró (no esperado)', e ? e.message : '', e ? 'ok' : 'error');
      const candidatos = ['Filtro de aceite motor Scania DC13', 'Filtro de aceite motor Cummins ISX15', 'Filtro de aceite motor Caterpillar C15', 'Filtro de aceite motor Detroit DD15'];
      for (const descripcion of candidatos) {
        const ver = await gw.verificarMaterial(ADM, { ...dup, descripcion });
        if (!ver.duplicados.length) {
          const m = await gw.crearMaterial(ADM, { ...dup, descripcion });
          paso(`"${descripcion}" es un artículo nuevo: código ${m.codigo}`, 'El correlativo lo asigna el maestro; nadie escribe el código a mano. Mantenimiento, almacén y compras usarán ese mismo código.', 'ok');
          return;
        }
      }
      paso('Los artículos de ejemplo ya fueron registrados en esta sesión', '');
    },
  },
  {
    id: 'falta',
    pregunta: '¿Qué pasa si se pide más de lo que hay?',
    concepto: 'El WMS rechaza la reserva sin tocar el stock y se genera la necesidad de compra ligada a la orden.',
    async ejecutar({ gw, paso, drenar }) {
      const a = await gw.disponibilidad(ALM, 'EMP-CUL-0115', 'ALM-SCZ');
      const pedido = a.disponible + 2;
      const n = await ordenValidada(gw, 'CAM-VOL-014', [{ material: 'EMP-CUL-0115', cantidad: pedido }], 'Fuga de compresión en culata');
      paso(`Orden ${n} pide ${pedido} juegos de empaquetaduras`, `Disponible en el WMS: ${a.disponible}.`);
      await gw.reservar(ALM, n);
      await drenar();
      const o = await gw.orden(ALM, n);
      const op = o.operaciones.find((x) => x.tipo === 'RESERVA');
      paso(`Respuesta del WMS: ${op?.respuesta?.causa ?? op?.estado}`, `${op?.respuesta?.mensaje ?? ''} La orden queda "${o.estado}".`, o.estado === 'En espera de repuestos' ? 'ok' : 'error');
      const b = await gw.disponibilidad(ALM, 'EMP-CUL-0115', 'ALM-SCZ');
      paso('El stock no cambió', disp(b));
      const sol = (await gw.solicitudes(COM)).find((s) => s.material === 'EMP-CUL-0115' && !['Recibida', 'Rechazada', 'Anulada'].includes(s.estado));
      paso(sol ? `Solicitud ${sol.numero} (${sol.origen === 'FALTA_STOCK' ? `falta de stock de ${sol.orden_origen}` : 'punto de reorden'})` : 'Sin solicitud', sol ? `${sol.cantidad} unidades: ${sol.detalle_calculo}. Si ya había una compra en curso, se usa esa y no se crea otra.` : '', sol ? 'ok' : 'error');
    },
  },
  {
    id: 'duplicar',
    pregunta: '¿Cómo evitan comprar dos veces lo mismo?',
    concepto: 'La posición suma lo que viene en camino; si existe una compra en curso del material, no se crea otra.',
    async ejecutar({ gw, paso }) {
      const r = await gw.evaluar(COM, 'VAL-COM-0042');
      paso('Evaluación de la válvula de descarga VAL-COM-0042 contra el ROP', disp(r.estado));
      paso(
        r.creada ? `Se creó ${r.solicitud.numero}` : r.requiere ? `No se duplica: ${r.solicitud.numero} está en "${r.solicitud.estado}"` : 'No corresponde reponer',
        r.solicitud?.numero_oc ? `OC del ERP ${r.solicitud.numero_oc}, entrega prometida ${r.solicitud.fecha_prometida}. En PostgreSQL un índice único parcial impide dos solicitudes abiertas del mismo material.` : '',
        r.creada ? '' : 'ok',
      );
    },
  },
  {
    id: 'caida',
    pregunta: '¿Qué pasa si el WMS no responde?',
    concepto: 'Bandeja de salida, reintentos con espera creciente, incidencia con causa y recuperación sin duplicar.',
    async ejecutar({ gw, paso, drenar, cambiarFalla }) {
      const n = await ordenValidada(gw, 'CAM-VOL-014', [{ material: 'FIL-AIR-0008', cantidad: 1 }], 'Restricción de admisión de aire');
      await cambiarFalla('wms', { caido: true });
      paso(`Orden ${n} validada y el WMS deja de responder`, 'Se solicita la reserva: la API la acepta igual porque solo la deja en la bandeja de salida.');
      await gw.reservar(ALM, n);
      const r = await drenar({ hastaIncidencia: true });
      paso('El trabajador reintenta', r.map((x) => (x.resultado === 'reintento' ? `reintento en ${x.espera_ms / 1000} s` : x.resultado)).join(', '), 'espera');
      const inc = (await gw.incidencias(ADM)).find((i) => i.codigo === 'WMS_SIN_RESPUESTA' && i.estado === 'Abierta');
      paso(`Incidencia ${inc?.codigo ?? ''}`, `${inc?.causa ?? ''} Responsable: ${ROL[inc?.responsable_rol] ?? inc?.responsable_rol ?? ''}.`, inc ? 'ok' : 'error');
      const e = await esperaRechazo(gw.cerrar(SUP, n));
      paso(`Cierre bloqueado: ${e?.codigo ?? 'no'}`, e?.message ?? '', e ? 'ok' : 'error');
      await cambiarFalla('wms', { caido: false });
      const op = (await gw.operaciones(ADM, { orden: n })).find((x) => x.estado === 'Incidencia');
      await gw.reprocesar(ADM, op.id);
      paso('El WMS vuelve y el administrador reprocesa', `La operación vuelve a la cola con el mismo id ${op.id.slice(0, 8)}…; antes de reenviar se consulta su estado.`);
      await drenar();
      const o = await gw.orden(ALM, n);
      const sim = await gw.simulador.estado();
      const enWms = sim.wms.reservas.filter((x) => x.orden === n).length;
      paso(`Orden "${o.estado}" con ${enWms} reserva en el WMS`, 'La incidencia quedó resuelta automáticamente al confirmarse la operación.', o.estado === 'Materiales reservados' && enWms === 1 ? 'ok' : 'error');
    },
  },
  {
    id: 'perdida',
    pregunta: '¿Y si el WMS procesó pero la respuesta se perdió?',
    concepto: 'Idempotencia: antes de reenviar se consulta por el id. También muestra FEFO en la salida de aceite.',
    async ejecutar({ gw, paso, drenar, cambiarFalla }) {
      const sim0 = await gw.simulador.estado();
      const n = await ordenValidada(gw, 'CAM-MER-022', [{ material: 'ACE-MOT-0003', cantidad: 3 }], 'Cambio de aceite por degradación');
      await cambiarFalla('wms', { perderRespuestas: 1 });
      await gw.reservar(ALM, n);
      paso(`Orden ${n}: reserva de 3 baldes de aceite`, 'El WMS aplicará la reserva pero su respuesta no llegará.');
      const r = await drenar();
      paso('Resultado del trabajador', r.map((x) => `${x.resultado}${x.recuperada ? ' (recuperada por id)' : ''}`).join(', '), 'espera');
      const sim1 = await gw.simulador.estado();
      paso(
        `El WMS recibió ${sim1.wms.estadisticas.solicitudes - sim0.wms.estadisticas.solicitudes} envío(s) de reserva`,
        'El segundo intento no reenvió: preguntó GET /wms/operaciones/{id}, encontró la reserva hecha y aplicó esa respuesta. Queda una incidencia CONFIRMACION_PERDIDA ya resuelta como evidencia.',
        'ok',
      );
      await gw.entregar(ALM, n, TEC);
      await drenar();
      const o = await gw.orden(ALM, n);
      const m = o.movimientos[0];
      paso('Salida por FEFO', m ? `${m.lotes.map((l) => `${l.lote} (vence ${l.vence}) × ${l.cantidad}`).join(', ')}. El lote L-2312 venció el 2026-10-01: está bloqueado y no sale.` : 'Sin salida', m ? 'ok' : 'error');
    },
  },
  {
    id: 'concurrencia',
    pregunta: '¿Qué pasa si dos órdenes piden la última unidad a la vez?',
    concepto: 'El WMS serializa las reservas: solo una compromete la unidad; la otra espera la compra.',
    async ejecutar({ gw, paso, drenar }) {
      const d = await gw.disponibilidad(ALM, 'VAL-COM-0042', 'ALM-CBB');
      if (d.disponible !== 1) {
        paso(`Hay ${d.disponible} válvulas disponibles`, d.disponible === 0 ? 'La última unidad ya se reservó. Ejecute "¿Cómo se actualizan los datos cuando llega la compra?" para recibir otra.' : 'El escenario necesita exactamente una unidad disponible.', 'error');
        return;
      }
      const a = await ordenValidada(gw, 'CMP-ARI-003', [{ material: 'VAL-COM-0042', cantidad: 1 }], 'Válvula de descarga con fuga, cilindro 2');
      const b = await ordenValidada(gw, 'CMP-ARI-003', [{ material: 'VAL-COM-0042', cantidad: 1 }], 'Válvula de descarga con fuga, cilindro 4');
      paso(`Dos órdenes, ${a} y ${b}, piden la única válvula disponible`, 'Las dos reservas se solicitan en el mismo instante.');
      await Promise.all([gw.reservar(ALM, a), gw.reservar(ALM, b)]);
      await drenar();
      const [oa, ob] = await Promise.all([gw.orden(ALM, a), gw.orden(ALM, b)]);
      paso(`${a}: "${oa.estado}"; ${b}: "${ob.estado}"`, 'Una sola reserva confirmada. La otra recibió STOCK_INSUFICIENTE.', [oa.estado, ob.estado].sort().join() === 'En espera de repuestos,Materiales reservados' ? 'ok' : 'error');
      const sols = (await gw.solicitudes(COM)).filter((s) => s.material === 'VAL-COM-0042');
      paso(`Solicitudes de la válvula: ${sols.map((s) => `${s.numero} (${s.estado})`).join(', ')}`, 'La falta de stock no creó otra compra: ya existía SOL-2026-0040 con OC en el ERP.', 'ok');
    },
  },
  {
    id: 'recepcion',
    pregunta: '¿Cómo se actualizan los datos cuando llega la compra?',
    concepto: 'Webhook de recepción, recepción parcial, CPP recalculado por el ERP y reserva reintentada automáticamente.',
    async ejecutar({ gw, paso, drenar }) {
      const sol = (await gw.solicitudes(COM)).find((s) => ['OC creada', 'Recibida parcial'].includes(s.estado));
      if (!sol) {
        paso('No hay órdenes de compra por recibir', 'Apruebe una solicitud en Compras para que el ERP cree la OC.', 'error');
        return;
      }
      const antes = await gw.disponibilidad(ALM, sol.material);
      paso(`Llega mercadería de la OC ${sol.numero_oc} (${sol.material})`, `Saldo por recibir: ${sol.cantidad - sol.cantidad_recibida}. CPP antes: ${bs(antes.cpp)}.`);
      await gw.simulador.recibir({ orden_compra: sol.numero_oc, material: sol.material, almacen: sol.almacen, cantidad_recibida: 1, cantidad_aceptada: 1, lote: `L-${Date.now().toString().slice(-5)}` });
      const s2 = await gw.solicitud(COM, sol.numero);
      paso(`El WMS acepta 1 unidad y avisa por webhook: ${s2.numero} queda "${s2.estado}"`, `Recibido ${s2.cantidad_recibida} de ${s2.cantidad}. El evento trae su propio id: si llega dos veces, se registra una vez.`, 'ok');
      const k = await gw.kardex(COM, sol.material);
      const ing = k.filter((x) => x.tipo === 'Ingreso').at(-1);
      paso(`El ERP recalcula el CPP: ${bs(ing?.cpp)}`, ing ? `(valor anterior + 1 × ${bs(ing.costo_unitario)}) ÷ ${ing.existencias} unidades. La solución no calcula ni guarda el costo: lo consulta.` : '');
      await drenar();
      const esperando = (await gw.ordenes(SUP)).filter((o) => o.detalles.some((d) => d.material === sol.material));
      const reservadas = esperando.filter((o) => o.estado === 'Materiales reservados');
      paso('Órdenes que esperaban este material', esperando.length ? esperando.map((o) => `${o.numero}: ${o.estado}`).join('; ') : 'Ninguna', reservadas.length ? 'ok' : '');
    },
  },
  {
    id: 'permiso',
    pregunta: '¿Cada usuario solo puede hacer lo que le corresponde?',
    concepto: 'Autorización por rol en el servicio: la misma regla aplica a la pantalla y a una llamada directa a la API.',
    async ejecutar({ gw, paso }) {
      const o = await gw.crearOrden(TEC, { equipo: 'BOM-GOU-007', tipo: 'preventivo', prioridad: 'media', diagnostico: 'Inspección de sello mecánico', fecha_requerida: manana(), materiales: [{ material: 'SEL-MEC-0011', cantidad: 1 }] });
      paso(`El técnico registra ${o.numero}`, 'Permiso orden.crear: técnico o supervisor.', 'ok');
      const antes = (await gw.bitacora('ctl.quiroga')).length;
      const e = await esperaRechazo(gw.validar(TEC, o.numero));
      paso(`El técnico intenta validarla: ${e?.codigo ?? 'permitido'}`, e?.message ?? '', e ? 'ok' : 'error');
      const e2 = await esperaRechazo(gw.crearMaterial(TEC, {}));
      paso(`El técnico intenta crear un material: ${e2?.codigo ?? 'permitido'}`, e2?.message ?? '', e2 ? 'ok' : 'error');
      const despues = (await gw.bitacora('ctl.quiroga')).length;
      paso('La bitácora no cambió con los intentos rechazados', `${antes} registros antes y ${despues} después.`, antes === despues ? 'ok' : 'error');
      const v = await gw.validar(SUP, o.numero);
      paso(`La supervisora valida: "${v.estado}"`, 'Queda en la bitácora con usuario, rol, fecha, estado anterior y nuevo.', 'ok');
    },
  },
  {
    id: 'idempotencia',
    pregunta: '¿Qué significa idempotencia en la práctica?',
    concepto: 'El mismo mensaje enviado varias veces produce un solo efecto, porque viaja con el mismo id.',
    async ejecutar({ gw, paso, drenar }) {
      const n = await ordenValidada(gw, 'BOM-GOU-007', [{ material: 'ROD-BOM-0017', cantidad: 2 }], 'Vibración en rodamiento lado acople');
      await gw.reservar(ALM, n);
      await drenar();
      const op = (await gw.operaciones(ADM, { orden: n })).find((x) => x.tipo === 'RESERVA');
      const a = await gw.disponibilidad(ALM, 'ROD-BOM-0017', 'ALM-CBB');
      paso(`Reserva confirmada con id ${op.id.slice(0, 8)}…`, `Reservado en el WMS: ${a.reservado}.`);
      const r1 = await gw.simulador.reenviar(op.id);
      const r2 = await gw.simulador.reenviar(op.id);
      const b = await gw.disponibilidad(ALM, 'ROD-BOM-0017', 'ALM-CBB');
      paso('Se envía dos veces más el mismo mensaje al WMS', `Respuestas: ${r1.ref_reserva} y ${r2.ref_reserva}, la misma reserva. Reservado: ${b.reservado}.`, a.reservado === b.reservado ? 'ok' : 'error');
    },
  },
  {
    id: 'conciliacion',
    pregunta: '¿Cómo detectan diferencias entre el WMS y el ERP?',
    concepto: 'Conciliación nocturna: compara existencias, registra la diferencia y abre una incidencia.',
    async ejecutar({ gw, paso }) {
      await gw.simulador.ajuste({ material: 'ROD-BOM-0017', almacen: 'ALM-CBB', cantidad: -1 });
      paso('Alguien ajusta −1 rodamiento directamente en el WMS sin informar al ERP', 'Es el caso que los controles técnicos no pueden impedir: un movimiento fuera del proceso.');
      const r = await gw.conciliar(ADM);
      const dif = r.filter((x) => x.diferencia !== 0);
      paso(`Conciliación: ${dif.length} diferencia(s)`, dif.map((x) => `${x.material}: WMS ${x.valor_wms}, ERP ${x.valor_erp}`).join('; '), dif.length ? 'ok' : 'error');
      paso('Se abre la incidencia DIFERENCIA_CONCILIACION para Almacén', 'Queda registrada para su revisión y resolución.');
    },
  },
];
