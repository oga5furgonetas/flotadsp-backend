# -*- coding: utf-8 -*-
"""EDGE OS — panel privado aislado. Se prueba SIN Mongo ni el resto del backend.

Comprueba:
  * sin EDGE_OS_PASSWORD el panel no monta ninguna ruta (404, no existe)
  * con clave: login correcto/incorrecto, bloqueo por intentos, token propio
  * las rutas de datos exigen token
  * el ensemble de futbol se construye y predice (con los CSV empaquetados o,
    si no estan, con liga sintetica)
  * el modulo NO importa server.py ni toca `db`/`global_db`

Sigue el patron del gotcha 36: `def test_*` que corre bajo pytest, y un
`main()` para lanzarlo a mano.
"""

import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)


def _fresh(password):
    """Recarga edge_os_api con (o sin) EDGE_OS_PASSWORD."""
    if password is None:
        os.environ.pop("EDGE_OS_PASSWORD", None)
    else:
        os.environ["EDGE_OS_PASSWORD"] = password
    os.environ["EDGE_OS_PATH"] = "zzz-test"
    import edge_os_api
    return importlib.reload(edge_os_api)


def _client(mod):
    try:
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
    except Exception as e:                       # pragma: no cover
        import pytest
        pytest.skip("fastapi/starlette no instalado: %s" % e)
    app = FastAPI()
    mod.register(app)
    return TestClient(app, raise_server_exceptions=False)


def test_no_password_no_routes():
    mod = _fresh(None)
    c = _client(mod)
    assert c.get("/zzz-test").status_code == 404
    assert c.post("/zzz-test/api/login", json={"password": "x"}).status_code == 404


def test_login_flow_and_token_gate():
    mod = _fresh("clave-secreta-123")
    c = _client(mod)

    # la portada existe y no pide auth
    assert c.get("/zzz-test").status_code == 200
    assert c.get("/zzz-test/health").json()["ok"] is True

    # clave mala
    r = c.post("/zzz-test/api/login", json={"password": "no"})
    assert r.status_code == 401

    # clave buena
    r = c.post("/zzz-test/api/login", json={"password": "clave-secreta-123"})
    assert r.status_code == 200
    tok = r.json()["token"]

    # ruta de datos sin token -> 401
    assert c.get("/zzz-test/api/football/leagues").status_code == 401
    # con token -> 200
    r = c.get("/zzz-test/api/football/leagues",
              headers={"Authorization": "Bearer " + tok})
    assert r.status_code == 200
    assert isinstance(r.json()["leagues"], list)

    # token manipulado -> 401
    bad = tok[:-3] + "000"
    assert c.get("/zzz-test/api/football/leagues",
                 headers={"Authorization": "Bearer " + bad}).status_code == 401


def test_bruteforce_lock():
    mod = _fresh("otra-clave")
    c = _client(mod)
    codes = [c.post("/zzz-test/api/login", json={"password": "mal"},
                    headers={"X-Forwarded-For": "9.9.9.9"}).status_code
             for _ in range(8)]
    assert codes[-1] == 429            # tras varios fallos, bloqueo temporal


def test_football_predict():
    mod = _fresh("clave-x")
    c = _client(mod)
    tok = c.post("/zzz-test/api/login",
                 json={"password": "clave-x"}).json()["token"]
    h = {"Authorization": "Bearer " + tok}

    lg = c.get("/zzz-test/api/football/leagues", headers=h).json()["leagues"]
    code = lg[0]["code"] if lg else "SP1"

    tbl = c.get("/zzz-test/api/football/table?league=" + code, headers=h)
    assert tbl.status_code == 200
    teams = tbl.json()["teams"]
    assert len(teams) >= 4

    a, b = teams[0]["team"], teams[-1]["team"]
    r = c.post("/zzz-test/api/football/predict", headers=h,
               json={"league": code, "home": a, "away": b})
    assert r.status_code == 200
    j = r.json()
    s = j["p_home"] + j["p_draw"] + j["p_away"]
    assert abs(s - 1.0) < 5e-4          # cada prob va redondeada a 4 decimales
    assert 0.0 <= j["p_home"] <= 1.0
    assert j["fair_home"] > 1.0


def test_module_does_not_import_server_or_touch_db():
    """Aislamiento por AST: nada de importar server ni usar los proxies de BD."""
    import ast
    src = open(os.path.join(BACKEND, "edge_os_api.py"), encoding="utf-8").read()
    tree = ast.parse(src)
    for n in ast.walk(tree):
        if isinstance(n, (ast.Import, ast.ImportFrom)):
            mods = ([a.name for a in n.names]
                    + ([n.module] if isinstance(n, ast.ImportFrom) and n.module else []))
            assert not any((m or "").split(".")[0] == "server" for m in mods), mods
        # uso de `db` / `global_db` como NOMBRE en codigo (no en comentarios)
        if isinstance(n, ast.Name):
            assert n.id not in ("db", "global_db"), "usa " + n.id


def main():
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("ok  ", name)
            except Exception as e:                # noqa: BLE001
                fails += 1
                print("FAIL", name, "->", repr(e))
    return fails


if __name__ == "__main__":
    raise SystemExit(main())
