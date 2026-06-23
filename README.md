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
- **Veröffentlichen:** GitHub PAT (repo Contents write) in Admin speichern, oder lokal `./scripts/publish-menu.sh`

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
