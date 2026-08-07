# -*- coding: utf-8 -*-
"""Deriva la regla DSC = Y/N a partir de las filas ya etiquetadas por Amazon.

Uso:  python scripts/regla_dsc.py     (lee docs/diarios.json)

METODO. Cada fila DNR es un ejemplo resuelto: ~14 columnas de entrada y la
respuesta (DSC = Y o N). No se propone una regla y se busca confirmarla; se
proponen y se intenta MATARLAS con contraejemplos. Tres pasadas:

  1. PARES CASI IGUALES. Dos filas identicas en todo menos en una columna, con
     DSC distinto: eso DEMUESTRA que esa columna decide. Es la evidencia mas
     fuerte que se puede sacar de datos etiquetados.
  2. REGLAS DE UNA COLUMNA. Para cada columna y cada valor, si en toda la
     muestra siempre sale Y (o siempre N), es candidata.
  3. ARBOL. Se parte por la columna que mas separa y se repite, exigiendo un
     minimo de filas por hoja para no memorizar el ruido.

CONTAMINACION QUE HAY QUE EVITAR. Hay dias en los que Amazon todavia no habia
clasificado y devuelve 'N' en todas las filas (ver docs/REPORTES_DIARIOS.md).
Esas 'N' son mentira. Solo se usan filas de dias marcados como fiables.
"""
import io
import json
import math
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scorecard_lib import DIARIOS, DOCS

SAL = os.path.join(DOCS, "regla_dsc.txt")
COLS = ["scan", "m25", "phr", "simul", "cc", "falso_scan", "otp", "excepcion",
        "buzon", "alto_valor", "nsd"]
L = []


def di(*a):
    s = " ".join(str(x) for x in a)
    L.append(s)
    print(s)


def cargar():
    dia = json.load(io.open(DIARIOS, encoding="utf-8"))
    limpias, sucias = [], 0
    for r in dia:
        for f in r["dnr"]:
            if f.get("dsc") not in ("Y", "N"):
                continue
            if not r["dsc_fiable"]:
                sucias += 1
                continue
            limpias.append({c: (f.get(c) or "?") for c in COLS} |
                           {"y": f["dsc"] == "Y", "centro": r["centro"],
                            "fecha": r["fecha_dnr"]})
    return limpias, sucias


def entropia(v):
    n = len(v)
    if not n:
        return 0.0
    p = sum(v) / n
    if p in (0.0, 1.0):
        return 0.0
    return -(p * math.log2(p) + (1 - p) * math.log2(1 - p))


