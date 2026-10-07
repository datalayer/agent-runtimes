# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Where ``loop`` runs its agent: on this machine, or on Datalayer (LOOP L-01 to L-06).

Launching ``loop`` asks one question more than it used to — *where?* — and,
for Datalayer, the few a cloud runtime needs: the environment, how long to
reserve it for and what that costs at most. When the conversation ends it
asks whether to stop the runtime, which is billed until its reservation ends.

A cloud runtime is reached through a **relay** on this machine: a local
address that forwards every request to the runtime's ingress with the
person's token. The terminal UI and its slash commands then talk to the
relay exactly as they talk to a local server — nothing in them knows, or
needs to know, where the agent runs.

Nothing here asks a question when standard input is not a terminal, or when
the flags answer it: ``--local``, ``--cloud``, ``--environment``,
``--minutes``, ``--keep``.
"""

from __future__ import annotations

import contextlib
import json
import socket
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Optional

from agent_runtimes.runtimes.client import unmetered_launch

LOCAL = "local"
CLOUD = "cloud"

#: The agent a cloud runtime configured from an agentspec serves.
CLOUD_AGENT_NAME = "default"

#: What a cloud runtime is reserved for unless said.
DEFAULT_MINUTES = 30

#: The longest reservation offered from the terminal.
MAX_MINUTES = 480

#: The environment an agent runs in on Datalayer unless another is chosen.
DEFAULT_ENVIRONMENT = "ai-agents-env"

#: The agentspec a new cloud runtime is launched with unless ``-a`` names
#: another: the launch path configures an agent only from an agentspec (the
#: companion's ``run-start-hooks``), and this is the one ``loop`` starts with.
DEFAULT_CLOUD_AGENTSPEC = "example-simple"

#: Where the last answer to *where?* is kept, to offer it first next time.
PREFERENCES = Path.home() / ".datalayer" / "loop.json"


def interactive() -> bool:
    """Whether a person is at the terminal to answer."""
    try:
        return sys.stdin.isatty() and sys.stdout.isatty()
    except (AttributeError, ValueError):
        return False


def _read_preferences(path: Path = PREFERENCES) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def _write_preferences(updates: dict[str, Any], path: Path = PREFERENCES) -> None:
    try:
        data = {**_read_preferences(path), **updates}
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2))
    except OSError:
        pass  # A preference that cannot be kept is asked again next time.


def choose_where(
    *,
    local: bool = False,
    cloud: bool = False,
    ask: Optional[Callable[..., Optional[str]]] = None,
    can_ask: Optional[bool] = None,
    preferences: Path = PREFERENCES,
    cloud_offered: bool = True,
) -> str:
    """Where the agent runs: what the flags say, else what the person answers.

    Without a person to ask, on this machine — a script never starts
    something billed by surprise. Nor is Datalayer offered to somebody who
    is not signed in (``cloud_offered``): there is then nothing to ask.
    """
    if local and cloud:
        raise ValueError("Use only one of --local or --cloud.")
    if local:
        return LOCAL
    if cloud:
        return CLOUD
    if not cloud_offered:
        return LOCAL
    if not (interactive() if can_ask is None else can_ask):
        return LOCAL
    last = _read_preferences(preferences).get("where")
    default = last if last in (LOCAL, CLOUD) else LOCAL
    answer = (ask or _select)(
        "Where should the agent run?",
        [
            ("On this machine — a local server, with your own model keys", LOCAL),
            (
                "On Datalayer — a cloud runtime with Datalayer's models, billed by the minute",
                CLOUD,
            ),
        ],
        default,
    )
    if answer is None:
        raise KeyboardInterrupt
    _write_preferences({"where": answer}, preferences)
    return answer


def _select(question: str, choices: list[tuple], default: str) -> Optional[str]:
    """Ask for one of ``choices``: ``(title, value)``, or ``(title, value, why_not)``.

    A choice with a reason why not is shown, greyed with that reason, and
    cannot be picked.
    """
    import questionary

    return questionary.select(
        question,
        choices=[
            questionary.Choice(
                title=choice[0],
                value=choice[1],
                disabled=choice[2] if len(choice) > 2 and choice[2] else None,
            )
            for choice in choices
        ],
        default=default,
    ).ask()


def _text(question: str, default: str, validate: Callable[[str], Any]) -> Optional[str]:
    import questionary

    return questionary.text(question, default=default, validate=validate).ask()


def _confirm(question: str, default: bool) -> Optional[bool]:
    import questionary

    return questionary.confirm(question, default=default).ask()


def minutes_problem(text: str) -> Optional[str]:
    """Why an answer is not a number of minutes, or None."""
    try:
        minutes = int(str(text).strip())
    except ValueError:
        return "A whole number of minutes, please."
    if minutes < 1 or minutes > MAX_MINUTES:
        return f"Between 1 and {MAX_MINUTES} minutes."
    return None


# --- the relay ---------------------------------------------------------------------


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


#: What the relay answers, with a 502, when the cloud runtime does not.
RUNTIME_SILENT = "The cloud runtime does not answer"

#: Headers a relay does not pass on: the hop's own, and what it sets itself.
_HOP_HEADERS = frozenset(
    {
        "host",
        "connection",
        "keep-alive",
        "transfer-encoding",
        "te",
        "trailer",
        "upgrade",
        "proxy-authorization",
        "proxy-authenticate",
        "content-length",
        "authorization",
    }
)


def relay_app(target: str, token: str) -> Any:
    """An application that forwards every request to ``target``, as the person."""
    import httpx
    from starlette.applications import Starlette
    from starlette.background import BackgroundTask
    from starlette.requests import Request
    from starlette.responses import JSONResponse, StreamingResponse
    from starlette.routing import Route

    base = target.rstrip("/")
    client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=None))

    async def forward(request: Request) -> Any:
        url = f"{base}/{request.path_params.get('path', '')}"
        if request.url.query:
            url = f"{url}?{request.url.query}"
        headers = {
            k: v for k, v in request.headers.items() if k.lower() not in _HOP_HEADERS
        }
        headers["authorization"] = f"Bearer {token}"
        try:
            upstream = await client.send(
                client.build_request(
                    request.method, url, headers=headers, content=await request.body()
                ),
                stream=True,
            )
        except httpx.HTTPError as error:
            # Said once, here, for every slash command: the session is on
            # Datalayer and nothing falls back to this machine.
            return JSONResponse(
                {"detail": f"{RUNTIME_SILENT} ({type(error).__name__})."},
                status_code=502,
            )
        return StreamingResponse(
            upstream.aiter_raw(),
            status_code=upstream.status_code,
            headers={
                k: v
                for k, v in upstream.headers.items()
                if k.lower() not in _HOP_HEADERS | {"content-encoding"}
            },
            background=BackgroundTask(upstream.aclose),
        )

    methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]

    @contextlib.asynccontextmanager
    async def lifespan(app: Any) -> AsyncIterator[None]:
        yield
        await client.aclose()

    return Starlette(
        routes=[Route("/{path:path}", forward, methods=methods)], lifespan=lifespan
    )


@dataclass
class Relay:
    """A relay running on this machine, in a thread of this process."""

    target: str
    token: str
    port: int = 0
    _server: Any = field(default=None, repr=False)
    _thread: Optional[threading.Thread] = field(default=None, repr=False)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self, timeout: float = 10.0) -> "Relay":
        import uvicorn

        self.port = self.port or _free_port()
        config = uvicorn.Config(
            relay_app(self.target, self.token),
            host="127.0.0.1",
            port=self.port,
            log_level="error",
        )
        self._server = uvicorn.Server(config)
        self._thread = threading.Thread(
            target=self._server.run, name="loop-relay", daemon=True
        )
        self._thread.start()
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline and not self._server.started:
            time.sleep(0.05)
        if not self._server.started:
            raise RuntimeError("The relay to the cloud runtime did not start.")
        return self

    def stop(self) -> None:
        if self._server is not None:
            self._server.should_exit = True
        if self._thread is not None:
            self._thread.join(timeout=5.0)


# --- the cloud runtime ----------------------------------------------------------


class NotSignedIn(Exception):
    """No Datalayer credentials: nothing can be launched there."""


class CloudRefused(Exception):
    """Datalayer will not run this agent: the message is the sentence to say.

    No credits, a reservation the credits cannot cover, a launch the platform
    refused, an environment that cannot hold an agent, a runtime that is not
    running, an agentspec the runtime does not have.
    """


@dataclass
class CloudLaunch:
    """A cloud runtime launched for this session, and the relay that reaches it."""

    runtime_name: str
    environment: str
    minutes: int
    ingress: str
    relay: Relay
    client: Any = field(repr=False)
    #: The runtime's own Jupyter server token: the one the Datalayer UI opens
    #: the runtime's notebooks with.
    jupyter_token: str = field(repr=False)
    credits: float = 0.0
    #: Whether this session went back to a runtime that was already running.
    attached: bool = False
    #: The agentspec the runtime's agent was created from, when known.
    agent_spec_id: Optional[str] = None

    @property
    def server_url(self) -> str:
        return self.relay.url

    @property
    def label(self) -> str:
        """Where the session's agent runs, in words: for `/status` and the banner."""
        return f"{self.runtime_name} on Datalayer ({self.environment})"

    @property
    def port(self) -> int:
        return self.relay.port

    @property
    def agent_url(self) -> str:
        return f"{self.relay.url}/api/v1/ag-ui/{CLOUD_AGENT_NAME}/"

    @property
    def jupyter_url(self) -> str:
        """The runtime's Jupyter server as a browser reaches it, with its token.

        The pod's Jupyter server is served at the runtime's ingress, as the
        Datalayer UI reaches it; the address the runtime reports for its
        sandbox (``127.0.0.1:2300``) is the pod's own. The token is the
        runtime's, valid while it runs — not the person's.
        """
        from urllib.parse import quote

        return f"{self.ingress.rstrip('/')}?token={quote(self.jupyter_token, safe='')}"

    def stop(self) -> bool:
        """Stop the runtime and the relay. Whether the runtime said it stopped."""
        self.relay.stop()
        try:
            return bool(self.client.stop_runtime(self.runtime_name))
        except Exception:  # noqa: BLE001 - said to the person by the caller
            return False


