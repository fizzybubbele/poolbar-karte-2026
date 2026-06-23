# Poolbar Getränkekarte 2026

## Live

- **Karte:** https://fizzybubbele.github.io/poolbar-karte-2026/
- **PDF:** https://fizzybubbele.github.io/poolbar-karte-2026/poolbar_getraenkekarte_2026.pdf
- **Admin:** https://fizzybubbele.github.io/poolbar-karte-2026/admin.html

## Admin-Editor

Passwort (Standard): `poolbar2026` — bitte nach Ersteinrichtung ändern (Hash in `assets/admin-config.js`).

### Funktionen

- **Freitext:** z. B. `Radler weg`, `Aperol Spritz 8,50 dazu`, `neu in Beefeater Gin: Pink Gin 8,90`
- **Karte bearbeiten:** Namen/Preise, ↑↓ verschieben, Enter für Zeilenumbrüche, Leer- und Hinweiszeilen
- **Fußzeile:** Texte links/rechts/Pfand — Enter für Zeilenumbrüche
- **Verlauf:** Rückgängig/Wiederholen + gespeicherte Snapshots
- **Reset:** lädt `data/baseline/menu.json` (offizieller Tagesstand)
- **Veröffentlichen:** GitHub PAT mit **Contents: Read and write** auf `fizzybubbele/poolbar-karte-2026` — im Admin einfügen, **PAT speichern** (testet Token), dann **Veröffentlichen**. Alternativ lokal: `./scripts/publish-menu.sh`

### GitHub PAT anlegen

1. https://github.com/settings/tokens → **Fine-grained token** (empfohlen) oder Classic
2. Repository: **fizzybubbele/poolbar-karte-2026**
3. Permission: **Contents → Read and write**
4. Token kopieren (`ghp_…` oder `github_pat_…`), im Admin einfügen → **PAT speichern**

Bei **Bad credentials**: Token abgelaufen oder falsch — neues PAT, **PAT löschen**, neu speichern.

### Passwort ändern

```bash
python3 -c "import hashlib; print(hashlib.sha256(b'NEUES_PASSWORT').hexdigest())"
```

Hash in `assets/admin-config.js` → `ADMIN_PASSWORD_HASH` ersetzen.

## Daten

| Datei | Zweck |
|-------|--------|
| `data/baseline/menu.json` | Offizieller Tagesstand (Reset) |
| `data/menu.json` | Live-Stand auf der Website |
| `data/history/` | Snapshots bei Veröffentlichung |

## Lokal PDF bauen

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --run-all-compositor-stages-before-draw \
  --print-to-pdf=poolbar_getraenkekarte_2026.pdf \
  "file://$(pwd)/print.html"
```
