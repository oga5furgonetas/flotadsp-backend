"""Orquestador: fetch -> normaliza -> calidad -> detecta -> persiste."""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import Config
from .dataquality import check_market
from .models import ArbOpportunity, MarketBook, OutcomePrices, Quote, ValueOpportunity
from .providers.base import OddsProvider
from .quant.arbitrage import detect_arbitrage
from .quant.value import detect_value
from .storage import Storage


def group_into_books(quotes: list[Quote]) -> list[MarketBook]:
    """Agrupa Quotes por (event_id, market, point) -> MarketBook."""
    books: dict[tuple, MarketBook] = {}
    for q in quotes:
        key = (q.event_id, q.market, q.point)
        mb = books.get(key)
        if mb is None:
            mb = MarketBook(
                event_id=q.event_id, sport=q.sport,
                commence_time=q.commence_time, home=q.home, away=q.away,
                market=q.market, point=q.point, outcomes=[],
            )
            books[key] = mb
        oc = next((o for o in mb.outcomes if o.outcome == q.outcome), None)
        if oc is None:
            oc = OutcomePrices(outcome=q.outcome, point=q.point)
            mb.outcomes.append(oc)
        # si la misma casa aparece dos veces, nos quedamos con la mejor cuota
        if q.bookmaker not in oc.prices or q.price > oc.prices[q.bookmaker]:
            oc.prices[q.bookmaker] = q.price
            oc.last_update[q.bookmaker] = q.last_update
    return list(books.values())


@dataclass
class ScanResult:
    n_quotes: int = 0
    n_books: int = 0
    n_books_rejected: int = 0
    arbs: list[ArbOpportunity] = field(default_factory=list)
    values: list[ValueOpportunity] = field(default_factory=list)
    rejected: list[tuple[str, str]] = field(default_factory=list)
    remaining: str | int | None = None


class Engine:
    def __init__(self, cfg: Config, provider: OddsProvider, storage: Storage):
        self.cfg = cfg
        self.provider = provider
        self.storage = storage

    def scan_once(self, *, persist: bool = True) -> ScanResult:
        cfg = self.cfg
        quotes = self.provider.fetch(
            cfg.get("sport", "upcoming"),
            list(cfg.get("markets", ["h2h"])),
            list(cfg.get("regions", ["eu", "uk"])),
        )
        res = ScanResult(n_quotes=len(quotes),
                         remaining=self.provider.last_remaining)
        if persist and quotes:
            self.storage.save_quotes(quotes)

        books = group_into_books(quotes)
        res.n_books = len(books)

        dq = cfg.get("data_quality", {})
        devig_method = cfg.get("devig.method", "power")
        fair_cfg = cfg.get("fair_source", {})
        vcfg = cfg.get("value", {})
        acfg = cfg.get("arbitrage", {})
        rcfg = cfg.get("robust_ev", {})
        dcfg = cfg.get("decision", {})
        kcfg = cfg.get("kelly", {})

        for mb in books:
            ok, why = check_market(mb, dq)
            if not ok:
                res.n_books_rejected += 1
                res.rejected.append((mb.match + f" [{mb.market}]", why))
                continue

            arb = detect_arbitrage(
                mb,
                min_roi=float(acfg.get("min_roi", 0.0)),
                exchange_commission=float(acfg.get("exchange_commission", 0.0)),
                max_hours_to_start=acfg.get("max_hours_to_start"),
            )
            if arb:
                res.arbs.append(arb)
                if persist:
                    self.storage.save_opportunity(arb)

            vals = detect_value(
                mb, vcfg=vcfg, devig_method=devig_method, fair_cfg=fair_cfg,
                robust_cfg=rcfg, decision_cfg=dcfg, kelly_cfg=kcfg,
            )
            for v in vals:
                res.values.append(v)
                if persist:
                    self.storage.save_opportunity(v)

        res.arbs.sort(key=lambda a: a.roi, reverse=True)
        res.values.sort(key=lambda v: v.robust_ev, reverse=True)
        return res
