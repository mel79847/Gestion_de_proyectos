# Calidad de la interfaz: aplicación de las skills de diseño

Revisión de la interfaz React (web/src) con tres skills descargadas de GitHub el 21/10/2026:

| Skill | Repositorio | Qué se usó |
| --- | --- | --- |
| taste-skill v2 | github.com/Leonxlnx/taste-skill (MIT) | references/app-screens.md, `draw.mjs --app`, `lint.mjs --app`, `inspect.mjs --app` |
| impeccable 4.7.0 | github.com/pbakaus/impeccable (Apache 2.0) | `impeccable context`, modo Operate, craft-floor.md, audit.md, `impeccable detect` |
| ui-ux-pro-max | github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT) | `search.py --design-system`, búsquedas `--domain ux`, checklist de entrega |

Se suman a las cuatro skills usadas en la construcción: frontend-design, artifact-design,
artifact-diagramming y dataviz.

## 1. Mediciones antes y después

| Herramienta | Antes | Después |
| --- | --- | --- |
| taste-skill `lint.mjs --app` | 2 FAIL (degradado en la marca, glifo ✓ como icono), 7 WARN | 0 FAIL, 2 WARN defendidos |
| taste-skill `inspect.mjs --app` (Panel) | 1 FAIL (botón con sombra), 1 WARN (contraste 4,4:1) | 0 FAIL, 0 WARN |
| taste-skill `inspect.mjs --app` (9 vistas) | no medido | 0 FAIL en las 9; 4 WARN defendidos |
| impeccable `detect` | 3 hallazgos (borde lateral de color ×2, franjas con degradado) | 0 hallazgos |

Resultados completos: `taste-inspect-despues.txt`, `taste-lint-despues.txt`,
`impeccable-detect-despues.json`; capturas `antes-*.jpg` y `despues-*.jpg`.

## 2. Cambios aplicados

- **Estilo de pantalla de aplicación** (taste-skill, `achromatic-ledger`, paleta y tipografía propias
  conservadas): interfaz en tinta; color solo en datos y estados; un botón principal en tinta.
- **Navegación**: el elemento activo pasa de una barra lateral de color a una píldora neutra.
- **Marca**: banda amarilla plana, sin franjas con degradado.
- **Iconos**: un juego de iconos de trazo (geometría Lucide) en lugar de ✓, ●, · y →.
- **Avisos**: borde completo e icono de estado en lugar de un borde lateral grueso.
- **Panel**: título de 24 px con el hallazgo del día calculado de los datos, sello de la hora de
  consulta, botones Actualizar y Nueva orden, indicadores en un contenedor dividido (etiqueta sobre
  valor, ceros en gris), materiales ordenados por urgencia, verde retirado de "Cubierto" (solo lo que
  está en riesgo lleva color), estado de error con Reintentar.
- **Órdenes y Compras**: lista y detalle (lista fija con desplazamiento propio); el formulario de nueva
  orden se abre desde el botón principal; celdas de dos líneas para que ninguna pastilla se corte.
- **Integración**: bloques apilados para que ninguna tarjeta quede con vacíos.
- **Tablas**: cabecera sin banda, peso 500; fila seleccionada con relleno neutro; filas seleccionables
  operables con teclado (Enter o Espacio) y foco visible.
- **Botones deshabilitados**: legibles (contraste 4,5:1) y con un title que explica por qué.
- **Superficies del navegador**: selección, cursor, acento de controles y barras de desplazamiento
  tomados de la paleta; `scroll-padding-top` para que el foco no quede bajo la cabecera.
- **Teléfono** (ui-ux-pro-max): objetivos táctiles de 44 px y campos de 16 px.
- **Cifras**: tabulares en toda la interfaz, también en códigos e identificadores.
- **Rendimiento**: el trabajador solo refresca la interfaz cuando alguna operación cambió.

## 3. Avisos que quedan y su justificación

| Aviso | Dónde | Justificación |
| --- | --- | --- |
| `mono` (lint) | estilos.css | La monoespaciada solo se usa en códigos maestros, ids, rutas y fórmulas, como permite app-screens §13. |
| `em-dash` (lint) | 17 guiones | Son el guion gris de valor faltante que pide app-screens §11, no guiones en la prosa. |
| `ragged-row` | Demostración, Órdenes, Compras | Patrón lista y detalle: la lista es fija y se desplaza por su cuenta; sus alturas difieren por diseño. |
| `hero-void` | Auditoría | Con los datos de ejemplo recién cargados la bitácora está vacía; el estado vacío conserva su marco. Se llena al usar el sistema. |

## 4. Auditoría impeccable (audit.md)

| # | Dimensión | Puntaje | Hallazgo principal |
| --- | --- | --- | --- |
| 1 | Accesibilidad | 4 | Contraste 4,5:1 medido; foco visible; filas operables con teclado; etiquetas en todos los campos |
| 2 | Rendimiento | 3 | El panel consulta un material por llamada (8 consultas por refresco); aceptable con 8 materiales |
| 3 | Temas | 4 | Todo color sale de tokens; modo oscuro propio comprobado |
| 4 | Responsive | 4 | Sin desplazamiento horizontal a 390 px; objetivos de 44 px; tablas con desplazamiento propio |
| 5 | Integridad de implementación | 4 | Detector sin hallazgos; cara y elemento propios del producto |
| | **Total** | **19/20** | **Excelente** |

Pendiente recomendado (P2): un endpoint de disponibilidad por lote para el panel
(`/impeccable optimize`).

## 5. Checklist de entrega de ui-ux-pro-max

| Punto | Estado |
| --- | --- |
| Sin emoji como iconos (SVG) | Cumple |
| Cursor de mano en todo lo clicable | Cumple |
| Estados hover con transición de 150 a 300 ms | Cumple (150 ms) |
| Contraste de texto 4,5:1 en modo claro | Cumple (medido por el inspector) |
| Foco visible para teclado | Cumple |
| prefers-reduced-motion respetado | Cumple |
| Responsive a 375, 768, 1024 y 1440 px | Cumple (inspector a 390, 768 y 1440; capturas a 400) |

La paleta verde y la tipografía Fira que sugiere `--design-system` (uiux-pro-max-sistema.md) no se
adoptaron: taste-skill e impeccable piden conservar la identidad existente en un refinamiento, y la
paleta actual ya pasó la validación de daltonismo y contraste.
