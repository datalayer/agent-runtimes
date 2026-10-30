# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The relay: what it forwards, what it counts, and when it stops."""

from __future__ import annotations

import http.client
import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import pytest

from agent_runtimes.evals.adapters.base import InferenceRoute
from agent_runtimes.evals.adapters.relay import InferenceRelay


class _Upstream:
    """AI Inference: a chat answer, a stream, or Anthropic's Messages."""

    def __enter__(self) -> "_Upstream":
        calls: list[dict[str, Any]] = []
        self.calls = calls

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                calls.append(
                    {
                        "path": self.path,
                        "body": body,
                        "auth": self.headers.get("Authorization"),
                        "app": self.headers.get("X-Datalayer-App-Uid"),
                        "version": self.headers.get("anthropic-version"),
                    }
                )
                if self.path.endswith("/anthropic/v1/messages") and body.get("stream"):
                    events = [
                        {
                            "type": "message_start",
                            "message": {
                                "usage": {
                                    "input_tokens": 100,
                                    "cache_read_input_tokens": 1000,
                                }
                            },
                        },
                        {"type": "message_delta", "usage": {"output_tokens": 50}},
                    ]
                    data = "".join(
                        f"event: x\ndata: {json.dumps(event)}\n\n" for event in events
                    ).encode()
                    kind = "text/event-stream"
                elif self.path.endswith("/anthropic/v1/messages"):
                    data = json.dumps(
                        {"usage": {"input_tokens": 100, "output_tokens": 50}}
                    ).encode()
                    kind = "application/json"
                elif body.get("stream"):
                    chunks = [
                        {"choices": [{"delta": {"content": "hi"}}]},
                        {
                            "choices": [],
                            "usage": {"prompt_tokens": 1000, "completion_tokens": 500},
                        },
                    ]
                    data = (
                        "".join(
                            f"data: {json.dumps(chunk)}\n\n" for chunk in chunks
                        ).encode()
                        + b"data: [DONE]\n\n"
                    )
                    kind = "text/event-stream"
                else:
                    data = json.dumps(
                        {
                            "choices": [{"message": {"content": "hi"}}],
                            "usage": {"prompt_tokens": 1000, "completion_tokens": 500},
                        }
                    ).encode()
                    kind = "application/json"
                self.send_response(200)
                self.send_header("Content-Type", kind)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/api/ai-inference/v1"
        return self

    def __exit__(self, *_):
        self.server.shutdown()
        self.server.server_close()


class _Unix(http.client.HTTPConnection):
    def __init__(self, path: str) -> None:
        super().__init__("sandbox")
        self.socket_path = path

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX)
        self.sock.connect(self.socket_path)


def _post(
    path: Path, target: str, body: dict[str, Any], headers: dict[str, str] | None = None
) -> tuple[int, bytes]:
    connection = _Unix(str(path))
    connection.request(
        "POST",
        target,
        json.dumps(body),
        {"Content-Type": "application/json", **(headers or {})},
    )
    answer = connection.getresponse()
    return answer.status, answer.read()


PRICES = {"bedrock:us.anthropic.claude-haiku-4-5": [1.0, 5.0]}
CHAT = {"model": "bedrock:us.anthropic.claude-haiku-4-5", "messages": []}


def _route(upstream, **update) -> InferenceRoute:
    return InferenceRoute(
        url=upstream.url, token="t", prices=PRICES, credits_per_usd=1000.0, **update
    )


class TestCounting:
    def test_a_call_is_counted_in_tokens_and_priced_in_credits(self, tmp_path):
        with (
            _Upstream() as upstream,
            InferenceRelay(tmp_path / "r", route=_route(upstream)) as relay,
        ):
            status, _ = _post(tmp_path / "r", "/v1/chat/completions", CHAT)
        assert status == 200
        counted = relay.usage.counted()
        assert (
            counted["calls"],
            counted["input_tokens"],
            counted["output_tokens"],
        ) == (1, 1000, 500)
        # 1000 × $1 + 500 × $5 per million, at 1000 credits a dollar.
        assert counted["credits_consumed"] == pytest.approx(3.5)

    def test_a_stream_is_asked_to_report_and_is_counted(self, tmp_path):
        with (
            _Upstream() as upstream,
            InferenceRelay(tmp_path / "r", route=_route(upstream)) as relay,
        ):
            _post(tmp_path / "r", "/v1/chat/completions", {**CHAT, "stream": True})
        assert upstream.calls[0]["body"]["stream_options"] == {"include_usage": True}
        assert relay.usage.counted()["output_tokens"] == 500

    def test_a_model_with_no_price_is_said_not_silently_free(self, tmp_path):
        with (
            _Upstream() as upstream,
            InferenceRelay(tmp_path / "r", route=_route(upstream)) as relay,
        ):
            _post(
                tmp_path / "r",
                "/v1/chat/completions",
                {**CHAT, "model": "alibaba:qwen-max"},
            )
        assert relay.usage.counted()["unpriced_models"] == ["alibaba:qwen-max"]


