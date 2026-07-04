"""Fusiona datasets preparados en un dataset final de entrenamiento YOLO-seg.

Uso:
  python merge_datasets.py --own data/propio --extra data/cardd data/roboflow_x \
      --out data/final [--val-ratio 0.2]

REGLA DE ORO (perfeccionar, no empeorar):
  · train = nuestro propio (80%) + TODOS los externos
  · val   = SOLO nuestro propio (20%) — las métricas se miden en NUESTRA flota.
    Si añadir un externo no mejora val, ese externo no aporta y se quita.
"""
from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import argparse
import json
import random
import shutil
from pathlib import Path

IMG_EXTS = (".jpg", ".jpeg", ".png")


def collect(folder: Path):
    pairs = []
    for img in sorted((folder / "images").iterdir()):
        if img.suffix.lower() not in IMG_EXTS:
            continue
        lbl = folder / "labels" / (img.stem + ".txt")
        if lbl.exists():
            pairs.append((img, lbl))
    return pairs


def place(pairs, out: Path, split: str):
    for img, lbl in pairs:
        shutil.copyfile(img, out / "images" / split / img.name)
        shutil.copyfile(lbl, out / "labels" / split / lbl.name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--own", required=True)
    ap.add_argument("--extra", nargs="*", default=[])
    ap.add_argument("--out", required=True)
    ap.add_argument("--val-ratio", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    out = Path(args.out)
    for split in ("train", "val"):
        (out / "images" / split).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split).mkdir(parents=True, exist_ok=True)

    own = collect(Path(args.own))
    if len(own) < 20:
        print(f"⚠ AVISO: solo {len(own)} imágenes propias — la validación será poco fiable. "
              "Sigue validando en Revisión Rápida antes de entrenar en serio.")
    random.Random(args.seed).shuffle(own)
    n_val = max(5, int(len(own) * args.val_ratio)) if own else 0
    val_own, train_own = own[:n_val], own[n_val:]
    place(train_own, out, "train")
    place(val_own, out, "val")

    extra_counts = {}
    for ex in args.extra:
        pairs = collect(Path(ex))
        place(pairs, out, "train")            # externos: SOLO train, jamás val
        extra_counts[Path(ex).name] = len(pairs)

    (out / "data.yaml").write_text(
        f"path: {out.resolve().as_posix()}\n"
        "train: images/train\nval: images/val\n"
        "names:\n  0: damage\n", encoding="utf-8")

    stats = {
        "train_own": len(train_own), "val_own_ONLY": len(val_own),
        "train_extra": extra_counts,
        "regla": "val contiene SOLO datos propios; si un externo no mejora val, se quita",
    }
    (out / "merge_stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print("LISTO →", out)
    print(json.dumps(stats, ensure_ascii=False, indent=1))
    print("\nEntrenar:  yolo segment train model=yolo11s-seg.pt data="
          f"{(out / 'data.yaml').as_posix()} imgsz=1024 epochs=120 batch=16 patience=25")


if __name__ == "__main__":
    main()
