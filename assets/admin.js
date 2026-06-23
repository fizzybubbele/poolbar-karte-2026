import { renderKarte, loadMenu, cloneMenu } from './karte.js';
import {
  applyFreetext,
  removeItemAt,
  addItemToSection,
  updateItem,
} from './parser.js';
import {
  ADMIN_PASSWORD_HASH,
  BASELINE_URL,
  MENU_URL,
  HISTORY_INDEX_URL,
  GITHUB_REPO,
} from './admin-config.js';

const AUTH_KEY = 'poolbar-admin-auth';
const PAT_KEY = 'poolbar-github-pat';
const UNDO_KEY = 'poolbar-admin-undo';

/** @type {import('./karte.js').MenuData | null} */
let currentMenu = null;
/** @type {import('./karte.js').MenuData[]} */
let undoStack = [];
let redoStack = [];
let undoPointer = -1;

const loginView = document.getElementById('login-view');
const editorView = document.getElementById('editor-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const previewRoot = document.getElementById('preview-root');
const structuredRoot = document.getElementById('structured-root');
const freetextInput = document.getElementById('freetext-input');
const freetextApply = document.getElementById('freetext-apply');
const freetextMessages = document.getElementById('freetext-messages');
const historyList = document.getElementById('history-list');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const resetBtn = document.getElementById('reset-btn');
const exportBtn = document.getElementById('export-btn');
const publishBtn = document.getElementById('publish-btn');
const patInput = document.getElementById('pat-input');
const savePatBtn = document.getElementById('save-pat-btn');
const statusBar = document.getElementById('status-bar');

init();

function init() {
  const savedPat = sessionStorage.getItem(PAT_KEY);
  if (savedPat && patInput) patInput.value = '••••••••';

  if (sessionStorage.getItem(AUTH_KEY) === '1') {
    showEditor();
  }

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    const submitBtn = document.getElementById('login-submit');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const pw = /** @type {HTMLInputElement} */ (document.getElementById('password')).value;
      const hash = await sha256(pw);
      if (hash === ADMIN_PASSWORD_HASH) {
        try {
          sessionStorage.setItem(AUTH_KEY, '1');
        } catch {
          /* z. B. privater Modus — Editor trotzdem öffnen */
        }
        await showEditor();
      } else {
        loginError.textContent = 'Falsches Passwort — Groß/Kleinschreibung beachten';
      }
    } catch (err) {
      loginError.textContent = `Anmeldung fehlgeschlagen: ${err.message}`;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  freetextApply?.addEventListener('click', () => {
    if (!currentMenu || !freetextInput) return;
    const { menu, messages } = applyFreetext(currentMenu, freetextInput.value);
    pushState(menu);
    freetextMessages.textContent = messages.join(' · ') || 'Angewendet';
    freetextInput.value = '';
  });

  undoBtn?.addEventListener('click', undo);
  redoBtn?.addEventListener('click', redo);
  resetBtn?.addEventListener('click', resetToBaseline);
  exportBtn?.addEventListener('click', exportJson);
  publishBtn?.addEventListener('click', publishMenu);
  savePatBtn?.addEventListener('click', () => {
    if (!patInput) return;
    const val = patInput.value.trim();
    if (val && val !== '••••••••') sessionStorage.setItem(PAT_KEY, val);
    setStatus('PAT für diese Sitzung gespeichert');
  });
}

async function showEditor() {
  loginView.hidden = true;
  editorView.hidden = false;
  try {
    const menu = await loadMenu(MENU_URL);
    currentMenu = menu;
    loadUndoFromSession(menu);
    renderAll();
    await loadHistoryList();
  } catch (err) {
    setStatus(err.message, true);
  }
}

function renderAll() {
  if (!currentMenu || !previewRoot) return;
  renderKarte(currentMenu, previewRoot);
  renderStructuredEditor();
  updateUndoButtons();
}

function renderStructuredEditor() {
  if (!structuredRoot || !currentMenu) return;
  structuredRoot.innerHTML = '';

  currentMenu.sections.forEach((section) => {
    const block = document.createElement('div');
    block.className = 'struct-section';

    const h = document.createElement('h3');
    h.textContent = section.title;
    block.appendChild(h);

    section.items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'struct-row';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Entfernen';
      remove.addEventListener('click', () => {
        pushState(removeItemAt(currentMenu, section.title, index));
      });

      const name = document.createElement('input');
      name.value = item.name;
      name.addEventListener('change', () => {
        pushState(updateItem(currentMenu, section.title, index, { name: name.value }));
      });

      const price = document.createElement('input');
      price.value = item.price || '';
      price.placeholder = 'Preis';
      price.className = 'price-input';
      price.addEventListener('change', () => {
        pushState(updateItem(currentMenu, section.title, index, { price: price.value }));
      });

      row.appendChild(remove);
      row.appendChild(name);
      row.appendChild(price);
      block.appendChild(row);
    });

    const addRow = document.createElement('button');
    addRow.type = 'button';
    addRow.className = 'add-row-btn';
    addRow.textContent = '+ Zeile';
    addRow.addEventListener('click', () => {
      pushState(addItemToSection(currentMenu, section.title, { name: 'Neu', price: '0,00' }));
    });
    block.appendChild(addRow);
    structuredRoot.appendChild(block);
  });
}

