# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`agent-runtimes mcp`: talk to the Datalayer MCP gateway, or any MCP server.

The commands open one streamable-HTTP session (see
:mod:`agent_runtimes.mcp.hosted_client`): list the gateway's toolsets, a
session's tools and their input schemas, call a tool, or run a script that
makes many calls on one session.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import os
from pathlib import Path
from typing import Annotated, Any, Optional

import typer

from agent_runtimes.mcp.hosted_client import (
    DEFAULT_TOKEN_ENV,
    HostedMCPClient,
    MCPToolError,
    connect,
    decode_result,
    list_toolsets,
    result_text,
)

app = typer.Typer(
    name="mcp",
    help=(
        "Talk to the Datalayer MCP gateway (or any MCP server): toolsets, "
        "tools, calls and scripts on one session."
    ),
    invoke_without_command=True,
    pretty_exceptions_show_locals=False,
)


@app.callback()
def mcp_callback(ctx: typer.Context) -> None:
    """Talk to the Datalayer MCP gateway, or any MCP server."""
    # Each HTTP exchange of the session is logged at INFO by httpx and the SDK:
    # noise around the answer a command prints.
    for name in ("httpx", "httpx2", "mcp"):
        logging.getLogger(name).setLevel(logging.WARNING)
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


UrlOption = Annotated[
    Optional[str],
    typer.Option(
        "--url",
        "-u",
        help=(
            "MCP endpoint. Default: $DATALAYER_MCP_SERVER_URL, or "
            "https://mcp.datalayer.run/mcp."
        ),
    ),
]
ToolsetOption = Annotated[
    Optional[list[str]],
    typer.Option(
        "--toolset",
        "-t",
        help="Gateway toolset to add (repeatable, or comma-separated).",
    ),
]
OnlyOption = Annotated[
    bool,
    typer.Option(
        "--only", help="Exactly the given toolsets, without the gateway's defaults."
    ),
]
ParamOption = Annotated[
    Optional[list[str]],
    typer.Option(
        "--param",
        "-p",
        help="Session parameter KEY=VALUE in the query string (repeatable), e.g. odoo-company=2.",
    ),
]
TokenEnvOption = Annotated[
    str,
    typer.Option(
        "--token-env",
        help="Environment variable holding the bearer token (never printed).",
    ),
]
HeaderOption = Annotated[
    Optional[list[str]],
    typer.Option("--header", "-H", help="Extra request header KEY=VALUE (repeatable)."),
]
JsonOption = Annotated[bool, typer.Option("--json", help="Output JSON.")]


def _pairs(values: Optional[list[str]], what: str) -> dict[str, str]:
    pairs: dict[str, str] = {}
    for value in values or []:
        key, sep, rest = value.partition("=")
        if not sep or not key.strip():
            raise typer.BadParameter(f"{what} must be KEY=VALUE, got {value!r}.")
        pairs[key.strip()] = rest
    return pairs


def _toolsets(values: Optional[list[str]]) -> list[str]:
    return [
        name.strip()
        for value in values or []
        for name in value.split(",")
        if name.strip()
    ]


def _json_value(text: str) -> Any:
    try:
        return json.loads(text)
    except ValueError:
        return text


def parse_arguments(args: Optional[str], pairs: Optional[list[str]]) -> dict[str, Any]:
    """
    A tool's arguments from ``--args`` and ``-a key=value``.

    ``--args`` is a JSON object, or ``@path`` to a file holding one. Each
    ``-a key=value`` sets one argument, its value decoded as JSON when it is
    JSON (``limit=5``, ``ids=[1,2]``, ``draft=true``) and kept as a string
    otherwise; it wins over the same key in ``--args``.
    """
    arguments: dict[str, Any] = {}
    if args:
        text = Path(args[1:]).read_text() if args.startswith("@") else args
        try:
            loaded = json.loads(text)
        except ValueError as error:
            raise typer.BadParameter(f"--args is not JSON: {error}") from error
        if not isinstance(loaded, dict):
            raise typer.BadParameter("--args must be a JSON object.")
        arguments.update(loaded)
    for key, value in _pairs(pairs, "--arg").items():
        arguments[key] = _json_value(value)
    return arguments


