import { renderKarte, loadMenu, cloneMenu, fitKartePreview } from './karte.js';
import {
  applyFreetext,
  removeItemAt,
  addItemToSection,
  updateItem,
  updateFooter,
  moveSection,
  moveItem,
  updateSection,
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
const PRINT_MENU_KEY = 'poolbar-print-menu';
const MOBILE_VIEW_KEY = 'poolbar-admin-mobile-view';
const MOBILE_MQ = '(max-width: 960px)';

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
const footerLeftInput = document.getElementById('footer-left');
const footerRightInput = document.getElementById('footer-right');
const footerPfandInput = document.getElementById('footer-pfand');
const historyList = document.getElementById('history-list');
const versionCurrent = document.getElementById('version-current');
const versionBadge = document.getElementById('version-badge');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const headerUndoBtn = document.getElementById('header-undo-btn');
const headerRedoBtn = document.getElementById('header-redo-btn');
const resetBtn = document.getElementById('reset-btn');
const exportBtn = document.getElementById('export-btn');
const publishBtn = document.getElementById('publish-btn');
const patInput = document.getElementById('pat-input');
const savePatBtn = document.getElementById('save-pat-btn');
const clearPatBtn = document.getElementById('clear-pat-btn');
const pdfPreviewBtn = document.getElementById('pdf-preview-btn');
const pdfLiveLink = document.getElementById('pdf-live-link');
const statusBar = document.getElementById('status-bar');
const previewPanel = document.querySelector('.preview-panel');
const editorGrid = document.querySelector('.editor-grid');
const mobileViewEdit = document.getElementById('mobile-view-edit');
const mobileViewPreview = document.getElementById('mobile-view-preview');

init();

function initPreviewScrollPassthrough() {
  if (!previewPanel) return;
  previewPanel.addEventListener('wheel', (e) => {
    if (window.matchMedia(MOBILE_MQ).matches) return;
    if (e.ctrlKey) return;
    const root = document.scrollingElement || document.documentElement;
    root.scrollTop += e.deltaY;
    root.scrollLeft += e.deltaX;
    e.preventDefault();
  }, { passive: false });
}

function setMobileView(mode) {
  if (!editorGrid || !mobileViewEdit || !mobileViewPreview) return;
  const isEdit = mode !== 'preview';
  const isMobile = window.matchMedia(MOBILE_MQ).matches;

  mobileViewEdit.classList.toggle('is-active', isEdit);
  mobileViewPreview.classList.toggle('is-active', !isEdit);
  mobileViewEdit.setAttribute('aria-pressed', isEdit ? 'true' : 'false');
  mobileViewPreview.setAttribute('aria-pressed', isEdit ? 'false' : 'true');

  if (isMobile) {
    editorGrid.classList.toggle('is-mobile-edit', isEdit);
    editorGrid.classList.toggle('is-mobile-preview', !isEdit);
    try {
      sessionStorage.setItem(MOBILE_VIEW_KEY, isEdit ? 'edit' : 'preview');
    } catch {
      /* ignore */
    }
    if (!isEdit) refitPreview();
  } else {
    editorGrid.classList.remove('is-mobile-edit', 'is-mobile-preview');
  }
}

function refitPreview() {
  const sheet = previewRoot?.closest('.a4-sheet');
  if (sheet) {
    requestAnimationFrame(() => {
      document.fonts.ready.then(() => fitKartePreview(sheet));
    });
  }
}

function initMobileViewToggle() {
  if (!editorGrid || !mobileViewEdit || !mobileViewPreview) return;
  const mq = window.matchMedia(MOBILE_MQ);
  const saved = sessionStorage.getItem(MOBILE_VIEW_KEY);
  setMobileView(saved === 'preview' ? 'preview' : 'edit');

  mobileViewEdit.addEventListener('click', () => setMobileView('edit'));
  mobileViewPreview.addEventListener('click', () => setMobileView('preview'));

  mq.addEventListener('change', () => {
    if (!mq.matches) {
      editorGrid.classList.remove('is-mobile-edit', 'is-mobile-preview');
      return;
    }
    const mode = sessionStorage.getItem(MOBILE_VIEW_KEY);
    setMobileView(mode === 'preview' ? 'preview' : 'edit');
  });
}

function init() {
  initPreviewScrollPassthrough();
  initMobileViewToggle();
  const savedPat = sessionStorage.getItem(PAT_KEY);
  if (savedPat && patInput) patInput.value = '••••••••';

  if (sessionStorage.getItem(AUTH_KEY) === '1') {
    void showEditor();
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

  undoBtn?.addEventListener('click', undo);
  redoBtn?.addEventListener('click', redo);
  headerUndoBtn?.addEventListener('click', undo);
  headerRedoBtn?.addEventListener('click', redo);
  resetBtn?.addEventListener('click', resetToBaseline);
  exportBtn?.addEventListener('click', exportJson);
  publishBtn?.addEventListener('click', publishMenu);
  savePatBtn?.addEventListener('click', () => void savePat());
  clearPatBtn?.addEventListener('click', () => {
    clearPat();
    setStatus('Gespeichertes PAT entfernt');
  });

  footerLeftInput?.addEventListener('change', syncFooterFromInputs);
  footerRightInput?.addEventListener('change', syncFooterFromInputs);
  footerPfandInput?.addEventListener('change', syncFooterFromInputs);
  pdfPreviewBtn?.addEventListener('click', downloadPdfPreview);

  freetextApply?.addEventListener('click', () => {
    if (!currentMenu || !freetextInput) return;
    const { menu, messages } = applyFreetext(currentMenu, freetextInput.value);
    pushState(menu);
    freetextMessages.textContent = messages.join(' · ') || 'Angewendet';
    freetextInput.value = '';
  });
}

async function showEditor() {
  setView('editor');
  try {
    const menu = await loadMenu(MENU_URL);
    currentMenu = menu;
    loadUndoFromSession(menu);
    updatePdfLiveLink();
    renderAll();
    await loadHistoryList();
  } catch (err) {
    setStatus(err.message, true);
  }
}

function setView(mode) {
  const isLogin = mode === 'login';
  loginView?.classList.toggle('is-active', isLogin);
  editorView?.classList.toggle('is-active', !isLogin);
  if (loginView) {
    loginView.hidden = isLogin ? false : true;
    if (isLogin) loginView.style.removeProperty('display');
    else loginView.style.display = 'none';
  }
  if (editorView) {
    editorView.hidden = isLogin;
    if (isLogin) editorView.style.display = 'none';
    else editorView.style.removeProperty('display');
  }
}

function renderAll() {
  if (!currentMenu || !previewRoot) return;
  renderKarte(currentMenu, previewRoot);
  renderStructuredEditor();
  renderFooterEditor();
  updateUndoButtons();
  updateVersionBadge();
  renderVersionCurrent();
  if (window.matchMedia(MOBILE_MQ).matches && editorGrid?.classList.contains('is-mobile-preview')) {
    refitPreview();
  }
}

function renderFooterEditor() {
  if (!currentMenu) return;
  if (footerLeftInput) footerLeftInput.value = currentMenu.footer.left;
  if (footerRightInput) footerRightInput.value = currentMenu.footer.right;
  if (footerPfandInput) footerPfandInput.value = currentMenu.footer.pfand;
}

function syncFooterFromInputs() {
  if (!currentMenu) return;
  pushState(updateFooter(currentMenu, {
    left: footerLeftInput?.value ?? currentMenu.footer.left,
    right: footerRightInput?.value ?? currentMenu.footer.right,
    pfand: footerPfandInput?.value ?? currentMenu.footer.pfand,
  }));
}

function renderStructuredEditor() {
  if (!structuredRoot || !currentMenu) return;
  structuredRoot.innerHTML = '';

  currentMenu.sections.forEach((section, sectionIndex) => {
    const block = document.createElement('div');
    block.className = 'struct-section';

    const head = document.createElement('div');
    head.className = 'struct-section-head';

    const titleInput = document.createElement('input');
    titleInput.className = 'section-title-input';
    titleInput.value = section.title;
    titleInput.placeholder = 'Kategoriename';
    titleInput.addEventListener('change', () => {
      const nextTitle = titleInput.value.trim();
      if (!nextTitle) {
        titleInput.value = section.title;
        return;
      }
      if (nextTitle === section.title) return;
      pushState(updateSection(currentMenu, sectionIndex, { title: nextTitle }));
    });
    head.appendChild(titleInput);

    const tools = document.createElement('div');
    tools.className = 'section-tools';

    const moveGroup = document.createElement('div');
    moveGroup.className = 'section-tool-group';
    const moveLabel = document.createElement('span');
    moveLabel.className = 'tool-group-label';
    moveLabel.textContent = 'Reihenfolge';
    moveGroup.appendChild(moveLabel);
    moveGroup.appendChild(createMoveButtons({
      canUp: sectionIndex > 0,
      canDown: sectionIndex < currentMenu.sections.length - 1,
      onUp: () => pushState(moveSection(currentMenu, sectionIndex, sectionIndex - 1)),
      onDown: () => pushState(moveSection(currentMenu, sectionIndex, sectionIndex + 1)),
    }));
    tools.appendChild(moveGroup);

    const colGroup = document.createElement('div');
    colGroup.className = 'section-tool-group';
    colGroup.style.flex = '1';
    colGroup.style.minWidth = '160px';
    const colLabel = document.createElement('span');
    colLabel.className = 'tool-group-label';
    colLabel.textContent = 'Spalte';
    const colSelect = document.createElement('select');
    colSelect.className = 'column-select';
    colSelect.title = 'Spalte auf der Karte';
    colSelect.innerHTML = '<option value="left">Links</option><option value="right">Rechts</option>';
    colSelect.value = section.column;
    colSelect.addEventListener('change', () => {
      pushState(updateSection(currentMenu, sectionIndex, { column: /** @type {'left'|'right'} */ (colSelect.value) }));
    });
    colGroup.appendChild(colLabel);
    colGroup.appendChild(colSelect);
    tools.appendChild(colGroup);
    head.appendChild(tools);
    block.appendChild(head);

    section.items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'struct-row' + (item.spacer ? ' struct-row-spacer' : '');

      const fields = document.createElement('div');
      fields.className = 'struct-row-fields';

      const toolbar = document.createElement('div');
      toolbar.className = 'struct-row-toolbar';

      toolbar.appendChild(createMoveButtons({
        canUp: index > 0,
        canDown: index < section.items.length - 1,
        onUp: () => pushState(moveItem(currentMenu, sectionIndex, index, sectionIndex, index - 1)),
        onDown: () => pushState(moveItem(currentMenu, sectionIndex, index, sectionIndex, index + 1)),
      }));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-ghost btn-sm remove-btn';
      remove.textContent = 'Entfernen';
      remove.title = 'Zeile löschen';
      remove.addEventListener('click', () => {
        pushState(removeItemAt(currentMenu, section.title, index));
      });
      toolbar.appendChild(remove);

      if (item.spacer) {
        const label = document.createElement('span');
        label.className = 'spacer-label';
        label.textContent = 'Leerzeile';
        fields.appendChild(label);
        row.appendChild(fields);

        const spacerFlex = document.createElement('span');
        spacerFlex.className = 'toolbar-spacer';
        toolbar.appendChild(spacerFlex);
        toolbar.appendChild(createCategoryMoveSelect(sectionIndex, index));
        row.appendChild(toolbar);
        block.appendChild(row);
        return;
      }

      const name = document.createElement('textarea');
      name.className = 'name-input';
      name.rows = 1;
      name.value = item.name;
      name.placeholder = 'Getränkename';
      name.setAttribute('aria-label', 'Getränkename');
      name.addEventListener('change', () => {
        pushState(updateItem(currentMenu, section.title, index, { name: name.value }));
      });
      bindAutoResize(name);

      const price = document.createElement('input');
      price.value = item.price || '';
      price.placeholder = '€';
      price.className = 'price-input';
      price.setAttribute('aria-label', 'Preis');
      price.inputMode = 'decimal';
      price.disabled = !!item.note;
      price.addEventListener('change', () => {
        pushState(updateItem(currentMenu, section.title, index, { price: price.value }));
      });

      fields.appendChild(name);
      fields.appendChild(price);
      row.appendChild(fields);

      const noteBtn = document.createElement('button');
      noteBtn.type = 'button';
      noteBtn.className = 'btn btn-ghost btn-sm note-toggle' + (item.note ? ' is-active' : '');
      noteBtn.textContent = 'Hinweis';
      noteBtn.title = 'Als Hinweiszeile (klein, ohne Preis)';
      noteBtn.addEventListener('click', () => {
        const nextNote = !item.note;
        pushState(updateItem(currentMenu, section.title, index, {
          note: nextNote,
          price: nextNote ? '' : item.price || '0,00',
        }));
      });
      toolbar.appendChild(noteBtn);

      const toolbarFlex = document.createElement('span');
      toolbarFlex.className = 'toolbar-spacer';
      toolbar.appendChild(toolbarFlex);
      toolbar.appendChild(createCategoryMoveSelect(sectionIndex, index));
      row.appendChild(toolbar);
      block.appendChild(row);
    });

    const rowActions = document.createElement('div');
    rowActions.className = 'row-actions';

    const addRow = document.createElement('button');
    addRow.type = 'button';
    addRow.className = 'btn btn-secondary btn-sm add-row-btn';
    addRow.textContent = '+ Zeile';
    addRow.addEventListener('click', () => {
      pushState(addItemToSection(currentMenu, section.title, { name: 'Neu', price: '0,00' }));
    });

    const addSpacer = document.createElement('button');
    addSpacer.type = 'button';
    addSpacer.className = 'btn btn-ghost btn-sm add-row-btn';
    addSpacer.textContent = '+ Leerzeile';
    addSpacer.addEventListener('click', () => {
      pushState(addItemToSection(currentMenu, section.title, { spacer: true, name: '', price: '' }));
    });

    rowActions.appendChild(addRow);
    rowActions.appendChild(addSpacer);
    block.appendChild(rowActions);
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
  const canUndo = undoPointer > 0;
  const canRedo = redoStack.length > 0;
  if (undoBtn) undoBtn.disabled = !canUndo;
  if (redoBtn) redoBtn.disabled = !canRedo;
  if (headerUndoBtn) headerUndoBtn.disabled = !canUndo;
  if (headerRedoBtn) headerRedoBtn.disabled = !canRedo;
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

function updatePdfLiveLink() {
  if (!pdfLiveLink || !currentMenu?.meta?.updated) return;
  pdfLiveLink.href = `poolbar_getraenkekarte_2026.pdf?v=${currentMenu.meta.updated}`;
}

function downloadPdfPreview() {
  if (!currentMenu) return;
  try {
    sessionStorage.setItem(PRINT_MENU_KEY, JSON.stringify(currentMenu));
  } catch {
    setStatus('PDF-Vorschau nicht möglich (Speicher blockiert)', true);
    return;
  }
  window.open('print.html?preview=1&print=1', '_blank', 'noopener');
  setStatus('Druckdialog öffnet — „Als PDF speichern“ wählen');
}

async function publishMenu() {
  if (!currentMenu) return;
  const pat = getPat();
  if (!pat) {
    setStatus('GitHub PAT fehlt — Token einfügen, „PAT speichern“, dann erneut veröffentlichen', true);
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const historyPath = `data/history/menu-${stamp}.json`;
  const menuToPublish = cloneMenu(currentMenu);
  menuToPublish.meta = { ...menuToPublish.meta, updated: new Date().toISOString().slice(0, 10) };
  const menuJson = JSON.stringify(menuToPublish, null, 2);

  try {
    publishBtn.disabled = true;
    await validatePat(pat);
    storePat(pat);
    await upsertFile(pat, 'data/menu.json', menuJson, 'Karte aktualisiert');
    await upsertFile(pat, historyPath, menuJson, `Snapshot ${stamp}`, true);
    await appendHistoryIndex(pat, historyPath, stamp, menuToPublish.meta.updated);
    pushState(menuToPublish);
    setStatus('Veröffentlicht — Deploy läuft auf GitHub (~1–2 Min.)');
    await loadHistoryList();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    publishBtn.disabled = false;
  }
}

function readPatFromInput() {
  const raw = patInput?.value?.trim() || '';
  if (!raw || raw === '••••••••') return '';
  return raw;
}

function getPat() {
  const fromInput = readPatFromInput();
  if (fromInput) return fromInput;
  return sessionStorage.getItem(PAT_KEY)?.trim() || '';
}

function storePat(pat) {
  sessionStorage.setItem(PAT_KEY, pat.trim());
  if (patInput) patInput.value = '••••••••';
}

function clearPat() {
  sessionStorage.removeItem(PAT_KEY);
  if (patInput) patInput.value = '';
}

async function savePat() {
  const pat = readPatFromInput();
  if (!pat) {
    setStatus('GitHub PAT einfügen (ghp_… oder github_pat_…)', true);
    return;
  }
  try {
    savePatBtn.disabled = true;
    await validatePat(pat);
    storePat(pat);
    setStatus('PAT gespeichert und geprüft');
  } catch (err) {
    clearPat();
    setStatus(err.message, true);
  } finally {
    savePatBtn.disabled = false;
  }
}

async function validatePat(pat) {
  await githubApi(pat, '/user');
  try {
    await githubApi(pat, `/repos/${GITHUB_REPO}`);
  } catch (err) {
    if (String(err.message).includes('404')) {
      throw new Error(`Kein Zugriff auf ${GITHUB_REPO} — Repo im PAT freigeben`);
    }
    throw err;
  }
}

async function appendHistoryIndex(pat, path, stamp, updated) {
  let index = [];
  try {
    const existing = await githubGet(pat, HISTORY_INDEX_URL);
    index = JSON.parse(existing);
  } catch {
    index = [];
  }
  index.unshift({ path, stamp, at: new Date().toISOString(), updated: updated || null });
  index = index.slice(0, 50);
  await upsertFile(pat, HISTORY_INDEX_URL, JSON.stringify(index, null, 2), 'History-Index aktualisiert');
}

function formatVersionDate(iso) {
  if (!iso) return 'Unbekannt';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.replace('T', ' ').slice(0, 16);
  return new Intl.DateTimeFormat('de-AT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function updateVersionBadge() {
  if (!versionBadge) return;
  const updated = currentMenu?.meta?.updated;
  versionBadge.textContent = updated ? `Stand ${updated}` : '';
}

function renderVersionCurrent() {
  if (!versionCurrent) return;
  const updated = currentMenu?.meta?.updated;
  if (!updated) {
    versionCurrent.hidden = true;
    versionCurrent.innerHTML = '';
    return;
  }
  versionCurrent.hidden = false;
  versionCurrent.innerHTML = `
    <span class="version-current-label">Live auf der Website</span>
    <span class="version-current-date">${updated}</span>
  `;
}

async function loadHistoryList() {
  if (!historyList) return;
  historyList.innerHTML = '';

  const baselineBtn = document.createElement('button');
  baselineBtn.type = 'button';
  baselineBtn.className = 'version-row history-item history-item-baseline';
  baselineBtn.innerHTML = `
    <span class="version-row-main">
      <span class="version-label">Offizieller Tagesstand</span>
      <span class="version-meta muted">Baseline — Reset-Vorlage</span>
    </span>
    <span class="version-badge-pill">Baseline</span>
  `;
  baselineBtn.addEventListener('click', async () => {
    if (!confirm('Offiziellen Tagesstand (Baseline) laden?')) return;
    const menu = await loadMenu(BASELINE_URL);
    pushState(menu);
    setStatus('Baseline geladen');
  });
  historyList.appendChild(baselineBtn);

  try {
    const res = await fetch(HISTORY_INDEX_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('no index');
    const index = await res.json();
    if (!index.length) {
      const p = document.createElement('p');
      p.className = 'muted history-empty';
      p.textContent = 'Noch keine veröffentlichten Versionen — nach dem ersten Veröffentlichen erscheinen sie hier.';
      historyList.appendChild(p);
      return;
    }

    index.forEach((entry, indexPos) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'version-row history-item';
      const label = formatVersionDate(entry.at);
      const meta = entry.updated ? `Karte ${entry.updated}` : entry.stamp?.replace('T', ' ') || entry.path;
      const isLatest = indexPos === 0;
      btn.innerHTML = `
        <span class="version-row-main">
          <span class="version-label">${label}</span>
          <span class="version-meta muted">${meta}</span>
        </span>
        ${isLatest ? '<span class="version-badge-pill">Neueste</span>' : ''}
      `;
      btn.addEventListener('click', async () => {
        if (!confirm(`Stand vom ${label} laden?`)) return;
        try {
          const menu = await loadMenu(entry.path);
          pushState(menu);
          setStatus(`Version geladen: ${label}`);
        } catch (err) {
          setStatus(`Version konnte nicht geladen werden: ${err.message}`, true);
        }
      });
      historyList.appendChild(btn);
    });
  } catch {
    const p = document.createElement('p');
    p.className = 'muted history-empty';
    p.textContent = 'Noch keine veröffentlichten Versionen — nach dem ersten Veröffentlichen erscheinen sie hier.';
    historyList.appendChild(p);
  }
}

async function upsertFile(pat, path, content, message, createOnly = false) {
  let sha;
  if (!createOnly) {
    try {
      const meta = await githubApi(pat, repoContentsPath(path));
      sha = meta.sha;
    } catch (err) {
      const msg = String(err.message || '');
      if (!msg.includes('404') && !msg.toLowerCase().includes('not found')) {
        throw err;
      }
    }
  }
  const body = {
    message,
    content: toBase64(content),
  };
  if (sha) body.sha = sha;
  await githubApi(pat, repoContentsPath(path), 'PUT', body);
}

async function githubGet(pat, path) {
  const data = await githubApi(pat, repoContentsPath(path));
  const binary = atob(data.content.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** @param {string} filePath */
function repoContentsPath(filePath) {
  return `/repos/${GITHUB_REPO}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`;
}

async function githubApi(pat, path, method = 'GET', body) {
  const token = pat.trim();
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.message || `GitHub API ${res.status}`;
    if (res.status === 401) {
      clearPat();
      throw new Error('GitHub-Token ungültig oder abgelaufen. Neues PAT erstellen, speichern, erneut versuchen.');
    }
    if (res.status === 403) {
      throw new Error('Kein Schreibrecht — PAT braucht „Contents: Read and write“ für poolbar-karte-2026');
    }
    if (msg.includes('sha') && msg.toLowerCase().includes("wasn't supplied")) {
      throw new Error('GitHub-Update fehlgeschlagen (Datei-Konflikt). Seite neu laden und erneut veröffentlichen.');
    }
    throw new Error(msg);
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
  statusBar.classList.toggle('is-error', isError);
}

function bindAutoResize(textarea) {
  const resize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener('input', resize);
  requestAnimationFrame(resize);
}

function createMoveButtons(opts) {
  const wrap = document.createElement('div');
  wrap.className = 'move-btns';
  wrap.title = 'Reihenfolge ändern';

  const up = document.createElement('button');
  up.type = 'button';
  up.className = 'btn btn-ghost btn-icon move-btn';
  up.textContent = '↑';
  up.setAttribute('aria-label', 'Nach oben');
  up.title = 'Nach oben';
  up.disabled = !opts.canUp;
  up.addEventListener('click', opts.onUp);

  const down = document.createElement('button');
  down.type = 'button';
  down.className = 'btn btn-ghost btn-icon move-btn';
  down.textContent = '↓';
  down.setAttribute('aria-label', 'Nach unten');
  down.title = 'Nach unten';
  down.disabled = !opts.canDown;
  down.addEventListener('click', opts.onDown);

  wrap.appendChild(up);
  wrap.appendChild(down);
  return wrap;
}

/** @param {number} sectionIndex @param {number} itemIndex */
function createCategoryMoveSelect(sectionIndex, itemIndex) {
  const select = document.createElement('select');
  select.className = 'move-category-select';
  select.title = 'In andere Kategorie verschieben';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Verschieben…';
  select.appendChild(placeholder);

  if (!currentMenu) return select;

  currentMenu.sections.forEach((sec, targetIndex) => {
    if (targetIndex === sectionIndex) return;
    const opt = document.createElement('option');
    opt.value = String(targetIndex);
    opt.textContent = sec.title.length > 22 ? `${sec.title.slice(0, 20)}…` : sec.title;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    if (!currentMenu || !select.value) return;
    const targetIndex = Number(select.value);
    const targetSection = currentMenu.sections[targetIndex];
    if (!targetSection) return;
    pushState(moveItem(currentMenu, sectionIndex, itemIndex, targetIndex, targetSection.items.length));
    select.value = '';
  });

  return select;
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
