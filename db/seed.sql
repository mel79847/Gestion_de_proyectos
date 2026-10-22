-- Generado por scripts/generar-seed.js. No editar a mano.
BEGIN;
SET search_path TO mro;
INSERT INTO rol (codigo, nombre) VALUES
  ('tecnico', 'Técnico de mantenimiento'),
  ('supervisor', 'Supervisor de mantenimiento'),
  ('almacen', 'Personal de almacén'),
  ('comprador', 'Comprador'),
  ('control', 'Control interno'),
  ('administrador', 'Administrador'),
  ('gerencia', 'Gerencia'),
  ('sistema', 'Proceso automático');

INSERT INTO permiso (rol, permiso) VALUES
  ('tecnico', 'maestro.leer'),
  ('supervisor', 'maestro.leer'),
  ('almacen', 'maestro.leer'),
  ('comprador', 'maestro.leer'),
  ('control', 'maestro.leer'),
  ('administrador', 'maestro.leer'),
  ('gerencia', 'maestro.leer'),
  ('administrador', 'maestro.crear'),
  ('administrador', 'maestro.parametros'),
  ('comprador', 'maestro.parametros'),
  ('tecnico', 'orden.leer'),
  ('supervisor', 'orden.leer'),
  ('almacen', 'orden.leer'),
  ('comprador', 'orden.leer'),
  ('control', 'orden.leer'),
  ('administrador', 'orden.leer'),
  ('gerencia', 'orden.leer'),
  ('tecnico', 'orden.crear'),
  ('supervisor', 'orden.crear'),
  ('supervisor', 'orden.validar'),
  ('tecnico', 'orden.completar'),
  ('supervisor', 'orden.completar'),
  ('supervisor', 'orden.cerrar'),
  ('supervisor', 'orden.anular'),
  ('tecnico', 'inventario.consultar'),
  ('supervisor', 'inventario.consultar'),
  ('almacen', 'inventario.consultar'),
  ('comprador', 'inventario.consultar'),
  ('control', 'inventario.consultar'),
  ('administrador', 'inventario.consultar'),
  ('gerencia', 'inventario.consultar'),
  ('almacen', 'reserva.solicitar'),
  ('supervisor', 'reserva.solicitar'),
  ('almacen', 'reserva.liberar'),
  ('supervisor', 'reserva.liberar'),
  ('almacen', 'entrega.registrar'),
  ('tecnico', 'cambio.registrar'),
  ('tecnico', 'compra.leer'),
  ('supervisor', 'compra.leer'),
  ('almacen', 'compra.leer'),
  ('comprador', 'compra.leer'),
  ('control', 'compra.leer'),
  ('administrador', 'compra.leer'),
  ('gerencia', 'compra.leer'),
  ('comprador', 'compra.cotizar'),
  ('comprador', 'compra.aprobar'),
  ('comprador', 'compra.evaluar'),
  ('almacen', 'compra.evaluar'),
  ('administrador', 'compra.evaluar'),
  ('tecnico', 'integracion.leer'),
  ('supervisor', 'integracion.leer'),
  ('almacen', 'integracion.leer'),
  ('comprador', 'integracion.leer'),
  ('control', 'integracion.leer'),
  ('administrador', 'integracion.leer'),
  ('gerencia', 'integracion.leer'),
  ('administrador', 'integracion.reprocesar'),
  ('administrador', 'integracion.conciliar'),
  ('control', 'integracion.conciliar'),
  ('administrador', 'incidencia.resolver'),
  ('almacen', 'incidencia.resolver'),
  ('comprador', 'incidencia.resolver'),
  ('control', 'bitacora.leer'),
  ('administrador', 'bitacora.leer'),
  ('gerencia', 'bitacora.leer'),
  ('supervisor', 'bitacora.leer');

