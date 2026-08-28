# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Runtimes client speaks the sandbox vocabulary, and only that."""

from typing import Any

import pytest
from code_sandboxes import SandboxLifecycle, SandboxManagerLifecycle
from code_sandboxes.lifecycle import (
    LIFECYCLE_OPERATIONS,
    SandboxOperationNotSupported,
)

from agent_runtimes.runtimes.client import RuntimeHandle, RuntimesClient


class _Urls:
    runtimes_url = "https://runtimes.example"
    iam_url = "https://iam.example"


class _Response:
    def __init__(self, status_code: int = 200, payload: Any = None) -> None:
        self.status_code = status_code
        self._payload = {} if payload is None else payload

    def json(self) -> Any:
        return self._payload


class _Transport:
    """Records what the client asked for, and answers whatever it was told to."""

    def __init__(self, response: _Response | None = None) -> None:
        self.urls = _Urls()
        self.calls: list[dict[str, Any]] = []
        self._response = response or _Response(payload={"success": True})

    def _fetch(self, request: str, **kwargs: Any) -> _Response:
        self.calls.append({"url": request, **kwargs})
        return self._response


class TestItIsWrittenToTheProtocol:
    """Conformance is structural — the client has the verbs, not a base class."""

    def test_the_client_is_a_manager(self) -> None:
        assert isinstance(RuntimesClient(_Transport()), SandboxManagerLifecycle)

    def test_a_handle_is_one_sandbox(self) -> None:
        assert isinstance(RuntimesClient(_Transport()).handle("runtime-1"), SandboxLifecycle)

    def test_it_supports_every_verb_but_execute(self) -> None:
        client = RuntimesClient(_Transport())
        for verb in LIFECYCLE_OPERATIONS:
            assert client.supports(verb) is (verb != "execute"), verb

    def test_a_handle_does_not_claim_the_manager_verbs(self) -> None:
        handle = RuntimesClient(_Transport()).handle("runtime-1")
        for verb in ("create", "list", "get", "update"):
            assert not handle.supports(verb), verb
        for verb in ("start", "stop", "pause", "resume", "snapshot"):
            assert handle.supports(verb), verb


class TestTheVerbsReachTheRightUrls:
    """The paths come from the vocabulary, so this pins them where callers see them."""

    def test_list_and_get(self) -> None:
        transport = _Transport(_Response(payload={"runtimes": []}))
        client = RuntimesClient(transport)
        client.list()
        client.get("runtime-1")
        assert transport.calls[0]["url"] == "https://runtimes.example/api/runtimes/v1/runtimes"
        assert transport.calls[1]["url"] == "https://runtimes.example/api/runtimes/v1/runtimes/runtime-1"

    def test_stop_is_one_verb_for_running_and_paused(self) -> None:
        transport = _Transport(_Response(status_code=200))
        client = RuntimesClient(transport)
        assert client.stop("runtime-1")["success"] is True
        call = transport.calls[0]
        assert call["method"] == "DELETE"
        # No second path for the paused case: one stop, one URL.
        assert call["url"].endswith("/runtimes/runtime-1")

    def test_stop_forwards_a_reason_when_given(self) -> None:
        transport = _Transport(_Response(status_code=200))
        RuntimesClient(transport).stop("runtime-1", reason="done")
        assert transport.calls[0]["params"] == {"reason": "done"}

    @pytest.mark.parametrize("verb,suffix", [("pause", "/pause"), ("resume", "/resume")])
    def test_pause_and_resume(self, verb: str, suffix: str) -> None:
        transport = _Transport(_Response(status_code=202, payload={"success": True}))
        getattr(RuntimesClient(transport), verb)("runtime-1")
        call = transport.calls[0]
        assert call["method"] == "POST"
        assert call["url"].endswith(f"/runtimes/runtime-1{suffix}")

    def test_a_202_with_no_body_still_counts_as_accepted(self) -> None:
        class _NoBody(_Response):
            def json(self) -> Any:
                raise ValueError("no body")

        transport = _Transport(_NoBody(status_code=202))
        assert RuntimesClient(transport).pause("runtime-1")["success"] is True

    def test_snapshot_is_its_own_resource(self) -> None:
        transport = _Transport(_Response(status_code=201, payload={"success": True}))
        RuntimesClient(transport).snapshot("runtime-1", "before-the-change")
        call = transport.calls[0]
        # A snapshot outlives the runtime, so it is not a sub-path of it.
        assert call["url"].endswith("/sandbox-snapshots")
        assert call["json"]["runtime_name"] == "runtime-1"
        assert call["json"]["name"] == "before-the-change"


class TestItRefusesRatherThanFailsLate:
    """`supports()` and the refusal have to agree."""

    def test_running_code_is_refused_by_name(self) -> None:
        handle = RuntimesClient(_Transport()).handle("runtime-1")
        assert handle.supports("execute") is False
        with pytest.raises(SandboxOperationNotSupported) as caught:
            handle.run_code("print(1)")
        assert caught.value.operation == "execute"

    def test_starting_a_created_runtime_is_a_no_op(self) -> None:
        transport = _Transport()
        # It already started when it was created; saying so beats a stray call.
        assert RuntimesClient(transport).handle("runtime-1").start() is None
        assert transport.calls == []


class TestItReportsFailuresRatherThanRaising:
    """Callers read `success`; a bad status must not become an exception."""

    def test_a_failed_stop_says_so(self) -> None:
        transport = _Transport(_Response(status_code=500, payload={"message": "boom"}))
        result = RuntimesClient(transport).stop("runtime-1")
        assert result["success"] is False
        assert "boom" in result["message"]

    def test_a_handle_narrows_without_losing_the_name(self) -> None:
        handle = RuntimesClient(_Transport()).handle("runtime-1")
        assert isinstance(handle, RuntimeHandle)
        assert handle.runtime_name == "runtime-1"
        assert "runtime-1" in repr(handle)
