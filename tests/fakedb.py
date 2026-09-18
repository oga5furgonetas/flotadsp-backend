# -*- coding: utf-8 -*-
"""Mongo falso en memoria: lo justo para probar tareas_ia sin motor."""
import copy
import re
from types import SimpleNamespace


def _cmp(valor, cond):
    if isinstance(cond, dict):
        for op, arg in cond.items():
            if op == "$regex":
                if not re.search(arg, str(valor or "")):
                    return False
            elif op == "$ne":
                if valor == arg:
                    return False
            elif op == "$in":
                if valor not in arg:
                    return False
            elif op == "$exists":
                if (valor is not None) != arg:
                    return False
            else:
                raise NotImplementedError(op)
        return True
    return valor == cond


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs

    def sort(self, campo, direccion=1):
        self.docs = sorted(self.docs, key=lambda d: (d.get(campo) is None, d.get(campo) or ""),
                           reverse=(direccion == -1))
        return self

    async def to_list(self, n=None):
        return [copy.deepcopy(d) for d in (self.docs[:n] if n else self.docs)]


class FakeCol:
    def __init__(self, nombre):
        self.nombre = nombre
        self.docs = []

    def _match(self, d, q):
        return all(_cmp(d.get(k), v) for k, v in (q or {}).items())

    def find(self, q=None, proj=None):
        return FakeCursor([d for d in self.docs if self._match(d, q)])

    async def find_one(self, q=None, proj=None, sort=None):
        encontrados = [d for d in self.docs if self._match(d, q)]
        if sort:
            campo, direccion = sort[0]
            encontrados.sort(key=lambda d: d.get(campo) or "", reverse=(direccion == -1))
        return copy.deepcopy(encontrados[0]) if encontrados else None

    async def insert_one(self, doc):
        self.docs.append(copy.deepcopy(doc))
        return SimpleNamespace(inserted_id=doc.get("id"))

    async def update_one(self, q, upd):
        for d in self.docs:
            if self._match(d, q):
                for k, v in (upd.get("$set") or {}).items():
                    d[k] = copy.deepcopy(v)
                for k, v in (upd.get("$inc") or {}).items():
                    d[k] = (d.get(k) or 0) + v
                return SimpleNamespace(modified_count=1, matched_count=1)
        return SimpleNamespace(modified_count=0, matched_count=0)

    async def delete_many(self, q):
        antes = len(self.docs)
        self.docs = [d for d in self.docs if not self._match(d, q)]
        return SimpleNamespace(deleted_count=antes - len(self.docs))

    async def distinct(self, campo):
        return sorted({d.get(campo) for d in self.docs if d.get(campo)})


class FakeDB:
    def __init__(self):
        self._cols = {}

    def __getitem__(self, nombre):
        return self._cols.setdefault(nombre, FakeCol(nombre))

    def __getattr__(self, nombre):
        if nombre.startswith("_"):
            raise AttributeError(nombre)
        return self[nombre]