def make_client() -> tuple[Any, str]:
    """A Datalayer client and the token it resolved, or `NotSignedIn`."""
    from agent_runtimes.client.agent_client import AgentClient

    try:
        client = AgentClient()
        token = str(client._get_api_key() or "").strip()
    except ValueError as error:
        raise NotSignedIn(str(error)) from None
    if not token:
        raise NotSignedIn("No Datalayer credentials were found.")
    return client, token


def signed_in() -> bool:
    """Whether Datalayer credentials are on this machine. Nothing is called."""
    try:
        make_client()
    except NotSignedIn:
        return False
    except Exception:  # noqa: BLE001 - a client that cannot be built offers nothing
        return False
    return True


def agent_capable(environment: Any) -> bool:
    """Whether an environment can hold an agent runtime.

    The platform's environments declare their capabilities, and only those
    with ``agent`` can (``ai-agents-env`` today). An environment that declares
    none — a user environment — is not ruled out: it is offered only when
    named (``--environment``).
    """
    capabilities = (getattr(environment, "metadata", None) or {}).get("capabilities")
    if not isinstance(capabilities, list) or not capabilities:
        return False
    return any(
        isinstance(cap, dict)
        and cap.get("name") == "agent"
        and cap.get("enabled", True) is not False
        for cap in capabilities
    )


