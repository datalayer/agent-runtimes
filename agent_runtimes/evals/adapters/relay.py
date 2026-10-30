# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The one door out of an `inference` sandbox.

Every model call of an external framework goes through ai-inference, which
routes it to Bedrock or Alibaba, meters it and bills it. This relay is what
makes that a fact rather than a convention. It runs on the runtime, outside
the sandbox, on a unix socket the sandbox's loopback reaches:

- it holds the run's token, narrowed to ai-inference; the sandbox holds a
  placeholder, so somebody's code never sees a credential;
- it forwards chat completions for a catalogue model and, when the route says
  ai-inference answers it, Anthropic's Messages API; nothing else;
- it stamps the application and deployment a call is metered under, so a
  framework cannot leave them out or name another;
- it counts what each call used and prices it from the catalogue, so a launch's
  budget sees a framework's calls, and refuses the next call once it is spent.

The same door reaches one task's environment, when the execution has one:
`/environment/exec`, `/read` and `/write` go to the backend the runtime holds
for it (`task_environments`), so the sandbox reaches that environment and no
other, and holds nothing to reach it with.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import socketserver
import threading
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any

import httpx

from agent_runtimes.evals.adapters.base import InferenceRoute, is_inference_model

__all__ = ["CHAT_PATH", "InferenceRelay", "RelayUsage"]

logger = logging.getLogger(__name__)

#: What a sandbox calls, on its own loopback.
CHAT_PATH = "/v1/chat/completions"
MESSAGES_PATH = "/anthropic/v1/messages"
COUNT_TOKENS_PATH = "/anthropic/v1/messages/count_tokens"
ENVIRONMENT_PATH = "/environment/"
MAX_BODY_BYTES = 32 * 1024 * 1024
TIMEOUT_SECONDS = 600.0
#: What Bedrock charges for Claude's prompt cache against the input price, as
#: ai-inference's metering prices it.
CACHE_READ_RATE = 0.1
CACHE_WRITE_RATE = 1.25
#: The headers of ai-inference's answer a framework has any use for.
_PASSED_ON = ("content-type", "retry-after")


class RelayUsage:
    """What the calls of one execution used, and what they cost."""

    def __init__(self, route: InferenceRoute | None) -> None:
        """Start at nothing, under `route`'s prices and limit."""
        self.route = route
        self.calls = 0
        self.input_tokens = 0
        self.output_tokens = 0
        self.credits = 0.0
        self.unpriced: set[str] = set()
        self.budget_exhausted = False
        self._lock = threading.Lock()

    def _price(self, model: str) -> list[float] | None:
        """Find the dollars per million tokens, by the catalogue's id or a harness's name."""
        prices = self.route.prices if self.route else {}
        if model in prices:
            return prices[model]
        return next(
            (
                price
                for name, price in prices.items()
                if name.endswith(model) or model in name
            ),
            None,
        )

    def may_call(self) -> bool:
        """Whether the budget leaves room for another call."""
        limit = self.route.credit_limit if self.route else None
        with self._lock:
            if limit is not None and self.credits >= limit:
                self.budget_exhausted = True
                return False
        return True

    def take(self, model: str, usage: dict[str, Any]) -> None:
        """Count one answer's usage, in either API's words."""
        prompt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
        answer = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
        read = int(usage.get("cache_read_input_tokens") or 0)
        written = int(usage.get("cache_creation_input_tokens") or 0)
        price = self._price(model)
        rate = self.route.credits_per_usd if self.route else 0.0
        with self._lock:
            self.input_tokens += prompt + read + written
            self.output_tokens += answer
            if price is None:
                self.unpriced.add(model)
                return
            weighted = prompt + read * CACHE_READ_RATE + written * CACHE_WRITE_RATE
            self.credits += (weighted / 1e6 * price[0] + answer / 1e6 * price[1]) * rate

    def counted(self) -> dict[str, Any]:
        """The usage as a task result carries it."""
        return {
            "calls": self.calls,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.input_tokens + self.output_tokens,
            "credits_consumed": round(self.credits, 6),
            "unpriced_models": sorted(self.unpriced),
            "budget_exhausted": self.budget_exhausted,
        }


