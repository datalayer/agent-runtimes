# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The MCP conformance server on localhost, for a client in another language (AGENT_PROTOCOLS PR-51).

A server of the ``mcp`` SDK that answers exactly what
``agent_runtimes/protocols/mcp/fixtures/session.json`` holds: its tools, each
call of the fixture with its answer, its resources and its prompts; anything
else is refused. Python's client reads it in process
(``test_protocols_mcp.py``); the TypeScript ``McpClient`` of
``src/protocols/mcp`` reads it over Streamable HTTP.

    python examples/protocols/mcp/fixture_server.py --port 8813
    MCP_FIXTURE_SERVER=http://127.0.0.1:8813/mcp npx vitest run --project=integration \\
        src/protocols/mcp/mcpServer.integration.test.ts

``agent_runtimes/tests/test_protocols_mcp_two_languages.py`` runs both.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from mcp.server.lowlevel import Server

from mcp import types

FIXTURE = (
    Path(__file__).parents[3]
    / "agent_runtimes"
    / "protocols"
    / "mcp"
    / "fixtures"
    / "session.json"
)


def load_fixture() -> dict[str, Any]:
    """The conformance fixture both languages read."""
    return json.loads(FIXTURE.read_text())


def fixture_server(fixture: dict[str, Any]) -> Server[Any]:
    """A server answering the fixture's wire answers, and nothing else."""

    async def list_tools(_ctx: Any, _params: Any) -> types.ListToolsResult:
        return types.ListToolsResult.model_validate(fixture["tools"]["wire"])

    async def call_tool(
        _ctx: Any, params: types.CallToolRequestParams
    ) -> types.CallToolResult:
        for call in fixture["calls"]:
            if call["tool"] == params.name and call["arguments"] == (
                params.arguments or {}
            ):
                return types.CallToolResult.model_validate(call["wire"])
        return types.CallToolResult(
            content=[
                types.TextContent(
                    type="text",
                    text=f"The fixture has no call of {params.name} with these arguments.",
                )
            ],
            is_error=True,
        )

    async def list_resources(_ctx: Any, _params: Any) -> types.ListResourcesResult:
        return types.ListResourcesResult(
            resources=[
                types.Resource(
                    uri=resource["uri"],
                    name=resource["name"],
                    mime_type=resource["mimeType"],
                )
                for resource in fixture["resources"]
            ]
        )

    async def read_resource(
        _ctx: Any, params: types.ReadResourceRequestParams
    ) -> types.ReadResourceResult:
        for resource in fixture["resources"]:
            if resource["uri"] == str(params.uri):
                return types.ReadResourceResult.model_validate(resource["wire"])
        raise ValueError(f"The fixture has no resource {params.uri}.")

    async def list_prompts(_ctx: Any, _params: Any) -> types.ListPromptsResult:
        return types.ListPromptsResult(
            prompts=[
                types.Prompt.model_validate(
                    {key: prompt[key] for key in ("name", "description", "arguments")}
                )
                for prompt in fixture["prompts"]
            ]
        )

    async def get_prompt(
        _ctx: Any, params: types.GetPromptRequestParams
    ) -> types.GetPromptResult:
        for prompt in fixture["prompts"]:
            if prompt["name"] == params.name and prompt["get"] == (
                params.arguments or {}
            ):
                return types.GetPromptResult.model_validate(prompt["wire"])
        raise ValueError(
            f"The fixture has no prompt {params.name} with these arguments."
        )

    return Server(
        fixture["server"]["name"],
        version=fixture["server"]["version"],
        on_list_tools=list_tools,
        on_call_tool=call_tool,
        on_list_resources=list_resources,
        on_read_resource=read_resource,
        on_list_prompts=list_prompts,
        on_get_prompt=get_prompt,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8813)
    args = parser.parse_args()

    import uvicorn

    server = fixture_server(load_fixture())
    print(f"MCP conformance server: http://{args.host}:{args.port}/mcp")
    uvicorn.run(
        server.streamable_http_app(host=args.host),
        host=args.host,
        port=args.port,
    )


if __name__ == "__main__":
    main()