def declares_capabilities(environment: Any) -> bool:
    """Whether an environment says what it can do."""
    capabilities = (getattr(environment, "metadata", None) or {}).get("capabilities")
    return isinstance(capabilities, list) and bool(capabilities)


def is_agent_runtime(runtime: Any) -> bool:
    """Whether a running runtime is an agent runtime, as against a kernel."""
    return str(getattr(runtime, "environment", "")).endswith("agents-env")


@dataclass
class CloudOffer:
    """What Datalayer offers this person, read from its API before anything is launched."""

    #: Every environment the account sees.
    environments: list[Any]
    #: The person's running runtimes, of every kind.
    running: list[Any]
    #: Credits left, or None when the usage service did not say.
    credits: Optional[float] = None

    @property
    def agent_environments(self) -> list[Any]:
        """The environments that can hold an agent."""
        return [env for env in self.environments if agent_capable(env)]

    @property
    def agent_runtimes(self) -> list[Any]:
        """The running runtimes that are agent runtimes."""
        return [r for r in self.running if is_agent_runtime(r)]


def read_credits(client: Any) -> Optional[float]:
    """The credits left on the account, from IAM's usage, or None."""
    try:
        payload = client._get_usage_credits()
        credits = (payload.get("credits") or {}).get("credits")
        return float(credits) if credits is not None else None
    except Exception:  # noqa: BLE001 - unknown is said as unknown
        return None


def read_offer(client: Any) -> CloudOffer:
    """The environments, the running runtimes and the credits, read-only."""
    try:
        environments = list(client.list_environments())
    except Exception as error:  # noqa: BLE001
        raise CloudRefused(
            f"Datalayer did not list its environments: {error}"
        ) from None
    try:
        running = list(client.list_runtimes())
    except Exception:  # noqa: BLE001 - a listing that fails launches anew
        running = []
    return CloudOffer(environments, running, read_credits(client))


