# -*- coding: utf-8 -*-
"""Extrae TODAS las metricas de las 17 scorecards emparejando etiqueta y valor
por POSICION FISICA en la pagina, no por orden del texto.

Metodo: se agrupan las palabras en lineas por su coordenada vertical. En cada
linea, el valor de una etiqueta es el primer token con forma de valor
(`X|Tier`, `N/A`, `None`, `In Compliance`) que aparece a su DERECHA y antes de
que empiece la siguiente etiqueta. El scorecard tiene dos columnas, asi que
una misma linea puede llevar dos pares etiqueta-valor.
"""
import io, os, re, glob, json
import pdfplumber

SAL = r'C:\Users\Usuario\AppData\Local\Temp\claude\C--Users-Usuario\198402e7-dfae-487c-a4f1-38c4a6569af3\scratchpad\todas.txt'
JSN = r'C:\Users\Usuario\AppData\Local\Temp\claude\C--Users-Usuario\198402e7-dfae-487c-a4f1-38c4a6569af3\scratchpad\todas.json'
os.chdir(r'C:\Users\Usuario\Downloads')

# Etiquetas exactas tal y como salen en el PDF -> nombre corto
ETIQ = [
    ("Safe Driving Metric (FICO)", "fico"),
    # La etiqueta COMPLETA incluye "(Per 100 Trips)". Con la corta, el limite
    # derecho caia sobre "(Per" y el valor quedaba fuera del rango buscado.
    ("Speeding Event Rate (Per 100 Trips)", "speeding"),
    ("Mentor Adoption Rate", "mentor"),
    ("Vehicle Audit (VSA) Compliance", "vsa"),
    ("Breach of Contract (BOC)", "boc"),
    ("Working Hours Compliance (WHC)", "whc"),
    ("Comprehensive Audit Score (CAS)", "cas"),
    ("Customer escalation DPMO", "ce_dpmo"),
    ("Customer Delivery Feedback", "cdf"),
    ("Delivery Completion Rate(DCR)", "dcr"),
    ("Delivered Not Received(DNR DPMO)", "dnr_dpmo"),
    ("Lost on Road (LoR) DPMO", "lor_dpmo"),
    ("Delivery Success Conditions (DSC DPMO)", "dsc_dpmo"),
    ("Photo-On-Delivery", "pod"),
    ("Contact Compliance", "cc"),
    ("Capacity Reliability", "capacity"),
]
# Un valor es: "94.97%|Poor", "814|Great", "1657|NA", "N/A", "None",
# "In Compliance", "Fantastic"
RE_VAL = re.compile(r"^(?:[\d.,]+%?\|[A-Za-z]+|N/A|None|In|[\d.,]+\|NA)$")


def valor_de(linea, x_ini, x_fin):
    """Primer token con forma de valor entre dos coordenadas x."""
    cand = [w for w in linea if x_ini < w["x0"] < x_fin and RE_VAL.match(w["text"])]
    if not cand:
        return None
    w = cand[0]
    if w["text"] == "In":                      # "In Compliance"
        return "In Compliance"
    return w["text"]


def leer(fichero):
    out = {}
    with pdfplumber.open(fichero) as pdf:
        p = pdf.pages[1]
        palabras = p.extract_words(use_text_flow=False)
    # Agrupacion por PROXIMIDAD real, no por redondeo. Con round(top/3) los
    # valores de FICO y VSA (top=208,5) caian en un grupo distinto que sus
    # etiquetas (top=209,0) y se perdian: 0 de 17 semanas las traian. Medio
    # punto de altura tumbaba tres metricas.
    grupos, actual, ultimo = [], [], None
    for w in sorted(palabras, key=lambda x: x["top"]):
        if ultimo is not None and w["top"] - ultimo > 4.0:
            grupos.append(actual); actual = []
        actual.append(w); ultimo = w["top"]
    if actual:
        grupos.append(actual)

    for grupo in grupos:
        ws = sorted(grupo, key=lambda x: x["x0"])
        texto = " ".join(w["text"] for w in ws)
        for etiqueta, corto in ETIQ:
            if etiqueta not in texto:
                continue
            # x donde ACABA la etiqueta: ultima palabra de la etiqueta
            ult = etiqueta.split()[-1]
            xs = [w["x1"] for w in ws if w["text"] == ult]
            if not xs:
                continue
            x_ini = min(xs)
            # Limite derecho: donde empieza la siguiente etiqueta de la linea
            otras = [w["x0"] for w in ws
                     if w["x0"] > x_ini and not RE_VAL.match(w["text"])
                     and w["text"] not in ("Compliance",)]
            x_fin = min(otras) if otras else 612
            v = valor_de(ws, x_ini, x_fin)
            if v and corto not in out:
                out[corto] = v
    return out


filas = []
vistos = set()
# Acepta CUALQUIER scorecard, no solo OGA5: el nombre trae pais, DSP y centro.
# Preparado para procesar cientos de PDFs de varios centros a la vez.
for f in sorted(glob.glob("*Week*-DSP-Scorecard*.pdf"),
                key=lambda x: int(re.search(r"Week(\d+)", x).group(1))):
    wk = int(re.search(r"Week(\d+)", f).group(1))
    # El centro va en el nombre del fichero (ES-TDSL-OGA5-Week31-...). Sin esto,
    # mezclar dos centros haria que uno pisara al otro por numero de semana.
    partes = os.path.basename(f).split("-")
    centro = partes[2] if len(partes) > 2 else "?"
    clave = (centro, wk)
    if clave in vistos:
        continue
    vistos.add(clave)
    d = leer(f)
    with pdfplumber.open(f) as pdf:
        t2 = pdf.pages[1].extract_text() or ""
    m = re.search(r"Overall Score:\s*([\d.]+)\s*\|\s*(\w+)", t2)
    d["semana"] = wk
    d["centro"] = centro
    d["fichero"] = os.path.basename(f)
    d["overall"] = float(m.group(1)) if m else None
    d["overall_tier"] = m.group(2) if m else None
    filas.append(d)

cols = ["centro", "semana", "overall", "overall_tier"] + [c for _, c in ETIQ]
with io.open(SAL, "w", encoding="utf-8") as fh:
    fh.write(" | ".join("%-13s" % c for c in cols) + "\n")
    fh.write("-" * (16 * len(cols)) + "\n")
    for d in filas:
        fh.write(" | ".join("%-13s" % str(d.get(c, "—"))[:13] for c in cols) + "\n")
    fh.write("\n\nCOBERTURA (cuantas de las 17 semanas traen cada metrica):\n")
    for _, c in ETIQ:
        n = sum(1 for d in filas if d.get(c))
        fh.write("   %-12s %2d/17\n" % (c, n))
io.open(JSN, "w", encoding="utf-8").write(json.dumps(filas, indent=1))
print("escrito, %d semanas" % len(filas))
