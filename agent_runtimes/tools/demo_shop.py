# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The demo shop's tools: its catalogue, a quote and a test order.

Datalayer's demo shop (the ``demo-shop`` application of agentspecs) sells
nothing: its catalogue is a snapshot bundled with the application
(``agentspecs/apps/demo-shop/catalog.json``) — 24 products, their texts from
DummyJSON and their photos from Shopify's Burst, served from
``images.datalayer.io`` — read here and never from the network. Every answer
comes from that file:

- ``list_products`` and ``find_products`` answer products with their photo,
  price, rating and stock, drawn as a grid of product cards;
- ``get_product`` answers one, with its description;
- ``quote_basket`` prices a basket from the catalogue, the total summed here;
- ``place_test_order`` answers what an order of that basket would be: a test
  order, of which nothing is charged, nothing ships and nothing is kept.

They change nothing anywhere (``read``): an agent without an account may use
them, and a person's own agent asks them of the shop over PAP, where placing
the test order is the operation the person approves.
"""

from __future__ import annotations

import json
import uuid
from functools import lru_cache
from importlib.resources import files
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError

__all__ = [
    "TEST_ORDER_NOTE",
    "catalogue",
    "find_products",
    "get_product",
    "list_products",
    "place_test_order",
    "quote_basket",
]

#: What a test order is, said wherever a person sees one.
TEST_ORDER_NOTE = (
    "A test order of Datalayer's demo shop: nothing is charged, nothing ships "
    "and nothing is kept."
)

#: The most products one answer holds.
MOST_PRODUCTS = 24

#: The fields of a product in a list: what a product card draws.
CARD_FIELDS = (
    "id",
    "title",
    "category",
    "brand",
    "price",
    "currency",
    "rating",
    "stock",
    "image",
)


@lru_cache(maxsize=1)
def catalogue() -> Dict[str, Any]:
    """The snapshot, as the application bundles it."""
    text = (
        files("agentspecs.apps")
        .joinpath("demo-shop/catalog.json")
        .read_text(encoding="utf-8")
    )
    return json.loads(text)


def _products() -> List[Dict[str, Any]]:
    return list(catalogue()["products"])


def _card(product: Dict[str, Any]) -> Dict[str, Any]:
    return {key: product[key] for key in CARD_FIELDS if key in product}


def _cents(value: float) -> float:
    return round(value + 0.0, 2)


def _shown(products: List[Dict[str, Any]], **said: Any) -> Dict[str, Any]:
    return {
        "shown": "products",
        "products": [_card(product) for product in products[:MOST_PRODUCTS]],
        "count": len(products),
        "currency": catalogue()["currency"],
        **said,
    }


def list_products(category: str = "") -> Any:
    """List the demo shop's products, all of them or those of one category.

    Args:
        category: One of the shop's categories (``groceries``, ``kitchen``,
            ``home``, ``sports``, ``sunglasses``), or empty for all.

    Returns:
        ``{"shown": "products", "products": [{id, title, category, price,
        currency, rating, stock, image}], "count", "categories"}``, or a
        sentence starting ``Refused`` for a category the shop does not have.
    """
    categories = list(catalogue()["categories"])
    wanted = category.strip().lower()
    if wanted and wanted not in categories:
        return (
            f"Refused: the shop has no category {category!r} "
            f"(it has {', '.join(categories)})."
        )
    found = [p for p in _products() if not wanted or p["category"] == wanted]
    return _shown(found, categories=categories)


def find_products(
    query: str = "",
    category: str = "",
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
) -> Any:
    """Find the demo shop's products by words, category and price.

    Args:
        query: Words to look for in a product's title, description or brand;
            every word must be found. Empty for any.
        category: One of the shop's categories, or empty for all.
        min_price: The lowest price, in the shop's currency.
        max_price: The highest price, in the shop's currency.

    Returns:
        ``{"shown": "products", "products": [...], "count", "query"}`` — the
        cheapest first —, or a sentence starting ``Refused``.
    """
    categories = list(catalogue()["categories"])
    wanted = category.strip().lower()
    if wanted and wanted not in categories:
        return (
            f"Refused: the shop has no category {category!r} "
            f"(it has {', '.join(categories)})."
        )
    if min_price is not None and max_price is not None and min_price > max_price:
        return "Refused: min_price is above max_price."
    words = [word for word in query.lower().split() if word]

    def matches(product: Dict[str, Any]) -> bool:
        text = " ".join(
            str(product.get(key) or "")
            for key in ("title", "description", "brand", "category")
        ).lower()
        return (
            all(word.rstrip("s") in text for word in words)
            and (not wanted or product["category"] == wanted)
            and (min_price is None or product["price"] >= min_price)
            and (max_price is None or product["price"] <= max_price)
        )

    found = sorted(
        (product for product in _products() if matches(product)),
        key=lambda product: (product["price"], product["title"]),
    )
    return _shown(found, query=query.strip())


def get_product(product_id: str) -> Any:
    """One product of the demo shop, with its description.

    Args:
        product_id: The product's id, as a list answered it (``tennis-ball``).

    Returns:
        ``{"shown": "products", "products": [{..., "description"}]}``, or a
        sentence starting ``Refused`` for an id the shop does not have.
    """
    for product in _products():
        if product["id"] == product_id.strip():
            shown = _shown([product])
            shown["products"][0]["description"] = product["description"]
            return shown
    return f"Refused: the shop has no product {product_id!r}."


class _Line(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    product_id: str = Field(min_length=1)
    quantity: int = Field(default=1, ge=1, le=99)


def _priced(items: Any) -> Any:
    """The basket priced from the catalogue, or a sentence saying what is wrong."""
    if not isinstance(items, list) or not items:
        return "the basket is a non-empty list of {product_id, quantity}"
    if len(items) > MOST_PRODUCTS:
        return f"the basket holds at most {MOST_PRODUCTS} lines"
    by_id = {product["id"]: product for product in _products()}
    lines = []
    for number, item in enumerate(items, start=1):
        try:
            line = _Line.model_validate(item)
        except ValidationError as error:
            problem = error.errors()[0]
            where = ".".join(str(part) for part in problem["loc"]) or "the line"
            return f"line {number}: {where}: {problem['msg']}"
        product = by_id.get(line.product_id)
        if product is None:
            return f"line {number}: the shop has no product {line.product_id!r}"
        if line.quantity > product["stock"]:
            return (
                f"line {number}: {product['title']} has {product['stock']} in stock, "
                f"not {line.quantity}"
            )
        lines.append(
            {
                "product_id": product["id"],
                "title": product["title"],
                "image": product["image"],
                "price": product["price"],
                "quantity": line.quantity,
                "line_total": _cents(product["price"] * line.quantity),
            }
        )
    return lines


def quote_basket(items: List[Dict[str, Any]]) -> Any:
    """Price a basket from the demo shop's catalogue: each line and the total.

    A quote, not an order: nothing is reserved.

    Args:
        items: ``{product_id, quantity}`` each.

    Returns:
        ``{"shown": "quote", "lines": [{product_id, title, image, price,
        quantity, line_total}], "currency", "total"}`` — the total summed
        here —, or a sentence starting ``Refused``.
    """
    lines = _priced(items)
    if isinstance(lines, str):
        return f"Refused: the basket was not priced ({lines})."
    return {
        "shown": "quote",
        "lines": lines,
        "currency": catalogue()["currency"],
        "total": _cents(sum(line["line_total"] for line in lines)),
        "note": "A quote, not an order: nothing is reserved.",
    }


def place_test_order(items: List[Dict[str, Any]]) -> Any:
    """Place a test order at the demo shop: nothing is charged, nothing ships.

    Answers what an order of that basket would be, with a test order number;
    nothing is charged, nothing ships and nothing is kept. Place it only once
    the person said to.

    Args:
        items: ``{product_id, quantity}`` each.

    Returns:
        ``{"shown": "test_order", "order_id": "TEST-…", "test": true,
        "charged": false, "ships": false, "lines", "currency", "total",
        "note"}``, or a sentence starting ``Refused``.
    """
    lines = _priced(items)
    if isinstance(lines, str):
        return f"Refused: no test order was placed ({lines})."
    return {
        "shown": "test_order",
        "order_id": f"TEST-{uuid.uuid4().hex[:8].upper()}",
        "test": True,
        "charged": False,
        "ships": False,
        "lines": lines,
        "currency": catalogue()["currency"],
        "total": _cents(sum(line["line_total"] for line in lines)),
        "note": TEST_ORDER_NOTE,
    }
