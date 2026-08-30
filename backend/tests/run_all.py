# -*- coding: utf-8 -*-
"""Corre TODOS los tests de golpe, sin pytest.

    python backend/tests/run_all.py

Por que sin pytest: no esta instalado en el Python local de Windows ni en la
maquina de Fly, y anadir una dependencia para correr diez ficheros no compensa.
Esto aguanta las DOS formas que conviven en la carpeta:

  · los antiguos, que se ejecutan como script y tienen un `main()`
  · los nuevos, con funciones `test_*`

Se descubrio que hacian falta las dos al ver que `test_piezas` y
`test_estados_cortex` daban "0 de 0" con un runner que solo buscaba `test_*`:
no fallaban, es que no se estaban ejecutando. Un test que no corre es peor que
no tenerlo, porque parece que cubre algo.
"""
import importlib
import sys
import traceback
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))


def main():
    ficheros = sorted(p.stem for p in AQUI.glob("test_*.py"))
    total_ok = total_mal = 0
    sin_nada = []
    saltados = []

    for nombre in ficheros:
        try:
            m = importlib.import_module(nombre)
        except ModuleNotFoundError as e:
            # Los tests de API importan `server` entero y necesitan todo el
            # backend instalado (jose, motor, aiohttp...). En el Python local
            # de Windows no lo esta, y no compensa instalarlo: CI ya los corre
            # con `pytest backend/tests -q` y el entorno completo. No es un
            # fallo, es que aqui no tocan.
            saltados.append((nombre, str(e).replace("No module named ", "falta ")))
            continue
        except Exception as e:                               # noqa: BLE001
            print("  %-30s NO SE PUDO IMPORTAR: %s" % (nombre, str(e)[:70]))
            total_mal += 1
            continue

        funcs = [k for k in sorted(dir(m)) if k.startswith("test_") and callable(getattr(m, k))]
        if funcs:
            ok = mal = 0
            for k in funcs:
                try:
                    getattr(m, k)()
                    ok += 1
                except Exception:                            # noqa: BLE001
                    mal += 1
                    print("  %-30s FALLA %s" % (nombre, k))
                    print("      " + traceback.format_exc().strip().splitlines()[-1][:140])
            total_ok += ok
            total_mal += mal
            print("  %-30s %d/%d" % (nombre, ok, ok + mal))
        elif hasattr(m, "main"):
            # Los antiguos: imprimen su propio resumen y salen con codigo.
            try:
                r = m.main()
                if r:
                    total_mal += 1
                    print("  %-30s FALLA (main devolvio %s)" % (nombre, r))
                else:
                    total_ok += 1
            except SystemExit as e:
                if e.code:
                    total_mal += 1
                    print("  %-30s FALLA (salida %s)" % (nombre, e.code))
                else:
                    total_ok += 1
            except Exception:                                # noqa: BLE001
                total_mal += 1
                print("  %-30s REVIENTA" % nombre)
                print("      " + traceback.format_exc().strip().splitlines()[-1][:140])
        else:
            sin_nada.append(nombre)

    if sin_nada:
        print("\n  SIN NADA QUE EJECUTAR (ni funciones test_ ni main): %s"
              % ", ".join(sin_nada))
        print("  Un test que no corre es peor que no tenerlo: parece que cubre algo.")

    print("\n%d bien, %d mal" % (total_ok, total_mal))
    return 1 if (total_mal or sin_nada) else 0


if __name__ == "__main__":
    raise SystemExit(main())