def offer_lines(offer: CloudOffer) -> list[str]:
    """What Datalayer offers, as the lines shown before anything is chosen."""
    lines: list[str] = []
    if offer.credits is None:
        lines.append("Credits: not known (the usage service did not say).")
    else:
        lines.append(f"Credits: {offer.credits:,.2f} left.")
    silent = [env for env in offer.environments if not declares_capabilities(env)]
    if silent:
        lines.append(
            f"{len(silent)} of your environments say nothing about agents and are not "
            "listed: --environment <name> to try one."
        )
    running = offer.agent_runtimes
    if running:
        lines.append("Running agent runtimes:")
        for runtime in running:
            left = minutes_left(getattr(runtime, "expired_at", None))
            remaining = f", {left} min left" if left is not None else ""
            lines.append(
                f"  ● {runtime.runtime_name} — {runtime.environment}{remaining}"
            )
    else:
        lines.append("Running agent runtimes: none.")
    lines.append(
        "Models: the runtime's own, through Datalayer — not this machine's keys; "
        "/models lists them once connected."
    )
    return lines


def check_credits(credits: Optional[float], environment: Any, minutes: int) -> None:
    """Refuse a reservation the credits left cannot cover."""
    if credits is None:
        return
    if credits <= 0:
        raise CloudRefused(
            "No credits left on Datalayer: add credits to the account, or run it on this machine (--local)."
        )
    cost = credits_for(environment, minutes)
    if cost > credits:
        raise CloudRefused(
            f"Reserving {minutes} min of {environment.name} costs at most {cost:.2f} credits "
            f"and {credits:.2f} are left: reserve fewer minutes (--minutes)."
        )


def describe(environment: Any) -> str:
    """An environment's description in one line: its own, without markup, else its title."""
    import html
    import re

    raw = str((getattr(environment, "metadata", None) or {}).get("description") or "")
    text = " ".join(html.unescape(re.sub(r"<[^>]+>", " ", raw)).split())
    text = text or str(getattr(environment, "title", "") or "")
    return text if len(text) <= 50 else text[:47].rstrip() + "..."


#: Why an environment that says what it can do is not offered for an agent.
NO_AGENT = "cannot launch an agent (no agent capability)"


def environment_choices(environments: list[Any]) -> list[tuple[str, str, str]]:
    """The environments as offered: the agent-capable first, the others greyed with why.

    Only environments that declare their capabilities are listed — the
    platform's. One that declares none (a user environment) says nothing
    about agents, so it is left out, and can still be named (``--environment``).
    """
    listed = [env for env in environments if declares_capabilities(env)]
    listed.sort(key=lambda env: (not agent_capable(env), env.name))
    choices = []
    for env in listed:
        per_minute = credits_for(env, 1)
        rate = f"{per_minute:.3f} credits a minute" if per_minute else "not priced"
        about = describe(env)
        title = f"{env.name} — {about}, {rate}" if about else f"{env.name} — {rate}"
        choices.append((title, env.name, "" if agent_capable(env) else NO_AGENT))
    return choices


def choose_environment(
    environments: list[Any],
    *,
    environment: Optional[str] = None,
    can_ask: bool,
    ask: Optional[Callable[..., Optional[str]]] = None,
) -> Any:
    """The environment of a new cloud runtime: the one named, else the person's pick.

    Every environment the SDK lists that says what it can do is shown, with
    its description and what a minute costs; only those that can launch an
    agent can be picked. The default is the first of those
    (``ai-agents-env`` when offered). Without somebody to ask, the default
    is taken only when it is ``ai-agents-env`` or the one that fits: several
    others are refused, to be named. Named with ``--environment``, an
    environment that says it cannot hold an agent is refused; one that says
    nothing is tried.
    """
    by_name = {env.name: env for env in environments}
    supported = [env for env in environments if agent_capable(env)]
    if environment:
        named = by_name.get(environment)
        if named is None:
            raise CloudRefused(
                f"There is no environment named “{environment}” on Datalayer. "
                f"Agent environments: {', '.join(e.name for e in supported) or 'none'}."
            )
        if declares_capabilities(named) and not agent_capable(named):
            raise CloudRefused(
                f"{environment} {NO_AGENT}; agent environments: "
                f"{', '.join(e.name for e in supported) or 'none'}."
            )
        return named
    if not supported:
        raise CloudRefused(
            "No environment that can launch an agent is offered to this account on Datalayer."
        )
    default = by_name.get(DEFAULT_ENVIRONMENT, supported[0])
    if not agent_capable(default):
        default = supported[0]
    if not can_ask:
        if default.name != DEFAULT_ENVIRONMENT and len(supported) > 1:
            raise CloudRefused(
                f"Several environments can launch an agent "
                f"({', '.join(e.name for e in supported)}) and {DEFAULT_ENVIRONMENT} "
                "is not one of them: name one with --environment."
            )
        return default
    answer = (ask or _select)(
        "In which environment? (only those that can launch an agent can be picked)",
        environment_choices(environments),
        default.name,
    )
    if answer is None:
        raise KeyboardInterrupt
    return by_name[answer]


