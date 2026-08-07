# -*- coding: utf-8 -*-
"""Ingesta de los Daily Report (HTML de Cortex) -> docs/diarios.json

Uso:  python scripts/ingerir_diarios.py [carpeta_con_html]

QUE TRAE CADA REPORTE
  El reporte de la fecha F contiene el bloque DNR de F-2 (verificado: desfase
  de exactamente 2 dias en 131/131 reportes). Las otras tablas -- RTS,
  POD audit y Contact Compliance -- no llevan fecha propia.

  Tablas:
    resumen  Transporter ID | RTS | DNR | POD Fails | CC Fails
    rts      un paquete devuelto a estacion por fila, con su motivo
    dnr      una concesion por fila, con la columna DSC = Y/N  <-- la clave
    pod      un fallo de foto por fila
    cc       un fallo de contacto por fila

DOS TRAMPAS QUE HAY QUE ESQUIVAR (ambas comprobadas con datos, no supuestas)

  1. LA COLUMNA DSC SE RELLENA DESPUES. Si bajas el reporte a -2 dias, la
     columna DSC viene entera a 'N' y cuentas cero defectos. Si lo vuelves a
     bajar 2-4 dias mas tarde, las MISMAS filas (mismos tracking IDs) traen ya
     sus 'Y'. Demostrado en los dias 2026-06-21, 2026-07-12 y 2026-07-15, que
     estan descargados dos veces:
         2026-07-12  descarga del 14/07: 10 filas, 0 con DSC=Y
                     descarga del 16/07: las MISMAS 10 filas, 7 con DSC=Y
     Por eso aqui NO se acumula: se indexa por tracking ID y gana la descarga
     mas reciente del mismo dia.

  2. UN TRACKING NUNCA SE REPITE ENTRE DIAS DISTINTOS (0 repetidos en 587
     concesiones), asi que sumar dias distintos es seguro. Lo que se repite es
     el mismo dia bajado varias veces.
"""
import glob
import html
import io
import json
import os
import re
import sys
import datetime as dt
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scorecard_lib import DIARIOS, fecha, semana_de

# Una tabla se identifica por las columnas que trae, no por su posicion.
FIRMAS = [
    ("dnr",     {"Tracking ID", "DSC", "Delivery Date"}),
    ("rts",     {"Tracking ID", "RTS Reason"}),
    ("pod",     {"Tracking ID", "POD Audit"}),
    ("cc",      {"Tracking ID", "CC Type"}),
    ("resumen", {"Transporter ID", "RTS", "DNR"}),
]
# Columnas de la tabla DNR que nos interesan -> nombre corto
DNR_COLS = {
    "Delivery Date": "entrega", "Tracking ID": "tid", "Transporter ID": "cond",
    "Postal Code": "cp", "Delivery Scan": "scan", "PHR": "phr",
    "Delivered \u2265 25m": "m25", "Simultaneous Deliveries": "simul",
    "Contact Compliance": "cc", "Contact Details": "cc_tipo",
    "Feedback False Scan Indicator": "falso_scan", "OTP/SIG": "otp",
    "Delivery Exception": "excepcion",
    "Mailbox Eligible, Delivered Elsewhere": "buzon",
    "High Value": "alto_valor", "Value": "valor",
    "Delivery Hint / Cutomer Note": "nota", "Next / Same Day": "nsd",
    "DSC": "dsc",
}


def celdas(fila_html):
    c = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", fila_html, re.S | re.I)
    return [html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", x))).strip()
            for x in c]


def tablas(texto):
    for tb in re.findall(r"<table.*?</table>", texto, re.S | re.I):
        filas = [celdas(f) for f in re.findall(r"<tr.*?</tr>", tb, re.S | re.I)]
        filas = [f for f in filas if f]
        if filas:
            yield filas


def clasifica(filas):
    """Devuelve (tipo, indice_de_la_cabecera). La primera fila puede ser el
    boton 'Download This Table', que no es cabecera."""
    for i, f in enumerate(filas[:3]):
        s = set(f)
        for tipo, firma in FIRMAS:
            if firma <= s:
                return tipo, i
    return None, None


