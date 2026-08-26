# -*- coding: utf-8 -*-
"""Nomenclator de Galicia: saber EN QUE CONCELLO buscar antes de buscar.

EL PROBLEMA
───────────
De 166 direcciones que el rescate guardo en cache, 149 devolvieron CERO
candidatos (90%). No es que acertaran mal: es que no encontraban nada. Y
mirandolas una a una se ve por que:

    LUGAR BOA VISTA | NUM 24 | 15250
    ALDEA GRANDE | AGUIONS | 36685
    A VESADA-SERRES | MUROS | 15259
    LUGAR DE AGUIEIRA | PORTO DO SON | 15970

Eso no son calles con portal. Son LUGARES y PARROQUIAS, que es como se vive
en la Galicia rural y como los escribe el cliente al pedir. Un geocodificador
general —Google incluido— busca calles, y ahi no hay ninguna.

Existe la fuente oficial que si los tiene: el Nomenclator de Galicia (Xunta),
42.212 toponimos, edicion aprobada en marzo de 2026, licencia CC BY-SA 4.0.
Este modulo lo lleva reducido a un indice de 1,9 MB:

    17.521 lugares · 3.101 parroquias · 313 concellos · 1.895 sinonimos

LO QUE ESTE MODULO NO HACE
──────────────────────────
NO da coordenadas. El Nomenclator no las trae —lo comprobamos abriendo el
fichero antes de construir nada sobre el—. Lo que hace es convertir una
cadena inutil en un CONCELLO concreto, para que Catastro y CartoCiudad
busquen acotados en vez de a ciegas. El punto lo siguen dando ellos.

LA REGLA QUE EVITA LOS FALSOS POSITIVOS
───────────────────────────────────────
La primera version de esto situaba "MUROS DE SAN PEDRO" (CP 15250, A Coruña)
en A GUARDA, que esta en Pontevedra, porque existe un lugar con ese nombre
alli. Y mandaba "SEGO 25 ARTES | RIBEIRA" a Vedra ignorando que la propia
direccion decia Ribeira. Dos inventos, de los que hacen que alguien conduzca
120 km para nada.

De ahi las tres reglas, en este orden:

  1. El CODIGO POSTAL manda. Si su provincia no cuadra con la del candidato,
     el candidato se cae. Si se caen todos, se calla.
  2. El MUNICIPIO escrito en la direccion desambigua entre los que quedan.
  3. Si despues de eso sigue habiendo mas de un concello posible, NO SE
     AFIRMA NADA. Un "no lo se" cuesta una llamada; un concello inventado
     cuesta una mañana.

Hay 128 sitios llamados OUTEIRO en Galicia. Sin estas reglas, elegir uno es
tirar un dado con cara de dato.
"""
import io
import json
import os
import re
import unicodedata

# El indice va en el propio repo: son 1,9 MB y es dato de referencia que no
# cambia entre despliegues. Meterlo en Mongo obligaria a una consulta por
# direccion y a decidir en que base vive (es global, no de un cliente).
_RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                     "datos", "nomenclator_gal.json")

# Las dos primeras cifras del CP dan la provincia, y con eso basta para tirar
# la mitad de los candidatos falsos. Galicia entera son cuatro.
PROV_CP = {"15": "A CORUÑA", "27": "LUGO", "32": "OURENSE", "36": "PONTEVEDRA"}

# Lo que la gente escribe delante del nombre y no forma parte de el.
_PREFIJOS = ("LUGAR DE ", "LUGAR ", "ALDEA DE ", "ALDEA ", "LG ", "LG. ",
             "BARRIO DE ", "BARRIO ", "PARROQUIA DE ", "PARROQUIA ",
             "O LUGAR DE ", "A ALDEA DE ")
# Colas de portal/piso que sobran al buscar un toponimo.
_COLA = re.compile(r"\s+(?:N|NO|NUM|NUMERO|PISO|BAJO|BAIXO|IZQ|IZDA|DCHA?|ESC|PTA)\.?$")
_CORTE = re.compile(r"\b(?:N|NO|NUM|NUMERO)\b")

_datos = None


def _cargar():
    global _datos
    if _datos is None:
        try:
            with io.open(_RUTA, encoding="utf-8") as f:
                _datos = json.load(f)
        except Exception:
            # Sin el fichero, el modulo se comporta como si no supiera nada.
            # Nunca debe tumbar el geocodificador que lo llama.
            _datos = {"lugares": {}, "parroquias": {}, "concellos": {}, "sinonimos": {}}
    return _datos


