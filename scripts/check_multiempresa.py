# -*- coding: utf-8 -*-
"""Un centro de la empresa principal escrito a mano no puede DECIDIR nada.

   ═══════════════════════════════════════════════════════════════════════
   OGA5, DGA1 y DGA2 son las naves de Dani. Aparecen legitimamente en datos
   —los talleres semilla de Galicia, el plano real de su nave, ejemplos en
   comentarios— y eso no molesta a nadie: son datos suyos en su base.

   El problema es cuando DECIDEN:

     · como valor por defecto  (`center or "OGA5"`, `Form("OGA5")`)
       -> en otra empresa el dato se guarda en un centro que no existe en su
          flota, no vuelve a salir en ninguna pantalla, y no falla nada;
     · dentro de una lista cerrada de codigos validos
       -> lo que no este en la lista se descarta en silencio.

   El 31-08-2026 habia ONCE. Tres en importaciones y plan de reparto, y ocho
   mas en el modulo de scorecard —justo lo que Amazon mide—: una empresa nueva
   que subiera su scorecard la guardaba bajo OGA5 y no la veia nunca. Y antes
   de eso, `_normalize_center_code` llevaba los tres codigos en un `for` y
   devolvia "" para cualquier otro, con lo que Revision Rapida filtrada por
   centro daba CERO fuera de OGA5 (gotcha 43).

   La cura esta hecha: `_centro_por_defecto()` devuelve el centro principal de
   la organizacion que llama, y `_centro_norm` reconoce cualquier codigo.

   Se ejecuta con: python scripts/check_multiempresa.py
"""
import io
import os
import re
import sys

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "server.py")
CENTROS = ("OGA5", "DGA1", "DGA2")

# Un centro literal que DECIDE. Cada patron salio de un fallo real de hoy.
PATRONES = [
    (re.compile(r'\bor\s+"(?:%s)"' % "|".join(CENTROS)),
     'valor por defecto con `or`: en otra empresa el dato acaba en un centro que no existe'),
    (re.compile(r'(?:Form|Query|Body)\(\s*"(?:%s)"' % "|".join(CENTROS)),
     'valor por defecto de un parametro: lo mismo, pero desde el formulario'),
    (re.compile(r'=\s*"(?:%s)"\s*[,)]' % "|".join(CENTROS)),
     'valor por defecto en la firma de la funcion'),
    (re.compile(r'for\s+\w+\s+in\s+\(\s*"(?:%s)"' % "|".join(CENTROS)),
     'lista cerrada de codigos: lo que no este dentro se descarta en silencio'),
]

# Lo que SI puede llevar el codigo dentro, porque es un dato y no una decision.
# Se listan a mano y con motivo: adivinarlo por la forma dejaria pasar el
# proximo default disfrazado de dato.
PERMITIDO = {
    "_SEED_WORKSHOPS": "talleres reales de Galicia, sembrados solo en la base principal",
    "_SEED_RENTALS": "alquiladoras reales de Santiago, sembradas solo en la base principal",
    "_CENTER_COORDS": "coordenadas de las naves de Dani (hoy no la usa nadie)",
    "_pk_default_layout": "el plano de aparcamiento con la geometria REAL de su nave; "
                          "otra empresa recibe el generico, que es lo correcto",
    "ensure_owner_org": "crea la organizacion principal: sus centros son literalmente esos",
    "_centros_referencia": "referencias geograficas de los talleres semilla; a mas de 70 km "
                           "no etiqueta, que es la respuesta correcta fuera de Galicia",
    "fix_centers": "endpoint de mantenimiento antiguo, superado por /checkers/centros",
}

src = io.open(RUTA, encoding="utf-8-sig").read()
lineas = src.split("\n")

# Que funcion o variable de modulo contiene cada linea, para poder permitir.
import ast
arbol = ast.parse(src)
dueños = {}
for n in ast.walk(arbol):
    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
        for i in range(n.lineno, (n.end_lineno or n.lineno) + 1):
            dueños[i] = n.name
for n in arbol.body:
    if isinstance(n, (ast.Assign, ast.AnnAssign)):
        nombre = getattr(n.targets[0] if isinstance(n, ast.Assign) else n.target, "id", "")
        if nombre:
            for i in range(n.lineno, (n.end_lineno or n.lineno) + 1):
                dueños.setdefault(i, nombre)

fallos = []
for i, l in enumerate(lineas, 1):
    # Los comentarios explican, no ejecutan.
    limpia = re.sub(r"#.*$", "", l)
    if not any(c in limpia for c in CENTROS):
        continue
    dueño = dueños.get(i, "")
    if dueño in PERMITIDO:
        continue
    for pat, porque in PATRONES:
        if pat.search(limpia):
            fallos.append((i, dueño, porque, l.strip()))
            break

if not fallos:
    print("multiempresa OK: ningun centro de la empresa principal decide nada")
    sys.exit(0)

for li, dueño, porque, texto in fallos:
    print("\n  backend/server.py:%d  %s()" % (li, dueño or "?"))
    print("     %s" % porque)
    print("     %s" % texto[:104])
print("\nFALLO: %d sitio(s). Usa `await _centro_por_defecto()` para el valor por" % len(fallos))
print("defecto y `_centro_norm` para reconocer un codigo. Si de verdad es un DATO")
print("de la empresa principal y no una decision, anadelo a PERMITIDO con su motivo.")
sys.exit(1)
