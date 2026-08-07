# -*- coding: utf-8 -*-
"""Extractor de scorecards DSP 3.0 (PDF de Amazon) -> docs/scorecards.json

Uso:  python scripts/extraer_scorecards.py [carpeta_con_pdfs]

Lo que saca de cada PDF:
  - pagina 2: las 16 metricas con su VALOR y su TIER, mas el color con que
    estan pintadas y el Overall Score.
  - pagina de SLS: el Target y el Minimum que Amazon publica para ESA semana y
    ESA estacion (dcr, dsc y dnr cambian por estacion; el resto no).
  - paginas de definiciones: el umbral 'Fantastic' de cada metrica.
  - los 'Recommended Focus Areas'.

METODO (por que es fiable, y por que el emparejamiento por texto no lo es):
pypdf y `extract_text()` entrelazan las DOS columnas de la pagina y pegan el
valor de una metrica a la etiqueta de otra. Aqui se usan las COORDENADAS: se
parte la pagina en dos columnas por x=296, se agrupan las palabras en lineas
por altura, y dentro de cada (linea, columna) la etiqueta es una secuencia
CONTIGUA de tokens conocida y el valor es todo lo que queda a su derecha.
Se casa siempre la etiqueta mas larga primero ("Capacity Reliability" es
subsecuencia de "Next Day Capacity Reliability").

Dos comprobaciones de integridad, ambas en el informe:
  - el color del valor tiene que coincidir con el tier escrito;
  - toda linea con algo con forma de valor tiene que tener etiqueta conocida.
"""
import glob
import io
import json
import os
import re
import sys
import unicodedata

import pdfplumber

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(RAIZ, "docs", "scorecards.json")
INFORME = os.path.join(RAIZ, "docs", "scorecards_extraccion.txt")

CORTE_COL = 296.0     # frontera fisica entre las dos columnas de la pagina 2
TOL_LINEA = 4.0       # separacion vertical que rompe linea

# Etiqueta tal cual sale en el PDF -> nombre corto.
ETIQ = [
    ("Safe Driving Metric (FICO)",                  "fico"),
    ("Speeding Event Rate (Per 100 Trips)",         "speeding"),
    ("Mentor Adoption Rate",                        "mentor"),
    ("Vehicle Audit (VSA) Compliance",              "vsa"),
    ("Breach of Contract (BOC)",                    "boc"),
    ("Working Hours Compliance (WHC)",              "whc"),
    ("Comprehensive Audit Score (CAS)",             "cas"),
    ("Customer escalation DPMO",                    "ce_dpmo"),
    ("Customer Delivery Feedback",                  "cdf"),
    ("Delivery Completion Rate(DCR)",               "dcr"),
    ("Delivered Not Received(DNR DPMO)",            "dnr_dpmo"),
    ("Lost on Road (LoR) DPMO",                     "lor_dpmo"),
    ("Delivery Success Conditions (DSC DPMO)",      "dsc_dpmo"),
    ("Photo-On-Delivery",                           "pod"),
    ("Contact Compliance",                          "cc"),
    ("Capacity Reliability",                        "capacity"),
    ("Next Day Capacity Reliability",               "capacity_nd"),
    ("Same Day/Sub-Same Day Capacity Reliability",  "capacity_sd"),
]
SECC = [
    ("Compliance and Safety",   "sec_compliance_safety"),
    ("Delivery Quality & SWC:", "sec_delivery_quality"),
    ("Capacity:",               "sec_capacity"),
]
ETIQ_TOK = sorted([(e.split(), c) for e, c in ETIQ], key=lambda p: -len(p[0]))
SECC_TOK = sorted([(e.split(), c) for e, c in SECC], key=lambda p: -len(p[0]))
RE_VALOR = re.compile(r"^(?:[\d.,]+%?\|[A-Za-z]+|N/A|None)$")

