# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`agent-runtimes kagent launch-runtime|end-runtime`: the kagent bridge's Datalayer runtime.

What the kagent bridge runs, in its Datalayer mode, to obtain a Datalayer
runtime for its Agent and to end it (:mod:`agent_runtimes.kagent.datalayer`):
the bridge's own environment cannot import the Datalayer client. Each command
reads ``DATALAYER_API_KEY``, ``DATALAYER_RUN_URL`` (and, to launch,
``DATALAYER_RUNTIME_ENVIRONMENT``, ``AGENT_SPEC_ID``,
``DATALAYER_RUNTIME_MINUTES``) and prints one line of JSON on stdout; a
refusal or a failure is a sentence on stderr and exit code 1.
"""

from __future__ import annotations

import json
import os
import sys

import typer

app = typer.Typer(
    name="kagent",
    help="The kagent bridge's Datalayer runtime: launch it for an Agent, end it.",
    no_args_is_help=True,
    pretty_exceptions_show_locals=False,
)


def _fail(error: BaseException) -> None:
    typer.echo(f"{type(error).__name__}: {error}", err=True)
    raise typer.Exit(1)


@app.command(name="launch-runtime")
def launch_runtime_command(
    agent: str = typer.Option(
        ..., "--agent", help="The kagent Agent, as <namespace>/<agent>."
    ),
) -> None:
    """Launch a runtime for a kagent Agent and print its uid, A2A endpoint and expiry."""
    from agent_runtimes.kagent.datalayer import launch_runtime, runtime_request

    try:
        launched = launch_runtime(runtime_request(agent))
    except Exception as error:  # noqa: BLE001 - said in a sentence, exit 1
        _fail(error)
    sys.stdout.write(json.dumps(launched) + "\n")


@app.command(name="end-runtime")
def end_runtime_command(
    uid: str = typer.Argument(..., help="The runtime's uid."),
) -> None:
    """End a runtime launched for a kagent Agent, closing its reservation."""
    from agent_runtimes.kagent.datalayer import (
        API_KEY_VARIABLE,
        RUN_URL_VARIABLE,
        DatalayerModeError,
        end_runtime,
    )

    run_url = (os.environ.get(RUN_URL_VARIABLE) or "").strip()
    api_key = (os.environ.get(API_KEY_VARIABLE) or "").strip()
    try:
        if not run_url or not api_key:
            raise DatalayerModeError(
                f"Ending a runtime needs {RUN_URL_VARIABLE} and {API_KEY_VARIABLE}."
            )
        ended = end_runtime(uid, run_url, api_key)
    except Exception as error:  # noqa: BLE001 - said in a sentence, exit 1
        _fail(error)
    sys.stdout.write(json.dumps({"uid": uid, "ended": ended}) + "\n")
