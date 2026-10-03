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
) -> str:
    """Where the agent runs: what the flags say, else what the person answers.

    Without a person to ask, on this machine — a script never starts
    something billed by surprise.
    """
    if local and cloud:
        raise ValueError("Use only one of --local or --cloud.")
    if local:
        return LOCAL
    if cloud:
        return CLOUD
    if not (interactive() if can_ask is None else can_ask):
        return LOCAL
    last = _read_preferences(preferences).get("where")
    default = last if last in (LOCAL, CLOUD) else LOCAL
    answer = (ask or _select)(
        "Where should the agent run?",
        [
            ("On this machine — a local server, with your own model keys", LOCAL),
            ("On Datalayer — a cloud runtime, billed by the minute", CLOUD),
        ],
        default,
    )
    if answer is None:
        raise KeyboardInterrupt
    _write_preferences({"where": answer}, preferences)
    return answer


def _select(
    question: str, choices: list[tuple[str, str]], default: str
) -> Optional[str]:
    import questionary

    return questionary.select(
        question,
        choices=[
            questionary.Choice(title=title, value=value) for title, value in choices
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
    from starlette.responses import StreamingResponse
    from starlette.routing import Route

    base = target.rstrip("/")
    client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, read=None))

    async def forward(request: Request) -> StreamingResponse:
        url = f"{base}/{request.path_params.get('path', '')}"
        if request.url.query:
            url = f"{url}?{request.url.query}"
        headers = {
            k: v for k, v in request.headers.items() if k.lower() not in _HOP_HEADERS
        }
        headers["authorization"] = f"Bearer {token}"
        upstream = await client.send(
            client.build_request(
                request.method, url, headers=headers, content=await request.body()
            ),
            stream=True,
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


@dataclass
class CloudLaunch:
    """A cloud runtime launched for this session, and the relay that reaches it."""

    runtime_name: str
    environment: str
    minutes: int
    ingress: str
    relay: Relay
    client: Any = field(repr=False)
    credits: float = 0.0

    @property
    def server_url(self) -> str:
        return self.relay.url

    @property
    def port(self) -> int:
        return self.relay.port

    @property
    def agent_url(self) -> str:
        return f"{self.relay.url}/api/v1/ag-ui/{CLOUD_AGENT_NAME}/"

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


def choose_environment(
    environments: list[Any],
    *,
    environment: Optional[str] = None,
    can_ask: bool,
    ask: Optional[Callable[..., Optional[str]]] = None,
) -> Any:
    """The environment to run in: the one named, else the agents' one, else asked."""
    by_name = {env.name: env for env in environments}
    if environment:
        if environment not in by_name:
            raise ValueError(
                f"There is no environment named “{environment}”. "
                f"Available: {', '.join(sorted(by_name)) or 'none'}."
            )
        return by_name[environment]
    if not environments:
        raise ValueError("No environment is available to this account on Datalayer.")
    default = by_name.get(DEFAULT_ENVIRONMENT) or environments[0]
    if len(environments) == 1 or not can_ask:
        return default
    answer = (ask or _select)(
        "In which environment?",
        [
            (
                f"{env.name}  ({env.title})" if getattr(env, "title", "") else env.name,
                env.name,
            )
            for env in environments
        ],
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


def launch_cloud(
    agent_id: str,
    *,
    label: Optional[str] = None,
    environment: Optional[str] = None,
    minutes: Optional[int] = None,
    can_ask: Optional[bool] = None,
    status: Callable[[str], None] = lambda message: None,
) -> CloudLaunch:
    """Launch a cloud runtime for an agent, and the relay that reaches it."""
    from agent_runtimes.client.agent_client import build_agent_runtimes_base_url

    asking = interactive() if can_ask is None else can_ask
    client, token = make_client()
    chosen = choose_environment(
        client.list_environments(), environment=environment, can_ask=asking
    )
    reserved = choose_minutes(chosen, minutes=minutes, can_ask=asking)
    status(
        f"Launching {label or agent_id} on Datalayer ({chosen.name}, {reserved} min)…"
    )
    runtime = client.create_runtime(
        environment=chosen.name, time_reservation=reserved, agent_spec_id=agent_id
    )
    relay = Relay(
        target=build_agent_runtimes_base_url(runtime.ingress), token=token
    ).start()
    launch = CloudLaunch(
        runtime_name=str(runtime.runtime_name),
        environment=chosen.name,
        minutes=reserved,
        ingress=str(runtime.ingress),
        relay=relay,
        client=client,
        credits=credits_for(chosen, reserved),
    )
    status(f"Waiting for runtime {launch.runtime_name}…")
    if not wait_until_ready(relay.url):
        launch.stop()
        raise RuntimeError(
            f"The cloud runtime {launch.runtime_name} did not answer in time; it was stopped."
        )
    if not speak_ag_ui(relay.url):
        launch.stop()
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
    if keep:
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
