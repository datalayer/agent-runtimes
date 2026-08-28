# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Sandbox output → A2UI surface.

This is the "notebook becomes an app" step: a prompt runs code, and what comes
back is a surface you can read rather than a wall of stdout.

It lives on the server (D20) so every front-end gets the same surfaces from one
converter. The browser draws them properly, the terminal renders a degraded
version, and a JupyterLab panel will get them free — none of which happens if
the conversion is written in the browser.

The messages are A2UI v0.9 (`createSurface` / `updateComponents` /
`updateDataModel`), the same shapes the `render_a2ui_surface` tool emits, so
anything that can already render an A2UI surface can render these.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Optional

#: A2UI protocol version these messages speak.
A2UI_VERSION = "v0.9"

#: Catalog the basic components come from.
A2UI_BASIC_CATALOG_ID = "a2ui/basic"

#: Longest text block rendered before it is cut. A surface is a summary; the
#: raw stream stays available where it always was.
MAX_TEXT_CHARS = 4000

#: Beyond this many rows a table is truncated with a note saying so — a silent
#: cut would misrepresent the data.
MAX_TABLE_ROWS = 50


@dataclass
class ExecutionResult:
    """What a sandbox reported for one execution."""

    code: str = ""
    success: bool = True
    stdout: str = ""
    stderr: str = ""
    error: str = ""
    #: Raw Jupyter outputs, when the variant produces them.
    outputs: list[dict[str, Any]] = field(default_factory=list)

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "ExecutionResult":
        """Build from the loose dict the sandbox routes return."""
        outputs = payload.get("outputs")
        return cls(
            code=str(payload.get("code") or ""),
            success=bool(payload.get("success", not payload.get("error"))),
            stdout=str(payload.get("stdout") or ""),
            stderr=str(payload.get("stderr") or ""),
            error=str(payload.get("error") or ""),
            outputs=list(outputs) if isinstance(outputs, list) else [],
        )


def _truncate(text: str, limit: int = MAX_TEXT_CHARS) -> tuple[str, bool]:
    """Cut long text, and say whether it was cut."""
    if len(text) <= limit:
        return text, False
    return text[:limit], True


def _text(component_id: str, text: str, variant: Optional[str] = None) -> dict[str, Any]:
    component: dict[str, Any] = {
        "id": component_id,
        "component": "Text",
        "text": text,
    }
    if variant:
        component["variant"] = variant
    return component


def _mime_bundle(output: dict[str, Any]) -> dict[str, Any]:
    """The data of a Jupyter output, whichever spelling it uses."""
    data = output.get("data")
    return data if isinstance(data, dict) else {}


def _plain_text(output: dict[str, Any]) -> str:
    """Best textual representation of one Jupyter output."""
    kind = output.get("output_type")
    if kind == "stream":
        return str(output.get("text") or "")
    if kind == "error":
        traceback = output.get("traceback") or []
        if isinstance(traceback, list):
            # Tracebacks arrive with ANSI colouring that means nothing here.
            return _strip_ansi("\n".join(str(line) for line in traceback))
        return f"{output.get('ename', 'Error')}: {output.get('evalue', '')}"
    bundle = _mime_bundle(output)
    for mime in ("text/plain", "text/markdown"):
        if mime in bundle:
            value = bundle[mime]
            return "".join(value) if isinstance(value, list) else str(value)
    return ""


_ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def _strip_ansi(text: str) -> str:
    return _ANSI.sub("", text)


def _image_mime(output: dict[str, Any]) -> Optional[str]:
    """The image mime type of an output, if it has one."""
    for mime in ("image/png", "image/jpeg", "image/svg+xml"):
        if mime in _mime_bundle(output):
            return mime
    return None


def execution_to_a2ui(
    result: ExecutionResult,
    surface_id: str = "sandbox-execution",
    *,
    title: str = "Execution",
) -> list[dict[str, Any]]:
    """Render one execution as an A2UI surface.

    The shape of the answer follows what happened: an error leads, because that
    is what the reader needs first; images are shown; long text is summarised
    rather than dumped.
    """
    components: list[dict[str, Any]] = []
    root_children: list[str] = []
    data: dict[str, Any] = {}

    def add(component: dict[str, Any]) -> str:
        components.append(component)
        return str(component["id"])

    root_children.append(add(_text("title", title, "h2")))

    status = "Succeeded" if result.success and not result.error else "Failed"
    root_children.append(add(_text("status", status, "caption")))

    if result.code.strip():
        code_text, cut = _truncate(result.code)
        card_children = [
            add(_text("code-label", "Code", "caption")),
            add(_text("code", code_text + ("\n…" if cut else ""))),
        ]
        add({"id": "code-column", "component": "Column", "children": card_children})
        root_children.append(add({"id": "code-card", "component": "Card", "child": "code-column"}))

    # An error is the thing the reader needs first, so it goes above output.
    failure = result.error or (result.stderr if not result.success else "")
    if failure:
        failure_text, _ = _truncate(_strip_ansi(failure))
        add({"id": "error-column", "component": "Column", "children": [
            add(_text("error-label", "Error", "caption")),
            add(_text("error", failure_text)),
        ]})
        root_children.append(add({"id": "error-card", "component": "Card", "child": "error-column"}))

    images = 0
    text_blocks: list[str] = []

    for index, output in enumerate(result.outputs):
        if not isinstance(output, dict):
            continue
        mime = _image_mime(output)
        if mime:
            payload = _mime_bundle(output)[mime]
            source = (
                str(payload)
                if mime == "image/svg+xml"
                else f"data:{mime};base64,{payload}"
            )
            images += 1
            root_children.append(
                add(
                    {
                        "id": f"image-{index}",
                        "component": "Image",
                        "url": source,
                    }
                )
            )
            continue
        text = _plain_text(output)
        if text.strip():
            text_blocks.append(text)

    if result.stdout.strip():
        text_blocks.insert(0, result.stdout)

    if text_blocks:
        joined, cut = _truncate("\n".join(text_blocks))
        add({"id": "output-column", "component": "Column", "children": [
            add(_text("output-label", "Output", "caption")),
            add(_text("output", joined + ("\n… truncated" if cut else ""))),
        ]})
        root_children.append(add({"id": "output-card", "component": "Card", "child": "output-column"}))

    if not text_blocks and not images and not failure:
        root_children.append(add(_text("empty", "The code ran and produced no output.")))

    components.insert(
        0,
        {"id": "root", "component": "Column", "children": root_children},
    )

    data["execution"] = {
        "success": bool(result.success and not result.error),
        "images": images,
        "hasOutput": bool(text_blocks),
    }

    return [
        {
            "version": A2UI_VERSION,
            "createSurface": {
                "surfaceId": surface_id,
                "catalogId": A2UI_BASIC_CATALOG_ID,
                "sendDataModel": True,
            },
        },
        {
            "version": A2UI_VERSION,
            "updateComponents": {"surfaceId": surface_id, "components": components},
        },
        {
            "version": A2UI_VERSION,
            "updateDataModel": {"surfaceId": surface_id, "path": "/", "value": data},
        },
    ]