def _session_options(
    url: Optional[str],
    toolset: Optional[list[str]],
    only: bool,
    param: Optional[list[str]],
    token_env: str,
    header: Optional[list[str]],
) -> dict[str, Any]:
    return {
        "url": url,
        "toolsets": _toolsets(toolset),
        "params": _pairs(param, "--param"),
        "only": only,
        "token_env": token_env,
        "headers": _pairs(header, "--header"),
    }


def _innermost(error: BaseException) -> BaseException:
    """The error itself, through anyio's exception groups."""
    while getattr(error, "exceptions", None):
        error = error.exceptions[0]  # type: ignore[attr-defined]
    return error


def _run(coroutine: Any, token_env: str) -> Any:
    try:
        return asyncio.run(coroutine)
    except Exception as error:  # noqa: BLE001 - one readable line, not a trace
        inner = _innermost(error)
        if isinstance(inner, (typer.Exit, typer.BadParameter, MCPToolError)):
            raise inner from None
        typer.secho(
            f"MCP session failed: {type(inner).__name__}: {inner}", fg="red", err=True
        )
        if not os.environ.get(token_env):
            typer.secho(f"(${token_env} is not set.)", fg="yellow", err=True)
        raise typer.Exit(2) from error


def _echo_json(value: Any) -> None:
    typer.echo(json.dumps(value, indent=2, ensure_ascii=False, default=str))


def _first_line(text: Optional[str]) -> str:
    return (text or "").strip().splitlines()[0] if (text or "").strip() else ""


def _tool_dict(tool: Any) -> dict[str, Any]:
    return tool.model_dump(by_alias=True, exclude_none=True, mode="json")


@app.command("toolsets")
def toolsets_command(
    url: UrlOption = None,
    toolset: ToolsetOption = None,
    only: OnlyOption = False,
    param: ParamOption = None,
    token_env: TokenEnvOption = DEFAULT_TOKEN_ENV,
    header: HeaderOption = None,
    output_json: JsonOption = False,
) -> None:
    """List the gateway's toolsets; `*` marks those the session would have."""
    options = _session_options(url, toolset, only, param, token_env, header)
    try:
        listing = asyncio.run(list_toolsets(**options))
    except Exception as error:  # noqa: BLE001
        typer.secho(str(error), fg="red", err=True)
        raise typer.Exit(2) from error
    if output_json:
        _echo_json(listing)
        return
    entries = listing.get("toolsets", [])
    width = max((len(entry.get("name", "")) for entry in entries), default=4)
    for entry in entries:
        mark = "*" if entry.get("active") else " "
        default = " (default)" if entry.get("default") else ""
        typer.echo(
            f"{mark} {entry.get('name', ''):<{width}}  {entry.get('description', '')}{default}"
        )
    if listing.get("unknown"):
        typer.secho(
            f"Unknown toolsets: {', '.join(listing['unknown'])}", fg="yellow", err=True
        )


@app.command("tools")
def tools_command(
    url: UrlOption = None,
    toolset: ToolsetOption = None,
    only: OnlyOption = False,
    param: ParamOption = None,
    token_env: TokenEnvOption = DEFAULT_TOKEN_ENV,
    header: HeaderOption = None,
    output_json: JsonOption = False,
    schema: Annotated[
        Optional[str],
        typer.Option("--schema", "-s", help="Show this tool's input schema instead."),
    ] = None,
) -> None:
    """List a session's tools, each with the first line of its description."""
    options = _session_options(url, toolset, only, param, token_env, header)
    if schema:
        _describe(schema, options, output_json)
        return

    async def go() -> list[Any]:
        async with connect(**options) as client:
            return await client.list_tools()

    tools = _run(go(), token_env)
    if output_json:
        _echo_json([_tool_dict(tool) for tool in tools])
        return
    width = max((len(tool.name) for tool in tools), default=4)
    for tool in sorted(tools, key=lambda tool: tool.name):
        typer.echo(f"{tool.name:<{width}}  {_first_line(tool.description)}")
    typer.secho(f"{len(tools)} tools", dim=True, err=True)


