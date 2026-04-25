# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A2UI v0.9 example templates for the Restaurant Finder agent."""

RESTAURANT_UI_EXAMPLES = """
---BEGIN RESTAURANT_LIST_V09_EXAMPLE---
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "default",
      "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json",
      "theme": {"primaryColor": "#FF5722", "font": "Roboto"},
      "sendDataModel": true
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "default",
      "components": [
        {"id": "root", "component": "Column", "children": ["title", "items"]},
        {"id": "title", "component": "Text", "variant": "h1", "text": {"path": "/title"}},
        {
          "id": "items",
          "component": "List",
          "direction": "vertical",
          "children": {"componentId": "item-card", "path": "/items"}
        },
        {"id": "item-card", "component": "Card", "child": "item-layout"},
        {"id": "item-layout", "component": "Column", "children": ["item-name", "item-rating", "item-detail", "book-btn"]},
        {"id": "item-name", "component": "Text", "variant": "h3", "text": {"path": "/name"}},
        {"id": "item-rating", "component": "Text", "text": {"path": "/rating"}},
        {"id": "item-detail", "component": "Text", "text": {"path": "/detail"}},
        {"id": "book-btn-label", "component": "Text", "text": "Book Now"},
        {
          "id": "book-btn",
          "component": "Button",
          "variant": "primary",
          "child": "book-btn-label",
          "action": {
            "event": {
              "name": "book_restaurant",
              "context": {
                "restaurantName": {"path": "/name"},
                "imageUrl": {"path": "/imageUrl"},
                "address": {"path": "/address"}
              }
            }
          }
        }
      ]
    }
  },
  {
    "version": "v0.9",
    "updateDataModel": {
      "surfaceId": "default",
      "path": "/",
      "value": {
        "title": "Top Restaurants",
        "items": [
          {
            "name": "The Fancy Place",
            "rating": "4.8",
            "detail": "Fine dining experience",
            "imageUrl": "https://example.com/fancy.jpg",
            "address": "123 Main St"
          }
        ]
      }
    }
  }
]
---END RESTAURANT_LIST_V09_EXAMPLE---

---BEGIN BOOKING_FORM_V09_EXAMPLE---
[
  {
    "version": "v0.9",
    "createSurface": {
      "surfaceId": "booking-form",
      "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json"
    }
  },
  {
    "version": "v0.9",
    "updateComponents": {
      "surfaceId": "booking-form",
      "components": [
        {"id": "root", "component": "Column", "children": ["title", "party", "when", "dietary", "submit"]},
        {"id": "title", "component": "Text", "variant": "h2", "text": "Book a Table"},
        {"id": "party", "component": "TextField", "label": "Party Size", "value": {"path": "/partySize"}},
        {"id": "when", "component": "DateTimeInput", "label": "Reservation Time", "value": {"path": "/reservationTime"}},
        {"id": "dietary", "component": "TextField", "label": "Dietary Requirements", "value": {"path": "/dietary"}},
        {"id": "submit-label", "component": "Text", "text": "Confirm Booking"},
        {
          "id": "submit",
          "component": "Button",
          "variant": "primary",
          "child": "submit-label",
          "action": {
            "event": {
              "name": "submit_booking",
              "context": {
                "restaurantName": {"path": "/restaurantName"},
                "partySize": {"path": "/partySize"},
                "reservationTime": {"path": "/reservationTime"},
                "dietary": {"path": "/dietary"}
              }
            }
          }
        }
      ]
    }
  }
]
---END BOOKING_FORM_V09_EXAMPLE---
"""
