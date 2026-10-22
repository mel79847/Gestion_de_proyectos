# Trazabilidad de inventario MRO · YPFB Transporte S.A.

Prototipo funcional del sistema que integra **Mantenimiento**, **Inventario (WMS)** y **Compras (ERP)**
para repuestos e insumos MRO de YPFB Transporte S.A.

La sección **Validación técnica** permite ejecutar los principales casos del sistema: flujo completo,
control de duplicados, falta de stock, compra no duplicada, caída del WMS, confirmación perdida,
concurrencia, recepción, permisos, idempotencia y conciliación.

## Arquitectura

| Capa | Pieza | Tecnología | Carpeta |
|---|---|---|---|
| Presentación | Aplicación web por rol | React 18 | `web/src` |
| Lógica | API de negocio (monolito modular) | Node.js 22 + Express 4 | `api/src` |
| Lógica | Trabajador de integración (bandeja de salida, reintentos, respaldo) | Node.js | `worker` |
| Lógica | Núcleo de reglas (servicios, cálculos, estados, MDM, permisos) | JavaScript puro | `core` |
| Datos | Base de datos propia, 23 tablas; bandeja de salida (outbox) | PostgreSQL 16 | `db` |
| Datos | Cola de operaciones pendientes, reintentos con TTL y cola de fallidas | RabbitMQ 3.12 | `api/src/adaptadores/cola-rabbitmq.js` |
| Externo | Simuladores del WMS y del ERP con el mismo contrato REST | Express | `mocks` |

El núcleo (`core/`) no depende de Express, SQL ni HTTP: recibe repositorios y clientes como puertos.
La API lo ejecuta con PostgreSQL (`api/src/adaptadores/db-pg.js`) y conectores HTTP
(`api/src/adaptadores/clientes-http.js`); la demostración web lo ejecuta en el navegador con
repositorios en memoria y simuladores. Las reglas son las mismas en ambos casos.

### Un dato, un dueño
- **WMS**: stock físico, reservas, lotes, ubicaciones, movimientos. La solución lo consulta, no lo copia.
- **ERP**: orden de compra, pagos, CPP, kardex valorizado. La solución guarda solo el número de OC.
- **Solución**: órdenes, detalle, reservas (referencia), cambio de pieza, solicitudes, cotizaciones,
  recepciones, operaciones de integración, incidencias, alertas, bitácora, conciliación.
- **Maestro**: un código por material (`FIL-ACE-0021`), asignado por el sistema; la descripción
  normalizada es `UNIQUE` en la base de datos.

### Controles de integración
- Bandeja de salida (outbox) en la misma transacción que el cambio de negocio; tras el COMMIT
  se publica el id en RabbitMQ (`mro.operaciones`). Reintentos en `mro.operaciones.reintento`
  (TTL por mensaje) y agotadas en `mro.operaciones.fallidas`. Un barrido periódico de la bandeja
  recupera cualquier aviso que no haya llegado al broker.
- `id_operacion` (UUID) como `Idempotency-Key`; el reenvío usa el mismo id.
- Antes de reenviar se consulta `GET /wms/operaciones/:id` (confirmación perdida).
- Reintentos con espera 2ⁿ × base; al agotar el límite, incidencia con causa y alerta.
- `FOR UPDATE SKIP LOCKED` para varios trabajadores; bloqueo consultivo por material para no
  duplicar compras; índice único parcial `ux_solicitud_abierta`.
- Webhooks firmados con HMAC-SHA256; bitácora protegida por disparador (sin UPDATE ni DELETE).

## Puesta en marcha

La forma más simple es abrir `dist/offline/index.html` en Chrome o Edge. Esta versión no requiere internet, base de datos ni instalación adicional. Para el recorrido y las respuestas clave, consulte `GUIA_PRESENTACION.md`.

Para ejecutar la arquitectura completa:

Con Docker:

```bash
npm ci && npm run web:build
docker compose up --build        # API :3000, simuladores :4000, PostgreSQL, RabbitMQ, trabajador
```

Sin Docker (PostgreSQL local):

```bash
npm ci
export DATABASE_URL=postgres://postgres@localhost:5432/ypfb_mro
npm run db:init                   # genera db/seed.sql y crea el esquema mro
npm run web:build
npm run mocks &                   # WMS y ERP simulados en :4000
export AMQP_URL=amqp://localhost:5672   # opcional; sin él se usa solo el barrido
npm run api &                     # API en :3000 (sirve también la interfaz web)
npm run worker &                  # trabajador de integración
```

Usuarios de demostración (contraseña `Demo2026!`): `tec.rojas` técnico, `sup.vargas` supervisor,
`alm.mamani` almacén, `com.flores` comprador, `ctl.quiroga` control interno, `adm.sistema` administrador,
`ger.salazar` gerencia.

## Pruebas

```bash
npm test                          # 23 pruebas del núcleo (cálculos, estados, MDM, flujos)
npm run test:integracion          # 12 pruebas HTTP + PostgreSQL + RabbitMQ + simuladores
npx newman run postman/YPFB-MRO.postman_collection.json   # 33 solicitudes, 42 aserciones
```

Resultados guardados en `docs/evidencia-pruebas.txt` y `docs/evidencia-postman.txt`;
capturas de la interfaz en `docs/capturas/` (`node scripts/capturas.js`).

## Interfaz y calidad de diseño

- `dist/demo.html`: página autocontenida (núcleo en el navegador con simuladores); es la que se publicó.
- `dist/offline/index.html`: la misma demostración sin internet (React y fuentes locales), para la defensa.
- `web/dist/`: la interfaz servida por la API Express (usa la API real).
- `PRODUCT.md` y `DESIGN.md`: contexto y sistema visual para las skills de diseño.
- `docs/calidad-interfaz/`: revisión con taste-skill, impeccable y ui-ux-pro-max (antes y después,
  reportes de sus medidores y auditoría de 19/20).
- `docs/entregables/`: documentos de las fases (desarrollo en Word y PDF).

## Estructura

```
core/        dominio (calculos, estados, maestros, permisos, errores), servicios, simuladores, adaptadores en memoria
api/src/     app Express, rutas, middleware (JWT, firma, errores), adaptadores PostgreSQL y HTTP, contenedor
worker/      ciclo de la bandeja de salida y sincronización de respaldo
mocks/       servidor de simulación del WMS y del ERP con control de fallas
db/          schema.sql (23 tablas) y seed.sql generado
web/src/     interfaz React: vistas, escenarios de la defensa, puertas de enlace local y HTTP
test/        unit/ e integracion/
postman/     colección con pruebas automáticas
scripts/     generación de semilla, colección Postman, construcción web y capturas
```
