"""Precio justo AHORA y cierre independiente.

Qué dice la validación (docs/VALIDATION.md) y por eso está hecho así:

* **Referencia para el precio justo: Pinnacle.** Su foto previa acierta más que
  cualquier otra disponible; la de Betfair exchange es mucho peor
  (log-loss +0.053 en 1X2, z 8.4) y usarla fabrica ventajas falsas.
* **Método de de-vig por mercado**, elegido fuera de muestra (1X2: power;
  O/U y hándicap: multiplicativo).
* **Cierre para medir si una apuesta fue buena: la MEDIA de las cuotas del resto
  del mercado, sin Pinnacle.** Medir con el cierre de la misma casa que eligió la
  apuesta comparte sus errores e infla el CLV (en el histórico, +1.17 % frente a
  +0.73 % con la media).

Sin Pinnacle en el mercado no hay precio justo validado: el estado es «sin
referencia», nunca un precio justo inventado con otra casa.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ..core import odds as O
from ..domain import MarketSnapshot

REFERENCE_BOOK = "pinnacle"
EXCHANGES = {"betfair_ex_eu": 0.05, "betfair_ex_uk": 0.05, "betfair_ex_au": 0.05,
             "matchbook": 0.02, "smarkets": 0.02}


@dataclass(frozen=True)
class Reference:
    status: str                         # ok | missing | incomplete | invalid | few_books
    book: str | None
    method: str
    probs: dict[str, float] | None
    margin: float | None
    updated: datetime | None
    note: str = ""
    kind: str = "pinnacle"              # pinnacle | consenso
    n_books: int = 0

    @property
    def ok(self) -> bool:
        return self.status == "ok" and self.probs is not None


def reference(snap: MarketSnapshot, method: str, book: str = REFERENCE_BOOK) -> Reference:
    if book not in snap.books():
        return Reference("missing", None, method, None, None, None,
                         f"{book} no cotiza este mercado: no hay precio justo validado")
    prices = snap.book_prices(book)
    if prices is None:
        return Reference("incomplete", book, method, None, None, snap.book_updated(book),
                         f"{book} no da precio para todos los resultados")
    try:
        probs = O.devig(prices, method)
        margin = O.overround(prices)
    except O.OddsError as e:
        return Reference("invalid", book, method, None, None, snap.book_updated(book), str(e))
    return Reference("ok", book, method, dict(zip(snap.outcomes, probs, strict=True)), margin,
                     snap.book_updated(book), n_books=len(snap.complete_books()))


def average_close(snap: MarketSnapshot, method: str, exclude: set[str] | frozenset[str] = frozenset({REFERENCE_BOOK}),
                  min_books: int = 3) -> dict[str, float] | None:
    """Probabilidades del cierre independiente: media aritmética de cuotas por resultado,
    de las casas completas que no están en ``exclude``, y de-vig. Es la misma medida
    que ``AvgC`` en el histórico, que es con la que se validó."""
    books = [b for b in snap.complete_books() if b not in exclude]
    if len(books) < min_books:
        return None
    avg = []
    for o in snap.outcomes:
        vals = [snap.quotes[o][b].price for b in books]
        avg.append(sum(vals) / max(len(vals), 1))
    try:
        return dict(zip(snap.outcomes, O.devig(avg, method), strict=True))
    except O.OddsError:
        return None


def executable_price(book: str, price: float, commissions: dict[str, float] | None = None) -> float:
    """Cuota efectiva: en un exchange se descuenta la comisión sobre la ganancia."""
    table = EXCHANGES if commissions is None else commissions
    c = table.get(book)
    return O.net_odds(price, c) if c else price


def consensus(snap: MarketSnapshot, method: str, min_books: int = 6) -> Reference:
    """Precio justo cuando Pinnacle no cotiza ESA línea: el consenso del mercado.

    Es la misma medida que la media del histórico (``Avg``) con la que se validó la
    estrategia de consenso: media aritmética de cuotas por resultado entre las casas que
    cotizan el mercado completo —incluida la que ofrece el mejor precio, igual que en el
    histórico— y de-vig con el método del mercado.

    Hace falta un mínimo de casas: una «media» de dos no es un mercado. El mínimo es una
    regla de higiene, no un número validado (en el histórico la media era de más de diez
    casas en las ligas grandes).
    """
    books = snap.complete_books()
    if len(books) < min_books:
        return Reference("few_books", None, method, None, None, None,
                         f"solo {len(books)} casas cotizan esta línea completa: no hay consenso fiable",
                         kind="consenso", n_books=len(books))
    probs = average_close(snap, method, exclude=frozenset(), min_books=min_books)
    if probs is None:
        return Reference("invalid", None, method, None, None, None,
                         "el consenso de esta línea no da un precio válido", kind="consenso",
                         n_books=len(books))
    avg = []
    for o in snap.outcomes:
        vals = [snap.quotes[o][b].price for b in books]
        avg.append(sum(vals) / max(len(vals), 1))
    updated = max((q.last_update for o in snap.outcomes for b, q in snap.quotes[o].items()
                   if b in books and q.last_update is not None), default=None)
    return Reference("ok", None, method, probs, O.overround(avg), updated,
                     f"consenso de {len(books)} casas", kind="consenso", n_books=len(books))


def best_reference(snap: MarketSnapshot, method: str, min_books: int = 6,
                   book: str = REFERENCE_BOOK) -> Reference:
    """Pinnacle si cotiza esta línea; si no, el consenso del mercado en esta misma línea."""
    ref = reference(snap, method, book)
    if ref.ok:
        return ref
    cons = consensus(snap, method, min_books)
    return cons if cons.ok else (ref if ref.status != "missing" else cons)