class _Tally:
    """Reads the usage out of an answer as it passes, JSON or a stream."""

    def __init__(self) -> None:
        self.held = bytearray()
        self.usage: dict[str, Any] = {}

    def feed(self, chunk: bytes) -> None:
        """Keep what may hold usage, bounded by the size of a call's answer."""
        self.held.extend(chunk)

    def _take(self, value: Any) -> None:
        if not isinstance(value, dict):
            return
        message = value.get("message")
        sources: list[dict[str, Any]] = [
            value,
            message if isinstance(message, dict) else {},
        ]
        for source in sources:
            found = source.get("usage")
            if isinstance(found, dict):
                self.usage.update(
                    {
                        key: item
                        for key, item in found.items()
                        if isinstance(item, (int, float))
                    }
                )

    def finish(self) -> dict[str, Any]:
        """The usage the answer reported, across its events."""
        text = bytes(self.held).decode("utf-8", "replace")
        try:
            self._take(json.loads(text))
        except ValueError:
            for line in text.splitlines():
                if line.startswith("data:"):
                    try:
                        self._take(json.loads(line[5:].strip()))
                    except ValueError:
                        continue
        return self.usage


class _UnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    """A threaded HTTP server on a unix socket."""

    daemon_threads = True
    route: InferenceRoute | None
    usage: RelayUsage
    environment: Any