# Colores de relleno reales del PDF. El valor se pinta con el color de su tier;
# la etiqueta va en negro salvo cuando la metrica esta excluida del calculo,
# que entonces va en rojo puro (el PDF lo explica: "Metrics highlighted in red
# are for visibility only and do not impact final DSP Scores/Tiers").
PALETA = {
    (0.267, 0.447, 0.769): "Fantastic",
    (0.439, 0.678, 0.278): "Great",
    (0.929, 0.49, 0.192):  "Fair",
    (1.0, 0.0, 0.0):       "Poor",
    (0.749, 0.561, 0.0):   "Info",
    (0.0,):                "Negro",
    (0.0, 0.0, 0.0):       "Negro",
}
ROJO = (1.0, 0.0, 0.0)

NUM = r"(-?[\d]+(?:[.,]\d+)?)\s*%?"
SLS_FILAS = [
    ("Scorecard Performance",                  "overall"),
    ("Vehicle Audit Compliance (VSA)",         "vsa"),
    ("Safe Driving (FICO)",                    "fico"),
    ("DVIC Compliance",                        "dvic"),
    ("Speeding Event Rate (per 100 trips)",    "speeding"),
    ("Customer Escalation DPMO",               "ce_dpmo"),
    ("Customer Delivery Feedback DPMO",        "cdf"),
    ("Route Reliability",                      "capacity"),
    ("Delivery Completion Rate (DCR)",         "dcr"),
    ("Delivery Success Conditions (DSC DPMO)", "dsc_dpmo"),
    ("Photo On Delivery",                      "pod"),
    ("Contact Compliance",                     "cc"),
    ("Lost on Road DPMO",                      "lor_dpmo"),
    ("Delivered Not Received DPMO",            "dnr_dpmo"),
    ("Working Hour Compliance",                "whc"),
    ("Mentor Adoption Rate",                   "mentor"),
]
DEF_FRASES = [
    (r">=\s*" + NUM + r"%?\s*in VSA",                        "vsa"),
    (r">=\s*" + NUM + r"\s*in FICO",                         "fico"),
    (r"<=\s*" + NUM + r"%?\s*speeding events per 100 trips", "speeding"),
    (r">=?\s*" + NUM + r"%?\s*in EMentor Adoption Rate",     "mentor"),
    (r"receive a\s*" + NUM + r"%?\s*in CAS",                 "cas"),
    (r"receive a\s*" + NUM + r"%?\s*in WHC",                 "whc"),
    (r">=\s*" + NUM + r"%?\s*in DCR",                        "dcr"),
    (r"<=\s*" + NUM + r"\s*in DNR DPMO",                     "dnr_dpmo"),
    (r"<=\s*" + NUM + r"\s*LoR DPMO",                        "lor_dpmo"),
    (r"DSC DPMO\s*<=?\s*" + NUM,                             "dsc_dpmo"),
    (r">=\s*" + NUM + r"%?\s*in Photo on Delivery",          "pod"),
    (r"receive a\s*" + NUM + r"%?\s*in Contact Compliance",  "cc"),
    (r"<=\s*" + NUM + r"\s*in CDF",                          "cdf"),
    (r"receive a\s*" + NUM + r"\s*in Customer",              "ce_dpmo"),
]
FOCUS_MAPA = [
    ("Delivery Success Conditions", "dsc_dpmo"), ("Contact Compliance", "cc"),
    ("Delivery Completion Rate", "dcr"), ("Working Hour", "whc"),
    ("Working Hours", "whc"), ("Customer escalation", "ce_dpmo"),
    ("Customer Escalation", "ce_dpmo"), ("Lost on Road", "lor_dpmo"),
    ("Photo-On-Delivery", "pod"), ("Photo On Delivery", "pod"),
    ("Delivered Not Received", "dnr_dpmo"), ("VSA", "vsa"),
    ("Vehicle Audit", "vsa"), ("Mentor Adoption", "mentor"),
    ("Capacity Reliability", "capacity"), ("Customer Delivery Feedback", "cdf"),
    ("Safe Driving", "fico"), ("Speeding", "speeding"),
    ("Comprehensive Audit", "cas"), ("Breach of Contract", "boc"),
    ("DVIC", "dvic"),
]


