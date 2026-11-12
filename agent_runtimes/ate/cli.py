# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``agent-runtimes-ate``: the Agent Substrate manifests of an agent-runtimes actor.

    agent-runtimes-ate template --atespace agents --name crawler \\
        --image ghcr.io/me/agent-runtimes@sha256:<digest> --agent-spec-id crawler \\
        | kubectl ate create actor-template -f -

    agent-runtimes-ate egress-policy --host ai.example.com \\
        --credential ate-secret://k8s.io/default/agents/inference/key \\
        | kubectl ate create egress-policy my-actor -a agents -f -
"""

from __future__ import annotations

import json
from typing import Any, List, Optional

import typer

from .template import (
    EgressRule,
    TemplateRequest,
    actor_template,
    egress_policy,
    parse_pairs,
)

app = typer.Typer(
    help="The Agent Substrate manifests of an agent-runtimes actor.",
    no_args_is_help=True,
    add_completion=False,
)


def _emit(body: dict[str, Any], output: str) -> None:
    if output == "json":
        typer.echo(json.dumps(body, indent=2))
        return
    if output != "yaml":
        raise typer.BadParameter(f"--output is json or yaml, not {output!r}.")
    try:
        import yaml
    except ImportError:
        raise typer.BadParameter(
            "--output yaml needs PyYAML; use --output json."
        ) from None
    typer.echo(yaml.safe_dump(body, sort_keys=False), nl=False)


@app.command()
def template(
    atespace: str = typer.Option(
        ..., help="The atespace of the template (must exist)."
    ),
    name: str = typer.Option(..., help="The template's name."),
    image: str = typer.Option(
        ..., help="The agent-runtimes image, by digest (name@sha256:...)."
    ),
    agent_spec_id: str = typer.Option(
        "", help="The agentspec served as 'default' (AGENT_SPEC_ID)."
    ),
    cpu_millicores: int = typer.Option(1000, help="Each actor's CPU, in millicores."),
    memory_bytes: int = typer.Option(
        2 * 1024**3, help="Each actor's memory, in bytes."
    ),
    worker_label: Optional[List[str]] = typer.Option(
        None, help="A WorkerPool label the template selects, NAME=value (repeatable)."
    ),
    env: Optional[List[str]] = typer.Option(
        None,
        help="A literal environment variable, NAME=value (repeatable); never a credential.",
    ),
    port: int = typer.Option(80, help="The port the actor serves on."),
    output: str = typer.Option("json", "--output", "-o", help="json or yaml."),
) -> None:
    """Print the ActorTemplate of an agent-runtimes actor."""
    try:
        body = actor_template(
            TemplateRequest(
                atespace=atespace,
                name=name,
                image=image,
                agent_spec_id=agent_spec_id,
                cpu_millicores=cpu_millicores,
                memory_bytes=memory_bytes,
                worker_labels=parse_pairs(worker_label, "worker label"),
                env=parse_pairs(env, "variable"),
                port=port,
            )
        )
    except ValueError as refused:
        raise typer.BadParameter(str(refused)) from None
    _emit(body, output)


@app.command("egress-policy")
def egress_policy_command(
    host: List[str] = typer.Option(
        ..., help="An HTTPS hostname the actor may reach (repeatable)."
    ),
    credential: str = typer.Option(
        "", help="ate-secret://<provider>/<path>: what the gateway puts in the header."
    ),
    header: str = typer.Option(
        "Authorization", help="The header the credential replaces."
    ),
    prefix: str = typer.Option("Bearer ", help="Put before the credential."),
    output: str = typer.Option("json", "--output", "-o", help="json or yaml."),
) -> None:
    """Print the EgressPolicy of an agent-runtimes actor: one HTTPS rule."""
    try:
        body = egress_policy(
            [
                EgressRule(
                    hostnames=host,
                    credential_uri=credential,
                    header=header,
                    prefix=prefix,
                )
            ]
        )
    except ValueError as refused:
        raise typer.BadParameter(str(refused)) from None
    _emit(body, output)


def main() -> None:
    """The ``agent-runtimes-ate`` command."""
    app()


__all__ = ["app", "main"]
