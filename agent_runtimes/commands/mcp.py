# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`agent-runtimes mcp`: talk to the Datalayer MCP gateway, or any MCP server.

The commands open one streamable-HTTP session (see
:mod:`agent_runtimes.mcp.hosted_client`): list the gateway's toolsets, a
session's tools and their input schemas, call a tool, run a script that makes
many calls on one session, or read the gateway's health.

Stdout carries the result alone, so it pipes into ``jq`` or ``json.load``:
logs, retries and errors go to stderr, and library logs are quiet unless
``-v``.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import inspect
import json
import logging
import os
import sys
from enum import Enum
from pathlib import Path
from typing import Annotated, Any, Optional

import typer

from agent_runtimes.mcp.hosted_client import (
    DEFAULT_RETRIES,
    DEFAULT_RETRY_WAIT,
    DEFAULT_TOKEN_ENV,
    HostedMCPClient,
    MCPConnectError,
    MCPToolError,
    _innermost,
    coerce_arguments,
    connect,
    decode_result,
    gateway_health,
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

#: Loggers that talk on every request or at import; WARNING unless `-v`.
QUIET_LOGGERS = (
    "httpx",
    "httpx2",
    "httpcore",
    "mcp",
    "botocore",
    "boto3",
    "urllib3",
    "fastmcp",
)


def configure_logging(verbose: bool) -> None:
    """Log to stderr only; library loggers at WARNING unless `verbose`."""
    level = logging.INFO if verbose else logging.WARNING
    loggers = [logging.getLogger()] + [
        candidate
        for candidate in logging.Logger.manager.loggerDict.values()
        if isinstance(candidate, logging.Logger)
    ]
    for candidate in loggers:
        for handler in candidate.handlers:
            if (
                isinstance(handler, logging.StreamHandler)
                and getattr(handler, "stream", None) is sys.stdout
            ):
                handler.setStream(sys.stderr)
    logging.getLogger().setLevel(level)
    for name in QUIET_LOGGERS:
        logging.getLogger(name).setLevel(level)


VerboseOption = Annotated[
    bool,
    typer.Option("--verbose", "-v", help="Show library logs (on stderr)."),
]


@app.callback()
def mcp_callback(ctx: typer.Context, verbose: VerboseOption = False) -> None:
    """Talk to the Datalayer MCP gateway, or any MCP server."""
    configure_logging(verbose)
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
CompanyOption = Annotated[
    Optional[int],
    typer.Option(
        "--company",
        "-c",
        help="Odoo company: sugar for -p odoo-company=N.",
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
RetriesOption = Annotated[
    int,
    typer.Option(
        "--retries",
        help=(
            "Retries for opening the session (connection, TLS, initialize, "
            "502/503/504). A tool call is never retried."
        ),
        min=0,
    ),
]
RetryWaitOption = Annotated[
    float,
    typer.Option(
        "--retry-wait", help="First wait between retries in seconds; doubles.", min=0
    ),
]
JsonOption = Annotated[bool, typer.Option("--json", help="Output JSON.")]


class OutputFormat(str, Enum):
    json = "json"
    text = "text"


OutputOption = Annotated[
    OutputFormat,
    typer.Option(
        "--output",
        "-o",
        help="json (default), or text: strings printed as they are, the rest as JSON.",
    ),
]
CompactOption = Annotated[
    bool, typer.Option("--compact", help="JSON on one line, without indentation.")
]


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


def parse_arguments(
    args: Optional[str],
    pairs: Optional[list[str]],
    schema: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    A tool's arguments from ``--args`` and ``-a key=value``.

    ``--args`` is a JSON object, or ``@path`` to a file holding one, kept as
    it is. Each ``-a key=value`` sets one argument and wins over the same key
    in ``--args``; its value is typed by the tool's input `schema`: a
    string-typed property keeps the text (``number=1618720029`` stays a
    string), an integer, number, boolean, array or object one decodes it as
    JSON. A property the schema does not type (or no schema) decodes it as
    JSON when it is JSON (``limit=5``, ``ids=[1,2]``, ``draft=true``) and keeps
    the text otherwise.
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
    arguments.update(
        coerce_arguments(_pairs(pairs, "--arg"), schema or {}, from_text=True)
    )
    return arguments


def _session_options(
    url: Optional[str],
    toolset: Optional[list[str]],
    only: bool,
    param: Optional[list[str]],
    token_env: str,
    header: Optional[list[str]],
    company: Optional[int] = None,
    retries: int = DEFAULT_RETRIES,
    retry_wait: float = DEFAULT_RETRY_WAIT,
) -> dict[str, Any]:
    params: dict[str, Any] = _pairs(param, "--param")
    if company is not None:
        params["odoo-company"] = company
    return {
        "url": url,
        "toolsets": _toolsets(toolset),
        "params": params,
        "only": only,
        "token_env": token_env,
        "headers": _pairs(header, "--header"),
        "retries": retries,
        "retry_wait": retry_wait,
        "on_retry": _tell_retry,
    }


def _tell_retry(message: str) -> None:
    typer.secho(message, fg="yellow", err=True)


def _run(coroutine: Any, token_env: str) -> Any:
    """Run the session; a failure to open it is one stderr line and exit 2."""
    try:
        return asyncio.run(coroutine)
    except Exception as error:  # noqa: BLE001 - one readable line, not a trace
        inner = _innermost(error)
        if isinstance(inner, (typer.Exit, typer.BadParameter, MCPToolError)):
            raise inner from None
        if isinstance(inner, MCPConnectError):
            typer.secho(f"MCP session failed: {inner}", fg="red", err=True)
        else:
            typer.secho(
                f"MCP session failed: {type(inner).__name__}: {inner}",
                fg="red",
                err=True,
            )
        if not os.environ.get(token_env):
            typer.secho(f"(${token_env} is not set.)", fg="yellow", err=True)
        raise typer.Exit(2) from error


def _dumps(value: Any, compact: bool = False) -> str:
    if compact:
        return json.dumps(value, ensure_ascii=False, default=str, separators=(",", ":"))
    return json.dumps(value, indent=2, ensure_ascii=False, default=str)


def _echo_json(value: Any, compact: bool = False) -> None:
    typer.echo(_dumps(value, compact))


def _emit(value: Any, output: OutputFormat, compact: bool) -> None:
    """The result on stdout: JSON, or with `text` a string as it is."""
    if output is OutputFormat.text:
        items = value if isinstance(value, list) else [value]
        if all(isinstance(item, str) for item in items):
            typer.echo("\n".join(items))
            return
        if isinstance(value, str):
            typer.echo(value)
            return
    _echo_json(value, compact)


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
    company: CompanyOption = None,
    token_env: TokenEnvOption = DEFAULT_TOKEN_ENV,
    header: HeaderOption = None,
    output_json: JsonOption = False,
    verbose: VerboseOption = False,
) -> None:
    """List the gateway's toolsets; `*` marks those the session would have."""
    if verbose:
        configure_logging(True)
    options = _session_options(url, toolset, only, param, token_env, header, company)
    for key in ("retries", "retry_wait", "on_retry"):
        options.pop(key)
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
    company: CompanyOption = None,
    token_env: TokenEnvOption = DEFAULT_TOKEN_ENV,
    header: HeaderOption = None,
    retries: RetriesOption = DEFAULT_RETRIES,
    retry_wait: RetryWaitOption = DEFAULT_RETRY_WAIT,
    output_json: JsonOption = False,
    schema: Annotated[
        Optional[str],
        typer.Option("--schema", "-s", help="Show this tool's input schema instead."),
    ] = None,
    verbose: VerboseOption = False,
) -> None:
    """List a session's tools, each with the first line of its description."""
    if verbose:
        configure_logging(True)
    options = _session_options(
        url, toolset, only, param, token_env, header, company, retries, retry_wait
    )
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
    company: CompanyOption = None,
    token_env: TokenEnvOption = DEFAULT_TOKEN_ENV,
    header: HeaderOption = None,
    retries: RetriesOption = DEFAULT_RETRIES,
    retry_wait: RetryWaitOption = DEFAULT_RETRY_WAIT,
    output_json: JsonOption = False,
    verbose: VerboseOption = False,
) -> None:
    """Show one tool's description and input schema."""
    if verbose:
        configure_logging(True)
    _describe(
        name,
        _session_options(
            url, toolset, only, param, token_env, header, company, retries, retry_wait
        ),
        output_json,
    )


#: Where a tool's base64 payload is looked for by `call --save`, in order.
SAVE_FIELDS = ("xml_base64", "raw.content", "content", "datas", "data", "resource.blob")


def _locate(value: Any, dotted: str) -> tuple[Optional[dict[str, Any]], str]:
    """The dict holding `dotted`'s last key in `value`, and that key."""
    *parents, key = dotted.split(".")
    holder = value
    for part in parents:
        holder = holder.get(part) if isinstance(holder, dict) else None
    return (holder if isinstance(holder, dict) else None), key


def save_base64(values: list[Any], path: Path, field: Optional[str] = None) -> str:
    """
    Decode a result's base64 field to `path`, replacing it with a note.

    Parameters
    ----------
    values : list[Any]
        The decoded result (changed in place).
    path : Path
        The file written.
    field : str, optional
        The dotted field (``raw.content``); else the first of `SAVE_FIELDS`
        holding valid base64.

    Returns
    -------
    str
        The field that was saved.

    Raises
    ------
    ValueError
        When no such field holds base64.
    """
    candidates = [field] if field else list(SAVE_FIELDS)
    for value in values:
        for dotted in candidates:
            holder, key = _locate(value, dotted)
            encoded = holder.get(key) if holder is not None else None
            if not isinstance(encoded, str) or not encoded.strip():
                continue
            try:
                data = base64.b64decode("".join(encoded.split()), validate=True)
            except (binascii.Error, ValueError):
                if field:
                    raise ValueError(f"{field} is not base64.") from None
                continue
            path.write_bytes(data)
            assert holder is not None
            holder[key] = f"<{len(data)} bytes saved to {path}>"
            return dotted
    if field:
        raise ValueError(f"No field {field} in the result.")
    raise ValueError(
        f"No base64 field ({', '.join(SAVE_FIELDS)}) in the result; "
        "name it with --save-field."
    )


@app.command("call")
def call_command(
    tool: Annotated[str, typer.Argument(help="Tool name.")],
    args: Annotated[
        Optional[str],
        typer.Option(
            "--args",
            help="Arguments as a JSON object, or @file.json holding one (sent as is).",
        ),
    ] = None,
    arg: Annotated[
        Optional[list[str]],
        typer.Option(
            "--arg",
            "-a",
            help=(
                "One argument KEY=VALUE (repeatable), typed by the tool's input "
                "schema: a string property keeps the text, others decode JSON."
            ),
        ),
    ] = None,
    raw: Annotated[
        bool, typer.Option("--raw", help="Print the whole CallToolResult.")
    ] = False,
    save: Annotated[
        Optional[Path],
        typer.Option(
            "--save",
            help=(
                "Decode the result's base64 field (xml_base64, raw.content, "
                "content, ...) to this file and print the rest."
            ),
            dir_okay=False,
        ),
    ] = None,
    save_field: Annotated[
        Optional[str],
        typer.Option("--save-field", help="The dotted field --save decodes (a.b.c)."),
    ] = None,
    output: OutputOption = OutputFormat.json,
    compact: CompactOption = False,
    url: UrlOption = None,
    toolset: ToolsetOption = None,
    only: OnlyOption = False,
    param: ParamOption = None,
    company: CompanyOption = None,
    token_env: TokenEnvOption = DEFAULT_TOKEN_ENV,
    header: HeaderOption = None,
    retries: RetriesOption = DEFAULT_RETRIES,
    retry_wait: RetryWaitOption = DEFAULT_RETRY_WAIT,
    verbose: VerboseOption = False,
) -> None:
    """Call a tool and print its result; exit 1 when the tool errs, 2 when no session.

    A result of one content is printed alone, several as a JSON list. The call
    itself is never retried: only opening the session is.
    """
    if verbose:
        configure_logging(True)
    if save_field and not save:
        raise typer.BadParameter("--save-field needs --save PATH.")
    parse_arguments(args, arg)  # refuse bad --args / -a before connecting
    options = _session_options(
        url, toolset, only, param, token_env, header, company, retries, retry_wait
    )

    async def go() -> Any:
        from mcp.shared.exceptions import MCPError  # noqa: PLC0415

        async with connect(**options) as client:
            schema = None
            if arg:  # -a texts are typed by the tool's schema, listed once
                try:
                    schema = (await client.describe(tool)).input_schema
                except KeyError:
                    schema = None  # the server's "unknown tool" says it best
            arguments = parse_arguments(args, arg, schema)
            try:
                return await client.call_raw(tool, **arguments)
            except MCPError as error:
                raise MCPToolError(tool, error.message) from error

    try:
        result = _run(go(), token_env)
    except MCPToolError as error:
        typer.secho(f"{tool} failed: {error.text}", fg="red", err=True)
        raise typer.Exit(1) from None
    if raw:
        _echo_json(
            result.model_dump(by_alias=True, exclude_none=True, mode="json"), compact
        )
        if result.is_error:
            raise typer.Exit(1)
        return
    if result.is_error:
        typer.secho(f"{tool} failed: {result_text(result)}", fg="red", err=True)
        raise typer.Exit(1)
    values = decode_result(result)
    if save:
        try:
            saved = save_base64(values, save, save_field)
        except ValueError as error:
            _emit(values[0] if len(values) == 1 else values, output, compact)
            typer.secho(str(error), fg="red", err=True)
            raise typer.Exit(1) from None
        typer.secho(f"Saved {saved} to {save}.", dim=True, err=True)
    _emit(values[0] if len(values) == 1 else values, output, compact)


def load_main(path: Path) -> Any:
    """The `async def main(client)` (or `main(client, argv)`) a script file defines."""
    namespace: dict[str, Any] = {"__name__": "__mcp_run__", "__file__": str(path)}
    exec(compile(path.read_text(), str(path), "exec"), namespace)  # noqa: S102  # nosec B102 - the script the person names, run as `python` would
    main = namespace.get("main")
    if main is None or not inspect.iscoroutinefunction(main):
        raise typer.BadParameter(f"{path} must define `async def main(client)`.")
    return main


def takes_argv(main: Any) -> bool:
    """Whether `main` accepts a second positional parameter (the script's argv)."""
    positional = (
        inspect.Parameter.POSITIONAL_ONLY,
        inspect.Parameter.POSITIONAL_OR_KEYWORD,
    )
    parameters = inspect.signature(main).parameters.values()
    return sum(parameter.kind in positional for parameter in parameters) >= 2 or any(
        parameter.kind == inspect.Parameter.VAR_POSITIONAL for parameter in parameters
    )


@app.command("run")
def run_command(
    script: Annotated[
        Path,
        typer.Argument(
            help="Python file defining `async def main(client)` or `main(client, argv)`.",
            exists=True,
            dir_okay=False,
            readable=True,
        ),
    ],
    argv: Annotated[
        Optional[list[str]],
        typer.Argument(
            help="The script's own arguments, after `--` (main(client, argv)).",
        ),
    ] = None,
    output: OutputOption = OutputFormat.json,
    compact: CompactOption = False,
    url: UrlOption = None,
    toolset: ToolsetOption = None,
    only: OnlyOption = False,
    param: ParamOption = None,
    company: CompanyOption = None,
    token_env: TokenEnvOption = DEFAULT_TOKEN_ENV,
    header: HeaderOption = None,
    retries: RetriesOption = DEFAULT_RETRIES,
    retry_wait: RetryWaitOption = DEFAULT_RETRY_WAIT,
    verbose: VerboseOption = False,
) -> None:
    """Run a script's `async def main(client)` on one session.

    `client` is a HostedMCPClient: `await client.call(tool, **args)` returns
    the decoded results (a list) and raises MCPToolError when the tool errs
    (`coerce=True` types the arguments by the tool's schema); `call_raw`,
    `list_tools` and `describe` are there too. Arguments after `--` go to
    `main(client, argv)` as a list of strings (a dry run unless
    `"--apply" in argv`, say). What `main` returns, when not None, is printed.
    """
    if verbose:
        configure_logging(True)
    main = load_main(script)
    script_argv = list(argv or [])
    with_argv = takes_argv(main)
    if script_argv and not with_argv:
        raise typer.BadParameter(
            f"{script} defines main(client): arguments after `--` need "
            "`async def main(client, argv)`."
        )
    options = _session_options(
        url, toolset, only, param, token_env, header, company, retries, retry_wait
    )

    async def go() -> Any:
        async with connect(**options) as client:
            if with_argv:
                return await main(client, script_argv)
            return await main(client)

    try:
        value = _run(go(), token_env)
    except MCPToolError as error:
        typer.secho(f"{error.tool} failed: {error.text}", fg="red", err=True)
        raise typer.Exit(1) from None
    if value is not None:
        _emit(value, output, compact)


def _failing_checks(body: Any) -> list[str]:
    """The failing entries a health body lists (`dependencies` or `checks`)."""
    if not isinstance(body, dict):
        return []
    lines: list[str] = []
    for key in ("dependencies", "checks"):
        entries = body.get(key)
        if isinstance(entries, dict):
            entries = [
                {"name": name, **(v if isinstance(v, dict) else {"ok": v})}
                for name, v in entries.items()
            ]
        for entry in entries if isinstance(entries, list) else []:
            if not isinstance(entry, dict):
                continue
            healthy = next(
                (entry[flag] for flag in ("ready", "healthy", "ok") if flag in entry),
                True,
            )
            if healthy:
                continue
            name = entry.get("name") or entry.get("job") or "?"
            required = " (required)" if entry.get("required") else ""
            detail = entry.get("detail") or entry.get("lastError") or ""
            lines.append(f"{name}{required}: {detail}".rstrip(": "))
    return lines


@app.command("health")
def health_command(
    url: UrlOption = None,
    header: HeaderOption = None,
    output_json: JsonOption = False,
    verbose: VerboseOption = False,
) -> None:
    """GET the gateway's /api/mcp/readyz and /api/mcp/healthz, beside its /mcp.

    Exit 0 when both answer 2xx, 1 when one does not, 2 when one cannot be
    reached.
    """
    if verbose:
        configure_logging(True)
    answers = asyncio.run(gateway_health(url, headers=_pairs(header, "--header")))
    if output_json:
        _echo_json(answers)
    else:
        for answer in answers:
            status = answer.get("status")
            body = answer.get("body")
            if status is None:
                typer.echo(
                    f"{answer['name']:<8} --   {answer['url']}  {answer['error']}"
                )
                continue
            word = body.get("status", "") if isinstance(body, dict) else ""
            typer.echo(
                f"{answer['name']:<8} {status}  {answer['url']}  {word}".rstrip()
            )
            for line in _failing_checks(body):
                typer.echo(f"  failing: {line}")
            if status >= 400 and not isinstance(body, dict) and body:
                typer.echo(f"  {str(body)[:300]}")
    if any(answer.get("status") is None for answer in answers):
        raise typer.Exit(2)
    if any(answer["status"] >= 300 for answer in answers):
        raise typer.Exit(1)


__all__ = [
    "HostedMCPClient",
    "app",
    "configure_logging",
    "load_main",
    "parse_arguments",
    "save_base64",
    "takes_argv",
]