def parsea(ruta, avisos):
    txt = io.open(ruta, encoding="utf-8", errors="replace").read()
    m = re.search(r"DNR \((\d{4}-\d\d-\d\d)\)", txt)
    out = {"fecha_dnr": m.group(1) if m else None,
           "dnr": [], "rts": [], "pod": 0, "cc": 0, "resumen": []}
    for filas in tablas(txt):
        tipo, i = clasifica(filas)
        if tipo is None:
            continue
        cab = filas[i]
        # Filas con distinto numero de celdas que la cabecera: NO se rellenan a
        # ciegas, porque zip() desplaza las columnas y mete valores en el campo
        # equivocado (asi salian DSC='1' en 24 filas). Se descartan y se avisan.
        buenas = [f for f in filas[i + 1:] if len(f) == len(cab)]
        malas = len(filas) - i - 1 - len(buenas)
        if malas:
            avisos.append("%s: tabla %s, %d filas con columnas desalineadas"
                          % (os.path.basename(ruta), tipo, malas))
        regs = [dict(zip(cab, f)) for f in buenas]
        if tipo == "dnr":
            out["dnr"] = [{corto: r.get(largo) for largo, corto in DNR_COLS.items()}
                          for r in regs]
            for r in out["dnr"]:
                r["dsc_crudo"] = r.get("dsc")
                # En 12 reportes de mayo de 2026 la columna viene codificada
                # '1' / '-' en vez de 'Y' / 'N', y cada fichero usa una sola
                # codificacion. Lo mas probable es 1=Y y -=N, pero NO se ha
                # podido verificar contra ninguna semana de cobertura completa,
                # asi que se marca como desconocido en vez de suponerlo.
                if r["dsc_crudo"] not in ("Y", "N"):
                    r["dsc"] = None
        elif tipo == "rts":
            out["rts"] = [{"tid": r.get("Tracking ID"),
                           "cond": r.get("Transporter ID"),
                           "motivo": r.get("RTS Reason"),
                           "cc": r.get("CC")} for r in regs]
        elif tipo == "resumen":
            out["resumen"] = [{"cond": r.get("Transporter ID"),
                               "rts": r.get("RTS"), "dnr": r.get("DNR"),
                               "pod_fails": r.get("POD Fails"),
                               "cc_fails": r.get("CC Fails")} for r in regs]
        else:
            out[tipo] = len(regs)
    return out


def main():
    carpeta = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\Usuario\Downloads"
    ficheros = sorted(glob.glob(os.path.join(carpeta, "*-Daily-Report_*.html")),
                      key=os.path.getmtime)          # de la mas vieja a la mas nueva
    avisos = []
    dias = {}                                        # (centro, fecha_dnr) -> registro

    for f in ficheros:
        base = os.path.basename(f)
        m = re.match(r"ES-([A-Z0-9]+)-([A-Z0-9]+)-Daily-Report_(\d{4}-\d\d-\d\d)_", base)
        if not m:
            avisos.append("%s: nombre no reconocido" % base)
            continue
        dsp, centro, f_rep = m.group(1), m.group(2), m.group(3)
        d = parsea(f, avisos)
        if not d["fecha_dnr"]:
            avisos.append("%s: sin bloque DNR fechado" % base)
            continue
        desfase = (fecha(f_rep) - fecha(d["fecha_dnr"])).days
        if desfase != 2:
            avisos.append("%s: desfase reporte->DNR de %d dias (se espera 2)"
                          % (base, desfase))
        bajado = dt.datetime.fromtimestamp(os.path.getmtime(f)).isoformat(" ", "seconds")
        clave = "%s|%s" % (centro, d["fecha_dnr"])
        reg = dias.get(clave)
        nuevo = {"dsp": dsp, "centro": centro, "fecha_dnr": d["fecha_dnr"],
                 "fecha_reporte": f_rep, "bajado": bajado, "fichero": base,
                 "semana": semana_de(fecha(d["fecha_dnr"])),
                 "rts": d["rts"], "pod_fails": d["pod"], "cc_fails": d["cc"],
                 "resumen": d["resumen"], "dnr": {r["tid"]: r for r in d["dnr"] if r["tid"]}}
        if reg is None:
            dias[clave] = nuevo
            continue
        # Mismo dia bajado otra vez: gana la version mas reciente fila a fila,
        # pero solo si aporta clasificacion (nunca se pierde un 'Y' ya visto).
        for tid, fila in nuevo["dnr"].items():
            viejo = reg["dnr"].get(tid)
            if viejo is None or (viejo.get("dsc") != "Y" and fila.get("dsc") == "Y"):
                reg["dnr"][tid] = fila
        if set(nuevo["dnr"]) != set(reg["dnr"]):
            avisos.append("%s: la re-descarga cambia el conjunto de tracking IDs" % base)
        for k in ("rts", "pod_fails", "cc_fails", "resumen"):
            if nuevo[k]:
                reg[k] = nuevo[k]
        reg["bajado"] = max(reg["bajado"], bajado)
        reg["redescargas"] = reg.get("redescargas", 1) + 1

    salida = []
    for clave in sorted(dias):
        r = dias[clave]
        filas = list(r["dnr"].values())
        r["dnr"] = filas
        r["n_dnr"] = len(filas)
        r["n_dsc"] = sum(1 for x in filas if x.get("dsc") == "Y")
        r["n_dsc_desconocido"] = sum(1 for x in filas if x.get("dsc") is None)
        # Un dia con concesiones y NINGUNA marcada es sospechoso de estar sin
        # clasificar todavia: es exactamente el patron que se demostro arriba.
        # Un dia con codificacion rara tampoco es de fiar.
        r["dsc_fiable"] = bool(filas) and r["n_dsc"] > 0 and r["n_dsc_desconocido"] == 0
        r["dsc_sin_clasificar"] = bool(filas) and not r["dsc_fiable"]
        salida.append(r)

    io.open(DIARIOS, "w", encoding="utf-8").write(json.dumps(salida, indent=1))
    informe(salida, ficheros, avisos)


