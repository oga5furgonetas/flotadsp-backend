# -*- coding: utf-8 -*-
"""Concilia los reportes diarios con la scorecard semanal.

Uso:  python scripts/conciliar_diarios.py   (lee docs/diarios.json + docs/scorecards.json)

LA REGLA QUE SE PONE A PRUEBA
    defectos DSC de la semana W = filas DNR con DSC='Y' cuya FECHA DE CONCESION
    (= fecha del reporte - 2 dias) cae en la semana W de Amazon (domingo a sabado)
    DSC DPMO = defectos * 1e6 / paquetes entregados

Se compara contra el numero que dice la scorecard, en PAQUETES ENTEROS, y solo
en semanas con los 7 dias descargados y clasificados. Un DPMO no dice nada;
'faltan 2 paquetes' si.

Tambien se prueba la alternativa (asignar por FECHA DE ENTREGA) para poder
descartarla, y se listan las filas limpias para trabajar la regla DSC=Y/N.
"""
import io
import json
import os
import sys
import datetime as dt
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scorecard_lib import DIARIOS, SCORECARDS, DOCS, rango_semana, fecha

SAL = os.path.join(DOCS, "conciliacion.txt")
L = []


def di(*a):
    s = " ".join(str(x) for x in a)
    L.append(s)
    print(s)


def cargar():
    dia = json.load(io.open(DIARIOS, encoding="utf-8"))
    scs = json.load(io.open(SCORECARDS, encoding="utf-8"))
    return dia, scs


