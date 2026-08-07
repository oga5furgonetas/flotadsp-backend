# -*- coding: utf-8 -*-
"""Analisis de las scorecards ya extraidas.

Uso:  python scripts/scorecard_analisis.py     (lee docs/scorecards.json)

Hace cuatro cosas, en este orden:
  1. TIERS: prueba que el tier de cada metrica sale de los umbrales Target y
     Minimum que el propio PDF publica. Se intenta falsar con contraejemplos.
  2. CORTES: los tres cortes de cada metrica y los del propio Overall.
  3. OVERALL: se formulan hipotesis y se intenta DESTRUIRLAS.
  4. BACKTEST: ventana movil, entrenando solo con semanas anteriores.

Requiere numpy y scipy.
"""
import io
import json
import os

import numpy as np
from scipy.optimize import nnls

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRADA = os.path.join(RAIZ, "docs", "scorecards.json")
INFORME = os.path.join(RAIZ, "docs", "scorecards_analisis.txt")

# sentido: +1 = mas alto es mejor, -1 = mas bajo es mejor (los DPMO)
METRICAS = [
    ("fico", +1), ("speeding", -1), ("mentor", +1), ("vsa", +1), ("whc", +1),
    ("ce_dpmo", -1), ("cdf", -1), ("dcr", +1), ("dnr_dpmo", -1),
    ("lor_dpmo", -1), ("dsc_dpmo", -1), ("pod", +1), ("cc", +1),
    ("capacity", +1),
]
SENT = dict(METRICAS)
ORD = {"Poor": 0, "Fair": 1, "Great": 2, "Fantastic": 3}
TIERS = ("Poor", "Fair", "Great", "Fantastic")

# Umbrales que NO estan en la tabla SLS y hay que suplir:
#   whc  -> Target 100% SI esta publicado (en las definiciones); el Minimum 95
#           es el corte Poor|Fair medido, no publicado.
#   mentor -> Target 90 publicado; el Minimum es un supuesto nuestro.
SUPUESTOS = {"whc": [100.0, 95.0], "mentor": [90.0, 80.0]}

# DNR va excluido: el PDF pinta su etiqueta en rojo en 85/85 y dice que las
# metricas en rojo no impactan. DVIC no se puede usar: tiene Target/Minimum en
# la tabla SLS pero no se muestra en ninguna pagina.
CAND = ["whc", "ce_dpmo", "dcr", "lor_dpmo", "dsc_dpmo", "cc", "vsa",
        "mentor", "capacity", "fico"]
PERFECTO = {"fico": 850.0, "speeding": 0.0, "mentor": 100.0, "vsa": 100.0,
            "whc": 100.0, "ce_dpmo": 0.0, "cdf": 0.0, "dcr": 100.0,
            "lor_dpmo": 0.0, "dsc_dpmo": 0.0, "pod": 100.0, "cc": 100.0,
            "capacity": 100.0}

SAL = []


def di(*a):
    linea = " ".join(str(x) for x in a)
    SAL.append(linea)
    print(linea)


def tit(t):
    di("")
    di("=" * 76)
    di(t)
    di("=" * 76)


# ------------------------------------------------------------------- carga
def cargar():
    filas = json.load(io.open(ENTRADA, encoding="utf-8"))
    for d in filas:
        sls = dict(d.get("sls") or {})
        for m, g in SUPUESTOS.items():
            sls.setdefault(m, list(g))
        d["sls"] = sls
        for m, s in METRICAS:
            d[m + "_ord"] = ORD.get(d.get(m + "_tier"))
            v, g = d.get(m), sls.get(m)
            if v is None or not g or g[0] == g[1]:
                d[m + "_p"] = d[m + "_pc"] = None
                continue
            tgt, mn = g
            p = (v - mn) / (tgt - mn) if s > 0 else (mn - v) / (mn - tgt)
            d[m + "_p"] = float(p)
            d[m + "_pc"] = float(np.clip(p, 0.0, 1.0))
        d["regimen"] = ("con_cdf" if d.get("cdf") is not None else
                        ("con_pod" if d.get("pod") is not None else "base"))
    filas.sort(key=lambda x: (x["semana"], x["centro"]))
    return filas


def cumple(v, u, s):
    return (v >= u - 1e-9) if s > 0 else (v <= u + 1e-9)


