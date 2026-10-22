/**
 * Construye la interfaz React en dos variantes:
 *  - web/dist/            aplicación servida por la API Express (usa la API real).
 *  - dist/demo.html       página autocontenida: el núcleo corre en el navegador con simuladores.
 * React y ReactDOM se cargan desde cdnjs (versión fija); el resto va en el paquete.
 */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
const css = readFileSync(`${raiz}web/src/estilos.css`, 'utf8');
const comun = { bundle: true, format: 'iife', jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment', target: 'es2022', minify: true, legalComments: 'none', write: false };

const REACT = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
];
const FUENTES = 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..100,400..800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

const cabeza = (titulo, extra = '') => `<title>${titulo}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Sistema de trazabilidad de inventario MRO para YPFB Transporte S.A.: mantenimiento, inventario (WMS) y compras (ERP).">
${extra}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FUENTES}">
<style>${css}</style>`;

async function paquete(entrada) {
  const r = await build({ ...comun, entryPoints: [`${raiz}web/src/${entrada}`] });
  return r.outputFiles[0].text;
}

const local = await paquete('entrada-local.jsx');
mkdirSync(`${raiz}dist`, { recursive: true });
writeFileSync(
  `${raiz}dist/demo.html`,
  `${cabeza('Trazabilidad MRO YPFB')}
<div id="raiz"></div>
${REACT.map((s) => `<script src="${s}"></script>`).join('\n')}
<script>${local.replaceAll('</script', '<\\/script')}</script>
`,
);

// Variante sin conexión (dist/offline): React y fuentes copiados al lado; sirve para la defensa sin internet
// y para los inspectores de diseño (taste-skill, impeccable), que no alcanzan los CDN.
const off = `${raiz}dist/offline`;
mkdirSync(`${off}/fuentes`, { recursive: true });
const nm = `${raiz}node_modules`;
copyFileSync(`${nm}/react/umd/react.production.min.js`, `${off}/react.production.min.js`);
copyFileSync(`${nm}/react-dom/umd/react-dom.production.min.js`, `${off}/react-dom.production.min.js`);
copyFileSync(`${nm}/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2`, `${off}/fuentes/archivo.woff2`);
for (const w of [400, 500, 600]) copyFileSync(`${nm}/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-${w}-normal.woff2`, `${off}/fuentes/plex-${w}.woff2`);
const fuentesLocales = `@font-face{font-family:'Archivo';font-style:normal;font-weight:100 900;font-stretch:62% 125%;font-display:swap;src:url(fuentes/archivo.woff2) format('woff2')}
${[400, 500, 600].map((w) => `@font-face{font-family:'IBM Plex Mono';font-weight:${w};font-display:swap;src:url(fuentes/plex-${w}.woff2) format('woff2')}`).join('\n')}`;
writeFileSync(
  `${off}/index.html`,
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Trazabilidad MRO YPFB</title>
<style>${fuentesLocales}\n${css}</style>
</head><body><div id="raiz"></div>
<script src="react.production.min.js"></script><script src="react-dom.production.min.js"></script>
<script>${local.replaceAll('</script', '<\\/script')}</script></body></html>
`,
);

const http = await paquete('entrada-http.jsx');
mkdirSync(`${raiz}web/dist`, { recursive: true });
writeFileSync(`${raiz}web/dist/app.js`, http);
writeFileSync(
  `${raiz}web/dist/index.html`,
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${cabeza('Trazabilidad MRO YPFB', `<meta name="simulador" content="${process.env.SIMULADOR_URL ?? 'http://localhost:4000'}">\n`)}
</head><body><div id="raiz"></div>
${REACT.map((s) => `<script src="${s}"></script>`).join('\n')}
<script src="app.js"></script></body></html>
`,
);
console.log(`dist/demo.html ${(local.length / 1024).toFixed(0)} KB, web/dist/app.js ${(http.length / 1024).toFixed(0)} KB`);
