# -*- coding: utf-8 -*-
"""`_centro_norm`: la regla que decide a qué centro pertenece un texto.

Por qué importa. 'OGA5' y 'AMZL OGA5 SANTIAGO XPT' son la misma nave y para
Mongo son dos, así que cualquier lista filtrada por centro enseña la mitad y no
falla nada. El 30-08-2026 salió en `maintenance_log`: 5 de 9 registros
invisibles.

Y por qué se prueba con cuidado: esta función AHORA REESCRIBE DATOS desde
`/checkers/centros/corregir`. Un falso positivo aquí no deja una lista corta —
mueve documentos al centro equivocado, que es peor y no se nota.

La regla que hay que defender es que **no adivina**: solo reescribe cuando en el
texto aparece exactamente UN código que ya existe limpio en la base.
"""
import ast
import io
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _cargar():
    """Saca `_centro_norm` y `_CENTRO_RE` de server.py sin importarlo.

    Se lee del fichero de verdad, no una copia: una copia deja de probar el
    código que corre en cuanto alguien toca el original (gotcha 40).
    """
    src = io.open(os.path.join(RAIZ, "server.py"), encoding="utf-8-sig").read()
    tree = ast.parse(src)
    ns = {"re": re}
    for n in tree.body:
        if isinstance(n, ast.Assign) and getattr(n.targets[0], "id", "") == "_CENTRO_RE":
            ns["_CENTRO_RE"] = eval(compile(ast.Expression(n.value), "<s>", "eval"), ns)
        if isinstance(n, ast.FunctionDef) and n.name == "_centro_norm":
            mod = ast.Module(body=[n], type_ignores=[])
            exec(compile(ast.fix_missing_locations(mod), "<server>", "exec"), ns)
    assert "_centro_norm" in ns, "_centro_norm no está en server.py"
    assert "_CENTRO_RE" in ns, "_CENTRO_RE no está en server.py"
    return ns["_centro_norm"]


# Los tres que existen de verdad en producción a 30-08-2026.
CONOCIDOS = {"OGA5", "DGA1", "DGA2"}

CASOS = [
    # (qué pasa, entrada, conocidos, esperado)
    ("el código limpio se queda igual", "OGA5", CONOCIDOS, "OGA5"),
    ("un espacio de más no crea un centro nuevo", "OGA5 ", CONOCIDOS, "OGA5"),
    ("ni las minúsculas", "oga5", CONOCIDOS, "OGA5"),
    ("ni un espacio por delante", "  OGA5", CONOCIDOS, "OGA5"),

    # El caso real que partió el historial de mantenimiento en dos.
    ("el nombre largo de Amazon se reduce a su código",
     "AMZL OGA5 SANTIAGO XPT", CONOCIDOS, "OGA5"),
    ("y en minúsculas también", "amzl oga5 santiago xpt", CONOCIDOS, "OGA5"),

    # NO ADIVINA: esto es lo que impide que la corrección mueva documentos al
    # centro equivocado.
    ("dos códigos conocidos en el mismo texto: no toca nada",
     "OGA5 / DGA1", CONOCIDOS, "OGA5 / DGA1"),
    ("un código que nadie ha escrito limpio se deja como está",
     "AMZL XYZ9 CUALQUIERA", CONOCIDOS, "AMZL XYZ9 CUALQUIERA"),
    ("un centro nuevo entero se respeta, solo recortado y en mayúsculas",
     " nave nueva ", CONOCIDOS, "NAVE NUEVA"),

    # Vacíos y basura: la corrección los recorre en bucle, no pueden reventar.
    ("vacío", "", CONOCIDOS, ""),
    ("None", None, CONOCIDOS, ""),
    ("solo espacios", "   ", CONOCIDOS, ""),
    ("un número suelto no es un centro", 4, CONOCIDOS, "4"),

    # Sin lista de conocidos no puede decidir, y no debe inventarse nada.
    ("sin lista de conocidos, el texto largo se queda entero",
     "AMZL OGA5 SANTIAGO XPT", None, "OGA5"),
    ("sin lista, el código limpio sigue igual", "OGA5", None, "OGA5"),

    # ── CENTROS QUE NO SON LOS DE DANI ────────────────────────────────────
    # `_normalize_center_code` llevaba OGA5/DGA1/DGA2 escritos a mano y
    # devolvia "" para cualquier otro. Como la cola de Revision Rapida compara
    # el centro pedido contra eso, **filtrar por centro devolvia siempre CERO**
    # en toda empresa que no fuera la principal — y el panel manda siempre el
    # centro seleccionado, o sea que era el caso normal. Se vio el 31-08-2026
    # con una empresa recien creada: la cola tenia una inspeccion y
    # `?center=IN1` devolvia ninguna.
    ("un centro nuevo NO se borra", "IN1", None, "IN1"),
    ("otro centro nuevo tampoco", "QA1", None, "QA1"),
    ("un centro de cuatro letras", "MADR1", None, "MADR1"),
    ("un centro escrito en cristiano se respeta", "NAVE PRINCIPAL", None, "NAVE PRINCIPAL"),
    ("en minusculas sube a mayusculas", "in1", None, "IN1"),
    ("con espacios de mas se recorta", "  IN1  ", None, "IN1"),
    ("dentro de un texto largo se extrae", "AMZL IN1 MADRID XPT", None, "IN1"),
    ("vacio sigue siendo vacio", "", None, ""),
    ("None no revienta", None, None, ""),
]


def test_todos_los_casos():
    assert main() == 0


def main():
    norm = _cargar()
    mal = 0
    for que, entrada, conocidos, esperado in CASOS:
        try:
            got = norm(entrada, conocidos)
        except Exception as e:                                   # noqa: BLE001
            print("  REVIENTA  %s -> %r" % (que, e))
            mal += 1
            continue
        if got != esperado:
            print("  MAL       %s\n            %r -> %r (esperado %r)"
                  % (que, entrada, got, esperado))
            mal += 1
        else:
            print("  ok        %s" % que)
    print("\n%d casos, %d fallos" % (len(CASOS), mal))
    return 1 if mal else 0


if __name__ == "__main__":
    sys.exit(main())