function pushState(menu) {
  currentMenu = cloneMenu(menu);
  undoStack = undoStack.slice(0, undoPointer + 1);
  undoStack.push(cloneMenu(currentMenu));
  if (undoStack.length > 20) undoStack.shift();
  undoPointer = undoStack.length - 1;
  redoStack = [];
  saveUndoToSession();
  renderAll();
}

function undo() {
  if (undoPointer <= 0) return;
  redoStack.push(cloneMenu(currentMenu));
  undoPointer -= 1;
  currentMenu = cloneMenu(undoStack[undoPointer]);
  saveUndoToSession();
  renderAll();
}

function redo() {
  if (redoStack.length === 0) return;
  undoPointer += 1;
  currentMenu = cloneMenu(redoStack.pop());
  undoStack.push(cloneMenu(currentMenu));
  saveUndoToSession();
  renderAll();
}

function updateUndoButtons() {
  if (undoBtn) undoBtn.disabled = undoPointer <= 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

async function resetToBaseline() {
  if (!confirm('Karte auf heutigen offiziellen Stand zurücksetzen?')) return;
  const menu = await loadMenu(BASELINE_URL);
  pushState(menu);
  setStatus('Auf Baseline zurückgesetzt');
}

function exportJson() {
  if (!currentMenu) return;
  const blob = new Blob([JSON.stringify(currentMenu, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'menu.json';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('menu.json exportiert');
}

async function publishMenu() {
  if (!currentMenu) return;
  const pat = sessionStorage.getItem(PAT_KEY);
  if (!pat) {
    setStatus('GitHub PAT fehlt — exportiere JSON oder PAT speichern', true);
    exportJson();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const historyPath = `data/history/menu-${stamp}.json`;
  const menuJson = JSON.stringify(currentMenu, null, 2);

  try {
    publishBtn.disabled = true;
    await upsertFile(pat, 'data/menu.json', menuJson, 'Karte aktualisiert');
    await upsertFile(pat, historyPath, menuJson, `Snapshot ${stamp}`, false);
    await appendHistoryIndex(pat, historyPath, stamp);
    setStatus('Veröffentlicht — Deploy läuft auf GitHub');
    await loadHistoryList();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    publishBtn.disabled = false;
  }
}

async function appendHistoryIndex(pat, path, stamp) {
  let index = [];
  try {
    const existing = await githubGet(pat, HISTORY_INDEX_URL);
    index = JSON.parse(existing);
  } catch {
    index = [];
  }
  index.unshift({ path, stamp, at: new Date().toISOString() });
  index = index.slice(0, 50);
  await upsertFile(pat, HISTORY_INDEX_URL, JSON.stringify(index, null, 2), 'History-Index aktualisiert', false);
}

async function loadHistoryList() {
  if (!historyList) return;
  historyList.innerHTML = '';
  try {
    const res = await fetch(HISTORY_INDEX_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('no index');
    const index = await res.json();
    index.forEach((entry) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-item';
      btn.textContent = entry.at?.slice(0, 16).replace('T', ' ') || entry.path;
      btn.addEventListener('click', async () => {
        const menu = await loadMenu(entry.path);
        pushState(menu);
        setStatus(`Stand geladen: ${entry.path}`);
      });
      historyList.appendChild(btn);
    });
  } catch {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Noch keine History-Einträge';
    historyList.appendChild(p);
  }
}

async function upsertFile(pat, path, content, message, tryUpdateMain = true) {
  let sha;
  if (tryUpdateMain) {
    try {
      const meta = await githubApi(pat, `/repos/${GITHUB_REPO}/contents/${path}`);
      sha = meta.sha;
    } catch {
      sha = undefined;
    }
  }
  const body = {
    message,
    content: toBase64(content),
  };
  if (sha) body.sha = sha;
  await githubApi(pat, `/repos/${GITHUB_REPO}/contents/${path}`, 'PUT', body);
}

async function githubGet(pat, path) {
  const data = await githubApi(pat, `/repos/${GITHUB_REPO}/contents/${path}`);
  const binary = atob(data.content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubApi(pat, path, method = 'GET', body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API ${res.status}`);
  }
  return res.json();
}

function saveUndoToSession() {
  sessionStorage.setItem(UNDO_KEY, JSON.stringify({ undoStack, undoPointer }));
}

function loadUndoFromSession(fallback) {
  try {
    const raw = sessionStorage.getItem(UNDO_KEY);
    if (!raw) throw new Error('empty');
    const data = JSON.parse(raw);
    undoStack = data.undoStack;
    undoPointer = data.undoPointer;
    currentMenu = cloneMenu(undoStack[undoPointer] || fallback);
  } catch {
    undoStack = [cloneMenu(fallback)];
    undoPointer = 0;
    currentMenu = cloneMenu(fallback);
  }
}

function setStatus(msg, isError = false) {
  if (!statusBar) return;
  statusBar.textContent = msg;
  statusBar.classList.toggle('error', isError);
}

async function sha256(text) {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Fallback(text);
}

/** @param {string} text */
function sha256Fallback(text) {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;
  const withOne = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  withOne.set(bytes);
  withOne[bytes.length] = 0x80;
  new DataView(withOne.buffer).setUint32(withOne.length - 4, bitLen);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let i = 0; i < withOne.length; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = new DataView(withOne.buffer).getUint32(i + j * 4);
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return Array.from(h).map((v) => v.toString(16).padStart(8, '0')).join('');
}

/** @param {number} x @param {number} n */
function rotr(x, n) {
  return (x >>> n) | (x << (32 - n));
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}