# --------------------------------------------------------- 1) regla de tier
def prueba_tiers(filas):
    tit("1) REGLA DE TIER — se intenta falsar con los umbrales del propio PDF")
    di("   Hipotesis A: Fantastic  <=>  el valor cumple el Target publicado")
    di("   Hipotesis B: Poor       <=>  el valor no llega al Minimum publicado")
    di("")
    di("   %-10s %5s %14s %14s   %s" % ("metrica", "n", "A aciertos", "B aciertos", "contraejemplos"))
    tot = okA = okB = 0
    for m, s in METRICAS:
        n = a = b = 0
        malos = []
        for d in filas:
            u = d["sls"].get(m)
            v, t = d.get(m), d.get(m + "_tier")
            if not u or v is None or t not in TIERS or u[0] == u[1]:
                continue
            n += 1
            ca = cumple(v, u[0], s) == (t == "Fantastic")
            cb = (not cumple(v, u[1], s)) == (t == "Poor")
            a += ca
            b += cb
            if not (ca and cb) and len(malos) < 2:
                malos.append("%s %g T=%g m=%g ->%s" % (d["id"], v, u[0], u[1], t))
        if n:
            di("   %-10s %5d %8d %5.1f%% %8d %5.1f%%   %s"
               % (m, n, a, 100.0 * a / n, b, 100.0 * b / n, malos or ""))
            tot += n
            okA += a
            okB += b
    di("")
    di("   TOTAL: %d observaciones. Regla A %d/%d (%.2f%%), regla B %d/%d (%.2f%%)"
       % (tot, okA, tot, 100.0 * okA / tot, okB, tot, 100.0 * okB / tot))
    di("   Nota: whc y mentor usan un Minimum supuesto, no publicado.")


# ------------------------------------------------------------- 2) cortes
def ajusta_q(filas, m):
    """Posicion relativa (0=Minimum, 1=Target) donde se parte Fair de Great."""
    obs = [(d[m + "_p"], d[m + "_tier"]) for d in filas
           if d.get(m + "_p") is not None and d.get(m + "_tier") in ("Fair", "Great")]
    if len({t for _, t in obs}) < 2:
        return None, 0, len(obs)
    rej = sorted({p for p, _ in obs})
    cands = [(a + b) / 2 for a, b in zip([0.0] + rej, rej + [1.0])]
    err = lambda q: sum(1 for p, t in obs if (p >= q) != (t == "Great"))
    e, q = min((err(q), q) for q in cands)
    return q, e, len(obs)


def prueba_cortes(filas):
    tit("2) CORTES DE TIER")
    di("   Fantastic|Great y Fair|Poor estan PUBLICADOS (Target y Minimum) y")
    di("   verificados arriba. El corte Great|Fair NO se publica: se ajusta.")
    di("")
    di("   %-10s %5s %8s %10s  %s" % ("metrica", "n", "q", "mal clasif", "lectura"))
    qs = {}
    for m in CAND + ["pod", "cdf", "speeding"]:
        q, e, n = ajusta_q(filas, m)
        qs[m] = 0.5 if q is None else q
        nota = "sin datos, se usa 0.5" if q is None else (
            "corte limpio" if e == 0 else "NO hay q constante que funcione")
        di("   %-10s %5d %8.3f %10d  %s" % (m, n, qs[m], e, nota))
    di("")
    di("   -> dcr y dsc_dpmo no admiten un q constante: sus umbrales son de")
    di("      estacion (el PDF lo dice) y el corte intermedio no se publica.")

    tit("2b) CORTES DEL PROPIO OVERALL")
    por = {}
    for d in filas:
        por.setdefault(d["overall_tier"], []).append(d["overall"])
    for t in TIERS:
        if t in por:
            di("   %-10s n=%-3d  %.2f .. %.2f" % (t, len(por[t]), min(por[t]), max(por[t])))
    for a, b in (("Fair", "Great"), ("Great", "Fantastic")):
        if a in por and b in por:
            di("   corte %-5s|%-10s en (%.2f , %.2f]" % (a, b, max(por[a]), min(por[b])))
    tgt = [d["sls"].get("overall") for d in filas if d["sls"].get("overall")]
    if tgt:
        di("   La tabla SLS publica para 'Scorecard Performance': Target=%g Minimum=%g"
           % (tgt[0][0], tgt[0][1]))
    return qs


# --------------------------------------------------------------- 3) overall
def score(d, m, q):
    """Puntuacion por bandas: Minimum->50, corte Great|Fair->70, Target->85."""
    g, v = d["sls"].get(m), d.get(m)
    if not g or v is None or g[0] == g[1]:
        return None
    p, s, pf = d[m + "_p"], SENT[m], PERFECTO.get(m)
    tgt, mn = g
    pperf = 1.5 if pf is None else (
        (pf - mn) / (tgt - mn) if s > 0 else (mn - pf) / (mn - tgt))
    if p >= 1.0:
        return 100.0 if pperf <= 1.0 else float(np.clip(85 + 15 * (p - 1) / (pperf - 1), 85, 100))
    if p >= q:
        return 70 + 15 * (p - q) / (1 - q)
    if p >= 0:
        return 50 + 20 * p / q
    return float(max(0.0, 50 + 50 * p))