def _describe(name: str, options: dict[str, Any], output_json: bool) -> None:
    async def go() -> Any:
        async with connect(**options) as client:
            try:
                return await client.describe(name)
            except KeyError:
                return None

    tool = _run(go(), options["token_env"])
    if tool is None:
        typer.secho(f"No tool {name!r} in this session.", fg="red", err=True)
        raise typer.Exit(1)
    if output_json:
        _echo_json(_tool_dict(tool))
        return
    typer.secho(tool.name, bold=True)
    if tool.description:
        typer.echo(tool.description.strip())
    typer.echo("")
    typer.echo("Input schema:")
    _echo_json(tool.input_schema)


@app.command("describe")
def describe_command(
    name: Annotated[str, typer.Argument(help="Tool name.")],
    url: UrlOption = None,
    toolset: ToolsetOption = None,
    only: OnlyOption = False,
    param: ParamOption = None,
    token_env: TokenEnvOption = DEFAULT_TOKEN_ENV,
    header: HeaderOption = None,
    output_json: JsonOption = False,
) -> None:
    """Show one tool's description and input schema."""
    _describe(
        name,
        _session_options(url, toolset, only, param, token_env, header),
        output_json,
    )


@app.command("call")
def call_command(
    tool: Annotated[str, typer.Argument(help="Tool name.")],
    args: Annotated[
        Optional[str],
        typer.Option(
            "--args", help="Arguments as a JSON object, or @file.json holding one."
        ),
    ] = None,
    arg: Annotated[
        Optional[list[str]],
        typer.Option(
            "--arg",
            "-a",
            help="One argument KEY=VALUE, VALUE decoded as JSON when it is (repeatable).",
        ),
    ] = None,
    raw: Annotated[
        bool, typer.Option("--raw", help="Print the whole CallToolResult.")
    ] = False,
    url: UrlOption = None,
    toolset: ToolsetOption = None,
    only: OnlyOption = False,
    param: ParamOption = None,
    token_env: TokenEnvOption = DEFAULT_TOKEN_ENV,
    header: HeaderOption = None,
) -> None:
    """Call a tool and print its JSON result; exit 1 when the tool errs.

    A result of one content is printed alone, several as a JSON list.
    """
    arguments = parse_arguments(args, arg)
    options = _session_options(url, toolset, only, param, token_env, header)

    async def go() -> Any:
        async with connect(**options) as client:
            return await client.call_raw(tool, **arguments)

    result = _run(go(), token_env)
    if raw:
        _echo_json(result.model_dump(by_alias=True, exclude_none=True, mode="json"))
        if result.is_error:
            raise typer.Exit(1)
        return
    if result.is_error:
        typer.secho(f"{tool} failed: {result_text(result)}", fg="red", err=True)
        raise typer.Exit(1)
    values = decode_result(result)
    _echo_json(values[0] if len(values) == 1 else values)


def load_main(path: Path) -> Any:
    """The `async def main(client)` a script file defines."""
    namespace: dict[str, Any] = {"__name__": "__mcp_run__", "__file__": str(path)}
    exec(compile(path.read_text(), str(path), "exec"), namespace)  # noqa: S102
    main = namespace.get("main")
    if main is None or not inspect.iscoroutinefunction(main):
        raise typer.BadParameter(f"{path} must define `async def main(client)`.")
    return main


@app.command("run")
def run_command(
    script: Annotated[
        Path,
        typer.Argument(
            help="Python file defining `async def main(client)`.",
            exists=True,
            dir_okay=False,
            readable=True,
        ),
    ],
    url: UrlOption = None,
    toolset: ToolsetOption = None,
    only: OnlyOption = False,
    param: ParamOption = None,
    token_env: TokenEnvOption = DEFAULT_TOKEN_ENV,
    header: HeaderOption = None,
) -> None:
    """Run a script's `async def main(client)` on one session.

    `client` is a HostedMCPClient: `await client.call(tool, **args)` returns
    the decoded results (a list) and raises MCPToolError when the tool errs;
    `call_raw`, `list_tools` and `describe` are there too. What `main`
    returns, when not None, is printed as JSON.
    """
    main = load_main(script)
    options = _session_options(url, toolset, only, param, token_env, header)

    async def go() -> Any:
        async with connect(**options) as client:
            return await main(client)

    try:
        value = _run(go(), token_env)
    except MCPToolError as error:
        typer.secho(f"{error.tool} failed: {error.text}", fg="red", err=True)
        raise typer.Exit(1) from error
    if value is not None:
        _echo_json(value)


__all__ = ["HostedMCPClient", "app", "load_main", "parse_arguments"]