def credits_for(environment: Any, minutes: int) -> float:
    """The most a reservation can cost, in credits."""
    return float(getattr(environment, "burning_rate", 0.0) or 0.0) * 60.0 * minutes


def choose_minutes(
    environment: Any,
    *,
    minutes: Optional[int] = None,
    can_ask: bool,
    ask: Optional[Callable[..., Optional[str]]] = None,
) -> int:
    """For how long to reserve the runtime: the flag, else the person, else the default."""
    if minutes is not None:
        problem = minutes_problem(str(minutes))
        if problem:
            raise ValueError(problem)
        return int(minutes)
    if not can_ask:
        return DEFAULT_MINUTES
    rate = credits_for(environment, 1)
    answer = (ask or _text)(
        f"For how many minutes? ({rate:.2f} credits a minute; stopped when you leave, if you say so)",
        str(DEFAULT_MINUTES),
        lambda text: minutes_problem(text) or True,
    )
    if answer is None:
        raise KeyboardInterrupt
    return int(answer)


def wait_until_ready(relay_url: str, timeout: float = 180.0) -> bool:
    """Whether the runtime answers through the relay before the timeout."""
    import httpx

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            response = httpx.get(f"{relay_url}/health", timeout=5.0)
            if response.status_code == 200:
                return True
        except httpx.HTTPError:
            pass
        time.sleep(2.0)
    return False


def set_up_by_datalayer(spec: Any) -> bool:
    """Whether a runtime's agent record is the one Datalayer set it up with.

    A pooled runtime starts its agent from the image's agentspec before it is
    anybody's (``_create_and_register_cli_agent``, a record with an ``id``).
    Once assigned, Datalayer's start hooks give it the account's secrets and
    configure that agent again through ``configure-from-spec``, which records
    the request it was created from (``CreateAgentRequest``: no ``id``, its
    ``selected_mcp_servers``).
    """
    return (
        isinstance(spec, dict) and "selected_mcp_servers" in spec and "id" not in spec
    )


def wait_until_set_up(relay_url: str, timeout: float = 180.0) -> bool:
    """Whether Datalayer has set the runtime up before the timeout.

    Its agent answers from the moment the pod starts, before the runtime is
    set up for the account: an application configured on it then finds none
    of the account's secrets (an owner's connection does not start), and is
    replaced by the platform's own configuration when it comes (STUDIO A-08).
    """
    import httpx

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            response = httpx.get(
                f"{relay_url}/api/v1/configure/agents/{CLOUD_AGENT_NAME}/spec",
                timeout=10.0,
            )
            answered = response.json() if response.status_code == 200 else None
            if isinstance(answered, dict) and answered.get("set_up_refused"):
                # A secret its specs declare was not given (R-19): said now.
                raise CloudRefused(str(answered["set_up_refused"]))
            if set_up_by_datalayer(answered):
                return True
        except (httpx.HTTPError, ValueError):
            pass
        time.sleep(2.0)
    return False