INSERT INTO usuario (usuario, nombre, rol, clave_hash) VALUES
  ('tec.rojas', 'Luis Rojas', 'tecnico', 'scrypt$4bcafeee98b52ade69a54fd86c93b3c8$4c94e896e2e5ae02485d85ff3d5d33889dfaf7978bb77c7f57d13be36b932175'),
  ('sup.vargas', 'Carla Vargas', 'supervisor', 'scrypt$43a3a42b61e23d1bcd71059442d51b81$22da84e9342bf2454db4cd48d7b2dc3ec9a8c7d2917b273232ec4689799856fd'),
  ('alm.mamani', 'Jorge Mamani', 'almacen', 'scrypt$b7334e4abd3d969c407f63d79e3f220b$8a701fda9fdaa13166e2846ba144fec867108322592e7b770ffe58a77ba5725a'),
  ('com.flores', 'Ana Flores', 'comprador', 'scrypt$6bcdf1217b4ee38cd7f2d2eb72d746f5$21e3a1aa90e0a7d93bc5d4f9b68be00d4df7e09d95b4f6b19cd437ffa17e7075'),
  ('ctl.quiroga', 'Rosa Quiroga', 'control', 'scrypt$f594262d0204a596d64b4018dbe9d115$d8ae513c24a10a227e0611cac2276e1aa7db1951fc08b89e8743b04f070a754e'),
  ('adm.sistema', 'Administrador del sistema', 'administrador', 'scrypt$b1ba329c82659aa704e71f7678e78745$4aa88bdabebdcb6f105b97cd6e2aaca5b5c24ea163bcff0c2318d3b389200d2f'),
  ('ger.salazar', 'Marco Salazar', 'gerencia', 'scrypt$5bd152b0d073e07669c6def8d5f6fbbf$827414f32f37682d0d2ef99a69c99a5a3064a5c0827e285127424588a70cabb4');

INSERT INTO almacen (codigo, nombre, ciudad) VALUES
  ('ALM-SCZ', 'Almacén Santa Cruz, base de mantenimiento de flota', 'Santa Cruz'),
  ('ALM-CBB', 'Almacén Cochabamba, estación de compresión', 'Cochabamba');

INSERT INTO ubicacion (almacen, codigo) VALUES
  ('ALM-SCZ', 'A-03-2'),
  ('ALM-SCZ', 'A-03-4'),
  ('ALM-SCZ', 'A-05-1'),
  ('ALM-SCZ', 'L-01-1'),
  ('ALM-SCZ', 'L-01-2'),
  ('ALM-SCZ', 'L-01-3'),
  ('ALM-SCZ', 'B-01-1'),
  ('ALM-CBB', 'C-02-1'),
  ('ALM-CBB', 'C-04-1'),
  ('ALM-CBB', 'Q-00-1'),
  ('ALM-CBB', 'C-05-3');

INSERT INTO material (codigo, descripcion, descripcion_normalizada, unidad, criticidad, perecible, serializado, demanda_diaria, sigma_diaria, plazo_dias, stock_maximo, metodo_reposicion, costo_pedido, costo_mantener, activo) VALUES
  ('FIL-ACE-0021', 'Filtro de aceite motor Volvo D13', 'aceite d13 filtro motor volvo', 'und', 'alta', false, false, 2, 1, 10, 140, 'EOQ', 150, 20, true),
  ('FIL-ACE-0034', 'Filtro de aceite motor Mercedes-Benz OM 471', '471 aceite benz filtro mercedes motor om', 'und', 'alta', false, false, 1, 0.7, 10, 90, 'EOQ', 150, 20, true),
  ('FIL-AIR-0008', 'Filtro de aire primario Volvo FH', 'aire fh filtro primario volvo', 'und', 'media', false, false, 0.5, 0.5, 15, 30, 'HASTA_MAXIMO', 0, 0, true),
  ('ACE-MOT-0003', 'Aceite de motor SAE 15W-40, balde de 20 L', '15w 20 40 aceite balde l motor sae', 'bal', 'alta', true, false, 1, 0.8, 7, 40, 'EOQ', 120, 60, true),
  ('EMP-CUL-0115', 'Juego de empaquetaduras de culata Volvo D13', 'culata d13 empaque juego volvo', 'jgo', 'critica', false, false, 0.03, 0.15, 30, 5, 'HASTA_MAXIMO', 0, 0, true),
  ('VAL-COM-0042', 'Válvula de descarga compresor Ariel JGK/4', '4 ariel compresor descarga jgk valvula', 'und', 'critica', false, true, 0.05, 0.2, 45, 6, 'HASTA_MAXIMO', 0, 0, true),
  ('SEL-MEC-0011', 'Sello mecánico bomba Goulds 3196', '3196 bomba goulds mecanico sello', 'und', 'alta', false, true, 0.04, 0.3, 30, 8, 'HASTA_MAXIMO', 0, 0, true),
  ('ROD-BOM-0017', 'Rodamiento 6309-2RS bomba Goulds 3196', '2rs 3196 6309 bomba goulds rodamiento', 'und', 'media', false, false, 0.1, 0.2, 20, 10, 'HASTA_MAXIMO', 0, 0, true);