def informe(salida, ficheros, avisos):
    L = []
    L.append("Ficheros HTML: %d   dias unicos (centro, fecha): %d"
             % (len(ficheros), len(salida)))
    por = defaultdict(list)
    for r in salida:
        por[r["centro"]].append(r)
    L.append("\n%-7s %5s %7s %7s %8s %9s %s"
             % ("centro", "dias", "DNR", "DSC=Y", "sin clas.", "redesc.", "rango"))
    for c in sorted(por):
        rs = por[c]
        fs = sorted(x["fecha_dnr"] for x in rs)
        L.append("%-7s %5d %7d %7d %8d %9d  %s .. %s"
                 % (c, len(rs), sum(x["n_dnr"] for x in rs),
                    sum(x["n_dsc"] for x in rs),
                    sum(1 for x in rs if x["dsc_sin_clasificar"]),
                    sum(x.get("redescargas", 1) - 1 for x in rs), fs[0], fs[-1]))

    L.append("\nDIAS SOSPECHOSOS DE NO ESTAR CLASIFICADOS (hay DNR y ningun DSC=Y):")
    sos = [r for r in salida if r["dsc_sin_clasificar"]]
    for r in sos[:25]:
        L.append("   %s %s  %2d concesiones, 0 marcadas   (bajado %s, reporte %s)"
                 % (r["centro"], r["fecha_dnr"], r["n_dnr"], r["bajado"][:10],
                    r["fecha_reporte"]))
    L.append("   total: %d de %d dias con concesiones"
             % (len(sos), sum(1 for r in salida if r["n_dnr"])))
    L.append("   -> vuelve a descargar esos reportes: la columna DSC se rellena despues.")

    vals = defaultdict(int)
    for r in salida:
        for x in r["dnr"]:
            vals[x.get("dsc_crudo")] += 1
    L.append("\nValores CRUDOS de la columna DSC: %s" % dict(vals))
    L.append("   ('1' y '-' solo salen en reportes de mayo/2026 y cada fichero usa")
    L.append("    una sola codificacion; se dejan como desconocidos, no se adivinan)")

    if avisos:
        L.append("\nAVISOS (%d):" % len(avisos))
        L.extend("   " + a for a in avisos[:60])

    txt = "\n".join(L)
    io.open(os.path.join(os.path.dirname(DIARIOS), "diarios_ingesta.txt"),
            "w", encoding="utf-8").write(txt)
    print(txt)
    print("\nescrito %s" % DIARIOS)


if __name__ == "__main__":
    main()
