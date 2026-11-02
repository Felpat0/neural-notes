// Genera le icone dell'app (PWA, iPhone) da un unico disegno SVG, lo stesso della favicon.
// Uso: pnpm icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const VOLT = '#fcee0a';
const VOID = '#000000';

/** scale < 1 lascia margine per le icone "maskable" che Android ritaglia a cerchio. */
const icon = (scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${VOID}"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
    <path d="M8 8h48v40l-8 8H8z" fill="${VOLT}"/>
    <path d="M8 8h14L8 22z" fill="${VOID}"/>
    <path d="M19 44V20h5l12 15V20h5v24h-5L24 29v15z" fill="${VOID}"/>
  </g>
</svg>`;

const render = (svg, size) =>
	new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

mkdirSync('static/icons', { recursive: true });
writeFileSync('static/icons/icon-192.png', render(icon(), 192));
writeFileSync('static/icons/icon-512.png', render(icon(), 512));
writeFileSync('static/icons/maskable-512.png', render(icon(0.72), 512));
writeFileSync('static/icons/apple-touch-icon.png', render(icon(), 180));
console.log('Icone generate in static/icons');
