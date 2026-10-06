# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Components of the catalog, checked: what an application places and shows.

One catalog for the three flavors (LOOP P-04, C-15): a component a Python
application places on its surface (``app.ui.table(...)``) or shows with an
answer (``session.send(text, show=[session.ui.table(...)])``) is a component
the Canvas places, its properties checked against the same JSON Schema.

An answer's components are drawn as an A2UI surface of their own, under the
message they came with (`answer_surface`).
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence

import jsonschema

from agent_runtimes.specs.ui_plugins import get_component

#: The catalog an answer's surface names; the page draws it with Datalayer's
#: catalog whatever it is named (`readA2uiToolResult`).
ANSWER_CATALOG_ID = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json"


def component_node(id: str, component: str, **properties: Any) -> Dict[str, Any]:
    """A component of the catalog as a surface holds it, its properties checked.

    Parameters
    ----------
    id : str
        Its id on the surface, unique; ``root`` is where the surface starts.
    component : str
        The component, by its id in the catalog (``Table``, ``Chart``…).
    **properties
        Its properties; one bound to the data model is ``{"path": ...}``.

    Returns
    -------
    dict
        The node: ``{"id", "component", **properties}``.

    Raises
    ------
    ValueError
        For a component the catalog does not have, or properties its schema refuses.
    """
    spec = get_component(component)
    if spec is None:
        raise ValueError(f"The catalog has no component {component!r}.")
    own = {
        name: value
        for name, value in properties.items()
        if not (isinstance(value, Mapping) and "path" in value)
    }
    schema = {
        **spec.properties,
        "required": [
            name
            for name in spec.properties.get("required", [])
            if name not in properties or name in own
        ],
    }
    refused = sorted(
        jsonschema.Draft202012Validator(schema).iter_errors(own),
        key=lambda error: list(error.path),
    )
    if refused:
        said = "; ".join(
            f"{'.'.join(str(part) for part in error.path) or 'its properties'}: {error.message}"
            for error in refused
        )
        raise ValueError(f"{id} is a {spec.name} its schema refuses: {said}.")
    return {"id": id, "component": component, **properties}


def _children_of(node: Mapping[str, Any]) -> List[str]:
    """The ids a node names as its children."""
    named: List[str] = []
    for key, value in node.items():
        if not key.lower().endswith(("child", "children")):
            continue
        if isinstance(value, str):
            named.append(value)
        elif isinstance(value, (list, tuple)):
            named.extend(item for item in value if isinstance(item, str))
        elif isinstance(value, Mapping) and isinstance(value.get("componentId"), str):
            named.append(value["componentId"])
    return named


def answer_components(show: Sequence[Mapping[str, Any]]) -> tuple[Dict[str, Any], ...]:
    """What an answer shows, checked: nodes of the catalog.

    A property bound to a path (a Table's ``rows``, a Chart's ``points``)
    reads the answer's own data (``session.send(..., data={...})``).

    Raises
    ------
    ValueError
        For what is not a node, two nodes of one id, or a child no node is.
    """
    nodes: List[Dict[str, Any]] = []
    for index, node in enumerate(show):
        if not isinstance(node, Mapping) or not isinstance(node.get("id"), str):
            raise ValueError(
                f"What an answer shows is components of the catalog "
                f"(session.ui.<component>(...)); item {index + 1} is not one."
            )
        properties = {k: v for k, v in node.items() if k not in ("id", "component")}
        nodes.append(
            component_node(node["id"], str(node.get("component")), **properties)
        )
    ids = [node["id"] for node in nodes]
    twice = sorted({one for one in ids if ids.count(one) > 1})
    if twice:
        raise ValueError(
            f"An answer shows one component per id: {', '.join(twice)} twice."
        )
    missing = sorted(
        {child for node in nodes for child in _children_of(node)} - set(ids)
    )
    if missing:
        raise ValueError(f"An answer shows no component {', '.join(missing)}.")
    return tuple(nodes)


def answer_surface(
    message_id: str,
    title: str,
    nodes: Sequence[Mapping[str, Any]],
    data: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """An answer's components as the A2UI messages that draw them, under the message.

    The nodes no other node names are laid in a column, in the order shown,
    unless one is ``root``; ``data`` is the surface's data model, what a
    bound property reads.

    Returns
    -------
    dict
        ``{surfaceId, catalogId, title, messages}``: what the chat draws a
        surface from (`render_a2ui_surface`'s result).
    """
    surface_id = f"answer-{message_id}"
    components = [dict(node) for node in nodes]
    if not any(node["id"] == "root" for node in components):
        named = {child for node in components for child in _children_of(node)}
        components.insert(
            0,
            {
                "id": "root",
                "component": "Column",
                "children": [
                    node["id"] for node in components if node["id"] not in named
                ],
            },
        )
    return {
        "surfaceId": surface_id,
        "catalogId": ANSWER_CATALOG_ID,
        "title": title,
        "messages": [
            {
                "version": "v0.9",
                "createSurface": {
                    "surfaceId": surface_id,
                    "catalogId": ANSWER_CATALOG_ID,
                },
            },
            {
                "version": "v0.9",
                "updateComponents": {"surfaceId": surface_id, "components": components},
            },
            *(
                [
                    {
                        "version": "v0.9",
                        "updateDataModel": {
                            "surfaceId": surface_id,
                            "path": "/",
                            "value": dict(data),
                        },
                    }
                ]
                if data
                else []
            ),
        ],
    }


__all__ = [
    "ANSWER_CATALOG_ID",
    "answer_components",
    "answer_surface",
    "component_node",
]
