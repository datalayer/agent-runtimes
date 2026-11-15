# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The seed agents' ``show_*`` tools: data shown to the person as a card.

Each tool takes what the agent wants the person to see — the Shopper's
comparison and basket, the Accountant's reconciliation, trial balance and VAT,
the Voyager's options, itinerary and budget, Terra's scenes and index — checks
it, and answers it normalized under ``shown``. The page draws the call with the
agent's own UI plugin (agent-runtimes ``src/apps/plugins/<id>``, bound to the
tool by name), from the arguments while the call runs and from the answer once
done; any other client reads the answer as data.

They read and write nothing: a card is not a fact. Every figure in it must come
from a tool that read it — the catalogue, Odoo, Earthdata, a booking site —
which each agent's instructions say. A malformed call is refused in a sentence
naming what is wrong, so the agent can call again.

Totals are computed here, never taken from the agent: a basket's, a trial
balance's, a VAT return's, a trip's.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

__all__ = [
    "show_basket",
    "show_comparison",
    "show_index_result",
    "show_itinerary",
    "show_reconciliation",
    "show_scenes",
    "show_trial_balance",
    "show_trip_budget",
    "show_trip_options",
    "show_vat_summary",
]

#: The most rows a card holds: a longer list is a report, not a card.
MOST_ROWS = 50


