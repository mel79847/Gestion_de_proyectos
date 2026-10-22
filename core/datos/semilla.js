/**
 * Datos de ejemplo de la demostración. Es la única fuente de la semilla: con ella se
 * cargan los repositorios en memoria, los simuladores del WMS y del ERP y el archivo
 * db/seed.sql (generado por scripts/generar-seed.js). Los nombres de proveedores y
 * personas son ficticios.
 */

export const almacenes = [
  { codigo: 'ALM-SCZ', nombre: 'Almacén Santa Cruz, base de mantenimiento de flota', ciudad: 'Santa Cruz' },
  { codigo: 'ALM-CBB', nombre: 'Almacén Cochabamba, estación de compresión', ciudad: 'Cochabamba' },
];

export const equipos = [
  { codigo: 'CAM-VOL-014', descripcion: 'Camión Volvo FH 460, placa 4123-KTR', tipo: 'camion', almacen: 'ALM-SCZ' },
  { codigo: 'CAM-MER-022', descripcion: 'Camión Mercedes-Benz Actros 2646, placa 3871-PLN', tipo: 'camion', almacen: 'ALM-SCZ' },
  { codigo: 'CMP-ARI-003', descripcion: 'Compresor reciprocante Ariel JGK/4', tipo: 'compresor', almacen: 'ALM-CBB' },
  { codigo: 'BOM-GOU-007', descripcion: 'Bomba centrífuga Goulds 3196', tipo: 'bomba', almacen: 'ALM-CBB' },
];

const m = (codigo, descripcion, unidad, criticidad, p) => ({
  codigo,
  descripcion,
  unidad,
  criticidad,
  perecible: false,
  serializado: false,
  metodo_reposicion: 'HASTA_MAXIMO',
  costo_pedido: 0,
  costo_mantener: 0,
  activo: true,
  ...p,
});

export const materiales = [
  m('FIL-ACE-0021', 'Filtro de aceite motor Volvo D13', 'und', 'alta', { demanda_diaria: 2, sigma_diaria: 1, plazo_dias: 10, stock_maximo: 140, metodo_reposicion: 'EOQ', costo_pedido: 150, costo_mantener: 20 }),
  m('FIL-ACE-0034', 'Filtro de aceite motor Mercedes-Benz OM 471', 'und', 'alta', { demanda_diaria: 1, sigma_diaria: 0.7, plazo_dias: 10, stock_maximo: 90, metodo_reposicion: 'EOQ', costo_pedido: 150, costo_mantener: 20 }),
  m('FIL-AIR-0008', 'Filtro de aire primario Volvo FH', 'und', 'media', { demanda_diaria: 0.5, sigma_diaria: 0.5, plazo_dias: 15, stock_maximo: 30 }),
  m('ACE-MOT-0003', 'Aceite de motor SAE 15W-40, balde de 20 L', 'bal', 'alta', { perecible: true, demanda_diaria: 1, sigma_diaria: 0.8, plazo_dias: 7, stock_maximo: 40, metodo_reposicion: 'EOQ', costo_pedido: 120, costo_mantener: 60 }),
  m('EMP-CUL-0115', 'Juego de empaquetaduras de culata Volvo D13', 'jgo', 'critica', { demanda_diaria: 0.03, sigma_diaria: 0.15, plazo_dias: 30, stock_maximo: 5 }),
  m('VAL-COM-0042', 'Válvula de descarga compresor Ariel JGK/4', 'und', 'critica', { serializado: true, demanda_diaria: 0.05, sigma_diaria: 0.2, plazo_dias: 45, stock_maximo: 6 }),
  m('SEL-MEC-0011', 'Sello mecánico bomba Goulds 3196', 'und', 'alta', { serializado: true, demanda_diaria: 0.04, sigma_diaria: 0.3, plazo_dias: 30, stock_maximo: 8 }),
  m('ROD-BOM-0017', 'Rodamiento 6309-2RS bomba Goulds 3196', 'und', 'media', { demanda_diaria: 0.1, sigma_diaria: 0.2, plazo_dias: 20, stock_maximo: 10 }),
];