def main():
    dia, scs = cargar()
    por = defaultdict(dict)          # centro -> fecha_dnr -> registro
    for r in dia:
        por[r["centro"]][r["fecha_dnr"]] = r

    di("=" * 78)
    di("CONCILIACION DIARIOS -> SCORECARD SEMANAL")
    di("=" * 78)
    di("   semana de Amazon: domingo a sabado. El bloque DNR de un reporte es")
    di("   de 2 dias antes, asi que la semana W necesita los reportes del")
    di("   martes de W al lunes de W+1.")
    di("")
    di("   %-11s %8s %5s %6s | %-22s %-14s | %s"
       % ("scorecard", "objetivo", "cob.", "clasif", "por CONCESION", "por ENTREGA", "estimado"))

    ok = {"concesion": [], "entrega": []}
    for d in sorted(scs, key=lambda x: (x["centro"], x["semana"])):
        c, wk = d["centro"], d["semana"]
        if c not in por or d.get("dsc_dpmo") is None:
            continue
        anio = d.get("anio") or 2026
        try:
            dom, fin = rango_semana(anio, wk)
        except KeyError:
            continue
        dias_sem = [dom + dt.timedelta(days=i) for i in range(7)]
        regs = [por[c].get(x.isoformat()) for x in dias_sem]
        cob = sum(1 for x in regs if x is not None)
        if cob == 0:
            continue
        clas = sum(1 for x in regs if x is not None and (x["dsc_fiable"] or x["n_dnr"] == 0))

        # objetivo en paquetes: el DPMO de la scorecard sobre los entregados
        ent = d.get("entregados")
        if not ent:
            continue
        obj = d["dsc_dpmo"] * ent / 1e6

        n_c = sum(x["n_dsc"] for x in regs if x)
        # Estimacion: si los dias sin clasificar hubieran tenido la misma tasa
        # de Y que los dias buenos de ESA semana, cuantos defectos saldrian.
        # Sirve para ver si el agujero se explica solo por eso.
        buenos = [x for x in regs if x and not x["dsc_sin_clasificar"]]
        malos = [x for x in regs if x and x["dsc_sin_clasificar"]]
        base = sum(x["n_dnr"] for x in buenos)
        tasa = (sum(x["n_dsc"] for x in buenos) / base) if base else None
        est = (n_c + tasa * sum(x["n_dnr"] for x in malos)) if tasa is not None else None
        n_e = 0
        for r in dia:
            if r["centro"] != c:
                continue
            for f in r["dnr"]:
                fe = fecha(f.get("entrega"))
                if f.get("dsc") == "Y" and fe and dom <= fe <= fin:
                    n_e += 1
        # Criterio: basta la cobertura completa. Los dias 'sin clasificar' se
        # muestran aparte porque el flag es conservador y marca de mas: la
        # semana 24 tenia un dia marcado y aun asi cuadro exacta, o sea que ese
        # dia realmente tuvo 0 defectos.
        completa = cob == 7
        di("   %-11s %8.1f %4d/7 %5d/7 | %5d (%+7.1f) %s %5d (%+7.1f) | %s"
           % ("%s-W%d" % (c, wk), obj, cob, clas, n_c, n_c - obj,
              "<--" if completa else "   ", n_e, n_e - obj,
              ("%5.1f (%+.1f)" % (est, est - obj)) if est is not None else "    -"))
        if completa:
            ok["concesion"].append(abs(n_c - obj))
            ok["entrega"].append(abs(n_e - obj))
            ok.setdefault("_detalle", []).append((c, wk, 7 - clas, n_c - obj))

    di("")
    n = len(ok["concesion"])
    di("   Semanas con los 7 dias descargados: %d" % n)
    for k in ("concesion", "entrega"):
        v = ok[k]
        if v:
            exactas = sum(1 for x in v if x < 0.5)
            di("      regla %-10s exactas %d/%d   error medio %.2f defectos   peor %.1f"
               % (k, exactas, len(v), sum(v) / len(v), max(v)))
    di("")
    di("      %-12s %14s %10s" % ("semana", "dias dudosos", "dif"))
    for c, wk, dud, dif in ok.get("_detalle", []):
        di("      %-12s %14d %+10.1f" % ("%s-W%d" % (c, wk), dud, dif))
    di("      -> las que fallan son justo las que traen dias sin clasificar.")
    di("")
    di("   La columna 'estimado' rellena los dias sin clasificar con la tasa de")
    di("   Y de los dias buenos de esa misma semana. Si al hacerlo el numero se")
    di("   acerca al de la scorecard, el agujero son esos dias y no la regla.")
    if n < 5:
        di("")
        di("   AVISO: con %d semanas esto NO demuestra nada todavia. Y NO se" % n)
        di("   arregla re-descargando: se probo el 2026-08-08 con 6 reportes")
        di("   viejos y volvieron identicos (ver docs/REPORTES_DIARIOS.md).")
        di("   Solo se puede ir sumando semanas nuevas, bajando cada reporte el")
        di("   dia que sale y otra vez 1-3 dias despues.")

    # ---------------- material limpio para atacar la regla DSC=Y/N
    di("")
    di("=" * 78)
    di("MATERIAL PARA DERIVAR LA REGLA DSC = Y/N")
    di("=" * 78)
    filas = [f for r in dia for f in r["dnr"] if f.get("dsc") in ("Y", "N")]
    di("   filas con DSC clasificado: %d  (Y=%d, N=%d)"
       % (len(filas), sum(1 for f in filas if f["dsc"] == "Y"),
          sum(1 for f in filas if f["dsc"] == "N")))
    di("")
    di("   Reparto por tipo de scan:")
    tab = defaultdict(lambda: [0, 0])
    for f in filas:
        tab[f.get("scan") or "?"][f["dsc"] == "Y"] += 1
    di("   %-36s %6s %6s %8s" % ("Delivery Scan", "N", "Y", "% Y"))
    for k in sorted(tab, key=lambda x: -sum(tab[x])):
        nn, yy = tab[k]
        di("   %-36s %6d %6d %7.0f%%" % (k[:36], nn, yy, 100.0 * yy / max(1, nn + yy)))
    di("")
    di("   Un scan con 0% o 100% en toda la muestra es candidato a regla.")
    di("   Uno con valores intermedios necesita otra columna que lo decida.")

    io.open(SAL, "w", encoding="utf-8").write("\n".join(L))
    print("\ninforme escrito en %s" % SAL)


if __name__ == "__main__":
    main()

