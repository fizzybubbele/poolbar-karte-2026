#!/usr/bin/env node
/**
 * Erzeugt print-snapshot.html mit eingebettetem Menü (kein fetch nötig für Headless-PDF).
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const menu = readFileSync(join(root, 'data/menu.json'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Poolbar Karte — Druck</title>
  <link rel="stylesheet" href="assets/karte.css">
  <style>
    body { background: #fff; margin: 0; }
    .a4-viewport { padding: 0; min-height: auto; }
    .a4-sheet,
    .a4-page {
      width: 297mm;
      height: 210mm;
    }
    .a4-sheet { box-shadow: none; aspect-ratio: auto; display: block; }
    .a4-page { transform: none !important; }
    .a4-inner { padding: 10mm; box-sizing: border-box; }
  </style>
</head>
<body>
  <div class="a4-viewport">
    <div class="a4-sheet">
      <div class="a4-page">
        <div class="a4-inner" id="karte-root"></div>
      </div>
    </div>
  </div>
  <script type="application/json" id="menu-data">${menu.replace(/</g, '\\u003c')}</script>
  <script type="module">
    import { renderKarte } from './assets/karte.js';
    const menu = JSON.parse(document.getElementById('menu-data').textContent);
    renderKarte(menu, document.getElementById('karte-root'));
    Promise.all([document.fonts.ready, new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))])
      .then(() => { document.body.dataset.ready = '1'; });
  </script>
</body>
</html>
`;

writeFileSync(join(root, 'print-snapshot.html'), html, 'utf8');
console.log('print-snapshot.html erzeugt');
