"""Descarga NUESTRO dataset (feedback humano) y lo convierte a YOLO-seg.

Uso:
  python fetch_own_dataset.py --api https://flotadsp-backend.fly.dev/api \
      --token <TOKEN_ADMIN> --out data/propio

Salida (layout YOLO-seg, clase única 0=damage):
  out/images/*.jpg           fotos descargadas
  out/labels/*.txt           "0 x1 y1 x2 y2 ..." (polígono normalizado) o vacío (negativo)
  out/manifest.json          trazabilidad: origen de cada imagen

Reglas de calidad (perfeccionar, no empeorar):
- POSITIVOS: verdicts correct / corrected / missed con geometría válida.
  Preferencia: polígono corregido > polígono IA > caja (convertida a polígono).
- NEGATIVOS DUROS: imágenes cuyos verdicts son TODOS 'wrong' (reflejos/sombras
  que un humano rechazó) → label vacío. Si una imagen mezcla daños reales y
  falsos positivos, se conservan solo los reales (nunca negativo puro).
"""
from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import argparse
import hashlib
import json
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Falta requests:  pip install requests")

VALID_POS = {"correct", "corrected", "missed"}


def box_to_poly(box):
    """[ymin,xmin,ymax,xmax] 0-1000 → polígono rectangular [[y,x]×4]."""
    y1, x1, y2, x2 = box
    return [[y1, x1], [y1, x2], [y2, x2], [y2, x1]]


def poly_to_yolo(points) -> str | None:
    """[[y,x] 0-1000 …] → '0 x1 y1 x2 y2 …' normalizado 0-1 (YOLO-seg)."""
    if not points or len(points) < 3:
        return None
    coords = []
    for p in points:
        if not (isinstance(p, (list, tuple)) and len(p) == 2):
            return None
        y, x = float(p[0]), float(p[1])
        coords += [max(0.0, min(1.0, x / 1000.0)), max(0.0, min(1.0, y / 1000.0))]
    return "0 " + " ".join(f"{c:.5f}" for c in coords)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True)
    ap.add_argument("--token", required=True)
    ap.add_argument("--out", default="data/propio")
    args = ap.parse_args()

    out = Path(args.out)
    (out / "images").mkdir(parents=True, exist_ok=True)
    (out / "labels").mkdir(parents=True, exist_ok=True)

    print("Descargando export del feedback humano…")
    r = requests.get(f"{args.api}/ai-dataset/export",
                     headers={"Authorization": f"Bearer {args.token}"}, timeout=120)
    r.raise_for_status()
    data = r.json()
    print(f"  {data['counts']['annotations']} anotaciones, "
          f"{data['counts']['images']} imágenes, por veredicto: {data['counts']['by_verdict']}")

    # Agrupar anotaciones por imagen
    by_image: dict[int, list] = {}
    for a in data["annotations"]:
        by_image.setdefault(a["image_id"], []).append(a)
    url_of = {img["id"]: img["file_name"] for img in data["images"]}

    manifest, n_pos, n_neg, n_skip = [], 0, 0, 0
    for img_id, anns in by_image.items():
        url = url_of.get(img_id)
        if not url:
            continue
        lines = []
        for a in anns:
            if a.get("verdict") not in VALID_POS:
                continue
            pts = a.get("polygon_points") or (box_to_poly(a["box_2d"]) if a.get("box_2d") else None)
            line = poly_to_yolo(pts) if pts else None
            if line:
                lines.append(line)
        all_wrong = all(a.get("verdict") == "wrong" for a in anns)
        if not lines and not all_wrong:
            n_skip += 1
            continue  # sin geometría útil y no es negativo puro → fuera

        stem = "own_" + hashlib.sha1(url.encode()).hexdigest()[:16]
        img_path = out / "images" / f"{stem}.jpg"
        if not img_path.exists():
            try:
                ir = requests.get(url, timeout=30)
                ir.raise_for_status()
                img_path.write_bytes(ir.content)
            except Exception as e:
                print(f"  ⚠ foto inaccesible ({e}): {url[:80]}")
                continue
        (out / "labels" / f"{stem}.txt").write_text("\n".join(lines), encoding="utf-8")
        manifest.append({"file": f"{stem}.jpg", "source_url": url,
                         "positives": len(lines), "hard_negative": bool(not lines)})
        n_pos += 1 if lines else 0
        n_neg += 0 if lines else 1

    (out / "manifest.json").write_text(
        json.dumps({"source": "flotadsp-own", "images": manifest}, ensure_ascii=False, indent=1),
        encoding="utf-8")
    print(f"LISTO → {out}  ·  {n_pos} imágenes con daño, {n_neg} negativos duros, {n_skip} descartadas")


if __name__ == "__main__":
    main()