# --------------------------------------------------------------------- utiles
def limpia(t):
    t = unicodedata.normalize("NFKD", t)
    t = t.replace("\u2264", "<=").replace("\u2265", ">=")
    t = re.sub(r"\(cid:\d+\)", "", t)
    return re.sub(r"\s+", " ", t)


def num(s):
    return None if s is None else float(s.replace(",", "."))


def color_char(ch):
    c = ch.get("non_stroking_color")
    if c is None:
        return None
    if isinstance(c, (int, float)):
        c = (c,)
    return tuple(round(float(x), 3) for x in c)


def colorea(palabras, chars):
    """Color dominante de los caracteres de cada palabra."""
    for w in palabras:
        cnt = {}
        for c in chars:
            if not c["text"].strip():
                continue
            if (w["x0"] - 0.6 <= c["x0"] and c["x1"] <= w["x1"] + 0.6
                    and abs(c["top"] - w["top"]) < 3.0):
                k = color_char(c)
                cnt[k] = cnt.get(k, 0) + 1
        w["color"] = max(cnt, key=cnt.get) if cnt else None
    return palabras


def lineas(pagina):
    ws = colorea(pagina.extract_words(use_text_flow=False), pagina.chars)
    grupos, actual, ultimo = [], [], None
    for w in sorted(ws, key=lambda x: x["top"]):
        if ultimo is not None and w["top"] - ultimo > TOL_LINEA:
            if actual:
                grupos.append(actual)
            actual = []
        actual.append(w)
        ultimo = w["top"]
    if actual:
        grupos.append(actual)
    return grupos


def busca_etiqueta(toks, patron):
    """Indice donde ACABA la secuencia contigua `patron` dentro de `toks`."""
    n = len(patron)
    for i in range(len(toks) - n + 1):
        if toks[i:i + n] == patron:
            return i + n
    return None


def normaliza(bruto):
    """'97.1%|Great' -> (97.1, 'Great');  'None'/'N/A'/'In Compliance' -> (None, txt)."""
    t = (bruto or "").strip()
    if not t:
        return None, None
    if "|" in t:
        izq, der = t.split("|", 1)
        izq = izq.strip().replace(",", "").replace("%", "")
        try:
            return float(izq), der.strip()
        except ValueError:
            return None, t
    return None, t


# ---------------------------------------------------------------- extraccion
def metricas_pagina2(pagina, base, avisos):
    out = {}
    for grupo in lineas(pagina):
        ordenado = sorted(grupo, key=lambda x: x["x0"])
        # Las cabeceras de seccion ocupan la linea ENTERA (etiqueta a la
        # izquierda, tier pegado al margen derecho): no se parten en columnas.
        toks_linea = [w["text"] for w in ordenado]
        for patron, corto in SECC_TOK:
            fin = busca_etiqueta(toks_linea, patron)
            if fin is not None and corto not in out:
                resto = " ".join(toks_linea[fin:]).strip()
                if resto:
                    out[corto] = resto

        for lo, hi in ((0.0, CORTE_COL), (CORTE_COL, 1e4)):
            col = [w for w in ordenado if lo <= w["x0"] < hi]
            if not col:
                continue
            toks = [w["text"] for w in col]
            for patron, corto in ETIQ_TOK:       # una metrica por linea-columna
                fin = busca_etiqueta(toks, patron)
                if fin is None:
                    continue
                bruto = " ".join(toks[fin:]).strip()
                if not bruto:
                    break
                if corto in out:
                    avisos.append("%s: %s duplicado (%r vs %r)"
                                  % (base, corto, out[corto], bruto))
                    break
                cet = [w["color"] for w in col[fin - len(patron):fin]]
                cva = [w["color"] for w in col[fin:]]
                out[corto] = bruto
                out["#et#" + corto] = "rojo" if ROJO in cet else "negro"
                out["#va#" + corto] = PALETA.get(cva[0], str(cva[0])) if cva else None
                break
            else:
                sueltos = [t for t in toks if RE_VALOR.match(t)]
                if sueltos:
                    avisos.append("METRICA DESCONOCIDA %s: %r" % (base, " ".join(toks)))
    return out


