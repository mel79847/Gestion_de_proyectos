# Guía breve de presentación del sistema

## Inicio rápido

Para presentar sin instalar servidores ni depender de internet, abra `dist/offline/index.html` en Chrome o Edge. Los datos funcionan en memoria y pueden reiniciarse recargando la página.

## Recorrido recomendado

1. **Inventario:** explique que se gestiona inventario MRO, perpetuo, por almacén y con revisión continua. Muestre las cuatro tarjetas conceptuales.
2. **Algoritmos:** seleccione un material. El sistema aplica FEFO cuando existe vencimiento y PEPS cuando no existe; excluye lotes bloqueados. La reposición compara la posición con el ROP y calcula EOQ o completa hasta el máximo.
3. **Datos maestros:** escriba `FILTRO ACEITE P/MOTOR VOLVO D-13`. El sistema normaliza la descripción, identifica el material existente y evita un segundo código.
4. **Validación técnica:** ejecute `¿Cómo funciona el inventario de punta a punta?`. Se observan orden, consulta, reserva, salida, cambio de pieza y reposición.
5. **Integración:** ejecute `¿Qué pasa si el WMS no responde?` y `¿Qué significa idempotencia en la práctica?`. Muestre la bandeja de salida, reintentos y el identificador único.
6. **Arquitectura:** cierre explicando bajo acoplamiento, alta cohesión y el principio `un dato, un dueño`.

## Respuestas esenciales

**¿Qué tipo de inventario maneja?**  
Inventario MRO porque controla repuestos e insumos destinados al mantenimiento y no a la venta. Es perpetuo porque cada movimiento confirmado actualiza la existencia; se administra por almacén y utiliza revisión continua.

**¿Qué algoritmo de ordenamiento utiliza?**  
FEFO para materiales con vencimiento: sale primero el lote que vence antes. PEPS para materiales sin vencimiento: sale primero el lote más antiguo. En ambos casos se excluyen unidades bloqueadas o vencidas.

**¿Cómo evita datos duplicados?**  
El maestro asigna un solo código corporativo, normaliza la descripción y aplica una restricción única. Para los movimientos usa un identificador de operación; si el mismo mensaje llega dos veces, se reconoce como la misma operación y no vuelve a afectar el stock.

**¿Cómo se actualizan los datos?**  
La disponibilidad se consulta directamente al WMS. Las reservas y salidas viajan por una bandeja de operaciones; el trabajador las procesa y reintenta si el sistema externo no responde. Los cambios externos llegan mediante webhooks y la conciliación detecta diferencias que hayan quedado pendientes.

**¿Dónde está el stock oficial?**  
En el WMS. La solución no crea un segundo saldo. El ERP conserva la orden formal de compra y el costo promedio ponderado; el sistema de trazabilidad guarda las órdenes de mantenimiento, solicitudes, referencias, estados e incidencias.

**¿Cómo demuestra bajo acoplamiento?**  
La lógica de negocio no depende directamente de Express, PostgreSQL, WMS ni ERP. Se comunica mediante contratos y adaptadores. Si cambia un sistema externo, se reemplaza su adaptador sin reescribir las reglas del inventario.

**¿Cómo demuestra alta cohesión?**  
Cada módulo concentra una responsabilidad: maestros, mantenimiento, inventario, compras, integración, seguridad y auditoría. Las reglas relacionadas permanecen juntas y los módulos intercambian únicamente la información necesaria.

## Operación segura durante la presentación

- Mantenga activada la opción `Usar el rol de cada acción` para recorrer el flujo completo.
- Si desea probar permisos, desactívela y seleccione un usuario sin autorización para la acción.
- Los botones `WMS en servicio` y `ERP en servicio` permiten simular una caída y después restablecer el servicio.
- Si un escenario ya modificó los datos, utilice `Reiniciar datos de ejemplo` o recargue la página.
