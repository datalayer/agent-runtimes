# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop agentcore deploy|status|invoke|sessions|destroy <agentspec>` (AC-11).

An agentspec on your own Amazon Bedrock AgentCore, with your own AWS
credentials (as boto3 finds them: the environment, a profile, a role), no
Datalayer account: the shape of the AgentCore starter toolkit's
``launch → status → invoke → destroy``, through the ``agentcore`` runtime
target (:mod:`agent_runtimes.agentcore.target`).

What was deployed, and the sessions invoked on it, are kept in
``~/.datalayer/agentcore.json`` (``LOOP_AGENTCORE_STATE`` to move it): one
deployment per agentspec, until it is destroyed. AgentCore lists no runtime
sessions of its own; ``sessions`` lists those this file kept, and stops one.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import typer
from rich.console import Console

from agent_runtimes.agentcore.target import (
    AgentCoreDeploySettings,
    AgentCoreTarget,
    JwtAuthorizer,
)
from agent_runtimes.apps.sessions import new_session_uid
from agent_runtimes.plugins.points import Deployment

app = typer.Typer(
    name="agentcore",
    help="Deploy an agentspec to your own Amazon Bedrock AgentCore, and run it there.",
    no_args_is_help=True,
    pretty_exceptions_show_locals=False,
)
console = Console(soft_wrap=True)

#: Where the deployments and their sessions are kept.
STATE_ENV = "LOOP_AGENTCORE_STATE"


def state_path() -> Path:
    return Path(
        os.environ.get(STATE_ENV) or Path.home() / ".datalayer" / "agentcore.json"
    )


def _read_state() -> Dict[str, Any]:
    path = state_path()
    if not path.exists():
        return {"deployments": {}}
    return json.loads(path.read_text())


def _write_state(state: Dict[str, Any]) -> None:
    path = state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n")


def _target() -> AgentCoreTarget:
    """The target the commands call (a test gives one with stubbed clients)."""
    return AgentCoreTarget()


def _fail(sentence: str) -> None:
    console.print(sentence, markup=False)
    raise typer.Exit(1)


def _pairs(values: List[str], what: str) -> Dict[str, str]:
    pairs: Dict[str, str] = {}
    for value in values:
        name, sep, said = value.partition("=")
        if not sep or not name:
            _fail(f"{value!r} is not {what}: NAME=VALUE.")
        pairs[name] = said
    return pairs


def _deployment(state: Dict[str, Any], agentspec: str) -> Deployment:
    held = state["deployments"].get(agentspec)
    if held is None:
        _fail(
            f"{agentspec} is not deployed to AgentCore from here: `loop agentcore deploy {agentspec}`."
        )
    return Deployment.from_dict(held["deployment"])


def _run(coroutine: Any) -> Any:
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        return asyncio.run(coroutine)
    except (ClientError, BotoCoreError, ValueError) as error:
        _fail(f"AgentCore refused: {error}")


@app.command("deploy")
def deploy(
    agentspec: str = typer.Argument(..., help="The agentspec's id."),
    image: str = typer.Option(
        ..., "--image", help="The agent-runtimes image URI in ECR."
    ),
    role_arn: str = typer.Option(..., "--role-arn", help="The execution role's ARN."),
    region: str = typer.Option(
        ..., "--region", envvar="AWS_REGION", help="The AWS region."
    ),
    name: str = typer.Option("", "--name", help="The agent runtime's name."),
    description: str = typer.Option("", "--description"),
    discovery_url: str = typer.Option(
        "",
        "--discovery-url",
        help="An OIDC issuer's discovery URL: a JWT authorizer trusts it.",
    ),
    audience: List[str] = typer.Option(
        [], "--audience", help="An accepted aud (repeatable)."
    ),
    client: List[str] = typer.Option(
        [], "--client", help="An accepted client_id (repeatable)."
    ),
    claim: List[str] = typer.Option(
        [], "--claim", help="A claim that must equal a value, NAME=VALUE (repeatable)."
    ),
    env: List[str] = typer.Option(
        [], "--env", help="An environment variable, NAME=VALUE."
    ),
) -> None:
    """Make the agentspec an AgentCore agent runtime."""
    from agent_runtimes.specs.agents import get_agent_spec

    if get_agent_spec(agentspec) is None:
        _fail(
            f"{agentspec} is not an agentspec of the catalogue: `loop list-specs` lists them."
        )
    state = _read_state()
    if agentspec in state["deployments"]:
        _fail(
            f"{agentspec} is already deployed ({state['deployments'][agentspec]['deployment']['arn']}): "
            f"`loop agentcore destroy {agentspec}` first."
        )
    authorizer: Optional[JwtAuthorizer] = None
    if discovery_url:
        authorizer = JwtAuthorizer(
            discovery_url=discovery_url,
            allowed_audience=tuple(audience),
            allowed_clients=tuple(client),
            custom_claims=_pairs(claim, "a claim"),
        )
    elif audience or client or claim:
        _fail(
            "--audience, --client and --claim configure a JWT authorizer: give its --discovery-url."
        )
    settings = AgentCoreDeploySettings(
        image_uri=image,
        role_arn=role_arn,
        region=region,
        name=name,
        description=description,
        authorizer=authorizer,
        environment=_pairs(env, "an environment variable"),
    )
    deployment = _run(_target().deploy(agentspec, settings))
    state["deployments"][agentspec] = {
        "deployment": deployment.as_dict(),
        "sessions": [],
    }
    _write_state(state)
    console.print(
        f"{agentspec} deployed as {deployment.arn} ({deployment.status}).", markup=False
    )