class TestABudget:
    def test_it_stops_the_next_call_and_says_so(self, tmp_path):
        with (
            _Upstream() as upstream,
            InferenceRelay(
                tmp_path / "r", route=_route(upstream, credit_limit=3.0)
            ) as relay,
        ):
            first, _ = _post(tmp_path / "r", "/v1/chat/completions", CHAT)
            second, body = _post(tmp_path / "r", "/v1/chat/completions", CHAT)
        assert (first, second) == (200, 402)
        assert b"budget" in body
        assert len(upstream.calls) == 1
        assert relay.usage.counted()["budget_exhausted"] is True

    def test_none_is_no_limit(self, tmp_path):
        with (
            _Upstream() as upstream,
            InferenceRelay(tmp_path / "r", route=_route(upstream)) as relay,
        ):
            for _ in range(3):
                assert _post(tmp_path / "r", "/v1/chat/completions", CHAT)[0] == 200
        assert relay.usage.counted()["budget_exhausted"] is False


class TestTheAnthropicRoute:
    MESSAGES = {"model": "claude-haiku-4-5", "messages": [], "max_tokens": 10}

    def test_it_is_closed_unless_the_deployment_says_it_is_there(self, tmp_path):
        with (
            _Upstream() as upstream,
            InferenceRelay(tmp_path / "r", route=_route(upstream)),
        ):
            status, _ = _post(tmp_path / "r", "/anthropic/v1/messages", self.MESSAGES)
        assert status == 404
        assert upstream.calls == []

    def test_open_it_forwards_with_the_held_token_and_counts_the_cache(self, tmp_path):
        with (
            _Upstream() as upstream,
            InferenceRelay(
                tmp_path / "r",
                route=_route(
                    upstream, anthropic=True, headers={"X-Datalayer-App-Uid": "a1"}
                ),
            ) as relay,
        ):
            status, _ = _post(
                tmp_path / "r",
                "/anthropic/v1/messages",
                {**self.MESSAGES, "stream": True},
                {"Authorization": "Bearer held-by-the-relay"},
            )
        assert status == 200
        call = upstream.calls[0]
        assert call["path"].endswith("/api/ai-inference/v1/anthropic/v1/messages")
        assert (call["auth"], call["app"], call["version"]) == (
            "Bearer t",
            "a1",
            "2023-06-01",
        )
        counted = relay.usage.counted()
        assert (counted["input_tokens"], counted["output_tokens"]) == (1100, 50)
        # 100 + 1000 × 0.1 input at $1, 50 output at $5, per million, at 1000 credits a dollar.
        assert counted["credits_consumed"] == pytest.approx(0.45)

    def test_the_openai_route_is_gone(self, tmp_path):
        with (
            _Upstream() as upstream,
            InferenceRelay(tmp_path / "r", route=_route(upstream, anthropic=True)),
        ):
            assert _post(tmp_path / "r", "/openai/v1/chat/completions", CHAT)[0] == 404
            assert _post(tmp_path / "r", "/v1/responses", CHAT)[0] == 404
        assert upstream.calls == []


class TestAnEnvironment:
    class Backend:
        def __init__(self) -> None:
            self.files: dict[str, bytes] = {}

        def exec(self, argv, *, stdin, cwd, env, timeout, user):
            return {"returncode": 0, "stdout": " ".join(argv), "stderr": ""}

        def write(self, path, content):
            self.files[path] = content

        def read(self, path):
            if path not in self.files:
                raise FileNotFoundError(path)
            return self.files[path]

    def test_it_carries_exec_read_and_write_to_the_one_backend(self, tmp_path):
        import base64

        backend = self.Backend()
        with InferenceRelay(tmp_path / "r", route=None, environment=backend):
            assert (
                json.loads(
                    _post(
                        tmp_path / "r", "/environment/exec", {"argv": ["echo", "hi"]}
                    )[1]
                )["stdout"]
                == "echo hi"
            )
            assert (
                _post(
                    tmp_path / "r",
                    "/environment/write",
                    {"path": "/a", "content": base64.b64encode(b"x").decode()},
                )[0]
                == 200
            )
            assert (
                base64.b64decode(
                    json.loads(
                        _post(tmp_path / "r", "/environment/read", {"path": "/a"})[1]
                    )["content"]
                )
                == b"x"
            )
            assert (
                _post(tmp_path / "r", "/environment/read", {"path": "/none"})[0] == 404
            )

    def test_with_none_it_refuses(self, tmp_path):
        with InferenceRelay(tmp_path / "r", route=None):
            assert _post(tmp_path / "r", "/environment/exec", {"argv": ["x"]})[0] == 404

    def test_it_answers_a_refusal_however_much_is_still_being_sent(self, tmp_path):
        """A refusal before the body is read resets a client still writing it."""
        body = {"argv": ["x" * 2_000_000]}
        with InferenceRelay(tmp_path / "r", route=None):
            assert _post(tmp_path / "r", "/environment/exec", body)[0] == 404
            assert _post(tmp_path / "r", "/nowhere", body)[0] == 404
            assert _post(tmp_path / "r", "/v1/chat/completions", body)[0] == 403

    def test_no_route_makes_no_model_call(self, tmp_path):
        with InferenceRelay(tmp_path / "r", route=None):
            assert _post(tmp_path / "r", "/v1/chat/completions", CHAT)[0] == 403
