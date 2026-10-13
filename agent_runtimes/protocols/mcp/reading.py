# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an MCP client of agent-runtimes reads from a server's answers.

The twin of ``src/protocols/mcp/client.ts`` (AGENT_PROTOCOLS PR-51): each
answer is the ``mcp`` SDK's own type, read into the plain shape both
languages agree on, held to ``fixtures/session.json`` by
``test_protocols_mcp.py`` and the TypeScript ``mcpClient.unit.test.ts``. A
tool's missing annotations are read with the specification's defaults
(``readOnlyHint`` false, ``destructiveHint`` true, ``idempotentHint`` false,
``openWorldHint`` true), so a server that says nothing is never read as
harmless; ``destructiveHint`` means something only when the tool is not
read-only, so a read-only tool is never destructive.
"""

from __future__ import annotations

from typing import Any

from mcp.types import (
    CallToolResult,
    GetPromptResult,
    ReadResourceResult,
    TextContent,
    TextResourceContents,
    Tool,
)


def tool_reading(tool: Tool) -> dict[str, Any]:
    """A listed tool: its parameters, whether it answers structured, its hints."""
    schema = tool.input_schema or {}
    hints = tool.annotations
    read_only = bool(hints and hints.read_only_hint is True)
    return {
        "name": tool.name,
        "title": tool.title,
        "description": tool.description,
        "parameters": sorted((schema.get("properties") or {}).keys()),
        "required": sorted(schema.get("required") or []),
        "structured": tool.output_schema is not None,
        "readOnly": read_only,
        "destructive": not read_only
        and not (hints and hints.destructive_hint is False),
        "idempotent": bool(hints and hints.idempotent_hint is True),
        "openWorld": not (hints and hints.open_world_hint is False),
    }


def call_reading(result: CallToolResult) -> dict[str, Any]:
    """A tool's answer: refused or not, its text parts joined, its structured content."""
    return {
        "isError": bool(result.is_error),
        "text": "\n".join(
            part.text for part in result.content if isinstance(part, TextContent)
        ),
        "structured": result.structured_content,
    }


def resource_reading(result: ReadResourceResult) -> list[dict[str, Any]]:
    """A resource's text contents; a binary one is refused, never decoded here."""
    contents: list[dict[str, Any]] = []
    for part in result.contents:
        if not isinstance(part, TextResourceContents):
            raise ValueError(f"{part.uri} is not text.")
        contents.append(
            {"uri": str(part.uri), "mimeType": part.mime_type, "text": part.text}
        )
    return contents


def prompt_reading(result: GetPromptResult) -> list[dict[str, Any]]:
    """A prompt's messages as text; a message of another kind is refused."""
    messages: list[dict[str, Any]] = []
    for message in result.messages:
        if not isinstance(message.content, TextContent):
            raise ValueError(f"A {message.role} message is not text.")
        messages.append({"role": message.role, "text": message.content.text})
    return messages


__all__ = ["call_reading", "prompt_reading", "resource_reading", "tool_reading"]
