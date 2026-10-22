-- =====================================================================
-- Sistema de trazabilidad de inventario MRO · YPFB Transporte S.A.
-- Esquema PostgreSQL 16 (23 tablas). La solución guarda sus propios objetos
-- y referencias a los objetos oficiales: no guarda saldos de stock (WMS)
-- ni órdenes de compra formales (ERP).
-- =====================================================================
BEGIN;

DROP SCHEMA IF EXISTS mro CASCADE;
CREATE SCHEMA mro;
SET search_path TO mro;

-- ---------- Seguridad ----------
CREATE TABLE rol (
  codigo   text PRIMARY KEY,
  nombre   text NOT NULL
);

CREATE TABLE permiso (
  rol      text NOT NULL REFERENCES rol(codigo),
  permiso  text NOT NULL,
  PRIMARY KEY (rol, permiso)
);

CREATE TABLE usuario (
  usuario     text PRIMARY KEY,
  nombre      text NOT NULL,
  rol         text NOT NULL REFERENCES rol(codigo),
  clave_hash  text NOT NULL,
  activo      boolean NOT NULL DEFAULT true
);

-- ---------- Datos maestros (MDM) ----------
CREATE TABLE almacen (
  codigo  text PRIMARY KEY CHECK (codigo ~ '^ALM-[A-Z]{3}$'),
  nombre  text NOT NULL,
  ciudad  text NOT NULL
);

CREATE TABLE ubicacion (
  id       serial PRIMARY KEY,
  almacen  text NOT NULL REFERENCES almacen(codigo),
  codigo   text NOT NULL,
  UNIQUE (almacen, codigo)
);

CREATE TABLE material (
  codigo                  text PRIMARY KEY CHECK (codigo ~ '^[A-Z]{3}-[A-Z]{3}-[0-9]{4}$'),
  descripcion             text NOT NULL,
  descripcion_normalizada text NOT NULL UNIQUE,          -- impide el mismo artículo con dos códigos
  unidad                  text NOT NULL CHECK (unidad IN ('und','jgo','bal','lt','kg','m')),
  criticidad              text NOT NULL CHECK (criticidad IN ('critica','alta','media','normal')),
  perecible               boolean NOT NULL DEFAULT false,
  serializado             boolean NOT NULL DEFAULT false,
  demanda_diaria          numeric(10,3) NOT NULL CHECK (demanda_diaria >= 0),
  sigma_diaria            numeric(10,3) NOT NULL CHECK (sigma_diaria >= 0),
  plazo_dias              integer NOT NULL CHECK (plazo_dias > 0),
  stock_maximo            integer NOT NULL CHECK (stock_maximo >= 0),
  metodo_reposicion       text NOT NULL CHECK (metodo_reposicion IN ('EOQ','HASTA_MAXIMO')),
  costo_pedido            numeric(12,2) NOT NULL DEFAULT 0,
  costo_mantener          numeric(12,2) NOT NULL DEFAULT 0,
  activo                  boolean NOT NULL DEFAULT true
);

CREATE TABLE equipo (
  codigo       text PRIMARY KEY CHECK (codigo ~ '^[A-Z]{3}-[A-Z]{3}-[0-9]{3}$'),
  descripcion  text NOT NULL,
  tipo         text NOT NULL,
  almacen      text NOT NULL REFERENCES almacen(codigo)
);

CREATE TABLE compatibilidad (
  id        serial PRIMARY KEY,
  material  text NOT NULL REFERENCES material(codigo),
  equipo    text NOT NULL REFERENCES equipo(codigo),
  UNIQUE (material, equipo)
);

CREATE TABLE proveedor (
  codigo        text PRIMARY KEY,
  razon_social  text NOT NULL,
  nit           text NOT NULL UNIQUE,
  plazo_dias    integer NOT NULL CHECK (plazo_dias > 0),
  cumplimiento  numeric(5,2) NOT NULL CHECK (cumplimiento BETWEEN 0 AND 100),
  habilitado    boolean NOT NULL DEFAULT true
);