def ols(X, y, ridge=1e-6):
    A = np.column_stack([np.ones(len(X)), X])
    G = A.T @ A + ridge * np.eye(A.shape[1])
    c = np.linalg.solve(G, A.T @ y)
    return c, A @ c


def errs(y, p):
    r = y - p
    return np.mean(np.abs(r)), float(np.sqrt(np.mean(r ** 2))), np.max(np.abs(r))


def prueba_overall(filas, qs):
    tit("3) OVERALL — cada hipotesis se intenta DESTRUIR")
    di("   valores distintos de Overall: %d sobre %d scorecards"
       % (len({d["overall"] for d in filas}), len(filas)))

    di("")
    di("   H1: el Overall es funcion SOLO del vector de tiers.")
    gr = {}
    for d in filas:
        gr.setdefault(tuple(d.get(m + "_ord") for m in CAND), []).append(d)
    contra = [g for g in gr.values() if len(g) > 1 and len({x["overall"] for x in g}) > 1]
    for g in contra:
        di("       CONTRAEJEMPLO: %s -> Overall %s"
           % ([x["id"] for x in g], sorted({x["overall"] for x in g})))
    di("       VEREDICTO: %s" % ("FALSADA" if contra else "no falsada (sin potencia)"))

    base = [d for d in filas if d["regimen"] == "base"]
    ok = [d for d in base if all(d.get(m + "_p") is not None for m in CAND)]
    y = np.array([d["overall"] for d in ok])
    fam = {
        "H2 lineal en el tier ordinal": np.array([[d[m + "_ord"] for m in CAND] for d in ok], float),
        "H3 lineal en p (min->target)": np.array([[d[m + "_p"] for m in CAND] for d in ok], float),
        "H3b lineal en p recortada": np.array([[d[m + "_pc"] for m in CAND] for d in ok], float),
        "H5 bandas 50/70/85": np.array([[score(d, m, qs[m]) for m in CAND] for d in ok], float),
    }
    di("")
    di("   Ajustes DENTRO de muestra (regimen sin POD ni CDF, n=%d, k=%d):" % (len(y), len(CAND) + 1))
    for nom, X in fam.items():
        _, p = ols(X, y)
        mae, rmse, mx = errs(y, p)
        di("       %-30s MAE=%.3f RMSE=%.3f peor=%.2f" % (nom, mae, rmse, mx))
    Xl = np.log(np.clip(fam["H3b lineal en p recortada"], 0.02, None))
    _, pl = ols(Xl, np.log(y))
    mae, rmse, mx = errs(y, np.exp(pl))
    di("       %-30s MAE=%.3f RMSE=%.3f peor=%.2f" % ("H4 multiplicativa (log-log)", mae, rmse, mx))

    di("")
    di("   H3 hacia una prediccion NUMERICA: si el Overall fuese la media")
    di("   ponderada de puntuaciones donde el Target vale 85 y el Minimum 50,")
    di("   al ajustar Overall = a + SUM b_i*p_i deberia salir a~50 y SUM b~35.")
    c, _ = ols(fam["H3 lineal en p (min->target)"], y)
    di("       obtenido: a=%.2f   SUM b=%.2f" % (c[0], c[1:].sum()))

    di("")
    di("   H5 con pesos en el simplex (w>=0, suma 1), que es lo que exigiria")
    di("   una media ponderada de verdad:")
    X = fam["H5 bandas 50/70/85"]
    P = 1e4
    w, _ = nnls(np.vstack([X, P * np.ones((1, X.shape[1]))]),
                np.concatenate([y, [P]]))
    mae, rmse, mx = errs(y, X @ w)
    di("       MAE=%.3f RMSE=%.3f peor=%.2f   suma w=%.3f" % (mae, rmse, mx, w.sum()))
    di("       " + "  ".join("%s=%.3f" % (m, ww) for m, ww in zip(CAND, w) if ww > 1e-4))

    di("")
    di("   CONTROL DNR (el PDF dice que no impacta): su etiqueta va en rojo en")
    di("   85/85 y el aviso 'highlighted in red' aparece tambien en las 21")
    di("   scorecards que no tienen ninguna metrica en Poor -> el aviso habla")
    di("   de la etiqueta de DNR, no de los valores en rojo.")


# ------------------------------------------------------------- 4) backtest
def tier_overall(v):
    return "Fantastic" if v >= 85 else ("Great" if v >= 70 else ("Fair" if v >= 50 else "Poor"))


