#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f data/menu.json ]]; then
  echo "data/menu.json fehlt" >&2
  exit 1
fi

STAMP="$(date -u +"%Y-%m-%dT%H%M")"
ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HISTORY="data/history/menu-${STAMP}.json"
cp data/menu.json "$HISTORY"

npm run build:pdf

python3 - "$HISTORY" "$STAMP" "$ISO" <<'PY'
import json, sys
from pathlib import Path
history_path, stamp, iso = sys.argv[1:4]
root = Path(".")
index_path = root / "data/history/index.json"
index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else []
index.insert(0, {"path": history_path, "stamp": stamp, "at": iso})
index_path.write_text(json.dumps(index[:50], ensure_ascii=False, indent=2), encoding="utf-8")
PY

git add data/menu.json "$HISTORY" data/history/index.json
git commit -m "Karte aktualisiert ($STAMP)"
git push origin main
echo "Veröffentlicht."