class _Row(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


def _https(value: str) -> str:
    """An address a card may link to: ``https://`` only, else nothing."""
    return value if value.startswith("https://") else ""


def _cents(value: float) -> float:
    return round(value + 0.0, 2)


def _refusal(what: str, error: ValidationError) -> str:
    """A refusal the agent can act on: each field and what is wrong with it."""
    problems = "; ".join(
        f"{'.'.join(str(part) for part in problem['loc']) or 'the call'}: {problem['msg']}"
        for problem in error.errors()[:5]
    )
    return f"Refused: {what[:1].lower()}{what[1:]} was not shown ({problems})."


def _rows(rows: Any, model: type[_Row], what: str) -> List[_Row]:
    if not isinstance(rows, list) or not rows:
        raise ValueError(f"{what} is a non-empty list")
    if len(rows) > MOST_ROWS:
        raise ValueError(f"{what} holds at most {MOST_ROWS} rows")
    checked = []
    for number, row in enumerate(rows, start=1):
        try:
            checked.append(model.model_validate(row))
        except ValidationError as error:
            problems = "; ".join(
                f"{'.'.join(str(part) for part in problem['loc']) or 'the row'}: {problem['msg']}"
                for problem in error.errors()[:3]
            )
            raise ValueError(f"{what} row {number}: {problems}") from None
    return checked


# ---- The Shopper -----------------------------------------------------------


class _Product(_Row):
    id: str = ""
    title: str = Field(min_length=1)
    seller: str = ""
    variant: str = ""
    price: Optional[float] = Field(default=None, ge=0)
    currency: str = ""
    availability: str = ""
    rating: Optional[float] = Field(default=None, ge=0, le=5)
    url: str = ""

    @field_validator("url")
    @classmethod
    def _link(cls, value: str) -> str:
        return _https(value)


def show_comparison(
    products: List[Dict[str, Any]],
    currency: str = "",
    pick: str = "",
    reason: str = "",
) -> Any:
    """Show the person the products compared, side by side, as a table.

    Args:
        products: Two to ten products as the catalogue returned them:
            ``{title, seller, variant, price, currency, availability, rating,
            url}`` — the price in major units (69.99, not 6999).
        currency: The currency of a product that does not say its own.
        pick: The title of the one you would choose, when you would.
        reason: Why, in a sentence.

    Returns:
        ``{"shown": "comparison", "products": [...], "pick", "reason"}``, or a
        sentence starting ``Refused`` saying what is wrong.
    """
    try:
        rows = _rows(products, _Product, "products")
    except ValidationError as error:
        return _refusal("The comparison", error)
    except ValueError as error:
        return f"Refused: the comparison was not shown ({error})."
    if pick and pick not in {row.title for row in rows} | {row.id for row in rows}:
        return "Refused: the comparison was not shown (pick names no product compared)."
    return {
        "shown": "comparison",
        "products": [row.model_dump() for row in rows],
        "currency": currency,
        "pick": pick,
        "reason": reason.strip(),
    }


class _BasketItem(_Row):
    title: str = Field(min_length=1)
    seller: str = ""
    variant: str = ""
    quantity: int = Field(default=1, ge=1)
    price: Optional[float] = Field(default=None, ge=0)
    url: str = ""

    @field_validator("url")
    @classmethod
    def _link(cls, value: str) -> str:
        return _https(value)


def show_basket(
    items: List[Dict[str, Any]],
    currency: str,
    shipping: Optional[float] = None,
    checkout_url: str = "",
    note: str = "",
) -> Any:
    """Show the person the basket: each item, the shipping and the total.

    Nothing is bought by showing it: a purchase is approved on the company's
    terms, or paid at the seller's checkout.

    Args:
        items: ``{title, seller, variant, quantity, price, url}`` each, the
            price per unit in major units as the catalogue gave it.
        currency: The basket's currency (``USD``, ``EUR``).
        shipping: The shipping, when the seller said it.
        checkout_url: The seller's checkout, when there is no connection to
            buy through.
        note: A sentence for the person (what is not included).

    Returns:
        ``{"shown": "basket", "items", "currency", "shipping", "total",
        "partial", ...}`` — the total summed here, ``partial`` when an item
        has no price —, or a sentence starting ``Refused``.
    """
    try:
        rows = _rows(items, _BasketItem, "items")
    except ValidationError as error:
        return _refusal("The basket", error)
    except ValueError as error:
        return f"Refused: the basket was not shown ({error})."
    if not currency.strip():
        return "Refused: the basket was not shown (currency is required)."
    if shipping is not None and shipping < 0:
        return "Refused: the basket was not shown (shipping cannot be negative)."
    total = sum((row.price or 0.0) * row.quantity for row in rows) + (shipping or 0.0)
    return {
        "shown": "basket",
        "items": [row.model_dump() for row in rows],
        "currency": currency.strip(),
        "shipping": shipping,
        "total": _cents(total),
        "partial": any(row.price is None for row in rows),
        "checkout_url": _https(checkout_url.strip()),
        "note": note.strip(),
    }


# ---- The Accountant --------------------------------------------------------


class _BankLine(_Row):
    id: str = Field(min_length=1)
    date: str = ""
    label: str = Field(min_length=1)
    amount: float
    invoice: str = ""
    partner: str = ""
    invoice_amount: Optional[float] = None
    confidence: Literal["high", "medium", "low", ""] = ""


def show_reconciliation(lines: List[Dict[str, Any]], currency: str) -> Any:
    """Show the person bank lines beside the invoices they would settle.

    The person ticks the matches they approve and sends them back; reconcile
    in Odoo only what comes back approved.

    Args:
        lines: ``{id, date, label, amount, invoice, partner, invoice_amount,
            confidence}`` each, as Odoo gave them: ``id`` the bank line's,
            ``invoice`` the invoice's number (empty when none matches),
            ``confidence`` ``high``, ``medium`` or ``low``.
        currency: The journal's currency.

    Returns:
        ``{"shown": "reconciliation", "lines": [... with "difference"],
        "currency", "matched"}``, or a sentence starting ``Refused``.
    """
    try:
        rows = _rows(lines, _BankLine, "lines")
    except ValidationError as error:
        return _refusal("The reconciliation", error)
    except ValueError as error:
        return f"Refused: the reconciliation was not shown ({error})."
    ids = [row.id for row in rows]
    if len(set(ids)) != len(ids):
        return "Refused: the reconciliation was not shown (each line has its own id)."
    shown = []
    for row in rows:
        line = row.model_dump()
        line["difference"] = (
            _cents(row.amount - row.invoice_amount)
            if row.invoice_amount is not None
            else None
        )
        shown.append(line)
    return {
        "shown": "reconciliation",
        "lines": shown,
        "currency": currency.strip(),
        "matched": sum(1 for row in rows if row.invoice),
    }


class _Account(_Row):
    code: str = ""
    name: str = ""
    debit: float = Field(default=0.0, ge=0)
    credit: float = Field(default=0.0, ge=0)


def show_trial_balance(
    accounts: List[Dict[str, Any]], period: str, currency: str
) -> Any:
    """Show the person a trial balance: each account's debit, credit, balance.

    Args:
        accounts: ``{code, name, debit, credit}`` each, as Odoo's ledger gave
            them for the period.
        period: The period, as a person says it (``October 2026``).
        currency: The company's currency.

    Returns:
        ``{"shown": "trial-balance", "accounts", "debit", "credit",
        "balanced", ...}`` — the totals summed here —, or a sentence starting
        ``Refused``.
    """
    try:
        rows = _rows(accounts, _Account, "accounts")
    except ValidationError as error:
        return _refusal("The trial balance", error)
    except ValueError as error:
        return f"Refused: the trial balance was not shown ({error})."
    if any(not (row.code or row.name) for row in rows):
        return "Refused: the trial balance was not shown (each account has a code or a name)."
    debit = _cents(sum(row.debit for row in rows))
    credit = _cents(sum(row.credit for row in rows))
    return {
        "shown": "trial-balance",
        "accounts": [
            {**row.model_dump(), "balance": _cents(row.debit - row.credit)}
            for row in rows
        ],
        "period": period.strip(),
        "currency": currency.strip(),
        "debit": debit,
        "credit": credit,
        "balanced": abs(debit - credit) < 0.005,
    }


class _VatBox(_Row):
    box: str = ""
    label: str = ""
    base: Optional[float] = None
    tax: float = 0.0
    direction: Literal["due", "deductible"] = "due"


def show_vat_summary(
    boxes: List[Dict[str, Any]], period: str, currency: str, country: str = ""
) -> Any:
    """Show the person the VAT for a period: the return's boxes and the net.

    Nothing is filed by showing it.

    Args:
        boxes: ``{box, label, base, tax, direction}`` each — ``box`` the
            return's grid (``54``, ``59``), ``direction`` ``due`` (output VAT)
            or ``deductible`` (input VAT) —, as Odoo's tax report gave them.
        period: The period, as a person says it (``Q3 2026``).
        currency: The company's currency.
        country: The country of the return (``BE``).

    Returns:
        ``{"shown": "vat-summary", "boxes", "due", "deductible", "net", ...}``
        — the net (to pay when positive) summed here —, or a sentence
        starting ``Refused``.
    """
    try:
        rows = _rows(boxes, _VatBox, "boxes")
    except ValidationError as error:
        return _refusal("The VAT summary", error)
    except ValueError as error:
        return f"Refused: the VAT summary was not shown ({error})."
    if any(not (row.box or row.label) for row in rows):
        return (
            "Refused: the VAT summary was not shown (each box has its grid or a label)."
        )
    due = _cents(sum(row.tax for row in rows if row.direction == "due"))
    deductible = _cents(sum(row.tax for row in rows if row.direction == "deductible"))
    return {
        "shown": "vat-summary",
        "boxes": [row.model_dump() for row in rows],
        "period": period.strip(),
        "currency": currency.strip(),
        "country": country.strip(),
        "due": due,
        "deductible": deductible,
        "net": _cents(due - deductible),
    }


# ---- The Voyager -----------------------------------------------------------


class _TripOption(_Row):
    id: str = ""
    title: str = Field(min_length=1)
    summary: str = ""
    dates: str = ""
    nights: Optional[int] = Field(default=None, ge=0)
    price: Optional[float] = Field(default=None, ge=0)
    currency: str = ""
    highlights: List[str] = Field(default_factory=list, max_length=5)
    url: str = ""
    image: str = ""

    @field_validator("url", "image")
    @classmethod
    def _link(cls, value: str) -> str:
        return _https(value)


def show_trip_options(options: List[Dict[str, Any]], currency: str = "") -> Any:
    """Show the person up to three trips, one card each, to choose from.

    The person's choice comes back as their next turn; nothing is booked.

    Args:
        options: One to three ``{id, title, summary, dates, nights, price,
            currency, highlights, url, image}`` — the price the total for the
            party as the offer said it, ``highlights`` at most five short
            phrases, ``url`` the offer's page.
        currency: The currency of an option that does not say its own.

    Returns:
        ``{"shown": "trip-options", "options": [...]}``, or a sentence
        starting ``Refused``.
    """
    if isinstance(options, list) and len(options) > 3:
        return "Refused: the trip options were not shown (three at most)."
    try:
        rows = _rows(options, _TripOption, "options")
    except ValidationError as error:
        return _refusal("The trip options", error)
    except ValueError as error:
        return f"Refused: the trip options were not shown ({error})."
    shown = []
    for index, row in enumerate(rows):
        option = row.model_dump()
        option["id"] = row.id or f"option-{index + 1}"
        option["currency"] = row.currency or currency.strip()
        shown.append(option)
    return {"shown": "trip-options", "options": shown, "currency": currency.strip()}


class _Stop(_Row):
    time: str = ""
    what: str = ""
    place: str = ""
    map_url: str = ""

    @field_validator("map_url")
    @classmethod
    def _link(cls, value: str) -> str:
        return _https(value)


class _Day(_Row):
    date: str = ""
    title: str = ""
    items: List[_Stop] = Field(default_factory=list)


def show_itinerary(days: List[Dict[str, Any]], title: str = "") -> Any:
    """Show the person the trip day by day, each stop with its place on a map.

    Args:
        days: ``{date, title, items}`` each, ``items`` the day's stops
            ``{time, what, place, map_url}`` — ``place`` an address or a name
            a map finds; ``map_url`` a map link when you have one.
        title: The itinerary's title (``Lisbon, 3 days``).

    Returns:
        ``{"shown": "itinerary", "days": [...], "title"}``, or a sentence
        starting ``Refused``.
    """
    try:
        rows = _rows(days, _Day, "days")
    except ValidationError as error:
        return _refusal("The itinerary", error)
    except ValueError as error:
        return f"Refused: the itinerary was not shown ({error})."
    if not any(stop.what or stop.place for day in rows for stop in day.items):
        return "Refused: the itinerary was not shown (no day has a stop)."
    return {
        "shown": "itinerary",
        "days": [day.model_dump() for day in rows],
        "title": title.strip(),
    }


class _BudgetLine(_Row):
    label: str = Field(min_length=1)
    category: str = ""
    amount: float = Field(ge=0)
    estimate: bool = False


def show_trip_budget(
    lines: List[Dict[str, Any]], currency: str, budget: Optional[float] = None
) -> Any:
    """Show the person what the trip costs, line by line, and the total.

    Args:
        lines: ``{label, category, amount, estimate}`` each — ``estimate``
            true for a figure you estimated rather than a price you read.
        currency: The trip's currency.
        budget: What the person said they would spend, when they said it.

    Returns:
        ``{"shown": "trip-budget", "lines", "total", "left", ...}`` — the
        total summed here, ``left`` the budget less it —, or a sentence
        starting ``Refused``.
    """
    try:
        rows = _rows(lines, _BudgetLine, "lines")
    except ValidationError as error:
        return _refusal("The trip budget", error)
    except ValueError as error:
        return f"Refused: the trip budget was not shown ({error})."
    if not currency.strip():
        return "Refused: the trip budget was not shown (currency is required)."
    total = _cents(sum(row.amount for row in rows))
    return {
        "shown": "trip-budget",
        "lines": [row.model_dump() for row in rows],
        "currency": currency.strip(),
        "total": total,
        "budget": budget,
        "left": None if budget is None else _cents(budget - total),
    }


# ---- Terra -----------------------------------------------------------------


class _Scene(_Row):
    id: str = ""
    collection: str = ""
    sensor: str = ""
    date: str = Field(min_length=1)
    cloud_cover: Optional[float] = Field(default=None, ge=0, le=100)
    url: str = ""

    @field_validator("url")
    @classmethod
    def _link(cls, value: str) -> str:
        return _https(value)


def show_scenes(
    scenes: List[Dict[str, Any]],
    area: str = "",
    period: str = "",
    max_cloud_cover: Optional[float] = None,
) -> Any:
    """Show the person the satellite scenes found, by date.

    Args:
        scenes: ``{id, collection, sensor, date, cloud_cover, url}`` each, as
            Earthdata's search gave them — ``cloud_cover`` in percent.
        area: The area searched, as the person said it.
        period: The dates searched.
        max_cloud_cover: The most cloud cover searched, in percent.

    Returns:
        ``{"shown": "scenes", "scenes": [... by date], ...}``, or a sentence
        starting ``Refused``.
    """
    try:
        rows = _rows(scenes, _Scene, "scenes")
    except ValidationError as error:
        return _refusal("The scenes", error)
    except ValueError as error:
        return f"Refused: the scenes were not shown ({error})."
    ordered = sorted((row.model_dump() for row in rows), key=lambda row: row["date"])
    return {
        "shown": "scenes",
        "scenes": ordered,
        "area": area.strip(),
        "period": period.strip(),
        "max_cloud_cover": max_cloud_cover,
    }


class _Reading(_Row):
    date: str = Field(min_length=1)
    scene: str = ""
    mean: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None


class _Change(_Row):
    mean_delta: Optional[float] = None
    changed_area_pct: Optional[float] = Field(default=None, ge=0, le=100)
    threshold: Optional[float] = None


def show_index_result(
    index: str,
    dates: List[Dict[str, Any]],
    area: str = "",
    change: Optional[Dict[str, Any]] = None,
    image: str = "",
    notes: str = "",
) -> Any:
    """Show the person an index computed from the pixels, and its change.

    Args:
        index: The index (``NDVI``, ``NDWI``, ``NBR``).
        dates: ``{date, scene, mean, min, max}`` each — the figures you
            computed over the area on that date, from that scene.
        area: The area, as the person said it.
        change: ``{mean_delta, changed_area_pct, threshold}`` between the
            first and the last date, when you computed it.
        image: The map you drew: an ``https://`` address or a PNG data URL.
        notes: What limits the reading (clouds, resolution, revisit).

    Returns:
        ``{"shown": "index-result", ...}``, or a sentence starting
        ``Refused``.
    """
    if not index.strip():
        return "Refused: the index was not shown (index is required)."
    try:
        rows = _rows(dates, _Reading, "dates")
        moved = _Change.model_validate(change) if change else None
    except ValidationError as error:
        return _refusal("The index", error)
    except ValueError as error:
        return f"Refused: the index was not shown ({error})."
    picture = image.strip()
    if not (
        picture.startswith("https://") or picture.startswith("data:image/png;base64,")
    ):
        picture = ""
    return {
        "shown": "index-result",
        "index": index.strip().upper(),
        "dates": sorted(
            (row.model_dump() for row in rows), key=lambda row: row["date"]
        ),
        "area": area.strip(),
        "change": moved.model_dump() if moved else None,
        "image": picture,
        "notes": notes.strip(),
    }
