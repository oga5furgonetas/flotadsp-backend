# -*- coding: utf-8 -*-
"""Construye el dataset UNIFICADO del detector de daños v2 (plan IA, etapa C):
CarDD (FiftyOne, máscaras binarias) + DrBimmer (Supervisely, polígonos)
→ YOLO-seg con 10 clases unificadas y split train/val determinista.

Uso:  python build_damage_v2.py
Salida: C:\\Users\\Usuario\\datasets\\flotadsp_damage_v2
"""
import base64
import hashlib
import io
import json
import shutil
import zlib
from pathlib import Path

import cv2
import numpy as np

CARDD = Path(r"C:\Users\Usuario\CarDD")
BIMMER = Path(r"C:\Users\Usuario\car-parts-and-damage-dataset\Car parts dataset\File1")
OUT = Path(r"C:\Users\Usuario\datasets\flotadsp_damage_v2")
VAL_FRAC = 0.15

# Esquema unificado v2 (10 clases)
CLASSES = ["scratch", "dent", "crack", "glass_shatter", "lamp_broken",
           "tire_flat", "broken_part", "missing_part", "paint_chip", "corrosion"]
CID = {c: i for i, c in enumerate(CLASSES)}

MAP_CARDD = {"scratch": "scratch", "dent": "dent", "crack": "crack",
             "glass shatter": "glass_shatter", "lamp broken": "lamp_broken",
             "tire flat": "tire_flat"}
# Flaking (descamación) se funde con paint_chip: misma reparación, más datos/clase.
MAP_BIMMER = {"Scratch": "scratch", "Dent": "dent", "Cracked": "crack",
              "Broken part": "broken_part", "Missing part": "missing_part",
              "Paint chip": "paint_chip", "Flaking": "paint_chip",
              "Corrosion": "corrosion"}


def split_of(name: str) -> str:
    return "val" if int(hashlib.md5(name.encode()).hexdigest(), 16) % 100 < VAL_FRAC * 100 else "train"


def write_sample(img_src: Path, uniq_name: str, lines: list, stats: dict):
    if not lines:
        return
    sp = split_of(uniq_name)
    shutil.copy2(img_src, OUT / "images" / sp / uniq_name)
    (OUT / "labels" / sp / (Path(uniq_name).stem + ".txt")).write_text(
        "\n".join(lines), encoding="utf-8")
    stats[sp] = stats.get(sp, 0) + 1


def decode_fo_mask(b64: str):
    """Máscara de FiftyOne: base64 → zlib → .npy → array booleano 2D."""
    raw = zlib.decompress(base64.b64decode(b64))
    return np.load(io.BytesIO(raw), allow_pickle=False)


def mask_to_polys(mask: np.ndarray, min_area_px: int = 12):
    """Contornos del daño dentro de su bbox → lista de polígonos (coords de máscara)."""
    m = (mask.astype(np.uint8)) * 255
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for c in contours:
        if cv2.contourArea(c) < min_area_px:
            continue
        eps = 0.005 * cv2.arcLength(c, True)
        c = cv2.approxPolyDP(c, eps, True)
        if len(c) >= 3:
            polys.append(c.reshape(-1, 2))
    return polys


def main():
    for sp in ("train", "val"):
        (OUT / "images" / sp).mkdir(parents=True, exist_ok=True)
        (OUT / "labels" / sp).mkdir(parents=True, exist_ok=True)

    stats, n_obj, per_class = {}, 0, {}

    # ── 1. CarDD (FiftyOne) ──
    data = json.load(open(CARDD / "samples.json", encoding="utf-8"))
    for s in data["samples"]:
        img_rel = s.get("filepath", "")
        img_src = CARDD / img_rel
        if not img_src.exists():
            continue
        dets = ((s.get("segmentations") or {}).get("detections")) or []
        lines = []
        for d in dets:
            cls = MAP_CARDD.get((d.get("label") or "").strip())
            if not cls:
                continue
            bb = d.get("bounding_box")  # [x, y, w, h] normalizado
            mk = ((d.get("mask") or {}).get("$binary") or {}).get("base64")
            if not bb or not mk:
                continue
            try:
                mask = decode_fo_mask(mk)
            except Exception:
                continue
            mh, mw = mask.shape[:2]
            if not mh or not mw:
                continue
            x0, y0, bw, bh = bb
            for poly in mask_to_polys(mask):
                coords = []
                for px, py in poly:
                    xi = min(max(x0 + (px / mw) * bw, 0), 1)
                    yi = min(max(y0 + (py / mh) * bh, 0), 1)
                    coords.append(f"{xi:.6f}")
                    coords.append(f"{yi:.6f}")
                if len(coords) >= 6:
                    lines.append(f"{CID[cls]} " + " ".join(coords))
                    n_obj += 1
                    per_class[cls] = per_class.get(cls, 0) + 1
        write_sample(img_src, "cardd_" + Path(img_rel).name, lines, stats)

    # ── 2. DrBimmer (Supervisely) ──
    for ann in sorted((BIMMER / "ann").glob("*.json")):
        img_name = ann.name[:-5]
        img_src = BIMMER / "img" / img_name
        if not img_src.exists():
            continue
        j = json.loads(ann.read_text(encoding="utf-8"))
        size = j.get("size") or {}
        w, h = size.get("width"), size.get("height")
        if not w or not h:
            continue
        lines = []
        for o in j.get("objects", []):
            if o.get("geometryType") != "polygon":
                continue
            cls = MAP_BIMMER.get((o.get("classTitle") or "").strip())
            pts = (o.get("points") or {}).get("exterior") or []
            if not cls or len(pts) < 3:
                continue
            coords = []
            for x, y in pts:
                coords.append(f"{min(max(x / w, 0), 1):.6f}")
                coords.append(f"{min(max(y / h, 0), 1):.6f}")
            lines.append(f"{CID[cls]} " + " ".join(coords))
            n_obj += 1
            per_class[cls] = per_class.get(cls, 0) + 1
        write_sample(img_src, "bimmer_" + img_name.replace(" ", "_"), lines, stats)

    (OUT / "data.yaml").write_text(
        f"path: {OUT.resolve().as_posix()}\n"
        "train: images/train\nval: images/val\n"
        "names:\n" + "".join(f"  {i}: {c}\n" for i, c in enumerate(CLASSES)),
        encoding="utf-8")

    print(f"OK v2: {stats.get('train', 0)} train / {stats.get('val', 0)} val, {n_obj} instancias")
    for c in CLASSES:
        print(f"  {c:<14} {per_class.get(c, 0)}")


if __name__ == "__main__":
    main()