class _Handler(BaseHTTPRequestHandler):
    """One sandbox request."""

    server: _UnixServer
    protocol_version = "HTTP/1.1"

    def address_string(self) -> str:
        """Name the peer, which a unix socket has no address for."""
        return "sandbox"

    def log_message(self, format: str, *args: object) -> None:
        """Log at debug: a request carries nothing worth more."""
        logger.debug("relay: " + format, *args)

    def _answer(self, status: int, body: dict[str, Any]) -> None:
        """Answer in JSON and close."""
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(data)
        self.close_connection = True

    def _refuse(self, status: int, message: str) -> None:
        """Answer a refusal in the shape an OpenAI client reads."""
        self._answer(status, {"error": {"message": message, "type": "refused"}})

    def do_HEAD(self) -> None:
        """Answer Claude Code's reachability check, when the route is there."""
        route = self.server.route
        self.send_response(
            200
            if route and route.anthropic and self.path == "/anthropic/api/hello"
            else 404
        )
        self.send_header("Content-Length", "0")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

    def do_GET(self) -> None:
        """Refuse: nothing is read through here."""
        self._refuse(
            404, "Only model calls and this task's environment go through here."
        )

    def _read(self) -> bytes | None:
        """The request's body, or the refusal."""
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:
            self._refuse(413, "The request is too large.")
            return None
        return self.rfile.read(length)

    def do_POST(self) -> None:
        """Route one request: a model call, or this task's environment."""
        path = self.path.split("?", 1)[0]
        # Read before any answer: a refusal over an unread body resets a client
        # that is still sending it, and it never sees the refusal.
        body = self._read()
        if body is None:
            return
        if path.startswith(ENVIRONMENT_PATH):
            self._environment(path[len(ENVIRONMENT_PATH) :], body)
        elif path == CHAT_PATH:
            self._model_call("/chat/completions", body, counted=True)
        elif path in (MESSAGES_PATH, COUNT_TOKENS_PATH):
            route = self.server.route
            if route is None or not route.anthropic:
                self._refuse(404, "ai-inference's Anthropic route is not offered here.")
                return
            self._model_call(path, body, counted=path == MESSAGES_PATH)
        else:
            self._refuse(
                404, "Only model calls and this task's environment go through here."
            )

    def _environment(self, operation: str, body: bytes) -> None:
        """One operation on the task's environment, and no other's."""
        backend = self.server.environment
        if backend is None:
            self._refuse(404, "This execution has no task environment.")
            return
        try:
            request = json.loads(body)
            if operation == "exec":
                answer = backend.exec(
                    list(request["argv"]),
                    stdin=base64.b64decode(request.get("stdin") or ""),
                    cwd=request.get("cwd"),
                    env=dict(request.get("env") or {}),
                    timeout=request.get("timeout"),
                    user=request.get("user"),
                )
            elif operation == "write":
                backend.write(
                    str(request["path"]), base64.b64decode(request["content"])
                )
                answer = {}
            elif operation == "read":
                answer = {
                    "content": base64.b64encode(
                        backend.read(str(request["path"]))
                    ).decode()
                }
            else:
                self._refuse(404, f"No environment operation {operation}.")
                return
        except FileNotFoundError as error:
            self._answer(404, {"error": {"message": str(error), "type": "not_found"}})
        except PermissionError as error:
            self._answer(403, {"error": {"message": str(error), "type": "permission"}})
        except (KeyError, ValueError, TypeError) as error:
            self._refuse(400, f"The request is not an environment operation: {error}")
        except Exception as error:  # noqa: BLE001 - the backend's failure is the sandbox's to read, not a dropped connection
            logger.warning("A task environment failed: %s", error)
            self._answer(
                502,
                {
                    "error": {
                        "message": f"The task environment did not answer: {error}",
                        "type": "environment",
                    }
                },
            )
        else:
            self._answer(200, answer)

    def _model_call(self, upstream: str, raw: bytes, *, counted: bool) -> None:
        """Forward one model call, counted against the budget."""
        route = self.server.route
        usage = self.server.usage
        if route is None:
            self._refuse(403, "This execution has no route to ai-inference.")
            return
        try:
            request = json.loads(raw)
            model = str(request.get("model") or "")
        except (ValueError, AttributeError):
            self._refuse(400, "The request is not a model call.")
            return
        if upstream.startswith("/chat") and not is_inference_model(model):
            self._refuse(
                403,
                f"The model {model!r} is not one ai-inference serves: every model call goes through it.",
            )
            return
        if counted and not usage.may_call():
            self._refuse(
                402,
                "The launch's budget is spent, so this run makes no further model calls.",
            )
            return
        if upstream.startswith("/chat") and request.get("stream"):
            # A stream reports what it used only when asked.
            request["stream_options"] = {
                **dict(request.get("stream_options") or {}),
                "include_usage": True,
            }
            raw = json.dumps(request).encode()
        headers = {
            **route.headers,
            "Authorization": f"Bearer {route.token}",
            "Content-Type": "application/json",
        }
        if upstream.startswith("/anthropic"):
            headers["anthropic-version"] = (
                self.headers.get("anthropic-version") or "2023-06-01"
            )
            if self.headers.get("anthropic-beta"):
                headers["anthropic-beta"] = str(self.headers["anthropic-beta"])
        tally = _Tally()
        try:
            with httpx.stream(
                "POST",
                f"{route.url.rstrip('/')}{upstream}",
                content=raw,
                headers=headers,
                timeout=TIMEOUT_SECONDS,
            ) as answer:
                self.send_response(answer.status_code)
                for name in _PASSED_ON:
                    if name in answer.headers:
                        self.send_header(name, answer.headers[name])
                self.send_header("Connection", "close")
                self.end_headers()
                for chunk in answer.iter_raw():
                    if counted:
                        tally.feed(chunk)
                    self.wfile.write(chunk)
                    self.wfile.flush()
            self.close_connection = True
        except httpx.HTTPError as error:
            logger.warning("ai-inference could not be reached: %s", error)
            self._refuse(502, "ai-inference could not be reached.")
            return
        if counted:
            usage.calls += 1
            usage.take(model, tally.finish())


class InferenceRelay:
    """One execution's relay, for as long as the `with` lasts."""

    def __init__(
        self, path: Path, *, route: InferenceRoute | None, environment: Any = None
    ) -> None:
        """Name the socket, the route and the task's environment."""
        self.path = Path(path)
        self.route = route
        self.environment = environment
        self.usage = RelayUsage(route)
        self._server: _UnixServer | None = None
        self._thread: threading.Thread | None = None

    def __enter__(self) -> "InferenceRelay":
        """Start serving."""
        self._server = _UnixServer(str(self.path), _Handler)
        self._server.route = self.route
        self._server.usage = self.usage
        self._server.environment = self.environment
        os.chmod(self.path, 0o600)
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            kwargs={"poll_interval": 0.1},
            daemon=True,
        )
        self._thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        """Stop serving and remove the socket."""
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
        self.path.unlink(missing_ok=True)
