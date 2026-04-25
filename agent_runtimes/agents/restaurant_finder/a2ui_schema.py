# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A2UI JSON Schema for the Restaurant Finder agent (v0.9)."""

A2UI_SCHEMA = r"""
{
  "title": "A2UI v0.9 Message Schema",
  "description": "Schema for A2UI v0.9 messages. Each message MUST include version='v0.9' and exactly one command: createSurface, updateComponents, updateDataModel, or deleteSurface.",
  "type": "object",
  "properties": {
    "version": {
      "const": "v0.9"
    },
    "createSurface": {
      "type": "object",
      "properties": {
        "surfaceId": { "type": "string" },
        "catalogId": { "type": "string" },
        "theme": { "type": "object" },
        "sendDataModel": { "type": "boolean" }
      },
      "required": ["surfaceId", "catalogId"]
    },
    "updateComponents": {
      "type": "object",
      "properties": {
        "surfaceId": { "type": "string" },
        "components": {
          "type": "array",
          "minItems": 1,
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "component": {
                "oneOf": [
                  { "type": "string" },
                  { "type": "object" }
                ]
              },
              "weight": { "type": "number" }
            },
            "required": ["id", "component"]
          }
        }
      },
      "required": ["surfaceId", "components"]
    },
    "updateDataModel": {
      "type": "object",
      "properties": {
        "surfaceId": { "type": "string" },
        "path": { "type": "string" },
        "value": {}
      },
      "required": ["surfaceId", "value"]
    },
    "deleteSurface": {
      "type": "object",
      "properties": {
        "surfaceId": { "type": "string" }
      },
      "required": ["surfaceId"]
    }
  },
  "required": ["version"],
  "oneOf": [
    { "required": ["createSurface"] },
    { "required": ["updateComponents"] },
    { "required": ["updateDataModel"] },
    { "required": ["deleteSurface"] }
  ]
}
"""