CREATE TABLE material_proveedor (
  id          serial PRIMARY KEY,
  material    text NOT NULL REFERENCES material(codigo),
  proveedor   text NOT NULL REFERENCES proveedor(codigo),
  precio_ref  numeric(12,2) NOT NULL CHECK (precio_ref > 0),
  preferido   boolean NOT NULL DEFAULT false,
  UNIQUE (material, proveedor)
);
CREATE UNIQUE INDEX ux_proveedor_preferido ON material_proveedor(material) WHERE preferido;

-- ---------- Mantenimiento ----------
CREATE TABLE orden_mantenimiento (
  numero           text PRIMARY KEY CHECK (numero ~ '^OM-[0-9]{4}-[0-9]{4}$'),
  equipo           text NOT NULL REFERENCES equipo(codigo),
  tipo             text NOT NULL CHECK (tipo IN ('correctivo','preventivo')),
  prioridad        text NOT NULL CHECK (prioridad IN ('critica','alta','media','normal')),
  diagnostico      text NOT NULL,
  fecha_requerida  date NOT NULL,
  almacen          text NOT NULL REFERENCES almacen(codigo),
  estado           text NOT NULL CHECK (estado IN ('Registrada','Validada','En espera de repuestos','Materiales reservados',
                                                    'En ejecución','Pendiente de verificación','Cerrada','Anulada')),
  tecnico          text NOT NULL REFERENCES usuario(usuario),
  supervisor       text REFERENCES usuario(usuario),
  creada_en        timestamptz NOT NULL DEFAULT now(),
  validada_en      timestamptz,
  cerrada_en       timestamptz
);

CREATE TABLE detalle_material (
  id                  serial PRIMARY KEY,
  orden               text NOT NULL REFERENCES orden_mantenimiento(numero),
  material            text NOT NULL REFERENCES material(codigo),
  cantidad            integer NOT NULL CHECK (cantidad > 0),
  cantidad_reservada  integer NOT NULL DEFAULT 0 CHECK (cantidad_reservada BETWEEN 0 AND cantidad),
  cantidad_entregada  integer NOT NULL DEFAULT 0 CHECK (cantidad_entregada BETWEEN 0 AND cantidad),
  UNIQUE (orden, material)
);

-- ---------- Integración (bandeja de salida y eventos recibidos) ----------
CREATE TABLE operacion_integracion (
  id               uuid PRIMARY KEY,                     -- clave de idempotencia
  tipo             text NOT NULL,
  destino          text NOT NULL CHECK (destino IN ('WMS','ERP','SOLUCION')),
  direccion        text NOT NULL CHECK (direccion IN ('SALIENTE','ENTRANTE')),
  entidad          text NOT NULL,
  entidad_id       text NOT NULL,
  orden            text REFERENCES orden_mantenimiento(numero),
  mensaje          jsonb NOT NULL,
  estado           text NOT NULL CHECK (estado IN ('Pendiente','Enviada','En reintento','Confirmada','Rechazada','Incidencia')),
  intentos         integer NOT NULL DEFAULT 0,
  limite_intentos  integer NOT NULL,
  proximo_intento  timestamptz NOT NULL DEFAULT now(),
  respuesta        jsonb,
  causa            text,
  creada_en        timestamptz NOT NULL DEFAULT now(),
  enviada_en       timestamptz,
  confirmada_en    timestamptz
);
CREATE INDEX ix_operacion_cola ON operacion_integracion(estado, proximo_intento) WHERE direccion = 'SALIENTE';
CREATE INDEX ix_operacion_orden ON operacion_integracion(orden);