@app.command("status")
def status(agentspec: str = typer.Argument(..., help="The agentspec's id.")) -> None:
    """The agent runtime as AgentCore says it now."""
    state = _read_state()
    deployment = _deployment(state, agentspec)
    said = _run(_target().status(deployment))
    state["deployments"][agentspec]["deployment"] = deployment.as_dict()
    _write_state(state)
    console.print(
        f"{agentspec}: {said['status']} — {said['arn']} (version {said['version']})",
        markup=False,
    )
    if said["failure_reason"]:
        console.print(f"  {said['failure_reason']}", markup=False)


@app.command("invoke")
def invoke(
    agentspec: str = typer.Argument(..., help="The agentspec's id."),
    prompt: str = typer.Argument(..., help="What to ask."),
    session: str = typer.Option(
        "", "--session", help="Carry on a session; a new one otherwise."
    ),
    raw: bool = typer.Option(False, "--json", help="Print each AG-UI event as JSON."),
    bearer: str = typer.Option(
        "",
        "--bearer",
        envvar="AGENTCORE_BEARER_TOKEN",
        help="A token the runtime's JWT authorizer accepts; AWS credentials (SigV4) otherwise.",
    ),
) -> None:
    """Run a turn of a session on the deployment."""
    state = _read_state()
    deployment = _deployment(state, agentspec)
    # A ULID, as every session the platform opens (padded for AgentCore's
    # runtimeSessionId where it is sent).
    session_uid = session or new_session_uid()
    # A prompt, not an AG-UI run carrying one message: the runtime keeps the
    # session's earlier turns and puts them before it, where an AG-UI run
    # brings its whole conversation itself.
    run_input = {"prompt": prompt, "session_id": session_uid}
    errors: List[str] = []

    async def stream() -> None:
        async for event in _target().invoke(
            deployment, session_uid, run_input, bearer=bearer
        ):
            if raw:
                console.print(json.dumps(event), markup=False)
            elif event.get("type") == "TEXT_MESSAGE_CONTENT":
                console.print(event.get("delta", ""), end="", markup=False)
            if event.get("type") == "RUN_ERROR":
                errors.append(str(event.get("message") or "the run failed"))

    sessions = state["deployments"][agentspec]["sessions"]
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    held = next((s for s in sessions if s["uid"] == session_uid), None)
    if held is None:
        sessions.append({"uid": session_uid, "started_at": now, "last_at": now})
    else:
        held["last_at"] = now
    _write_state(state)
    _run(stream())
    if not raw:
        console.print("", markup=False)
    console.print(f"Session {session_uid}.", markup=False)
    if errors:
        _fail(errors[0])


@app.command("sessions")
def sessions(
    agentspec: str = typer.Argument(..., help="The agentspec's id."),
    stop: str = typer.Option("", "--stop", help="Stop this session's microVM."),
) -> None:
    """The sessions invoked from here on the deployment; stop one."""
    state = _read_state()
    deployment = _deployment(state, agentspec)
    held = state["deployments"][agentspec]["sessions"]
    if stop:
        if not any(s["uid"] == stop for s in held):
            _fail(f"{stop} is not a session invoked on {agentspec} from here.")
        _run(_target().stop(deployment, stop))
        console.print(f"Session {stop} stopped.", markup=False)
        return
    if not held:
        console.print(f"No session was invoked on {agentspec} from here.", markup=False)
    for session in held:
        console.print(
            f"{session['uid']}  started {session['started_at']}  last {session['last_at']}",
            markup=False,
        )


@app.command("destroy")
def destroy(agentspec: str = typer.Argument(..., help="The agentspec's id.")) -> None:
    """Remove the agent runtime from AgentCore."""
    state = _read_state()
    deployment = _deployment(state, agentspec)
    _run(_target().destroy(deployment))
    del state["deployments"][agentspec]
    _write_state(state)
    console.print(f"{agentspec}: {deployment.arn} {deployment.status}.", markup=False)


__all__ = ["app", "state_path"]
