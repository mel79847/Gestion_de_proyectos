/**
 * Recorre la demostración en Chromium, ejecuta escenarios y guarda capturas en docs/capturas/.
 * Sin acceso a CDN: React y las fuentes se sirven desde node_modules.
 * Uso: node scripts/capturas.js [--tema dark] [--ancho 1440]
 */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';

const raiz = new URL('..', import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((s) => s.trim().split(/\s+/)));
const tema = args.tema ?? 'light';
const ancho = Number(args.ancho ?? 1440);
const salida = `${raiz}docs/capturas`;
mkdirSync(salida, { recursive: true });

const fuente = (f) => readFileSync(`${raiz}node_modules/${f}`);
const cssFuentes = `
@font-face{font-family:'Archivo';font-style:normal;font-weight:100 900;font-stretch:62% 125%;src:url(/f/archivo.woff2) format('woff2')}
@font-face{font-family:'IBM Plex Mono';font-weight:400;src:url(/f/plex400.woff2) format('woff2')}
@font-face{font-family:'IBM Plex Mono';font-weight:500;src:url(/f/plex500.woff2) format('woff2')}
@font-face{font-family:'IBM Plex Mono';font-weight:600;src:url(/f/plex600.woff2) format('woff2')}`;
const archivos = {
  '/f/archivo.woff2': fuente('@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2'),
  '/f/plex400.woff2': fuente('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2'),
  '/f/plex500.woff2': fuente('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2'),
  '/f/plex600.woff2': fuente('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2'),
};

const navegador = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
const pagina = await navegador.newPage({ viewport: { width: ancho, height: 900 }, deviceScaleFactor: 2, colorScheme: tema });
const errores = [];
pagina.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
pagina.on('pageerror', (e) => errores.push(String(e)));
await pagina.route('**/*', async (ruta) => {
  const url = new URL(ruta.request().url());
  if (url.hostname === 'cdnjs.cloudflare.com') {
    const lib = url.pathname.includes('react-dom') ? 'react-dom/umd/react-dom.production.min.js' : 'react/umd/react.production.min.js';
    return ruta.fulfill({ body: readFileSync(`${raiz}node_modules/${lib}`), contentType: 'application/javascript' });
  }
  if (url.hostname === 'fonts.googleapis.com') return ruta.fulfill({ body: cssFuentes.replaceAll('url(/f/', 'url(https://fuentes.local/f/'), contentType: 'text/css' });
  if (url.hostname === 'fuentes.local') return ruta.fulfill({ body: archivos[url.pathname], contentType: 'font/woff2' });
  if (url.hostname === 'fonts.gstatic.com') return ruta.abort();
  if (url.protocol === 'file:') return ruta.continue();
  return ruta.continue();
});

const html = readFileSync(`${raiz}dist/demo.html`, 'utf8');
await pagina.goto('about:blank');
await pagina.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
await pagina.waitForTimeout(800);

const ir = async (texto) => {
  await pagina.locator('.nav button', { hasText: texto }).first().click();
  await pagina.waitForTimeout(500);
};
const foto = async (nombre, completa = true) => {
  await pagina.screenshot({ path: `${salida}/${nombre}${tema === 'dark' ? '-oscuro' : ''}${ancho < 800 ? '-movil' : ''}.png`, fullPage: completa });
  console.log('captura', nombre);
};
const escenario = async (pregunta, espera = 400) => {
  await pagina.locator('.escenario', { hasText: pregunta }).click();
  await pagina.locator('button', { hasText: /Ejecutar (escenario|de nuevo)/ }).click();
  await pagina.waitForFunction(() => !document.querySelector('button.boton.primario')?.textContent.includes('Ejecutando'), null, { timeout: 30000 });
  await pagina.waitForTimeout(espera);
  const pasos = await pagina.$$eval('.paso', (ps) => ps.map((p) => `  [${p.className.replace('paso', '').trim() || '-'}] ${p.innerText.replace(/\n+/g, ' | ')}`));
  bitacoraEscenarios.push(`## ${pregunta}`, ...pasos, '');
};
const bitacoraEscenarios = [];

const soloInicio = args.solo === 'inicio';
await foto('01-panel', false);
if (!soloInicio) {
  await ir('Validación técnica');
  await escenario('de punta a punta');
  await foto('02-escenario-flujo');
  await escenario('dos códigos');
  await foto('03-escenario-mdm');
  await escenario('más de lo que hay');
  await escenario('comprar dos veces');
  await foto('04-escenario-sin-duplicar-compra');
  await escenario('no responde');
  await foto('05-escenario-wms-caido');
  await escenario('respuesta se perdió');
  await foto('06-escenario-confirmacion-perdida');
  await escenario('última unidad');
  await foto('07-escenario-concurrencia');
  await escenario('llega la compra');
  await foto('08-escenario-recepcion');
  await escenario('le corresponde');
  await foto('09-escenario-permisos');
  await escenario('significa idempotencia');
  await foto('10-escenario-idempotencia');
  await escenario('diferencias');
  await foto('11-escenario-conciliacion');
  await ir('Panel');
  await foto('12-panel-despues');
  await ir('Órdenes');
  await pagina.locator('tr', { hasText: 'OM-2026-0153' }).first().click();
  await pagina.waitForTimeout(500);
  await foto('13-ordenes');
  await ir('Inventario');
  await foto('14-inventario');
  await ir('Compras');
  await foto('15-compras');
  await ir('Integración');
  await foto('16-integracion');
  await ir('Datos maestros');
  await foto('17-maestros');
  await ir('Auditoría');
  await foto('18-auditoria');
  await ir('Arquitectura');
  await foto('19-arquitectura');
}
if (bitacoraEscenarios.length) (await import('node:fs')).writeFileSync(`${salida}/escenarios.txt`, bitacoraEscenarios.join('\n'));
console.log(errores.length ? `Errores de consola:\n${errores.join('\n')}` : 'Sin errores de consola');
await navegador.close();
