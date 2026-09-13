"""EDGE OS dentro de FlotaDSP.

El motor vive en ``edgeos/`` y NO se edita aquí: se escribe en el repositorio
``apuestas-edge`` y se copia con ``tools/vendor_to_flotadsp.py``, que deja un
manifiesto de hashes. ``tests/test_edge_os.py`` falla si alguien toca la copia a mano.

AISLADO A PROPÓSITO (gotcha 26):
  * No importa server.py ni toca ``db`` / ``global_db``: guarda en su PROPIA base de
    Mongo (``EDGE_OS_DB``, por defecto ``edge_os``) con su propio cliente.
  * Sin el secreto ``EDGE_OS_PASSWORD`` no monta ninguna ruta: el path da 404.
  * Vive bajo un path no adivinable (``EDGE_OS_PATH``).
  * Si algo falla al montarlo, server.py lo captura y FlotaDSP arranca igual.

Variables: ``EDGE_OS_PASSWORD``, ``EDGE_OS_PATH``, ``THE_ODDS_API_KEY`` (sin ella,
proveedor sintético y la interfaz lo dice), ``MONGO_URL``, ``EDGE_OS_DB``,
``EDGE_OS_STORE`` (``memory`` para tests) y ``EDGE_OS_BACKGROUND`` (``0`` para no
arrancar el bucle de cierres y liquidación).
"""

from __future__ import annotations

import logging
import os

_log = logging.getLogger("edge_os")


def register(app) -> bool:
    password = os.environ.get("EDGE_OS_PASSWORD") or ""
    path = (os.environ.get("EDGE_OS_PATH") or "panel-x7q2m9").strip("/")
    if not password:
        _log.info("edge_os: sin EDGE_OS_PASSWORD, no se monta")
        return False
    from edgeos.api import attach, service_from_env

    background = os.environ.get("EDGE_OS_BACKGROUND", "1") != "0"
    return attach(app, prefix=path, password=password, service_factory=service_from_env, background=background)