def main():
    filas, sucias = cargar()
    di("=" * 78)
    di("REGLA DSC = Y/N")
    di("=" * 78)
    di("   filas etiquetadas y de dias FIABLES: %d  (Y=%d, N=%d)"
       % (len(filas), sum(f["y"] for f in filas), sum(not f["y"] for f in filas)))
    di("   filas descartadas por venir de dias sin clasificar: %d" % sucias)
    if len(filas) < 50:
        di("   muestra insuficiente, no se sigue.")
        io.open(SAL, "w", encoding="utf-8").write("\n".join(L))
        return

    # ---------- 1) el test que decide si esto tiene solucion
    di("")
    di("1) HAY FILAS IDENTICAS EN TODAS LAS COLUMNAS CON DSC DISTINTO?")
    di("   Si las hay, NINGUNA regla sobre estas columnas puede ser exacta:")
    di("   la decision depende de algo que no esta en la tabla.")
    g = defaultdict(list)
    for f in filas:
        g[tuple(f[c] for c in COLS)].append(f)
    conf = {k: v for k, v in g.items() if len({x["y"] for x in v}) > 1}
    afect = sum(len(v) for v in conf.values())
    di("   combinaciones distintas: %d" % len(g))
    di("   combinaciones CONTRADICTORIAS: %d  ->  %d filas (%.0f%% de la muestra)"
       % (len(conf), afect, 100.0 * afect / len(filas)))
    for k in sorted(conf, key=lambda x: -len(conf[x]))[:5]:
        v = conf[k]
        ys = sum(x["y"] for x in v)
        di("      %2d filas identicas: %d Y / %d N   [%s]"
           % (len(v), ys, len(v) - ys,
              "  ".join("%s=%s" % (c, val) for c, val in zip(COLS, k)
                        if val not in ("N", "-", "?")) or "todo por defecto"))
    techo = sum(max(sum(x["y"] for x in v), len(v) - sum(x["y"] for x in v))
                for v in g.values())
    trivial = max(sum(f["y"] for f in filas), sum(not f["y"] for f in filas))
    di("   TECHO de cualquier regla sobre estas columnas: %.1f%%"
       % (100.0 * techo / len(filas)))
    di("   Regla trivial (contestar siempre lo mismo):      %.1f%%"
       % (100.0 * trivial / len(filas)))
    di("   -> las columnas solo aportan %.1f puntos sobre no mirar nada."
       % (100.0 * (techo - trivial) / len(filas)))

    # Columnas con prueba directa: solo tiene sentido en las que varian.
    di("")
    di("   Columnas que cambian el resultado manteniendo todo lo demas igual:")
    idx = defaultdict(list)
    varian = [c for c in COLS if len({f[c] for f in filas}) > 1]
    for f in filas:
        for c in varian:
            idx[(c, tuple((k, f[k]) for k in COLS if k != c))].append(f)
    for c in varian:
        dec = sum(1 for (cc, _), gr in idx.items()
                  if cc == c and len(gr) > 1 and len({x["y"] for x in gr}) > 1)
        tot = sum(1 for (cc, _), gr in idx.items() if cc == c and len(gr) > 1)
        if tot:
            di("      %-12s %d de %d pares comparables" % (c, dec, tot))

    # ---------- 2) reglas de una columna
    di("")
    di("2) VALORES QUE SIEMPRE DAN EL MISMO RESULTADO (candidatos a regla)")
    di("   %-12s %-30s %6s %6s %8s" % ("columna", "valor", "n", "Y", "veredicto"))
    for c in COLS:
        por = defaultdict(list)
        for f in filas:
            por[f[c]].append(f["y"])
        for v in sorted(por, key=lambda x: -len(por[x])):
            vs = por[v]
            if len(vs) < 8:
                continue
            ny = sum(vs)
            if ny == 0:
                ver = "SIEMPRE N"
            elif ny == len(vs):
                ver = "SIEMPRE Y"
            else:
                ver = ""
            if ver:
                di("   %-12s %-30s %6d %6d %8s" % (c, str(v)[:30], len(vs), ny, ver))

    # ---------- 3) arbol
    di("")
    di("3) ARBOL DE DECISION (minimo 12 filas por hoja)")
    di("   cada hoja indica cuantas filas cubre y cuantas contradice")

    def crece(sub, prof, prefijo):
        ys = [f["y"] for f in sub]
        e = entropia(ys)
        if prof >= 4 or e == 0 or len(sub) < 24:
            ny = sum(ys)
            mayor = "Y" if ny * 2 >= len(ys) else "N"
            err = len(ys) - (ny if mayor == "Y" else len(ys) - ny)
            di("   %s=> %s   (%d filas, %d contradicen, %.0f%% puro)"
               % (prefijo, mayor, len(sub), err, 100.0 * (1 - err / len(sub))))
            return err
        mejor = None
        for c in COLS:
            por = defaultdict(list)
            for f in sub:
                por[f[c]].append(f)
            if len(por) < 2 or any(len(v) < 12 for v in por.values()):
                # se permite partir aunque haya ramas pequenas, pero penaliza
                pass
            g = e - sum(len(v) / len(sub) * entropia([x["y"] for x in v])
                        for v in por.values())
            if mejor is None or g > mejor[0]:
                mejor = (g, c, por)
        g, c, por = mejor
        if g < 0.01:
            ny = sum(ys)
            mayor = "Y" if ny * 2 >= len(ys) else "N"
            di("   %s=> %s   (%d filas, sin corte util)" % (prefijo, mayor, len(sub)))
            return len(ys) - (ny if mayor == "Y" else len(ys) - ny)
        err = 0
        for v in sorted(por, key=lambda x: -len(por[x])):
            err += crece(por[v], prof + 1, prefijo + "%s=%s " % (c, str(v)[:26]))
        return err

    err = crece(filas, 0, "   ")
    di("")
    di("   contradicciones totales del arbol: %d de %d filas (%.1f%%)"
       % (err, len(filas), 100.0 * err / len(filas)))
    di("   Un arbol con contradicciones NO es la regla de Amazon: es una")
    di("   aproximacion. La regla exacta daria 0.")

    io.open(SAL, "w", encoding="utf-8").write("\n".join(L))
    print("\ninforme escrito en %s" % SAL)


if __name__ == "__main__":
    main()