-- ---------- Inventario (referencias a objetos del WMS) ----------
CREATE TABLE reserva (
  id                serial PRIMARY KEY,
  orden             text NOT NULL REFERENCES orden_mantenimiento(numero),
  detalle_id        integer NOT NULL REFERENCES detalle_material(id),
  material          text NOT NULL REFERENCES material(codigo),
  almacen           text NOT NULL REFERENCES almacen(codigo),
  cantidad          integer NOT NULL CHECK (cantidad > 0),
  estado            text NOT NULL CHECK (estado IN ('Solicitada','Confirmada','Rechazada','Consumida','Liberada')),
  ref_wms           text UNIQUE,
  id_operacion      uuid REFERENCES operacion_integracion(id),
  operacion_salida  uuid REFERENCES operacion_integracion(id),
  creada_en         timestamptz NOT NULL DEFAULT now()
);
-- Un detalle no puede tener dos reservas activas a la vez.
CREATE UNIQUE INDEX ux_reserva_activa ON reserva(detalle_id) WHERE estado IN ('Solicitada','Confirmada');

CREATE TABLE movimiento (
  id              serial PRIMARY KEY,
  tipo            text NOT NULL CHECK (tipo IN ('SALIDA','LIBERACION','DEVOLUCION')),
  orden           text NOT NULL REFERENCES orden_mantenimiento(numero),
  reserva_id      integer REFERENCES reserva(id),
  material        text NOT NULL REFERENCES material(codigo),
  almacen         text NOT NULL REFERENCES almacen(codigo),
  cantidad        integer NOT NULL,
  lotes           jsonb NOT NULL DEFAULT '[]',
  ref_wms         text UNIQUE,
  receptor        text,
  costo_unitario  numeric(12,2),                         -- CPP consultado al ERP
  costo_total     numeric(14,2),
  fecha           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cambio_pieza (
  id               serial PRIMARY KEY,
  orden            text NOT NULL REFERENCES orden_mantenimiento(numero),
  movimiento_id    integer NOT NULL REFERENCES movimiento(id),   -- exige salida confirmada
  material         text NOT NULL REFERENCES material(codigo),
  serie_instalada  text,
  lote_instalado   text,
  pieza_retirada   text NOT NULL,
  condicion        text NOT NULL CHECK (condicion IN ('desgastada','danada','en_garantia','reutilizable')),
  destino          text NOT NULL CHECK (destino IN ('evaluacion','reparacion','garantia','resguardo','baja')),
  observacion      text,
  tecnico          text NOT NULL REFERENCES usuario(usuario),
  fecha            timestamptz NOT NULL DEFAULT now()
);

-- ---------- Compras ----------
CREATE TABLE solicitud_compra (
  numero             text PRIMARY KEY CHECK (numero ~ '^SOL-[0-9]{4}-[0-9]{4}$'),
  material           text NOT NULL REFERENCES material(codigo),
  almacen            text NOT NULL REFERENCES almacen(codigo),
  cantidad           integer NOT NULL CHECK (cantidad > 0),
  metodo             text NOT NULL CHECK (metodo IN ('EOQ','HASTA_MAXIMO')),
  detalle_calculo    text NOT NULL,
  origen             text NOT NULL CHECK (origen IN ('ROP','FALTA_STOCK')),
  orden_origen       text REFERENCES orden_mantenimiento(numero),
  proveedor          text REFERENCES proveedor(codigo),
  precio_ref         numeric(12,2),
  estado             text NOT NULL CHECK (estado IN ('Borrador','Aprobada','Enviada al ERP','OC creada','Recibida parcial','Recibida','Rechazada','Anulada')),
  numero_oc          text UNIQUE,                        -- referencia a la OC oficial del ERP
  fecha_prometida    date,
  cantidad_recibida  integer NOT NULL DEFAULT 0,
  creada_por         text NOT NULL,
  aprobada_por       text,
  creada_en          timestamptz NOT NULL DEFAULT now()
);
-- Nunca dos compras en curso del mismo material (RF-13).
CREATE UNIQUE INDEX ux_solicitud_abierta ON solicitud_compra(material)
  WHERE estado IN ('Borrador','Aprobada','Enviada al ERP','OC creada','Recibida parcial');

CREATE TABLE cotizacion (
  id              serial PRIMARY KEY,
  solicitud       text NOT NULL REFERENCES solicitud_compra(numero),
  proveedor       text NOT NULL REFERENCES proveedor(codigo),
  precio          numeric(12,2) NOT NULL CHECK (precio > 0),
  plazo_dias      integer NOT NULL CHECK (plazo_dias > 0),
  garantia_meses  integer NOT NULL DEFAULT 0,
  cumplimiento    numeric(5,2) NOT NULL,
  elegida         boolean NOT NULL DEFAULT false,
  UNIQUE (solicitud, proveedor)
);

CREATE TABLE recepcion (
  id                 serial PRIMARY KEY,
  solicitud          text NOT NULL REFERENCES solicitud_compra(numero),
  numero_oc          text NOT NULL,
  material           text NOT NULL REFERENCES material(codigo),
  cantidad_recibida  integer NOT NULL CHECK (cantidad_recibida >= 0),
  cantidad_aceptada  integer NOT NULL CHECK (cantidad_aceptada BETWEEN 0 AND cantidad_recibida),
  lote               text,
  vence              date,
  ref_wms            text,
  fecha              timestamptz NOT NULL DEFAULT now()
);

-- ---------- Alertas, incidencias, auditoría y conciliación ----------
CREATE TABLE incidencia (
  id               serial PRIMARY KEY,
  codigo           text NOT NULL CHECK (codigo IN ('WMS_SIN_RESPUESTA','ERP_SIN_RESPUESTA','STOCK_INSUFICIENTE','DATOS_INVALIDOS',
                                                   'CONFIRMACION_PERDIDA','TRANSFERENCIA_VENCIDA','PROVEEDOR_RETRASADO',
                                                   'RECEPCION_PARCIAL','DIFERENCIA_CONCILIACION')),
  operacion_id     uuid REFERENCES operacion_integracion(id),
  entidad          text NOT NULL,
  entidad_id       text NOT NULL,
  causa            text NOT NULL,
  responsable_rol  text NOT NULL REFERENCES rol(codigo),
  estado           text NOT NULL CHECK (estado IN ('Abierta','Resuelta')),
  creada_en        timestamptz NOT NULL DEFAULT now(),
  resuelta_en      timestamptz,
  resolucion       text
);

CREATE TABLE alerta (
  id               serial PRIMARY KEY,
  tipo             text NOT NULL,
  prioridad        text NOT NULL CHECK (prioridad IN ('alta','media','baja')),
  destinatario_rol text NOT NULL REFERENCES rol(codigo),
  entidad          text NOT NULL,
  entidad_id       text NOT NULL,
  mensaje          text NOT NULL,
  estado           text NOT NULL CHECK (estado IN ('Abierta','Atendida')),
  creada_en        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bitacora (
  id          bigserial PRIMARY KEY,
  fecha       timestamptz NOT NULL DEFAULT now(),
  usuario     text NOT NULL,
  rol         text NOT NULL,
  accion      text NOT NULL,
  entidad     text NOT NULL,
  entidad_id  text NOT NULL,
  antes       jsonb,
  despues     jsonb,
  motivo      text
);
CREATE INDEX ix_bitacora_entidad ON bitacora(entidad, entidad_id);

-- La bitácora es inalterable (RF-19): ni UPDATE ni DELETE, ni siquiera por la aplicación.
CREATE FUNCTION bitacora_inalterable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La bitácora es de solo inserción' USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER tg_bitacora_inalterable BEFORE UPDATE OR DELETE OR TRUNCATE ON bitacora
  FOR EACH STATEMENT EXECUTE FUNCTION bitacora_inalterable();

CREATE TABLE conciliacion (
  id           serial PRIMARY KEY,
  fecha_corte  timestamptz NOT NULL,
  material     text NOT NULL REFERENCES material(codigo),
  almacen      text REFERENCES almacen(codigo),
  valor_wms    integer NOT NULL,
  valor_erp    integer NOT NULL,
  diferencia   integer NOT NULL,
  estado       text NOT NULL
);

COMMIT;
