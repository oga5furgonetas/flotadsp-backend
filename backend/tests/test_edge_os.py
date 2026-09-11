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


def _auth_client(pw="k1"):
    mod = _fresh(pw)
    c = _client(mod)
    tok = c.post("/zzz-test/api/login", json={"password": pw}).json()["token"]
    return c, {"Authorization": "Bearer " + tok}


def test_sports_listado():
    c, h = _auth_client()
    sp = c.get("/zzz-test/api/sports", headers=h).json()
    assert sp["real"] is False
    assert any("MOCK" in s["title"] for s in sp["sports"])
    assert sp["defaults"]


def test_board_trae_todas_las_cuotas_etiquetadas():
    c, h = _auth_client()
    j = c.get("/zzz-test/api/board?sport=soccer_spain_la_liga", headers=h).json()
    assert j["mock"] is True and j["events"]
    tags = {"VALOR", "JUSTA", "FLOJA", "NI_LOCOS", "DUDOSA"}
    for e in j["events"]:
        assert e["match"] and e["outcomes"]
        for o in e["outcomes"]:
            assert o["tag"] in tags
            assert o["best_odds"] > 1.0 and o["best_book"]
        assert e["best_tag"] in tags
    # el valor va primero
    order = [e["best_tag"] for e in j["events"]]
    assert order == sorted(order, key=lambda t: 0 if t == "VALOR" else 1)


def test_top_solo_devuelve_lo_que_pasa_los_filtros():
    c, h = _auth_client()
    for scope in ("live", "soon", "today"):
        j = c.get(f"/zzz-test/api/top?scope={scope}&sports=soccer_spain_la_liga",
                  headers=h).json()
        assert "picks" in j and j["scope"] == scope
        for p in j["picks"]:
            assert p["kind"] in ("VALOR", "ARBITRAJE")
            assert p["odds"] is None or p["odds"] >= 1.30
            assert p["why"] and len(p["why"]) >= 2
            assert p["n_books"] >= 8
        # Ordena por SEÑAL/RUIDO, no por EV pelado: un +5 % a cuota 1.8 vale
        # mucho mas que un +5 % a cuota 7, porque el error de la probabilidad
        # se multiplica por la cuota. Ordenando por EV salia justo al reves, y
        # es lo que ponia arriba los "cuota 4 rentable" que no valen nada.
        zs = [p["ev_z"] for p in j["picks"] if p["kind"] == "VALOR"]
        assert zs == sorted(zs, reverse=True), zs


def test_top_scope_invalido():
    c, h = _auth_client()
    assert c.get("/zzz-test/api/top?scope=loquesea", headers=h).status_code == 400


def test_check_bad_inputs():
    c, h = _auth_client()
    assert c.post("/zzz-test/api/check", headers=h,
                  json={"odds": 1.0, "side": "home"}).status_code == 400
    assert c.post("/zzz-test/api/check", headers=h,
                  json={"odds": 2.0, "side": "loquesea"}).status_code == 400


def test_check_low_odds_is_no_meter():
    c, h = _auth_client()
    r = c.post("/zzz-test/api/check", headers=h, json={
        "sport": "soccer_spain_la_liga", "home": "Real Madrid", "away": "Sevilla",
        "side": "home", "odds": 1.04, "stake": 100})
    j = r.json()
    # o casa el partido (y da NO_METER por cuota baja) o dice que no lo encuentra
    if "verdict" in j:
        assert j["verdict"] == "NO_METER"
        assert "baja" in j["title"]
    else:
        assert "error" in j


def test_check_unknown_match_lists_options():
    c, h = _auth_client()
    j = c.post("/zzz-test/api/check", headers=h, json={
        "sport": "soccer_spain_la_liga", "home": "Equipo Inventado FC",
        "away": "Otro Inventado", "side": "home", "odds": 2.0}).json()
    assert "error" in j and isinstance(j.get("disponibles"), list)


def test_barrido_ciego_no_se_traga_el_silencio():
    """«No hay nada» y «no veo nada» se leen igual en pantalla.

    El radar barre gratis con `/events` y solo paga cuotas donde hay accion. Si
    esa llamada devuelve vacia —un proveedor que no la implemente, un fallo de
    la API— el panel diria «no hay nada ahora mismo» sin haber mirado UNA sola
    cuota. Entonces se paga por los deportes de siempre y se avisa.
    """
    mod = _fresh("k-ciego")
    mod._events_cache.clear()
    mod._odds_cache.clear()
    original = mod._fetch_events
    mod._fetch_events = lambda sport: []              # barrido ciego
    try:
        c = _client(mod)
        tok = c.post("/zzz-test/api/login",
                     json={"password": "k-ciego"}).json()["token"]
        j = c.get("/zzz-test/api/top?scope=live",
                  headers={"Authorization": "Bearer " + tok}).json()
    finally:
        mod._fetch_events = original
        mod._events_cache.clear()
        mod._odds_cache.clear()

    assert j["pulse"]["blind"] is True, "un barrido a cero tiene que decirlo"
    assert j["sports"], "con el barrido ciego hay que pedir cuotas igualmente"
    assert j["n_scanned"] > 0, "no se ha mirado ni un mercado"


def test_el_barrido_normal_no_se_marca_como_ciego():
    """La guarda no puede saltar cuando el barrido funciona: seria gastar
    credito en todo el catalogo por sistema."""
    mod = _fresh("k-ve")
    mod._events_cache.clear()
    mod._odds_cache.clear()
    c = _client(mod)
    tok = c.post("/zzz-test/api/login", json={"password": "k-ve"}).json()["token"]
    j = c.get("/zzz-test/api/top?scope=live",
              headers={"Authorization": "Bearer " + tok}).json()
    assert j["pulse"]["events"] > 0
    assert j["pulse"]["blind"] is False


def test_el_javascript_del_panel_no_tiene_errores_de_sintaxis():
    """El panel es UNA pagina: si su <script> no parsea, no funciona NADA y
    por pantalla solo se ve el formulario de entrada que no responde.

    Paso de verdad el 11-09-2026: un `\\"` de mas dentro de un template
    literal tumbo el panel entero y los tests de API seguian en verde, porque
    prueban el backend y no el navegador.
    """
    import re
    import shutil
    import subprocess
    import tempfile

    node = shutil.which("node")
    if not node:                                  # pragma: no cover
        import pytest
        pytest.skip("node no instalado")

    mod = _fresh("k")
    html = mod._PAGE.replace("__BASE__", "/p")
    m = re.search(r"<script>(.*?)</script>", html, re.S)
    assert m, "el panel no trae <script>"

    with tempfile.TemporaryDirectory() as d:
        f = os.path.join(d, "panel.js")
        with open(f, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(m.group(1))
        r = subprocess.run([node, "--check", f], capture_output=True, text=True)
    assert r.returncode == 0, "JS del panel roto:\n" + (r.stderr or "")[:2000]


def test_el_html_del_panel_cierra_sus_etiquetas():
    import re
    mod = _fresh("k")
    html = mod._PAGE
    for tag in ("html", "head", "body", "style", "script", "header", "section"):
        # \b para que `<head` no cuente tambien `<header>`
        abre = len(re.findall(rf"<{tag}\b", html))
        cierra = len(re.findall(rf"</{tag}>", html))
        assert abre == cierra, f"{tag}: {abre} abiertas, {cierra} cerradas"
    assert "__BASE__" in html          # el placeholder se sustituye al servir


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
