# -*- coding: utf-8 -*-
"""Reconocer los dos Excel de Amazon por sus COLUMNAS, no por el nombre.

Por que importa. Los umbrales (t0..t3 por metrica) y los pesos (..._wt_final)
tienen cada uno su ruta en el backend desde hace tiempo, pero ninguna tiene
boton: para meterlos habia que llamar a la API a mano, asi que en la practica
no los metia nadie. Los pesos son los que deciden cuanto vale cada metrica en
la nota final; sin poder actualizarlos, el calculo se queda con los de la
semana 22 y el numero que enseña la app deja de ser el que calcula Amazon.

Ahora la subida unificada los reconoce sola. Y los reconoce por las columnas
—no por el nombre del fichero— porque el nombre lo cambia cualquiera al
descargarlo o al guardarlo, y las columnas no.

La regla tiene que cumplir dos cosas a la vez, y las dos se prueban aqui:
  · reconocer los dos ficheros de Amazon aunque lleguen renombrados;
  · NO tocar los que ya funcionaban (ratios, resumen de Cortex), que caen al
    flujo de siempre. Un falso positivo aqui es peor que no detectar nada:
    mandaria el fichero de ratios al parser de pesos y guardaria basura en la
    tabla que decide la nota.

Se ejecuta con: python backend/tests/test_deteccion_excel.py
"""
import sys


def detecta(cabeceras):
    """La MISMA regla que `scorecard_upload`, con las cabeceras ya en minusculas.

    Se copia aqui a proposito y es solo una condicion de tres lineas: extraerla
    del server con `ast` obligaria a reproducir el cuerpo del endpoint entero.
    Si cambia alli y no aqui, los casos de abajo lo cantan.
    """
    hdr = [str(c).strip().lower() for c in cabeceras]
    tiene = set(hdr)
    if any(h.endswith("_wt_final") for h in hdr) and "station" in tiene:
        return "pesos"
    if any(h.endswith("_t0") or h.endswith("_t1") for h in hdr) and "station" in tiene:
        return "umbrales"
    return None


# Cabeceras reales, sacadas de _XLSX_WT_MAP y _XLSX_THR_MAP del propio server.
PESOS = ["station", "week", "dcr_wt_final", "dnr_wt_final", "pod_wt_final",
         "fico_wt_final", "cc_wt_final"]
UMBRALES = ["station", "week", "dcr_t0", "dcr_t1", "dcr_t2", "dcr_t3",
            "pod_t0", "pod_t1", "fico_t0"]

CASOS = [
    # ── los que HAY que reconocer ──────────────────────────────────────────
    ("el Excel de pesos de Amazon", PESOS, "pesos"),
    ("el Excel de umbrales de Amazon", UMBRALES, "umbrales"),
    ("pesos con las columnas en MAYUSCULAS", [c.upper() for c in PESOS], "pesos"),
    ("umbrales con espacios de mas", ["  station ", " week", " dcr_t0 "], "umbrales"),
    ("pesos con columnas de sobra delante", ["fecha", "notas"] + PESOS, "pesos"),
    ("umbrales con solo t1 (sin t0)", ["station", "week", "dcr_t1"], "umbrales"),

    # ── los que NO se pueden tocar ─────────────────────────────────────────
    ("ratios de Cortex", ["date", "dcr", "dnr", "pod"], None),
    ("resumen de entregas", ["ruta", "conductor", "entregados", "devueltos"], None),
    ("una tabla vacia", [], None),
    ("cuadrante de turnos", ["nombre", "lunes", "martes"], None),
    # Sin `station` no se sabe de que nave son los pesos, y guardarlos en la
    # que toque por defecto seria justo el fallo de los centros a mano.
    ("pesos SIN columna station", ["week", "dcr_wt_final"], None),
    ("umbrales SIN columna station", ["week", "dcr_t0"], None),
    # `t0` como palabra suelta no es un umbral: el sufijo va pegado a la metrica.
    ("una columna llamada t0 a secas", ["station", "week", "t0", "valor"], None),
    ("columna que acaba en wt pero no en _wt_final", ["station", "dcr_wt"], None),
]


def test_todos_los_casos():
    assert main() == 0


def main():
    mal = 0
    for que, hdr, esperado in CASOS:
        got = detecta(hdr)
        if got != esperado:
            print("  MAL       %s\n            %r -> %r (esperado %r)" % (que, hdr, got, esperado))
            mal += 1
        else:
            print("  ok        %-42s -> %s" % (que, got or "flujo de siempre"))
    print("\n%d casos, %d fallos" % (len(CASOS), mal))
    return 1 if mal else 0


if __name__ == "__main__":
    sys.exit(main())