INSERT INTO equipo (codigo, descripcion, tipo, almacen) VALUES
  ('CAM-VOL-014', 'Camión Volvo FH 460, placa 4123-KTR', 'camion', 'ALM-SCZ'),
  ('CAM-MER-022', 'Camión Mercedes-Benz Actros 2646, placa 3871-PLN', 'camion', 'ALM-SCZ'),
  ('CMP-ARI-003', 'Compresor reciprocante Ariel JGK/4', 'compresor', 'ALM-CBB'),
  ('BOM-GOU-007', 'Bomba centrífuga Goulds 3196', 'bomba', 'ALM-CBB');

INSERT INTO compatibilidad (material, equipo) VALUES
  ('FIL-ACE-0021', 'CAM-VOL-014'),
  ('FIL-AIR-0008', 'CAM-VOL-014'),
  ('EMP-CUL-0115', 'CAM-VOL-014'),
  ('ACE-MOT-0003', 'CAM-VOL-014'),
  ('ACE-MOT-0003', 'CAM-MER-022'),
  ('FIL-ACE-0034', 'CAM-MER-022'),
  ('VAL-COM-0042', 'CMP-ARI-003'),
  ('SEL-MEC-0011', 'BOM-GOU-007'),
  ('ROD-BOM-0017', 'BOM-GOU-007');

INSERT INTO proveedor (codigo, razon_social, nit, plazo_dias, cumplimiento, habilitado) VALUES
  ('PRV-001', 'Repuestos Andinos S.R.L.', '1023456027', 10, 92, true),
  ('PRV-002', 'Distribuidora Técnica del Oriente S.A.', '2034567018', 7, 85, true),
  ('PRV-003', 'Compresión y Válvulas Bolivia S.R.L.', '3045678014', 45, 88, true),
  ('PRV-004', 'Lubricantes Chiquitanos S.R.L.', '4056789011', 5, 95, true);

INSERT INTO material_proveedor (material, proveedor, precio_ref, preferido) VALUES
  ('FIL-ACE-0021', 'PRV-001', 92, true),
  ('FIL-ACE-0021', 'PRV-002', 89.5, false),
  ('FIL-ACE-0034', 'PRV-001', 98, true),
  ('FIL-AIR-0008', 'PRV-001', 150, true),
  ('ACE-MOT-0003', 'PRV-004', 405, true),
  ('ACE-MOT-0003', 'PRV-002', 418, false),
  ('EMP-CUL-0115', 'PRV-001', 1280, true),
  ('VAL-COM-0042', 'PRV-003', 6900, true),
  ('SEL-MEC-0011', 'PRV-002', 2400, true),
  ('ROD-BOM-0017', 'PRV-002', 315, true);

INSERT INTO orden_mantenimiento (numero, equipo, tipo, prioridad, diagnostico, fecha_requerida, almacen, estado, tecnico, supervisor, creada_en, validada_en, cerrada_en) VALUES
  ('OM-2026-0152', 'CAM-MER-022', 'preventivo', 'normal', 'Mantenimiento de 60 000 km', '2026-10-14', 'ALM-SCZ', 'Cerrada', 'tec.rojas', 'sup.vargas', '2026-10-12T13:00:00.000Z', '2026-10-12T13:20:00.000Z', '2026-10-14T21:40:00.000Z');

INSERT INTO detalle_material (orden, material, cantidad, cantidad_reservada, cantidad_entregada) VALUES
  ('OM-2026-0152', 'FIL-ACE-0034', 1, 1, 1);

INSERT INTO solicitud_compra (numero, material, almacen, cantidad, metodo, detalle_calculo, origen, orden_origen, proveedor, precio_ref, estado, numero_oc, fecha_prometida, cantidad_recibida, creada_por, creada_en) VALUES
  ('SOL-2026-0040', 'VAL-COM-0042', 'ALM-CBB', 2, 'HASTA_MAXIMO', 'Máximo 6 − posición 1 = 5; aprobado 2 por presupuesto', 'ROP', NULL, 'PRV-003', 6900, 'OC creada', '4500012871', '2026-11-04', 0, 'com.flores', '2026-09-20T14:10:00.000Z');

COMMIT;