def umbrales(textos):
    todo = limpia("\n".join(textos))
    sls = {}
    for t in textos:
        if "Operational SLS Metrics" in t:
            pag = limpia(t)
            for etiqueta, corto in SLS_FILAS:
                m = re.search(re.escape(etiqueta) + r"\s+" + NUM + r"\s+" + NUM, pag)
                if m:
                    sls[corto] = [num(m.group(1)), num(m.group(2))]
            break
    fan = {}
    for pat, corto in DEF_FRASES:
        m = re.search(pat, todo)
        if m:
            fan[corto] = num(m.group(1))
    return sls, fan


def focus_areas(texto_p2):
    m = re.search(r"Recommended Focus Areas(.*?)(?:Current Week Tips|Page 2)",
                  texto_p2, re.S)
    if not m:
        return []
    out = []
    for linea in m.group(1).split("\n"):
        mm = re.match(r"\s*([123])\.\s*(.+)", linea)
        if not mm:
            continue
        txt = mm.group(2).lower()
        for clave, corto in FOCUS_MAPA:
            if clave.lower() in txt:
                out.append(corto)
                break
        else:
            out.append("?" + mm.group(2).strip()[:40])
    return out


def leer(fichero, avisos):
    base = os.path.basename(fichero)
    with pdfplumber.open(fichero) as pdf:
        textos = [(p.extract_text() or "") for p in pdf.pages]
        if len(pdf.pages) < 2:
            avisos.append("%s: solo %d paginas" % (base, len(pdf.pages)))
            return None
        crudo = metricas_pagina2(pdf.pages[1], base, avisos)
    sls, fan = umbrales(textos)
    return crudo, textos, sls, fan


def main():
    carpeta = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\Usuario\Downloads"
    patron = os.path.join(carpeta, "*Week*-DSP-Scorecard*.pdf")
    ficheros = sorted(glob.glob(patron))
    filas, vistos, avisos = [], {}, []

    for f in ficheros:
        base = os.path.basename(f)
        # El nombre trae pais, DSP y centro: ES-TDSL-OGA5-Week31-...
        m = re.match(r"([A-Z]{2})-([A-Z0-9]+)-([A-Z0-9]+)-Week(\d+)-", base)
        if not m:
            avisos.append("%s: nombre no reconocido" % base)
            continue
        pais, dsp, centro, wk = m.group(1), m.group(2), m.group(3), int(m.group(4))

        leido = leer(f, avisos)
        if leido is None:
            continue
        crudo, textos, sls, fan = leido
        t2 = textos[1]
        mo = re.search(r"Overall Score:\s*([\d.,]+)\s*\|\s*(\w+)", t2)
        my = re.search(r"Week\s*(\d+)\s*-\s*(\d{4})", t2)
        mr = re.search(r"Rank at [A-Z0-9]+:\s*(\d+)\s*\(\s*(-?\d+)\s*WoW\)", t2)

        fila = {
            "pais": pais, "dsp": dsp, "centro": centro, "semana": wk,
            "anio": int(my.group(2)) if my else None,
            "id": "%s-W%02d" % (centro, wk),
            "fichero": base, "paginas": len(textos),
            "overall": num(mo.group(1)) if mo else None,
            "overall_tier": mo.group(2) if mo else None,
            "rank": int(mr.group(1)) if mr else None,
            "sls": sls, "fantastic_doc": fan,
            "focus_areas": focus_areas(t2),
        }
        for _, corto in ETIQ:
            val, tier = normaliza(crudo.get(corto))
            fila[corto] = val
            fila[corto + "_tier"] = tier
            fila[corto + "_etiq_roja"] = crudo.get("#et#" + corto) == "rojo"
            fila[corto + "_color"] = crudo.get("#va#" + corto)
        for _, corto in SECC:
            fila[corto] = (crudo.get(corto) or "").strip() or None

        # Las tres variantes de capacidad son la MISMA casilla del scorecard:
        # unos centros la parten en Next Day / Same Day y otros no.
        if fila["capacity"] is None and fila["capacity_nd"] is not None:
            for suf in ("", "_tier", "_color", "_etiq_roja"):
                fila["capacity" + suf] = fila["capacity_nd" + suf]

        clave = (dsp, centro, wk)
        if clave in vistos:
            prev = vistos[clave]
            dif = [k for k in fila if k != "fichero" and prev.get(k) != fila.get(k)]
            if dif:
                avisos.append("DUPLICADO DISCREPANTE %s: %s vs %s -> %s"
                              % (clave, prev["fichero"], base, dif))
            continue
        vistos[clave] = fila
        filas.append(fila)

    filas.sort(key=lambda d: (d["centro"], d["semana"]))
    informe(filas, ficheros, avisos)
    with io.open(SALIDA, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(filas, indent=1))
    print("escrito %s  (%d scorecards)" % (SALIDA, len(filas)))