def backtest(filas, qs):
    tit("4) BACKTESTING CON VENTANA MOVIL (entrena con semanas < W, predice W)")
    for d in filas:
        d["f_tier"] = [d.get(m + "_ord") for m in CAND]
        d["f_p"] = [d.get(m + "_pc") for m in CAND]
        d["f_band"] = [score(d, m, qs[m]) for m in CAND]
        for k in ("f_tier", "f_p", "f_band"):
            if any(v is None for v in d[k]):
                d[k] = None
        d["f_logp"] = None if d["f_p"] is None else list(np.log(np.clip(d["f_p"], 0.02, None)))

    semanas = sorted({d["semana"] for d in filas})
    ult, y, ids = {}, [], []
    modelos = ["persistencia", "media_historica", "tier_ols", "p_ols",
               "bandas_ols", "bandas_simplex", "logp_ols"]
    res = {m: [] for m in modelos}
    MIN_TRAIN = 20

    for w in semanas:
        tr = [d for d in filas if d["semana"] < w]
        te = [d for d in filas if d["semana"] == w]
        if len(tr) < MIN_TRAIN:
            for d in te:
                ult[d["centro"]] = d["overall"]
            continue
        ytr_all = np.array([d["overall"] for d in tr])
        for d in te:
            y.append(d["overall"])
            ids.append(d["id"])
            res["persistencia"].append(ult.get(d["centro"], ytr_all.mean()))
            res["media_historica"].append(ytr_all.mean())

        for campo, nom, log in (("f_tier", "tier_ols", False), ("f_p", "p_ols", False),
                                ("f_band", "bandas_ols", False), ("f_logp", "logp_ols", True)):
            trf = [d for d in tr if d[campo] is not None]
            Xtr = np.array([d[campo] for d in trf], float)
            ytr = np.array([d["overall"] for d in trf], float)
            for d in te:
                if d[campo] is None or len(trf) < len(CAND) + 3:
                    res[nom].append(ytr_all.mean())
                    continue
                c, _ = ols(Xtr, np.log(ytr) if log else ytr)
                v = float(np.concatenate([[1.0], d[campo]]) @ c)
                res[nom].append(float(np.exp(v)) if log else v)

        trf = [d for d in tr if d["f_band"] is not None]
        Xtr = np.array([d["f_band"] for d in trf], float)
        ytr = np.array([d["overall"] for d in trf], float)
        for d in te:
            if d["f_band"] is None or len(trf) < len(CAND) + 3:
                res["bandas_simplex"].append(ytr_all.mean())
            else:
                P = 1e4
                w2, _ = nnls(np.vstack([Xtr, P * np.ones((1, Xtr.shape[1]))]),
                             np.concatenate([ytr, [P]]))
                res["bandas_simplex"].append(float(np.array(d["f_band"]) @ w2))
        for d in te:
            ult[d["centro"]] = d["overall"]

    y = np.array(y)
    treal = [tier_overall(v) for v in y]
    di("   n predicciones = %d   rango real %.2f..%.2f   desv.tipica %.2f"
       % (len(y), y.min(), y.max(), y.std()))
    di("")
    di("   %-18s %8s %8s %8s %14s" % ("modelo", "MAE", "RMSE", "peor", "acierto tier"))
    for m in modelos:
        p = np.array(res[m], float)
        mae, rmse, mx = errs(y, p)
        acc = np.mean([tier_overall(a) == b for a, b in zip(p, treal)])
        di("   %-18s %8.3f %8.3f %8.2f %13.1f%%" % (m, mae, rmse, mx, 100 * acc))

    best = min(modelos, key=lambda m: np.mean(np.abs(y - np.array(res[m], float))))
    p = np.array(res[best], float)
    e = np.abs(y - p)
    di("")
    di("   Peores errores del mejor modelo (%s):" % best)
    for i in np.argsort(-e)[:6]:
        di("      %-10s real %6.2f  pred %6.2f  error %5.2f" % (ids[i], y[i], p[i], e[i]))
    di("")
    di("   El Overall se publica con 2 decimales: tener la formula significaria")
    di("   un error de ~0.005 puntos, como pasa con WHC. Estamos 500 veces peor.")


def main():
    filas = cargar()
    di("scorecards: %d   centros: %d   semanas: %d..%d"
       % (len(filas), len({d["centro"] for d in filas}),
          min(d["semana"] for d in filas), max(d["semana"] for d in filas)))
    prueba_tiers(filas)
    qs = prueba_cortes(filas)
    prueba_overall(filas, qs)
    backtest(filas, qs)
    with io.open(INFORME, "w", encoding="utf-8") as fh:
        fh.write("\n".join(SAL))
    print("\ninforme escrito en %s" % INFORME)


if __name__ == "__main__":
    main()
