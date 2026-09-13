"""Persistencia: lo que EDGE OS vio, cuándo lo vio y qué decidió.

``MemoryStore`` para tests y uso local; ``MongoStore`` para producción, en una
base PROPIA (``edge_os`` por defecto) del Atlas existente. Nunca toca las bases
de FlotaDSP.
"""

from .base import Store
from .memory import MemoryStore

__all__ = ["MemoryStore", "Store"]
