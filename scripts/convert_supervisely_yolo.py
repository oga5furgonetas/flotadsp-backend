# -*- coding: utf-8 -*-
"""Convierte un dataset en formato Supervisely (ann/*.json con polígonos) al
formato YOLO-seg de Ultralytics (labels/*.txt + data.yaml + split train/val).

Uso:
    python convert_supervisely_yolo.py <dir_supervisely> <dir_salida> [val_frac]

<dir_supervisely> debe contener File1/ann/*.json y File1/img/*.
Cada línea YOLO-seg: <class_id> x1 y1 x2 y2 ... (coords normalizadas 0-1).

Notas:
- Solo objetos geometryType=polygon con ≥3 puntos.
- El tamaño de imagen sale del propio JSON (campo size) o de la imagen (PIL).
- Split determinista por hash del nombre (reproducible, sin azar).
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

from PIL import Image


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    val_frac = float(sys.argv[3]) if len(sys.argv) > 3 else 0.15

    ann_dir = src / "File1" / "ann"
    img_dir = src / "File1" / "img"
    if not ann_dir.is_dir() or not img_dir.is_dir():
        print(f"No encuentro {ann_dir} / {img_dir}")
        return 1

    # 1ª pasada: clases (orden alfabético = ids estables entre ejecuciones)
    classes = set()
    for f in ann_dir.glob("*.json"):
        try:
            j = json.loads(f.read_text(encoding="utf-8"))
            for o in j.get("objects", []):
                if o.get("geometryType") == "polygon":
                    classes.add(o.get("classTitle", "").strip())
        except Exception:
            continue
    classes = sorted(c for c in classes if c)
    cls_id = {c: i for i, c in enumerate(classes)}
    print(f"Clases ({len(classes)}): {classes}")

    for split in ("train", "val"):
        (out / "images" / split).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split).mkdir(parents=True, exist_ok=True)

    n_img = n_obj = n_skip = 0
    for ann in sorted(ann_dir.glob("*.json")):
        img_name = ann.name[:-5]  # quita ".json" → nombre real de la imagen
        img_path = img_dir / img_name
        if not img_path.exists():
            n_skip += 1
            continue
        try:
            j = json.loads(ann.read_text(encoding="utf-8"))
        except Exception:
            n_skip += 1
            continue

        size = j.get("size") or {}
        w, h = size.get("width"), size.get("height")
        if not w or not h:
            try:
                with Image.open(img_path) as im:
                    w, h = im.size
            except Exception:
                n_skip += 1
                continue

        lines = []
        for o in j.get("objects", []):
            if o.get("geometryType") != "polygon":
                continue
            pts = (o.get("points") or {}).get("exterior") or []
            if len(pts) < 3:
                continue
            cid = cls_id.get(o.get("classTitle", "").strip())
            if cid is None:
                continue
            coords = []
            for x, y in pts:
                coords.append(f"{min(max(x / w, 0), 1):.6f}")
                coords.append(f"{min(max(y / h, 0), 1):.6f}")
            lines.append(f"{cid} " + " ".join(coords))
            n_obj += 1
        if not lines:
            continue

        # Split determinista por hash del nombre
        split = "val" if int(hashlib.md5(img_name.encode()).hexdigest(), 16) % 100 < val_frac * 100 else "train"
        shutil.copy2(img_path, out / "images" / split / img_name)
        (out / "labels" / split / (Path(img_name).stem + ".txt")).write_text(
            "\n".join(lines), encoding="utf-8")
        n_img += 1

    yaml = out / "data.yaml"
    yaml.write_text(
        f"path: {out.resolve().as_posix()}\n"
        "train: images/train\nval: images/val\n"
        f"names:\n" + "".join(f"  {i}: {c}\n" for i, c in enumerate(classes)),
        encoding="utf-8")

    tr = len(list((out / "images" / "train").iterdir()))
    va = len(list((out / "images" / "val").iterdir()))
    print(f"OK: {n_img} imágenes ({tr} train / {va} val), {n_obj} polígonos, {n_skip} saltadas")
    print(f"data.yaml → {yaml}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
