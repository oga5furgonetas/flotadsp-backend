"""Descarga un dataset Supervisely alojado en HuggingFace (anónimo, stdlib puro).

Uso:
  python fetch_hf_supervisely.py --repo DrBimmer/car-parts-and-damage-dataset \
      --folder "Car parts dataset/File1" --out <destino>

Baja ann/*.json + img/* con reintentos. Pensado para el dataset de daños
DrBimmer (licencia MIT — uso comercial permitido).
"""
from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://huggingface.co"


def http_json(url: str):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def download(url: str, dest: Path, tries: int = 3) -> bool:
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r:
                dest.write_bytes(r.read())
            return True
        except Exception as e:
            if i == tries - 1:
                print(f"  FALLO {dest.name}: {e}")
                return False
            time.sleep(2 * (i + 1))
    return False


def list_files(repo: str, path: str):
    q = urllib.parse.quote(path)
    out, cursor = [], None
    while True:
        url = f"{BASE}/api/datasets/{repo}/tree/main/{q}?limit=1000"
        if cursor:
            url += f"&cursor={urllib.parse.quote(cursor)}"
        data = http_json(url)
        if not data:
            break
        out += [f for f in data if f.get("type") == "file"]
        if len(data) < 1000:
            break
        cursor = data[-1]["path"]  # paginación simple
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--folder", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    out = Path(args.out)
    for sub in ("ann", "img"):
        (out / sub).mkdir(parents=True, exist_ok=True)

    # meta.json (clases) vive un nivel por encima de File1
    meta_path = args.folder.rsplit("/", 1)[0] + "/meta.json"
    murl = f"{BASE}/datasets/{args.repo}/resolve/main/{urllib.parse.quote(meta_path)}"
    download(murl, out / "meta.json")

    total_ok = 0
    for sub in ("ann", "img"):
        files = list_files(args.repo, f"{args.folder}/{sub}")
        print(f"{sub}: {len(files)} archivos por bajar")
        for i, f in enumerate(files, 1):
            name = f["path"].split("/")[-1]
            dest = out / sub / name
            if dest.exists() and dest.stat().st_size == f.get("size", -1):
                total_ok += 1
                continue
            url = f"{BASE}/datasets/{args.repo}/resolve/main/{urllib.parse.quote(f['path'])}"
            if download(url, dest):
                total_ok += 1
            if i % 50 == 0:
                print(f"  {sub}: {i}/{len(files)}")
    print(f"DESCARGA COMPLETA -> {out}  ({total_ok} archivos)")


if __name__ == "__main__":
    main()