def normalizar(s: str) -> str:
    """Mayusculas, sin tildes, y el articulo pospuesto puesto delante.

    El Nomenclator escribe 'Bulleiros, Os' y la gente escribe 'Os Bulleiros'.
    Sin esta vuelta, ninguno de los dos encuentra al otro.
    """
    s = unicodedata.normalize("NFD", (s or "").strip().upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("º", " ").replace("°", " ").replace("ª", " ")
    if ", " in s:
        base, art = s.rsplit(", ", 1)
        if len(art) <= 3:
            s = art + " " + base
    return " ".join(s.split())


def limpiar(s: str) -> str:
    """Deja solo el toponimo: fuera prefijo, portal, piso y lo que siga."""
    s = normalizar(s)
    for p in _PREFIJOS:
        if s.startswith(p):
            s = s[len(p):]
            break
    s = _CORTE.split(s)[0]
    s = re.sub(r"\d+.*$", "", s).strip(" .,-")
    # 'GANDARA NO9' deja 'GANDARA NO' al quitar el numero, porque el 9 es
    # caracter de palabra y no casa con el corte anterior.
    s = _COLA.sub("", s).strip(" .,-")
    return " ".join(s.split())


def _candidatos(texto: str):
    """(tipo, [[concello, parroquia, provincia], ...]) sin filtrar todavia."""
    d = _cargar()
    c = limpiar(texto)
    if not c or len(c) < 3:
        return None, []
    # SE UNEN LOS TRES, no se para en el primero que acierte.
    # 'OLEIROS' es lugar en Tordoia Y parroquia en Ribeira. Parando en los
    # lugares, una direccion de Ribeira acababa en Tordoia —60 km— con
    # aspecto de dato bueno. Si el nombre existe en dos capas, los dos son
    # candidatos y que decidan el CP y el municipio.
    for clave in (c, d["sinonimos"].get(c, "")):
        if not clave:
            continue
        acum, tipos = [], []
        for x in d["lugares"].get(clave, []):
            acum.append(list(x)); tipos.append("lugar")
        for x in d["parroquias"].get(clave, []):
            # La parroquia se guarda a si misma como nombre: hace falta para
            # desambiguar cuando el campo 'municipio' trae una parroquia.
            acum.append([x[0], clave, x[1]]); tipos.append("parroquia")
        if clave in d["concellos"]:
            v = d["concellos"][clave]
            acum.append([v[0], "", v[1]]); tipos.append("concello")
        if acum:
            return (tipos[0] if len(set(tipos)) == 1 else "mixto"), acum
    # 'A VESADA-SERRES' y 'SANTA CRUZ DE RIBADULLA--VEDRA': el separador
    # es basura de la fuente, pero los trozos si son toponimos buenos.
    for trozo in re.split(r"[-.]+", c):
        t = trozo.strip()
        if len(t) >= 4:
            if t in d["lugares"]:
                return "lugar", [list(x) for x in d["lugares"][t]]
            if t in d["parroquias"]:
                return "parroquia", [[x[0], "", x[1]] for x in d["parroquias"][t]]
    return None, []


def situar(via: str = "", municipio: str = "", cp: str = "") -> dict:
    """En que concello esta esta direccion. Silencioso si no puede afirmarlo.

    JERARQUIA DE PRUEBAS, de mas fiable a menos:

      1. EL CODIGO POSTAL. Viene del INE y no lo escribe nadie a mano, asi que
         es el unico campo que no trae erratas. 1.498 CP gallegos, de los que
         101 se reparten entre dos o mas concellos: cuando pasa eso, el CP
         acota y no decide.
      2. EL MUNICIPIO ESCRITO, si el Nomenclator lo reconoce como concello o
         parroquia. Ojo: este campo trae basura a menudo ('GANDARA 19'), por
         eso no puede mandar sobre el CP.
      3. EL NOMBRE DE LA VIA/LUGAR. El mas rico y el menos fiable: hay 128
         sitios llamados OUTEIRO en Galicia.

    Y la regla que lo sostiene todo: si al final queda mas de un concello
    posible, se devuelve `concello: None`. Un "no lo se" cuesta una llamada;
    un concello inventado cuesta una mañana de conduccion.

    Devuelve siempre dict, nunca lanza. `motivo` distingue "no lo encuentro"
    de "encuentro demasiados", que se atienden distinto.
    """
    d = _cargar()
    tipo_v, cands_v = _candidatos(via)
    tipo_m, cands_m = _candidatos(municipio) if municipio else (None, [])

    # UN CONCELLO EXACTO EN EL CAMPO 'MUNICIPIO' GANA A TODO LO DEMAS.
    # En Galicia media docena de concellos comparten nombre con lugares de
    # otros concellos: hay un lugar 'Boiro' en Porto do Son y otro en Val do
    # Dubra. Sin esta regla, un 'municipio: BOIRO' —que es exactamente lo que
    # ese campo existe para decir— salia ambiguo entre tres, y se perdia una
    # respuesta que estaba clarisima.
    if municipio:
        _mc = limpiar(municipio)
        if _mc in d["concellos"]:
            v_ = d["concellos"][_mc]
            tipo_m, cands_m = "concello", [[v_[0], "", v_[1]]]

    # ── 1. El CP ─────────────────────────────────────────────────────────────
    cp_l = re.sub(r"\D", "", str(cp or ""))[:5]
    cp_set = {normalizar(x) for x in (d.get("cp_concello") or {}).get(cp_l, [])}
    prov = PROV_CP.get(cp_l[:2]) if cp_l else None

    def _filtra(cs, permitidos):
        return [c for c in cs if normalizar(c[0]) in permitidos]

    # ── 2. Reunir lo que dicen via y municipio ───────────────────────────────
    if cp_set:
        # El CP conoce el concello (o dos). Se comprueba si via/municipio
        # caen dentro; los que no, se descartan por contradecir al CP.
        dentro = _filtra(cands_v, cp_set) + _filtra(cands_m, cp_set)
        if dentro:
            cands, tipo = dentro, (tipo_v if _filtra(cands_v, cp_set) else tipo_m)
        elif len(cp_set) == 1:
            # Ni la via ni el municipio se reconocen, pero el CP es unico:
            # eso ya es una respuesta buena, solo que sin parroquia.
            nombre = (d["cp_concello"][cp_l])[0]
            return {"concello": nombre, "parroquia": None,
                    "provincia": prov, "tipo": "cp", "motivo": "ok",
                    "candidatos": 1, "fuente": "cp"}
        else:
            return {"concello": None, "motivo": "ambiguo", "candidatos": len(cp_set),
                    "posibles": sorted(d["cp_concello"][cp_l])}
    else:
        # Sin CP conocido: la provincia todavia sirve de criba.
        if tipo_v and tipo_m:
            comun = {normalizar(c[0]) for c in cands_v} & {normalizar(c[0]) for c in cands_m}
            if comun:
                cands, tipo = _filtra(cands_v, comun), tipo_v
            else:
                cands, tipo = cands_m, tipo_m
        elif tipo_v:
            cands, tipo = cands_v, tipo_v
        elif tipo_m:
            cands, tipo = cands_m, tipo_m
        else:
            return {"concello": None, "motivo": "no_encontrado", "candidatos": 0}
        if prov:
            f = [c for c in cands if normalizar(c[2]) == normalizar(prov)]
            if f:
                cands = f
            else:
                return {"concello": None, "motivo": "cp_contradice",
                        "candidatos": len(cands)}

    # ── 3. El mismo concello repetido no es una duda ─────────────────────────
    vistos, unicos = set(), []
    for c in cands:
        k = normalizar(c[0])
        if k not in vistos:
            vistos.add(k)
            unicos.append(c)
    cands = unicos

    if len(cands) != 1:
        return {"concello": None, "motivo": "ambiguo", "candidatos": len(cands),
                "posibles": [c[0] for c in cands[:8]]}

    c = cands[0]
    return {"concello": c[0], "parroquia": c[1] or None, "provincia": c[2],
            "tipo": tipo, "motivo": "ok", "candidatos": 1,
            "fuente": "cp+nombre" if cp_set else "nombre"}


def hay_datos() -> bool:
    return bool(_cargar()["lugares"])


if __name__ == "__main__":  # pragma: no cover
    import sys
    fallos = [l.strip()[2:].strip() for l in io.open(sys.argv[1], encoding="utf-8")
              if l.strip().startswith("::")] if len(sys.argv) > 1 else []
    cuenta = {}
    for f in fallos:
        p = (f.split("|") + ["", "", ""])[:3]
        r = situar(p[0], p[1], p[2])
        cuenta[r["motivo"]] = cuenta.get(r["motivo"], 0) + 1
        print("  %-48s %-14s %s" % (f[:48], r["motivo"], r.get("concello") or
                                    (r.get("posibles") or "")))
    n = max(1, len(fallos))
    print("\n--- %d direcciones ---" % len(fallos))
    for k, v in sorted(cuenta.items(), key=lambda x: -x[1]):
        print("  %-16s %3d  (%.0f%%)" % (k, v, 100.0 * v / n))