export const compatibilidad = [
  ['FIL-ACE-0021', 'CAM-VOL-014'],
  ['FIL-AIR-0008', 'CAM-VOL-014'],
  ['EMP-CUL-0115', 'CAM-VOL-014'],
  ['ACE-MOT-0003', 'CAM-VOL-014'],
  ['ACE-MOT-0003', 'CAM-MER-022'],
  ['FIL-ACE-0034', 'CAM-MER-022'],
  ['VAL-COM-0042', 'CMP-ARI-003'],
  ['SEL-MEC-0011', 'BOM-GOU-007'],
  ['ROD-BOM-0017', 'BOM-GOU-007'],
].map(([material, equipo]) => ({ material, equipo }));

export const proveedores = [
  { codigo: 'PRV-001', razon_social: 'Repuestos Andinos S.R.L.', nit: '1023456027', plazo_dias: 10, cumplimiento: 92, habilitado: true },
  { codigo: 'PRV-002', razon_social: 'Distribuidora Técnica del Oriente S.A.', nit: '2034567018', plazo_dias: 7, cumplimiento: 85, habilitado: true },
  { codigo: 'PRV-003', razon_social: 'Compresión y Válvulas Bolivia S.R.L.', nit: '3045678014', plazo_dias: 45, cumplimiento: 88, habilitado: true },
  { codigo: 'PRV-004', razon_social: 'Lubricantes Chiquitanos S.R.L.', nit: '4056789011', plazo_dias: 5, cumplimiento: 95, habilitado: true },
];

export const materialProveedor = [
  ['FIL-ACE-0021', 'PRV-001', 92.0, true],
  ['FIL-ACE-0021', 'PRV-002', 89.5, false],
  ['FIL-ACE-0034', 'PRV-001', 98.0, true],
  ['FIL-AIR-0008', 'PRV-001', 150.0, true],
  ['ACE-MOT-0003', 'PRV-004', 405.0, true],
  ['ACE-MOT-0003', 'PRV-002', 418.0, false],
  ['EMP-CUL-0115', 'PRV-001', 1280.0, true],
  ['VAL-COM-0042', 'PRV-003', 6900.0, true],
  ['SEL-MEC-0011', 'PRV-002', 2400.0, true],
  ['ROD-BOM-0017', 'PRV-002', 315.0, true],
].map(([material, proveedor, precio_ref, preferido]) => ({ material, proveedor, precio_ref, preferido }));

export const usuarios = [
  { usuario: 'tec.rojas', nombre: 'Luis Rojas', rol: 'tecnico' },
  { usuario: 'sup.vargas', nombre: 'Carla Vargas', rol: 'supervisor' },
  { usuario: 'alm.mamani', nombre: 'Jorge Mamani', rol: 'almacen' },
  { usuario: 'com.flores', nombre: 'Ana Flores', rol: 'comprador' },
  { usuario: 'ctl.quiroga', nombre: 'Rosa Quiroga', rol: 'control' },
  { usuario: 'adm.sistema', nombre: 'Administrador del sistema', rol: 'administrador' },
  { usuario: 'ger.salazar', nombre: 'Marco Salazar', rol: 'gerencia' },
];
export const CLAVE_DEMO = 'Demo2026!';

