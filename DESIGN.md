# DESIGN.md

Sistema visual de la interfaz (web/src/estilos.css). Estilo dealt por taste-skill: `achromatic-ledger`
(semilla 1375750681) con la paleta y tipografía propias conservadas (`--keep palette,type`).

## Principio
La interfaz va en tinta y grises. El color solo aparece en los datos y en los estados:
- azul `--s-disp` en el stock disponible (el elemento de datos principal de la pantalla);
- amarillo `--s-res` en lo reservado y `--marker` en la familia del código maestro;
- verde, ámbar y rojo solo como estados (pastilla pálida con texto oscuro del mismo tono).

## Cara del producto y elemento propio
- Cara: la etiqueta de ubicación del código maestro (familia en banda amarilla, color de marcado
  de tuberías de gas; subfamilia y correlativo en celdas con borde).
- Elemento propio: la barra de existencias frente al punto de reorden (disponible, reservado,
  bloqueado rayado, en tránsito punteado, marcas de SS y ROP).

## Tokens
| Rol | Claro | Oscuro |
| --- | --- | --- |
| Fondo `--bg` | #f2f3f0 | #111519 |
| Superficie `--surface` | #ffffff | #181d22 |
| Tinta `--ink` / `--ink-2` / `--ink-3` | #151b21 / #48535e / #5d6872 | #e6e9e5 / #b3bbc2 / #8a939b |
| Línea `--line` / `--line-2` | #d6dbd4 / #e7eae5 | #2f373f / #252c33 |
| Activo `--active` | #e6e8e4 | #262d34 |
| Disponible / reservado | #2a78d6 / #eda100 | #3987e5 / #c98500 |
| Estados ok / aviso / crítico | #2b7549 / #8f5500 / #b3261e | #63c08a / #e5a640 / #f07a72 |

Paleta de datos validada con el validador de dataviz (daltonismo y contraste).

## Tipografía
Archivo (ancho 80 en títulos, 92 en texto) y IBM Plex Mono solo para códigos, ids, rutas y fórmulas.
Escala: 11 / 12 / 13 / 14 / 15 / 18 / 24. Cifras tabulares en toda la interfaz.

## Componentes
- Navegación lateral con píldora neutra para el elemento activo; sin barras de color.
- Indicadores del proceso en un contenedor dividido (etiqueta sobre valor; el cero en gris).
- Tablas sin banda de cabecera; números alineados a la derecha; guion gris para lo que falta.
- Un botón principal en tinta por pantalla; secundarios con borde; deshabilitados legibles con motivo.
- Iconos de trazo (geometría Lucide) en un solo grosor; sin emoji ni glifos Unicode.
- Avisos flotantes con borde completo e icono de estado.

## Comportamiento
Foco visible en todo control y fila seleccionable (teclado: Enter o Espacio). Objetivos táctiles de 44 px
y campos de 16 px en teléfono. Transiciones de 150 ms solo en respuesta a una acción; con movimiento
reducido se anulan. Selección, cursor y barras de desplazamiento tomados de la paleta.