def informe(filas, ficheros, avisos):
    n = len(filas) or 1
    L = []
    L.append("Ficheros: %d   scorecards unicas (dsp,centro,semana): %d"
             % (len(ficheros), len(filas)))
    cen = {}
    for d in filas:
        cen.setdefault(d["centro"], []).append(d["semana"])
    L.append("\nCENTROS:")
    for c in sorted(cen):
        L.append("  %-6s %2d semanas  %s" % (c, len(cen[c]), sorted(cen[c])))

    L.append("\nCOBERTURA: valor numerico presente / tier presente")
    for _, c in ETIQ:
        nv = sum(1 for d in filas if d.get(c) is not None)
        nt = sum(1 for d in filas if d.get(c + "_tier"))
        L.append("  %-12s num %3d (%5.1f%%)   tier %3d (%5.1f%%)"
                 % (c, nv, 100.0 * nv / n, nt, 100.0 * nt / n))

    L.append("\nQA-1 numerico ausente CON tier real (= fallo de extraccion):")
    fallos = 0
    for d in filas:
        for _, c in ETIQ:
            t = d.get(c + "_tier")
            if d.get(c) is None and t and t not in ("N/A", "None", "In Compliance"):
                L.append("  %s %s tier=%r" % (d["id"], c, t))
                fallos += 1
    L.append("  fallos: %d" % fallos)

    L.append("\nQA-2 color del valor vs tier escrito (deben coincidir):")
    mal = 0
    for d in filas:
        for _, c in ETIQ:
            t, col = d.get(c + "_tier"), d.get(c + "_color")
            if t in ("Fantastic", "Great", "Fair", "Poor") and col != t:
                mal += 1
                if mal <= 10:
                    L.append("  %s %s: tier %s color %s" % (d["id"], c, t, col))
    L.append("  discrepancias: %d" % mal)

    L.append("\nETIQUETA EN ROJO ('for visibility only, do not impact'):")
    for _, c in ETIQ:
        r = sum(1 for d in filas if d.get(c + "_etiq_roja"))
        if r:
            L.append("  %-12s %d/%d" % (c, r, len(filas)))

    if avisos:
        L.append("\nAVISOS (%d):" % len(avisos))
        L.extend("  " + a for a in avisos[:150])

    txt = "\n".join(L)
    with io.open(INFORME, "w", encoding="utf-8") as fh:
        fh.write(txt)
    print(txt)


if __name__ == "__main__":
    main()
