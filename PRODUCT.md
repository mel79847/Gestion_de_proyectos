# PRODUCT.md

Contexto de producto para las skills de diseño (impeccable, taste-skill, ui-ux-pro-max).
Inferido del enunciado del proyecto y de las fases anteriores; los supuestos están marcados.

## Producto
Sistema de trazabilidad de inventario MRO de YPFB Transporte S.A. (caso de estudio académico, UPB).
Integra Mantenimiento, Inventario (WMS) y Compras (ERP) para repuestos e insumos de equipos y camiones.

## Personas y uso
- Técnico de mantenimiento: crea órdenes y registra el cambio de pieza, desde computadora o tableta.
- Supervisor de mantenimiento: valida, prioriza y cierra órdenes.
- Personal de almacén: consulta disponibilidad, reserva y entrega en la ventanilla (tableta).
- Comprador: evalúa la reposición, compara cotizaciones y aprueba el envío al ERP.
- Control interno, administrador y gerencia: consultan bitácora, incidencias y conciliación.
- Supuesto: sesiones largas de trabajo en oficina y almacén, con luz de interior; también tableta.

## Superficie y modo
Pantallas de aplicación (impeccable: modo Operate; taste-skill: app screens).
Pregunta principal del panel: ¿qué repuestos necesitan reposición y qué está bloqueando el proceso?
Trabajo más frecuente: registrar una orden (botón principal "Nueva orden").

## Restricciones
- El WMS es dueño del stock y el ERP de la orden de compra y del CPP: la interfaz indica la fuente de cada dato.
- Un código maestro por material (FAM-SUB-NNNN), visible como etiqueta de ubicación.
- Español de Bolivia, cifras con coma decimal (Bs 88,50).
