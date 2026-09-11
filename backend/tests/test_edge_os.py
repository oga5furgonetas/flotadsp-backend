"""EDGE OS dentro de FlotaDSP. Se prueba SIN Mongo ni el resto del backend.

Comprueba:
  * sin EDGE_OS_PASSWORD no se monta ninguna ruta (404)
  * contraseña, token y bloqueo por intentos
  * aislamiento por AST: ni `import server` ni `db`/`global_db`, en el adaptador Y en
    toda la copia del motor
  * la copia del motor coincide con su manifiesto (nadie la ha editado a mano)
  * el JavaScript del panel parsea y solo llama a rutas que existen
  * flujo completo con el proveedor sintético y almacén en memoria
  * el fichero de calibración carga y sus estados son los que el motor entiende

Patrón del gotcha 36: `def test_*` para pytest y `main()` para lanzarlo a mano.
Se genera en apuestas-edge (integrations/flotadsp/test_edge_os.py): no editar aquí.
"""

import ast
import hashlib
import importlib
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
PKG = os.path.join(BACKEND, "edgeos")
if BACKEND not in sys.path:
    sys.path.insert(0, BACKEND)


def _read(path, binary=False):
    if binary:
        with open(path, "rb") as fh:
            return fh.read()
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def _env(password):
    if password is None:
        os.environ.pop("EDGE_OS_PASSWORD", None)
    else:
        os.environ["EDGE_OS_PASSWORD"] = password
    os.environ["EDGE_OS_PATH"] = "zzz-test"
    os.environ["EDGE_OS_STORE"] = "memory"          # nunca Mongo en estos tests, aunque CI tenga MONGO_URL
    os.environ["EDGE_OS_BACKGROUND"] = "0"
    os.environ.pop("THE_ODDS_API_KEY", None)          # proveedor sintético: sin red ni créditos


def _client(password):
    _env(password)
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    import edge_os_api
    mod = importlib.reload(edge_os_api)
    app = FastAPI()
    mounted = mod.register(app)
    return TestClient(app, raise_server_exceptions=False), mounted


def _auth(c, password):
    tok = c.post("/zzz-test/api/login", json={"password": password}).json()["token"]
    return {"Authorization": "Bearer " + tok}


def test_no_password_no_routes():
    c, mounted = _client(None)
    assert mounted is False
    assert c.get("/zzz-test").status_code == 404
    assert c.post("/zzz-test/api/login", json={"password": "x"}).status_code == 404


def test_login_token_and_lock():
    c, mounted = _client("clave-secreta-123")
    assert mounted is True
    assert c.get("/zzz-test").status_code == 200
    assert c.get("/zzz-test/health").json()["ok"] is True
    assert c.get("/zzz-test/api/board").status_code == 401
    assert c.post("/zzz-test/api/login", json={"password": "no"}).status_code == 401
    h = _auth(c, "clave-secreta-123")
    assert c.get("/zzz-test/api/board", headers=h).status_code == 200
    bad = {"Authorization": h["Authorization"][:-3] + "000"}
    assert c.get("/zzz-test/api/board", headers=bad).status_code == 401
    codes = [c.post("/zzz-test/api/login", json={"password": "mal"},
                    headers={"X-Forwarded-For": "9.9.9.9"}).status_code for _ in range(8)]
    assert codes[-1] == 429


def test_module_and_engine_do_not_touch_flotadsp():
    files = [os.path.join(BACKEND, "edge_os_api.py")]
    for root, _dirs, names in os.walk(PKG):
        files += [os.path.join(root, n) for n in names if n.endswith(".py")]
    assert len(files) > 20
    for f in files:
        tree = ast.parse(_read(f))
        for n in ast.walk(tree):
            if isinstance(n, (ast.Import, ast.ImportFrom)):
                mods = [a.name for a in n.names] + ([n.module] if isinstance(n, ast.ImportFrom) and n.module else [])
                assert not any((m or "").split(".")[0] == "server" for m in mods), (f, mods)
            if isinstance(n, ast.Name):
                assert n.id not in ("db", "global_db"), (f, n.id)


def _digest(raw):
    # finales de línea a LF: con core.autocrlf, git hace checkout de estos ficheros con CRLF
    # y una copia intacta no puede parecer «editada a mano» en el otro ordenador
    return hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest()


def test_vendored_copy_matches_its_manifest():
    manifest = json.loads(_read(os.path.join(PKG, "VENDORED.json")))
    listed = manifest["files"]
    for rel, digest in listed.items():
        path = os.path.join(PKG, *rel.split("/"))
        assert os.path.exists(path), f"falta {rel}"
        raw = _read(path, binary=True)
        assert _digest(raw) == digest, f"{rel} se ha editado a mano: se edita en apuestas-edge y se vuelve a copiar"
        crlf = raw.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
        assert _digest(crlf) == digest, f"{rel}: un checkout con CRLF lo daría por editado"
    for root, dirs, names in os.walk(PKG):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for n in names:
            rel = os.path.relpath(os.path.join(root, n), PKG).replace("\\", "/")
            if rel != "VENDORED.json" and not rel.endswith(".pyc"):
                assert rel in listed, f"{rel} no viene del motor copiado"


def test_panel_javascript_parses_and_calls_existing_routes():
    js_path = os.path.join(PKG, "web", "app.js")
    node = shutil.which("node")
    if node:
        r = subprocess.run([node, "--check", js_path], capture_output=True, text=True)
        assert r.returncode == 0, "JS del panel roto:\n" + (r.stderr or "")[:2000]
    js = _read(js_path)
    api_src = _read(os.path.join(PKG, "api.py"))
    routes = set(re.findall(r'base \+ "(/api/[^"{]*)', api_src))
    used = set(re.findall(r'api\("(/api/[a-z/]+)', js))
    missing = sorted(u for u in used if u.rstrip("/") not in {x.rstrip("/") for x in routes}
                     and not any(x.endswith("/") and u.startswith(x) for x in routes))
    assert used and not missing, missing


def test_full_flow_with_the_synthetic_feed():
    c, _ = _client("k2")
    h = _auth(c, "k2")
    scan = c.post("/zzz-test/api/scan", headers=h, json={"scope": "today"})
    assert scan.status_code == 200
    body = scan.json()
    assert body["mock"] is True and body["decisions"]
    board = c.get("/zzz-test/api/board", headers=h).json()
    ids = [d["id"] for d in board["decisions"] if d["best_odds"]]
    assert len(ids) >= 2
    assert c.post("/zzz-test/api/compare", headers=h, json={"ids": ids[:2]}).status_code == 200
    assert c.get("/zzz-test/api/research", headers=h).json()["strategies"]
    assert c.get("/zzz-test/api/performance", headers=h).status_code == 200
    assert c.get("/zzz-test/static/app.js").status_code == 200
    assert c.get("/zzz-test/static/..%2Fapi.py").status_code == 404


def test_calibration_asset_loads_with_known_states():
    from edgeos.assets import Asset
    a = Asset.load()
    states = {s.state for s in a.strategies().values()}
    assert states and states <= {"ACTIVE", "WATCH", "DEGRADED", "DISABLED", "REJECTED"}
    assert a.data["runtime"]["reference_book"] == "pinnacle"


def main():
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("ok  ", name)
            except Exception as e:
                fails += 1
                print("FAIL", name, "->", repr(e))
    return fails


if __name__ == "__main__":
    raise SystemExit(main())
