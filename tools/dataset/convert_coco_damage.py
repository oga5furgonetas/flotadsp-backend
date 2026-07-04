"""Convierte CUALQUIER dataset COCO de daños (CarDD, Roboflow…) a nuestro layout.

Uso:
  python convert_coco_damage.py --coco annotations.json --images ./imgs \
      --out data/cardd --source cardd [--exclude-classes tire_flat]

Todas las categorías se colapsan a la clase única 0=damage (ver README:
la pieza la da la geometría de la app; el modelo solo aprende DÓNDE hay daño).
Prioriza máscaras de segmentación; si solo hay bbox, la convierte a polígono.
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


def seg_to_yolo(seg, w, h) -> str | None:
    """Segmentación COCO (lista plana [x1,y1,x2,y2…] en píxeles) → línea YOLO-seg."""
    if not seg or not isinstance(seg, list):
        return None
    flat = seg[0] if seg and isinstance(seg[0], list) else seg
    if not isinstance(flat, list) or len(flat) < 6:
        return None
    coords = []
    for i in range(0, len(flat) - 1, 2):
        x, y = float(flat[i]), float(flat[i + 1])
        coords += [max(0.0, min(1.0, x / w)), max(0.0, min(1.0, y / h))]
    return "0 " + " ".join(f"{c:.5f}" for c in coords)


def bbox_to_yolo(bbox, w, h) -> str | None:
    """bbox COCO [x,y,ancho,alto] px → polígono rectangular YOLO-seg."""
    if not bbox or len(bbox) != 4:
        return None
    x, y, bw, bh = map(float, bbox)
    pts = [(x, y), (x + bw, y), (x + bw, y + bh), (x, y + bh)]
    coords = []
    for px, py in pts:
        coords += [max(0.0, min(1.0, px / w)), max(0.0, min(1.0, py / h))]
    return "0 " + " ".join(f"{c:.5f}" for c in coords)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--coco", required=True)
    ap.add_argument("--images", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--source", required=True, help="prefijo/atribución (ej: cardd)")
    ap.add_argument("--exclude-classes", nargs="*", default=[])
    args = ap.parse_args()

    coco = json.loads(Path(args.coco).read_text(encoding="utf-8"))
    img_dir = Path(args.images)
    out = Path(args.out)
    (out / "images").mkdir(parents=True, exist_ok=True)
    (out / "labels").mkdir(parents=True, exist_ok=True)

    excluded = {c["id"] for c in coco.get("categories", [])
                if c.get("name") in set(args.exclude_classes)}
    imgs = {im["id"]: im for im in coco["images"]}
    per_img: dict = {}
    for a in coco.get("annotations", []):
        if a.get("category_id") in excluded:
            continue
        per_img.setdefault(a["image_id"], []).append(a)

    n_ok = n_miss = 0
    for img_id, anns in per_img.items():
        im = imgs.get(img_id)
        if not im:
            continue
        src = img_dir / im["file_name"]
        if not src.exists():
            # Roboflow a veces exporta con subcarpetas
            candidates = list(img_dir.rglob(Path(im["file_name"]).name))
            if not candidates:
                n_miss += 1
                continue
            src = candidates[0]
        w, h = im.get("width"), im.get("height")
        if not (w and h):
            n_miss += 1
            continue
        lines = []
        for a in anns:
            line = seg_to_yolo(a.get("segmentation"), w, h) or bbox_to_yolo(a.get("bbox"), w, h)
            if line:
                lines.append(line)
        if not lines:
            continue
        stem = f"{args.source}_{img_id}"
        ext = src.suffix.lower() if src.suffix.lower() in (".jpg", ".jpeg", ".png") else ".jpg"
        shutil.copyfile(src, out / "images" / f"{stem}{ext}")
        (out / "labels" / f"{stem}.txt").write_text("\n".join(lines), encoding="utf-8")
        n_ok += 1

    (out / "manifest.json").write_text(json.dumps({
        "source": args.source, "license_note":
            "VERIFICA la licencia de esta fuente antes de entrenar para uso comercial "
            "(CarDD: formulario firmado; Roboflow: la de cada dataset, CC BY 4.0 = OK con atribución).",
        "images": n_ok,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"LISTO → {out}  ·  {n_ok} imágenes convertidas, {n_miss} sin archivo/medidas")


if __name__ == "__main__":
    main()
