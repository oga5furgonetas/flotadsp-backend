"""Convierte un dataset Supervisely de daños al layout YOLO-seg unificado.

Uso:
  python convert_supervisely_damage.py --src <carpeta con ann/ img/> \
      --out data/drbimmer --source drbimmer

Cada objeto poligonal de cualquier clase de daño → clase única 0=damage
(misma decisión que el resto de la tubería; ver README.md).
Formato Supervisely: ann/<imagen>.json con {size:{width,height},
objects:[{classTitle, points:{exterior:[[x,y],...]}}]}.
"""
from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import argparse
import json
import shutil
from pathlib import Path

IMG_EXTS = (".jpg", ".jpeg", ".png")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="carpeta con ann/ e img/")
    ap.add_argument("--out", required=True)
    ap.add_argument("--source", required=True)
    ap.add_argument("--min-points", type=int, default=3)
    args = ap.parse_args()

    src = Path(args.src)
    out = Path(args.out)
    (out / "images").mkdir(parents=True, exist_ok=True)
    (out / "labels").mkdir(parents=True, exist_ok=True)

    n_ok = n_empty = n_bad = 0
    class_counts: dict = {}
    for annf in sorted((src / "ann").glob("*.json")):
        try:
            a = json.loads(annf.read_text(encoding="utf-8"))
        except Exception:
            n_bad += 1
            continue
        w = (a.get("size") or {}).get("width")
        h = (a.get("size") or {}).get("height")
        if not (w and h):
            n_bad += 1
            continue

        lines = []
        for obj in a.get("objects", []):
            pts = ((obj.get("points") or {}).get("exterior")) or []
            if len(pts) < args.min_points:
                continue
            coords = []
            for p in pts:
                x, y = float(p[0]), float(p[1])
                coords += [max(0.0, min(1.0, x / w)), max(0.0, min(1.0, y / h))]
            lines.append("0 " + " ".join(f"{c:.5f}" for c in coords))
            ct = obj.get("classTitle", "?")
            class_counts[ct] = class_counts.get(ct, 0) + 1
        if not lines:
            n_empty += 1
            continue

        # imagen asociada: ann/X.json ↔ img/X (el .json va sobre el nombre completo)
        img_name = annf.name[:-5]  # quita .json
        img_src = src / "img" / img_name
        if not img_src.exists() or img_src.suffix.lower() not in IMG_EXTS:
            n_bad += 1
            continue
        stem = f"{args.source}_{n_ok:05d}"
        shutil.copyfile(img_src, out / "images" / f"{stem}{img_src.suffix.lower()}")
        (out / "labels" / f"{stem}.txt").write_text("\n".join(lines), encoding="utf-8")
        n_ok += 1

    (out / "manifest.json").write_text(json.dumps({
        "source": args.source,
        "license": "MIT (DrBimmer/car-parts-and-damage-dataset, HuggingFace)",
        "images": n_ok, "instances_por_clase_original": class_counts,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"LISTO -> {out}  ·  {n_ok} imágenes, {n_empty} sin objetos, {n_bad} inválidas")
    print("Instancias por clase original:", json.dumps(class_counts, ensure_ascii=False))


if __name__ == "__main__":
    main()
