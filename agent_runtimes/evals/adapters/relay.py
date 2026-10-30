# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The one door out of an `inference` sandbox: ai-inference, and only that.

Every model call of an external framework goes through ai-inference, which
routes it to Bedrock or Alibaba, meters it and bills it. This relay is what
makes that a fact rather than a convention. It runs on the runtime, outside
the sandbox, on a unix socket the sandbox's loopback reaches:

- it holds the run's token, narrowed to ai-inference; the sandbox holds a
  placeholder, so somebody's code never sees a credential;
- it forwards `POST /v1/chat/completions` and nothing else;
- it forwards a catalogue model and nothing else, whatever the code asks for;
- it stamps the application and deployment a call is metered under, so a
  framework cannot leave them out or name another.
"""

from __future__ import annotations

import json
import logging
import os
import socketserver
import threading
from http.server import BaseHTTPRequestHandler
from pathlib import Path

import httpx

from agent_runtimes.evals.adapters.base import InferenceRoute, is_inference_model

__all__ = ["InferenceRelay"]

logger = logging.getLogger(__name__)

#: What a sandbox calls, on its own loopback.
CHAT_PATH = "/v1/chat/completions"
MAX_BODY_BYTES = 32 * 1024 * 1024
TIMEOUT_SECONDS = 600.0
#: The headers of ai-inference's answer a framework has any use for.
_PASSED_ON = ("content-type", "retry-after")


class _UnixServer(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    """A threaded HTTP server on a unix socket."""

    daemon_threads = True
    route: InferenceRoute


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

    def _refuse(self, status: int, message: str) -> None:
        """Answer a refusal in the shape an OpenAI client reads."""
        body = json.dumps({"error": {"message": message, "type": "refused"}}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def do_GET(self) -> None:
        """Refuse: nothing is read through here."""
        self._refuse(404, "Only chat completions go through here.")

    def do_POST(self) -> None:
        """Forward one chat completion for a catalogue model."""
        if self.path.split("?", 1)[0] != CHAT_PATH:
            self._refuse(404, "Only chat completions go through here.")
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY_BYTES:
            self._refuse(413, "The request is too large.")
            return
        body = self.rfile.read(length)
        try:
            model = str(json.loads(body).get("model") or "")
        except (ValueError, AttributeError):
            self._refuse(400, "The request is not a chat completion.")
            return
        if not is_inference_model(model):
            self._refuse(
                403,
                f"The model {model!r} is not one ai-inference serves: every model call goes through it.",
            )
            return
        route = self.server.route
        headers = {
            **route.headers,
            "Authorization": f"Bearer {route.token}",
            "Content-Type": "application/json",
        }
        try:
            with httpx.stream(
                "POST",
                f"{route.url.rstrip('/')}/chat/completions",
                content=body,
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
                    self.wfile.write(chunk)
                    self.wfile.flush()
            self.close_connection = True
        except httpx.HTTPError as error:
            logger.warning("ai-inference could not be reached: %s", error)
            self._refuse(502, "ai-inference could not be reached.")


class InferenceRelay:
    """One execution's relay, for as long as the `with` lasts."""

    def __init__(self, path: Path, *, route: InferenceRoute) -> None:
        """Name the socket and the route."""
        self.path = Path(path)
        self.route = route
        self._server: _UnixServer | None = None
        self._thread: threading.Thread | None = None

    def __enter__(self) -> "InferenceRelay":
        """Start serving."""
        self._server = _UnixServer(str(self.path), _Handler)
        self._server.route = self.route
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
