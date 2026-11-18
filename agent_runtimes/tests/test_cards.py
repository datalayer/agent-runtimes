# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The seed agents' ``show_*`` tools: data checked, totals summed here, refusals said."""

from __future__ import annotations

from agent_runtimes.specs.backend_tools import get_backend_tool_spec
from agent_runtimes.tools import cards


def test_a_basket_sums_its_total_and_says_when_a_price_is_missing():
    shown = cards.show_basket(
        [
            {
                "title": "Boots",
                "price": 80,
                "quantity": 1,
                "url": "https://shop.example/b",
            },
            {
                "title": "Socks",
                "price": 5.5,
                "quantity": 2,
                "url": "http://insecure.example",
            },
        ],
        "USD",
        shipping=4,
    )
    assert shown["shown"] == "basket"
    assert shown["total"] == 95.0
    assert shown["partial"] is False
    assert shown["items"][1]["url"] == ""
    partial = cards.show_basket([{"title": "Hat"}], "EUR")
    assert partial["partial"] is True and partial["total"] == 0.0


def test_a_compared_product_and_a_basket_item_carry_their_photo_over_https_only():
    photo = "https://images.datalayer.io/landing/demo-shop/tennis-ball.jpg"
    compared = cards.show_comparison(
        [
            {"title": "Tennis Ball", "price": 6.99, "image": photo},
            {"title": "Volleyball", "price": 11.99, "image": "http://x.example/v.jpg"},
        ],
        currency="USD",
    )
    assert [row["image"] for row in compared["products"]] == [photo, ""]
    basket = cards.show_basket(
        [{"title": "Tennis Ball", "price": 6.99, "image": photo}], "USD"
    )
    assert basket["items"][0]["image"] == photo


def test_a_card_refuses_what_it_cannot_show_in_a_sentence():
    assert cards.show_basket([], "USD").startswith("Refused: the basket")
    assert "currency" in cards.show_basket([{"title": "Hat"}], " ")
    assert "three at most" in cards.show_trip_options([{"title": "a"}] * 4)
    refused = cards.show_reconciliation(
        [{"id": "1", "label": "x", "amount": "abc"}], "EUR"
    )
    assert refused.startswith("Refused: the reconciliation") and "row 1" in refused
    assert "own id" in cards.show_reconciliation(
        [
            {"id": "1", "label": "a", "amount": 1},
            {"id": "1", "label": "b", "amount": 2},
        ],
        "EUR",
    )
    assert "pick names no product" in cards.show_comparison([{"title": "A"}], pick="B")
    assert "less than or equal to 100" in cards.show_index_result(
        "ndvi", [{"date": "2026-05-01"}], change={"changed_area_pct": 200}
    )


def test_the_accountants_cards_compute_their_figures():
    lines = cards.show_reconciliation(
        [
            {
                "id": "b1",
                "label": "ACME",
                "amount": 120,
                "invoice": "INV/1",
                "invoice_amount": 100,
            },
            {"id": "b2", "label": "Fee", "amount": -5},
        ],
        "EUR",
    )
    assert lines["matched"] == 1
    assert [line["difference"] for line in lines["lines"]] == [20.0, None]
    balance = cards.show_trial_balance(
        [{"code": "400", "debit": 100}, {"code": "700", "credit": 100}],
        "Oct 2026",
        "EUR",
    )
    assert balance["balanced"] is True and balance["accounts"][0]["balance"] == 100.0
    vat = cards.show_vat_summary(
        [
            {"box": "54", "tax": 210},
            {"box": "59", "tax": 60, "direction": "deductible"},
        ],
        "Q3",
        "EUR",
    )
    assert (vat["due"], vat["deductible"], vat["net"]) == (210.0, 60.0, 150.0)


def test_the_traveller_and_terra_cards_order_and_complete_their_data():
    options = cards.show_trip_options(
        [{"title": "Lisbon"}, {"title": "Porto", "currency": "USD"}], "EUR"
    )
    assert [(o["id"], o["currency"]) for o in options["options"]] == [
        ("option-1", "EUR"),
        ("option-2", "USD"),
    ]
    assert "no day has a stop" in cards.show_itinerary([{"date": "2026-11-20"}])
    budget = cards.show_trip_budget(
        [{"label": "Flight", "amount": 300}, {"label": "Hotel", "amount": 250}],
        "EUR",
        500,
    )
    assert (budget["total"], budget["left"]) == (550.0, -50.0)
    scenes = cards.show_scenes(
        [{"date": "2026-08-01"}, {"date": "2026-05-01", "cloud_cover": 3}]
    )
    assert [scene["date"] for scene in scenes["scenes"]] == ["2026-05-01", "2026-08-01"]
    index = cards.show_index_result(
        "ndvi", [{"date": "2026-08-01", "mean": 0.4}], image="javascript:x"
    )
    assert index["index"] == "NDVI" and index["image"] == ""


def test_each_show_tool_is_a_catalogue_backend_tool_bringing_its_card():
    for tool_id, method, plugin in (
        ("show-comparison", "show_comparison", "product-comparison"),
        ("show-basket", "show_basket", "shopping-basket"),
        ("show-reconciliation", "show_reconciliation", "bank-reconciliation"),
        ("show-trial-balance", "show_trial_balance", "trial-balance"),
        ("show-vat-summary", "show_vat_summary", "vat-summary"),
        ("show-trip-options", "show_trip_options", "trip-options"),
        ("show-itinerary", "show_itinerary", "trip-itinerary"),
        ("show-trip-budget", "show_trip_budget", "trip-budget"),
        ("show-scenes", "show_scenes", "earth-scenes"),
        ("show-index-result", "show_index_result", "earth-index"),
    ):
        spec = get_backend_tool_spec(tool_id)
        assert spec is not None, tool_id
        assert spec.runtime.method == method and spec.approval == "auto"
        assert callable(getattr(cards, method))
        assert spec.ui[0].plugin == plugin