def minutes_left(expired_at: Any, now: Optional[float] = None) -> Optional[int]:
    """What remains of a reservation, in whole minutes, or None when unknown."""
    from datetime import datetime

    now = time.time() if now is None else now
    try:
        end = float(expired_at)
    except (TypeError, ValueError):
        try:
            end = datetime.fromisoformat(
                str(expired_at).replace("Z", "+00:00")
            ).timestamp()
        except ValueError:
            return None
    if end > 1e12:  # milliseconds
        end /= 1000.0
    return max(0, int((end - now) // 60))


def choose_running(
    runtimes: list[Any],
    *,
    can_ask: bool,
    ask: Optional[Callable[..., Optional[str]]] = None,
) -> Optional[Any]:
    """A running agent runtime to go back to, or None to launch a new one (L-06)."""
    agents = [r for r in runtimes if is_agent_runtime(r)]
    if not agents or not can_ask:
        return None
    new = "__new__"
    choices = []
    for runtime in agents:
        left = minutes_left(getattr(runtime, "expired_at", None))
        remaining = f", {left} min left" if left is not None else ""
        choices.append(
            (
                f"Reconnect to {runtime.runtime_name} — {runtime.environment}{remaining}",
                runtime.runtime_name,
            )
        )
    choices.append(("Launch a new runtime", new))
    answer = (ask or _select)(
        "You have agent runtimes running on Datalayer.", choices, choices[0][1]
    )
    if answer is None:
        raise KeyboardInterrupt
    return next((r for r in agents if r.runtime_name == answer), None)


def speak_ag_ui(relay_url: str, timeout: float = 120.0) -> bool:
    """Whether the runtime's agent answers over AG-UI, which the terminal speaks.

    A cloud runtime configures its agent from the agentspec for the browser,
    over Vercel AI. The runtime is this session's alone, so its agent is
    moved to AG-UI once it exists.
    """
    import httpx

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            listed = httpx.get(f"{relay_url}/api/v1/agents", timeout=10.0).json()
            agents = listed.get("agents") or []
        except (httpx.HTTPError, ValueError):
            agents = []
        agent = next((a for a in agents if a.get("id") == CLOUD_AGENT_NAME), None)
        if agent is not None:
            if agent.get("transport") == "ag-ui":
                return True
            try:
                response = httpx.patch(
                    f"{relay_url}/api/v1/agents/{CLOUD_AGENT_NAME}/transport",
                    json={"transport": "ag-ui"},
                    timeout=20.0,
                )
                if response.status_code < 300:
                    return True
            except httpx.HTTPError:
                pass
        time.sleep(2.0)
    return False


def library_has(relay_url: str, agent_spec_id: str) -> Optional[bool]:
    """Whether the runtime's library has an agentspec, or None when it does not say."""
    import httpx

    try:
        response = httpx.get(
            f"{relay_url}/api/v1/agents/library/{agent_spec_id}", timeout=15.0
        )
    except httpx.HTTPError:
        return None
    if response.status_code == 404:
        return False
    return True if response.status_code < 300 else None


def runtime_agentspec(relay_url: str) -> Optional[str]:
    """The agentspec the runtime's agent was created from, or None."""
    import httpx

    try:
        response = httpx.get(
            f"{relay_url}/api/v1/configure/agents/{CLOUD_AGENT_NAME}/spec",
            timeout=15.0,
        )
        if response.status_code != 200:
            return None
        payload = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    spec_id = payload.get("agent_spec_id") if isinstance(payload, dict) else None
    return str(spec_id) if spec_id else None


def unavailable(agent_spec_id: str, runtime_name: str) -> CloudRefused:
    """The refusal of an agentspec the runtime's library does not have."""
    return CloudRefused(
        f"The agentspec {agent_spec_id} is not available on {runtime_name}: "
        "its library does not have it (the runtime's agentspecs are older or newer than this machine's)."
    )


def ensure_agentspec(
    relay_url: str, agent_spec_id: str, *, runtime_name: str, token: str
) -> bool:
    """Make the runtime's agent the chosen agentspec's. Whether it was changed.

    A runtime holds one agent, ``default``. Going back to a runtime with
    another agentspec reconfigures that agent from the spec, through the
    same route the platform's companion calls at launch.
    """
    import httpx

    if runtime_agentspec(relay_url) == agent_spec_id:
        return False
    if library_has(relay_url, agent_spec_id) is False:
        raise unavailable(agent_spec_id, runtime_name)
    try:
        response = httpx.post(
            f"{relay_url}/api/v1/agents/configure-from-spec",
            json={
                "agent_spec_id": agent_spec_id,
                "transport": "ag-ui",
                "user_token": token,
            },
            timeout=120.0,
        )
    except httpx.HTTPError as error:
        raise CloudRefused(
            f"{runtime_name} did not take the agentspec {agent_spec_id}: {error}"
        ) from None
    if response.status_code == 404:
        raise unavailable(agent_spec_id, runtime_name)
    if response.status_code >= 300:
        raise CloudRefused(
            f"{runtime_name} did not take the agentspec {agent_spec_id} "
            f"({response.status_code}): {response.text[:200]}"
        )
    return True


def find_running(offer: CloudOffer, name: str) -> Any:
    """The running agent runtime ``--runtime`` names, by its name, uid or given name."""
    for runtime in offer.running:
        names = {
            str(getattr(runtime, attr, "") or "")
            for attr in ("runtime_name", "uid", "name")
        }
        if name in names:
            if not is_agent_runtime(runtime):
                raise CloudRefused(
                    f"{name} runs {runtime.environment}, which holds no agent."
                )
            return runtime
    listed = ", ".join(str(r.runtime_name) for r in offer.agent_runtimes) or "none"
    raise CloudRefused(
        f"No agent runtime named {name} is running on Datalayer (running: {listed})."
    )


def _attach(
    runtime: Any,
    *,
    agent_spec_id: Optional[str],
    client: Any,
    token: str,
    status: Callable[[str], None],
) -> Optional[CloudLaunch]:
    """Reach a running runtime through a relay, or None when it does not answer."""
    from agent_runtimes.client.agent_client import build_agent_runtimes_base_url

    relay = Relay(
        target=build_agent_runtimes_base_url(runtime.ingress), token=token
    ).start()
    back = CloudLaunch(
        runtime_name=str(runtime.runtime_name),
        environment=str(runtime.environment),
        minutes=minutes_left(getattr(runtime, "expired_at", None)) or 0,
        ingress=str(runtime.ingress),
        relay=relay,
        client=client,
        jupyter_token=str(runtime.jupyter_token),
        attached=True,
    )
    status(f"Reconnecting to {back.runtime_name}…")
    if not wait_until_ready(relay.url, timeout=30.0):
        relay.stop()
        return None
    try:
        if agent_spec_id and ensure_agentspec(
            relay.url, agent_spec_id, runtime_name=back.runtime_name, token=token
        ):
            status(f"{back.runtime_name} now runs {agent_spec_id}.")
    except CloudRefused:
        relay.stop()
        raise
    if not speak_ag_ui(relay.url, timeout=30.0):
        relay.stop()
        return None
    back.agent_spec_id = agent_spec_id or runtime_agentspec(relay.url)
    return back


def launch_cloud(
    agent_id: Optional[str],
    *,
    label: Optional[str] = None,
    reconnect: bool = True,
    environment: Optional[str] = None,
    minutes: Optional[int] = None,
    runtime: Optional[str] = None,
    offer: Optional[CloudOffer] = None,
    can_ask: Optional[bool] = None,
    status: Callable[[str], None] = lambda message: None,
    note: Callable[[str], None] = lambda message: None,
    app_spec: Optional[dict[str, Any]] = None,
) -> CloudLaunch:
    """Launch a cloud runtime for an agent, or go back to one, and the relay that reaches it.

    ``runtime`` names a running runtime to attach to, and nothing is launched.
    Otherwise a running agent runtime is offered first (L-06), then a new one
    is reserved in an environment that can launch an agent, chosen from the
    SDK's list and priced against the credits left. No agentspec is asked
    for: the runtime's agent is ``agent_id``, else `DEFAULT_CLOUD_AGENTSPEC`,
    said through ``note``.

    ``app_spec`` is the Appspec of the application the runtime is launched
    for (`loop apps run --cloud`): sent with the launch, so the runtime is
    given the secrets its connections declare and a missing one is said
    before the application is configured (LOOP R-19).
    """
    from agent_runtimes.client.agent_client import build_agent_runtimes_base_url

    asking = interactive() if can_ask is None else can_ask
    client, token = make_client()
    offer = offer or read_offer(client)
    if runtime:
        named = find_running(offer, runtime)
        back = _attach(
            named, agent_spec_id=agent_id, client=client, token=token, status=status
        )
        if back is None:
            raise CloudRefused(f"{named.runtime_name} is running but does not answer.")
        return back
    if reconnect:
        again = choose_running(offer.running, can_ask=asking)
        if again is not None:
            back = _attach(
                again, agent_spec_id=agent_id, client=client, token=token, status=status
            )
            if back is not None:
                return back
            status(f"{again.runtime_name} does not answer: launching a new runtime.")
    chosen = choose_environment(
        offer.environments, environment=environment, can_ask=asking
    )
    if not agent_id:
        agent_id = DEFAULT_CLOUD_AGENTSPEC
        note(
            f"The runtime's agent is {agent_id}, the agent loop starts with: "
            "a runtime is configured from an agentspec. -a <agentspec> for another."
        )
    unmetered = unmetered_launch()
    if unmetered:
        # DATALAYER_MAGIC_API_KEY is set: the runtime is sent it, consumes no
        # credits and never expires, so no time is asked and no credit is
        # checked. A --minutes given is still validated, and sent: the
        # platform ignores it for an unmetered runtime.
        reserved = choose_minutes(chosen, minutes=minutes, can_ask=False)
        status(
            f"Launching {label or agent_id} on Datalayer ({chosen.name}, unmetered: "
            "no credits, never expires)…"
        )
    else:
        reserved = choose_minutes(chosen, minutes=minutes, can_ask=asking)
        check_credits(offer.credits, chosen, reserved)
        status(
            f"Launching {label or agent_id} on Datalayer ({chosen.name}, {reserved} min, "
            f"at most {credits_for(chosen, reserved):.2f} credits)…"
        )
    try:
        created = client.create_runtime(
            environment=chosen.name,
            time_reservation=reserved,
            agent_spec_id=agent_id,
            **({"app_spec": dict(app_spec)} if app_spec else {}),
        )
    except (RuntimeError, ValueError) as error:
        raise CloudRefused(f"Datalayer refused the launch: {error}") from None
    relay = Relay(
        target=build_agent_runtimes_base_url(created.ingress), token=token
    ).start()
    launch = CloudLaunch(
        runtime_name=str(created.runtime_name),
        environment=chosen.name,
        minutes=reserved,
        ingress=str(created.ingress),
        relay=relay,
        client=client,
        jupyter_token=str(created.jupyter_token),
        credits=0.0 if unmetered else credits_for(chosen, reserved),
        agent_spec_id=agent_id,
    )
    status(f"Waiting for runtime {launch.runtime_name}…")
    if not wait_until_ready(relay.url):
        launch.stop()
        raise RuntimeError(
            f"The cloud runtime {launch.runtime_name} did not answer in time; it was stopped."
        )
    status(f"Waiting for Datalayer to set up {launch.runtime_name} for the account…")
    try:
        set_up = wait_until_set_up(relay.url)
    except CloudRefused as refused:
        launch.stop()
        raise CloudRefused(f"{refused} The runtime was stopped.") from None
    if not set_up:
        launch.stop()
        raise RuntimeError(
            f"Datalayer did not set up {launch.runtime_name} in time (the account's "
            "secrets and model token are given then); it was stopped."
        )
    if not speak_ag_ui(relay.url):
        missing = library_has(relay.url, agent_id) is False
        launch.stop()
        if missing:
            refused = unavailable(agent_id, launch.runtime_name)
            raise CloudRefused(f"{refused} The runtime was stopped.")
        raise RuntimeError(
            f"The agent of {launch.runtime_name} did not come up; the runtime was stopped."
        )
    return launch


def finish_cloud(
    launch: CloudLaunch,
    *,
    keep: bool = False,
    can_ask: Optional[bool] = None,
    ask: Optional[Callable[..., Optional[bool]]] = None,
    say: Callable[[str], None] = print,
) -> None:
    """At the end of a session: stop the runtime, unless the person keeps it."""
    asking = interactive() if can_ask is None else can_ask
    # A runtime this session went back to was running before it: without
    # somebody to ask, it is left as it was found.
    if keep or (launch.attached and not asking):
        launch.relay.stop()
        say(
            f"The runtime {launch.runtime_name} keeps running until its reservation ends. Stop it with `loop agents terminate {launch.runtime_name}`."
        )
        return
    stop = True
    if asking:
        answer = (ask or _confirm)(
            f"Stop the cloud runtime {launch.runtime_name}? It is billed until you do.",
            True,
        )
        stop = answer is not False
    if not stop:
        launch.relay.stop()
        say(
            f"Kept: reach it again with `loop connect {build_url(launch)}`; stop it with `loop agents terminate {launch.runtime_name}`."
        )
        return
    if launch.stop():
        say(f"Stopped {launch.runtime_name}.")
    else:
        say(
            f"Could not stop {launch.runtime_name}: stop it with `loop agents terminate {launch.runtime_name}`."
        )


def build_url(launch: CloudLaunch) -> str:
    """The runtime's own AG-UI address, for `loop connect`."""
    from agent_runtimes.client.agent_client import build_agent_runtimes_base_url

    return f"{build_agent_runtimes_base_url(launch.ingress)}/api/v1/ag-ui/{CLOUD_AGENT_NAME}/"


def runtime_of_url(url: str) -> Optional[str]:
    """The runtime a Datalayer runtime's address names (`build_url`'s), or None.

    ``https://<host>/agent-runtimes/<pool>/<uid>/…`` names runtime ``<uid>``:
    `loop connect` goes back to it as `loop --runtime <uid>` does, through a
    relay with the person's token.
    """
    import re
    from urllib.parse import urlparse

    found = re.search(r"/agent-runtimes/[^/]+/([^/]+)(?:/|$)", urlparse(url).path)
    return found.group(1) if found else None
