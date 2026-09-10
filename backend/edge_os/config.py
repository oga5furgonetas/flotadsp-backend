"""Carga de configuración: config.yaml + variables de entorno (.env)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

try:                                # PyYAML es opcional: si no está, se usan defaults
    import yaml                     # type: ignore
except ImportError:                 # pragma: no cover
    yaml = None                     # type: ignore

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = ROOT / "config.yaml"


def _load_dotenv(path: Path) -> None:
    """Mini-parser de .env (evita depender de python-dotenv en runtime)."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


class Config:
    def __init__(self, data: dict[str, Any]):
        self._d = data

    # acceso por punto con fallback: cfg.get("value.min_edge", 0.02)
    def get(self, dotted: str, default: Any = None) -> Any:
        node: Any = self._d
        for part in dotted.split("."):
            if not isinstance(node, dict) or part not in node:
                return default
            node = node[part]
        return node

    def __getitem__(self, key: str) -> Any:
        return self._d[key]

    @property
    def raw(self) -> dict[str, Any]:
        return self._d

    @property
    def api_key(self) -> str | None:
        return os.environ.get("THE_ODDS_API_KEY") or None

    @property
    def database(self) -> str:
        return os.environ.get("EDGE_DATABASE") or self.get("database", "edge.db")


def load_config(path: str | Path | None = None) -> Config:
    _load_dotenv(ROOT / ".env")
    p = Path(path) if path else DEFAULT_CONFIG_PATH
    if yaml is not None and p.exists():
        data = yaml.safe_load(p.read_text(encoding="utf-8"))
    else:
        data = {}
    return Config(data or {})
