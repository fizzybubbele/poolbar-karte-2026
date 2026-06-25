#!/usr/bin/env node
/**
 * PDF via Puppeteer — wartet auf gerenderte Karte + Fonts.
 */
import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { extname } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4173;
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.otf': 'font/otf',
};

function serveStatic() {
  return createServer((req, res) => {
    let path = join(root, (req.url || '/').split('?')[0].replace(/^\//, '') || 'index.html');
    if (path.endsWith('/')) path = join(path, 'index.html');
    if (!path.startsWith(root) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    res.end(readFileSync(path));
  });
}

const server = serveStatic();
await new Promise((resolve) => server.listen(port, resolve));

try {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/print-snapshot.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 60000 });
  await page.pdf({
    path: join(root, 'poolbar_getraenkekarte_2026.pdf'),
    width: '297mm',
    height: '210mm',
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    printBackground: true,
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log('PDF erzeugt: poolbar_getraenkekarte_2026.pdf');
} finally {
  server.close();
}
