/**
 * Freitext-Parser für Kartenänderungen.
 * @param {import('./karte.js').MenuData} menu
 * @param {string} text
 * @returns {{ menu: import('./karte.js').MenuData, messages: string[] }}
 */
export function applyFreetext(menu, text) {
  const result = structuredClone(menu);
  const messages = [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const removeMatch = line.match(/^(?:entferne|ohne)\s+(.+)$/i) || line.match(/^(.+?)\s+weg$/i);
    if (removeMatch) {
      const query = removeMatch[1].trim();
      const hits = findItems(result, query);
      if (hits.length === 0) messages.push(`Nicht gefunden: „${query}"`);
      else if (hits.length > 1) messages.push(`Mehrdeutig „${query}": ${hits.map((h) => h.item.name).join(', ')}`);
      else {
        removeItem(result, hits[0]);
        messages.push(`Entfernt: ${hits[0].item.name}`);
      }
      continue;
    }

    const addSectionMatch = line.match(/^neu in (.+?):\s*(.+?)\s+(\d+[,.]\d+)\s*$/i);
    if (addSectionMatch) {
      const sectionTitle = addSectionMatch[1].trim();
      const name = addSectionMatch[2].trim();
      const price = addSectionMatch[3].replace('.', ',');
      const section = findSection(result, sectionTitle);
      if (!section) messages.push(`Sektion nicht gefunden: „${sectionTitle}"`);
      else {
        section.items.push({ name, price });
        messages.push(`Hinzugefügt in ${section.title}: ${name}`);
      }
      continue;
    }

    const addMatch = line.match(/^(.+?)\s+(\d+[,.]\d+)\s+dazu\s*$/i);
    if (addMatch) {
      const name = addMatch[1].trim();
      const price = addMatch[2].replace('.', ',');
      const last = result.sections[result.sections.length - 1];
      if (!last) messages.push('Keine Sektion vorhanden');
      else {
        last.items.push({ name, price });
        messages.push(`Hinzugefügt in ${last.title}: ${name}`);
      }
      continue;
    }

    messages.push(`Nicht erkannt: „${line}"`);
  }

  return { menu: result, messages };
}

/**
 * @param {import('./karte.js').MenuData} menu
 * @param {string} query
 */
function findItems(menu, query) {
  const q = query.toLowerCase();
  /** @type {{ section: import('./karte.js').MenuSection, item: import('./karte.js').MenuItem, index: number }[]} */
  const hits = [];
  menu.sections.forEach((section) => {
    section.items.forEach((item, index) => {
      if (item.name.toLowerCase().includes(q)) hits.push({ section, item, index });
    });
  });
  return hits;
}

/**
 * @param {import('./karte.js').MenuData} menu
 * @param {string} query
 */
function findSection(menu, query) {
  const q = query.toLowerCase();
  return menu.sections.find((s) => s.title.toLowerCase().includes(q));
}

/**
 * @param {import('./karte.js').MenuData} menu
 * @param {{ section: import('./karte.js').MenuSection, index: number }} hit
 */
function removeItem(menu, hit) {
  hit.section.items.splice(hit.index, 1);
  if (hit.section.items.length === 0) {
    menu.sections = menu.sections.filter((s) => s !== hit.section);
  }
}

/**
 * @param {import('./karte.js').MenuData} menu
 * @param {string} sectionTitle
 * @param {number} itemIndex
 */
export function removeItemAt(menu, sectionTitle, itemIndex) {
  const section = menu.sections.find((s) => s.title === sectionTitle);
  if (!section) return menu;
  const next = structuredClone(menu);
  const sec = next.sections.find((s) => s.title === sectionTitle);
  if (!sec) return next;
  sec.items.splice(itemIndex, 1);
  if (sec.items.length === 0) next.sections = next.sections.filter((s) => s.title !== sectionTitle);
  return next;
}

/**
 * @param {import('./karte.js').MenuData} menu
 * @param {string} sectionTitle
 * @param {{ name: string, price?: string, note?: boolean }} item
 */
export function addItemToSection(menu, sectionTitle, item) {
  const next = structuredClone(menu);
  const sec = next.sections.find((s) => s.title === sectionTitle);
  if (!sec) return next;
  sec.items.push(item);
  return next;
}

/**
 * @param {import('./karte.js').MenuData} menu
 * @param {string} sectionTitle
 * @param {number} itemIndex
 * @param {{ name?: string, price?: string, note?: boolean, spacer?: boolean }} patch
 */
export function updateItem(menu, sectionTitle, itemIndex, patch) {
  const next = structuredClone(menu);
  const sec = next.sections.find((s) => s.title === sectionTitle);
  if (!sec || !sec.items[itemIndex]) return next;
  Object.assign(sec.items[itemIndex], patch);
  if (patch.note) {
    sec.items[itemIndex].price = '';
    sec.items[itemIndex].spacer = false;
  }
  if (patch.spacer) {
    sec.items[itemIndex].name = '';
    sec.items[itemIndex].price = '';
    sec.items[itemIndex].note = false;
  }
  return next;
}

/**
 * @param {import('./karte.js').MenuData} menu
 * @param {{ left?: string, right?: string, pfand?: string }} patch
 */
export function updateFooter(menu, patch) {
  const next = structuredClone(menu);
  Object.assign(next.footer, patch);
  return next;
}

/**
 * @param {import('./karte.js').MenuData} menu
 * @param {number} fromIndex
 * @param {number} toIndex
 */
export function moveSection(menu, fromIndex, toIndex) {
  const next = structuredClone(menu);
  if (fromIndex === toIndex) return next;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= next.sections.length || toIndex >= next.sections.length) return next;
  const [section] = next.sections.splice(fromIndex, 1);
  next.sections.splice(toIndex, 0, section);
  return next;
}

/**
 * @param {import('./karte.js').MenuData} menu
 * @param {string} sectionTitle
 * @param {number} fromIndex
 * @param {number} toIndex
 */
export function moveItemInSection(menu, sectionTitle, fromIndex, toIndex) {
  const next = structuredClone(menu);
  const sec = next.sections.find((s) => s.title === sectionTitle);
  if (!sec || fromIndex === toIndex) return next;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= sec.items.length || toIndex >= sec.items.length) return next;
  const [item] = sec.items.splice(fromIndex, 1);
  sec.items.splice(toIndex, 0, item);
  return next;
}

/**
 * @param {import('./karte.js').MenuData} menu
 * @param {number} sectionIndex
 * @param {{ title?: string, column?: 'left'|'right' }} patch
 */
export function updateSection(menu, sectionIndex, patch) {
  const next = structuredClone(menu);
  if (!next.sections[sectionIndex]) return next;
  Object.assign(next.sections[sectionIndex], patch);
  return next;
}
