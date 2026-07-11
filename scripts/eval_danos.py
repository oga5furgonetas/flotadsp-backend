# -*- coding: utf-8 -*-
"""Arnés de evaluación del motor de daños contra el conjunto dorado.

Uso:
    python scripts/eval_danos.py gold.jsonl predicciones.jsonl

Formato de AMBOS ficheros (una inspección por línea, JSON):
    {
      "inspection_id": "…",
      "severity": "sin_danos|leve|moderado|grave|critico",
      "damages": [
        {"panel": "puerta_delantera_izquierda", "severity": "moderado"},
        ...
      ]
    }

- gold.jsonl: la verdad etiquetada a mano (o consolidada desde Revisión Rápida).
- predicciones.jsonl: lo que dijo el motor (exportar con scripts/export_preds.py
  o construir desde la API GET /inspections/{id}).

Métricas (a nivel de PANEL, que es lo que le importa al cliente):
- precision / recall / F1 de paneles dañados
- falsos positivos por inspección (la métrica que más duele)
- exactitud de severidad global y por daño (sobre los aciertos de panel)

El panel se normaliza con reglas simples (lado + pieza); si el motor y el gold
usan el mismo vocabulario del baremo (_canon_panel del backend), coincidirán.
"""
import json
import sys
from collections import defaultdict

SEV_ORDER = {"sin_danos": 0, "leve": 1, "moderado": 2, "grave": 3, "critico": 4}


def norm_panel(p: str) -> str:
    s = (p or "").strip().lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), (" ", "_")):
        s = s.replace(a, b)
    return s


def load(path: str) -> dict:
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            j = json.loads(line)
            out[j["inspection_id"]] = j
    return out


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    gold, pred = load(sys.argv[1]), load(sys.argv[2])
    common = sorted(set(gold) & set(pred))
    if not common:
        print("Sin inspecciones en común entre gold y predicciones.")
        return 1

    tp = fp = fn = 0
    fp_per_insp = []
    sev_global_ok = 0
    sev_dmg_ok = sev_dmg_total = 0
    per_panel = defaultdict(lambda: [0, 0, 0])  # panel → [tp, fp, fn]

    for iid in common:
        g = {norm_panel(d.get("panel")): (d.get("severity") or "").lower()
             for d in gold[iid].get("damages") or []}
        p = {norm_panel(d.get("panel")): (d.get("severity") or "").lower()
             for d in pred[iid].get("damages") or []}
        g_set, p_set = set(g) - {""}, set(p) - {""}
        tp_i = len(g_set & p_set)
        fp_i = len(p_set - g_set)
        fn_i = len(g_set - p_set)
        tp += tp_i; fp += fp_i; fn += fn_i
        fp_per_insp.append(fp_i)
        for pan in g_set & p_set:
            per_panel[pan][0] += 1
            sev_dmg_total += 1
            if g.get(pan) == p.get(pan):
                sev_dmg_ok += 1
        for pan in p_set - g_set:
            per_panel[pan][1] += 1
        for pan in g_set - p_set:
            per_panel[pan][2] += 1
        if (gold[iid].get("severity") or "").lower() == (pred[iid].get("severity") or "").lower():
            sev_global_ok += 1

    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0

    print(f"Inspecciones evaluadas : {len(common)}")
    print(f"Paneles — precision    : {prec:.3f}")
    print(f"Paneles — recall       : {rec:.3f}")
    print(f"Paneles — F1           : {f1:.3f}")
    print(f"Falsos positivos/insp. : {sum(fp_per_insp) / len(common):.2f}")
    print(f"Severidad global acierto: {sev_global_ok / len(common):.3f}")
    if sev_dmg_total:
        print(f"Severidad por daño (en aciertos de panel): {sev_dmg_ok / sev_dmg_total:.3f}")
    print("\nPor panel (tp/fp/fn):")
    for pan, (t, f_, n) in sorted(per_panel.items(), key=lambda x: -(x[1][1] + x[1][2])):
        print(f"  {pan:<32} {t:>3} / {f_:>3} / {n:>3}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
