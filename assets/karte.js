/** @typedef {{ name: string, price?: string, note?: boolean }} MenuItem */
/** @typedef {{ title: string, column: 'left'|'right', items: MenuItem[] }} MenuSection */
/** @typedef {{ meta: object, logoSvg: string, headerRight: string, footer: { left: string, right: string, pfand: string }, sections: MenuSection[] }} MenuData */

/**
 * @param {MenuItem} item
 * @returns {HTMLDivElement}
 */
function createRow(item) {
  const row = document.createElement('div');
  row.className = 'row';
  if (item.note) row.style.marginTop = '3px';

  const name = document.createElement('span');
  name.className = 'row-name' + (item.note ? ' note' : '');
  name.textContent = item.name;

  row.appendChild(name);
  if (item.price) {
    const price = document.createElement('span');
    price.className = 'row-price';
    price.textContent = item.price;
    row.appendChild(price);
  }
  return row;
}

/**
 * @param {MenuSection} section
 * @returns {HTMLDivElement}
 */
function createSection(section) {
  const el = document.createElement('div');
  el.className = 'section';
  el.dataset.sectionTitle = section.title;

  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = section.title;
  el.appendChild(title);

  section.items.forEach((item) => el.appendChild(createRow(item)));
  return el;
}

/**
 * @param {MenuData} menu
 * @param {HTMLElement} container
 */
export function renderKarte(menu, container) {
  container.innerHTML = '';

  const karte = document.createElement('div');
  karte.className = 'karte';

  const header = document.createElement('div');
  header.className = 'header';
  header.innerHTML = menu.logoSvg;
  const headerRight = document.createElement('span');
  headerRight.className = 'header-right';
  headerRight.textContent = menu.headerRight;
  header.appendChild(headerRight);
  karte.appendChild(header);

  const cols = document.createElement('div');
  cols.className = 'zwei-spalten';
  const left = document.createElement('div');
  const right = document.createElement('div');

  menu.sections.forEach((section) => {
    const node = createSection(section);
    if (section.column === 'right') right.appendChild(node);
    else left.appendChild(node);
  });

  cols.appendChild(left);
  cols.appendChild(right);
  karte.appendChild(cols);

  const footer = document.createElement('div');
  footer.className = 'footer';
  const footerLeft = document.createElement('span');
  footerLeft.textContent = menu.footer.left;
  const footerRight = document.createElement('span');
  footerRight.textContent = menu.footer.right;
  footer.appendChild(footerLeft);
  footer.appendChild(footerRight);
  karte.appendChild(footer);

  const pfand = document.createElement('div');
  pfand.className = 'pfand';
  pfand.textContent = menu.footer.pfand;
  karte.appendChild(pfand);

  container.appendChild(karte);
  const sheet = container.closest('.a4-sheet');
  if (sheet) schedulePreviewFit(sheet);
}

let fitListenersBound = false;

function schedulePreviewFit(sheet) {
  requestAnimationFrame(() => {
    document.fonts.ready.then(() => fitKartePreview(sheet));
  });
}

/**
 * Skaliert die Karte in der Screen-Vorschau auf die A4-Innenfläche (wie PDF).
 * @param {HTMLElement} sheet
 */
export function fitKartePreview(sheet) {
  if (window.matchMedia('print').matches) return;

  const inner = sheet.querySelector('.a4-inner') || sheet;
  const karte = inner.querySelector('.karte');
  if (!karte) return;

  karte.style.width = '190mm';
  karte.style.transform = 'none';
  karte.style.marginLeft = '0';

  const innerW = inner.clientWidth;
  const innerH = inner.clientHeight;
  const karteW = karte.offsetWidth;
  const karteH = karte.offsetHeight;
  if (!innerW || !innerH || !karteW || !karteH) return;

  const scale = Math.min(innerW / karteW, innerH / karteH);
  karte.style.transformOrigin = 'top left';
  karte.style.transform = `scale(${scale})`;
  karte.style.marginLeft = `${(innerW - karteW * scale) / 2}px`;

  if (!fitListenersBound) {
    fitListenersBound = true;
    window.addEventListener('resize', () => {
      document.querySelectorAll('.a4-sheet').forEach((el) => fitKartePreview(el));
    });
  }
}

/**
 * @param {string} url
 * @returns {Promise<MenuData>}
 */
export async function loadMenu(url = 'data/menu.json') {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Menü konnte nicht geladen werden');
  return res.json();
}

/**
 * @param {MenuData} menu
 * @returns {MenuData}
 */
export function cloneMenu(menu) {
  return structuredClone(menu);
}
