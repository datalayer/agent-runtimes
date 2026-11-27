# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The online shop's tools: its bundled catalogue, a quote summed here, a test order."""

from __future__ import annotations

import re

from agent_runtimes.specs.backend_tools import get_backend_tool_spec
from agent_runtimes.tools import online_shop

PHOTOS = "https://images.datalayer.io/landing/demo-shop/"


def test_the_catalogue_is_the_bundled_snapshot_with_a_photo_of_its_own_each():
    catalogue = online_shop.catalogue()
    products = catalogue["products"]
    assert len(products) == 24
    assert {product["category"] for product in products} == set(catalogue["categories"])
    images = [product["image"] for product in products]
    assert len(set(images)) == 24 and all(image.startswith(PHOTOS) for image in images)
    for product in products:
        assert product["photo"]["licence"] == "Burst Some Rights Reserved"
        assert product["texts"]["url"].startswith("https://dummyjson.com/products/")
        assert "dummyjson" not in product["image"]


def test_a_list_and_a_search_answer_product_cards_the_cheapest_first():
    sports = online_shop.list_products("Sports")
    assert sports["shown"] == "products" and sports["count"] == 6
    assert set(sports["products"][0]) >= {
        "id",
        "title",
        "price",
        "rating",
        "stock",
        "image",
    }
    found = online_shop.find_products("ball", max_price=10)
    assert [product["id"] for product in found["products"]] == [
        "tennis-ball",
        "baseball-ball",
    ]
    glasses = online_shop.find_products(
        "sunglasses", category="sunglasses", min_price=24
    )
    assert all(24 <= product["price"] for product in glasses["products"])
    assert online_shop.find_products("tent")["products"] == []
    assert online_shop.list_products("tents").startswith(
        "Refused: the shop has no category"
    )
    assert (
        online_shop.find_products(min_price=5, max_price=1)
        == "Refused: min_price is above max_price."
    )


def test_a_product_comes_with_its_description_and_an_unknown_one_is_refused():
    shown = online_shop.get_product("volleyball")
    assert shown["products"][0]["stock"] == 0
    assert "volleyball" in shown["products"][0]["description"].lower()
    assert online_shop.get_product("tent") == "Refused: the shop has no product 'tent'."


def test_a_quote_sums_its_total_and_refuses_what_the_shop_cannot_sell():
    quote = online_shop.quote_basket(
        [
            {"product_id": "tennis-racket", "quantity": 1},
            {"product_id": "tennis-ball", "quantity": 3},
        ]
    )
    assert quote["shown"] == "quote" and quote["currency"] == "USD"
    assert quote["total"] == 70.96
    assert quote["lines"][1] == {
        "product_id": "tennis-ball",
        "title": "Tennis Ball",
        "image": PHOTOS + "tennis-ball.jpg",
        "price": 6.99,
        "quantity": 3,
        "line_total": 20.97,
    }
    assert "in stock, not 1" in online_shop.quote_basket(
        [{"product_id": "volleyball", "quantity": 1}]
    )
    assert "no product 'tent'" in online_shop.quote_basket([{"product_id": "tent"}])
    assert online_shop.quote_basket([]).startswith("Refused: the basket was not priced")


def test_a_test_order_charges_nothing_ships_nothing_and_says_so():
    order = online_shop.place_test_order([{"product_id": "lemon", "quantity": 2}])
    assert re.fullmatch(r"TEST-[0-9A-F]{8}", order["order_id"])
    assert (order["test"], order["charged"], order["ships"]) == (True, False, False)
    assert order["total"] == 1.58
    assert "nothing is charged, nothing ships" in order["note"]
    assert online_shop.place_test_order(
        [{"product_id": "lemon", "quantity": 0}]
    ).startswith("Refused: no test order was placed")


def test_each_tool_is_a_catalogue_backend_tool_bringing_the_product_cards():
    for tool_id, method in (
        ("online-shop-list-products", "list_products"),
        ("online-shop-find-products", "find_products"),
        ("online-shop-get-product", "get_product"),
        ("online-shop-quote-basket", "quote_basket"),
        ("online-shop-place-test-order", "place_test_order"),
    ):
        spec = get_backend_tool_spec(tool_id)
        assert spec is not None, tool_id
        assert spec.runtime.package == "agent_runtimes.tools.online_shop"
        assert spec.runtime.method == method and spec.approval == "auto"
        assert callable(getattr(online_shop, method))
        assert spec.ui[0].plugin == "product-cards"