/** Existencias físicas en el WMS (dueño del stock). */
export const lotesWms = [
  { material: 'FIL-ACE-0021', almacen: 'ALM-SCZ', ubicacion: 'A-03-2', lote: 'L-FA-2603', fecha_ingreso: '2026-03-10', vence: null, cantidad: 12 },
  { material: 'FIL-ACE-0021', almacen: 'ALM-SCZ', ubicacion: 'A-03-2', lote: 'L-FA-2607', fecha_ingreso: '2026-07-22', vence: null, cantidad: 16 },
  { material: 'FIL-ACE-0034', almacen: 'ALM-SCZ', ubicacion: 'A-03-4', lote: 'L-FM-2606', fecha_ingreso: '2026-06-02', vence: null, cantidad: 22 },
  { material: 'FIL-AIR-0008', almacen: 'ALM-SCZ', ubicacion: 'A-05-1', lote: 'L-AI-2604', fecha_ingreso: '2026-04-18', vence: null, cantidad: 14 },
  { material: 'ACE-MOT-0003', almacen: 'ALM-SCZ', ubicacion: 'L-01-1', lote: 'L-2312', fecha_ingreso: '2025-12-05', vence: '2026-10-01', cantidad: 2 },
  { material: 'ACE-MOT-0003', almacen: 'ALM-SCZ', ubicacion: 'L-01-2', lote: 'L-2401', fecha_ingreso: '2026-01-20', vence: '2026-12-15', cantidad: 8 },
  { material: 'ACE-MOT-0003', almacen: 'ALM-SCZ', ubicacion: 'L-01-3', lote: 'L-2405', fecha_ingreso: '2026-05-14', vence: '2027-06-30', cantidad: 10 },
  { material: 'EMP-CUL-0115', almacen: 'ALM-SCZ', ubicacion: 'B-01-1', lote: 'L-EC-2602', fecha_ingreso: '2026-02-11', vence: null, cantidad: 4 },
  { material: 'VAL-COM-0042', almacen: 'ALM-CBB', ubicacion: 'C-02-1', lote: 'L-VD-2511', serie: 'AR-VD-77812', fecha_ingreso: '2025-11-03', vence: null, cantidad: 1 },
  ...['0451', '0452', '0453', '0454', '0455', '0456'].map((s, i) => ({
    material: 'SEL-MEC-0011', almacen: 'ALM-CBB', ubicacion: 'C-04-1', lote: 'L-SM-2605', serie: `GS-3196-${s}`, fecha_ingreso: `2026-05-0${i + 1}`, vence: null, cantidad: 1,
  })),
  { material: 'SEL-MEC-0011', almacen: 'ALM-CBB', ubicacion: 'Q-00-1', lote: 'L-SM-2605', serie: 'GS-3196-0457', fecha_ingreso: '2026-05-07', vence: null, cantidad: 1, bloqueado: true, motivo_bloqueo: 'Cuarentena por inspección' },
  { material: 'ROD-BOM-0017', almacen: 'ALM-CBB', ubicacion: 'C-05-3', lote: 'L-RB-2608', fecha_ingreso: '2026-08-09', vence: null, cantidad: 6 },
];

/** Valoración en el ERP (dueño del CPP); coincide con el físico del WMS al inicio. */
export const valoracionErp = [
  ['FIL-ACE-0021', 28, 88.5],
  ['FIL-ACE-0034', 22, 96.0],
  ['FIL-AIR-0008', 14, 145.0],
  ['ACE-MOT-0003', 20, 412.0],
  ['EMP-CUL-0115', 4, 1250.0],
  ['VAL-COM-0042', 1, 6850.0],
  ['SEL-MEC-0011', 7, 2350.0],
  ['ROD-BOM-0017', 6, 310.0],
].map(([material, existencias, cpp]) => ({ material, existencias, cpp, valor: Math.round(existencias * cpp * 100) / 100 }));

/** Compra ya en curso: evita que el ROP duplique la solicitud de la válvula. */
export const solicitudes = [
  {
    numero: 'SOL-2026-0040', material: 'VAL-COM-0042', almacen: 'ALM-CBB', cantidad: 2, metodo: 'HASTA_MAXIMO',
    detalle_calculo: 'Máximo 6 − posición 1 = 5; aprobado 2 por presupuesto', origen: 'ROP', orden_origen: null,
    proveedor: 'PRV-003', precio_ref: 6900, estado: 'OC creada', numero_oc: '4500012871', fecha_prometida: '2026-11-04',
    cantidad_recibida: 0, creada_por: 'com.flores', creada_en: '2026-09-20T14:10:00.000Z',
  },
];

export const ordenCompraErp = [
  { numero_oc: '4500012871', solicitud: 'SOL-2026-0040', material: 'VAL-COM-0042', almacen: 'ALM-CBB', proveedor: 'PRV-003', cantidad: 2, recibido: 0, precio_unitario: 6900, fecha_prometida: '2026-11-04', estado: 'Abierta' },
];

/** Última orden cerrada: la numeración continúa en OM-2026-0153. */
export const ordenes = [
  {
    numero: 'OM-2026-0152', equipo: 'CAM-MER-022', tipo: 'preventivo', prioridad: 'normal', diagnostico: 'Mantenimiento de 60 000 km',
    fecha_requerida: '2026-10-14', almacen: 'ALM-SCZ', estado: 'Cerrada', tecnico: 'tec.rojas', supervisor: 'sup.vargas',
    creada_en: '2026-10-12T13:00:00.000Z', validada_en: '2026-10-12T13:20:00.000Z', cerrada_en: '2026-10-14T21:40:00.000Z',
    detalles: [{ material: 'FIL-ACE-0034', cantidad: 1, cantidad_reservada: 1, cantidad_entregada: 1 }],
  },
];
