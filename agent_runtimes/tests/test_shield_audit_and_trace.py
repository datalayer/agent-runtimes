# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Shield's audit in the record and its trace across the chain (SHIELD.md SH-34, SH-51, SH-37).

Every Shield row reaches the application's record in A-01's vocabulary
extended with ACP's kinds; a diff is whole only when the record names
``diffs``, a terminal's output only when it names ``terminals``; a credential
in a row is redacted before anything keeps, logs or counts it. The turn is a
span of the trace the face arrived on, handed to the harness in the prompt's
``_meta.traceparent`` and to the lent gateway (the HTTP headers, the stdio
shim per call); a request's ``traceparent`` becomes the request's span.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from agent_shield import tracing
from opentelemetry import trace as otel_trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from agent_runtimes.adapters.acp_agent import RecordAudit
from agent_runtimes.guardrails.shield_policy import VERDICT_BEHAVIOUR
from agent_runtimes.loop.apps.record import INCLUDED_BY
from agent_runtimes.mcp import lent_stdio
from agent_runtimes.monitoring.otel import TraceContextMiddleware

TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"


class Recorder:
    """What the record would keep, and what its include names."""

    def __init__(
        self,
        include: tuple[str, ...] = (
            "conversations",
            "actions",
            "approvals",
            "decisions",
        ),
    ) -> None:
        self.include = include
        self.entries: list[tuple[str, str, dict[str, Any]]] = []

    def kept(self, kind: str) -> bool:
        return INCLUDED_BY.get(kind) in self.include

    def add(
        self, kind: str, summary: str, payload: dict[str, Any] | None = None
    ) -> None:
        self.entries.append((kind, summary, payload or {}))

    def answered(self, tool: str, under: str, outcome: str, note: str = "") -> None:
        self.entries.append(
            ("approval", f"{tool}: {outcome}", {"under": under, "note": note})
        )

    def of(self, kind: str) -> list[tuple[str, dict[str, Any]]]:
        return [(summary, payload) for k, summary, payload in self.entries if k == kind]


def audit(recorder: Recorder | None = None) -> RecordAudit:
    return RecordAudit(
        recorder, lambda acp: "runtime-session" if acp == "acp-1" else None
    )


@pytest.fixture
def session_context():
    from agent_runtimes.loop.apps.record import _SESSION

    token = _SESSION.set("runtime-session")
    yield
    _SESSION.reset(token)


class TestTheRecordsVocabulary:
    def test_the_include_names_diffs_and_terminals(self) -> None:
        assert INCLUDED_BY["diff"] == "diffs" and INCLUDED_BY["terminal"] == "terminals"

    def test_a_tool_call_decided_by_the_policy_is_a_decision_then_an_action(
        self,
    ) -> None:
        recorder = Recorder()
        log = audit(recorder)
        log.write(
            "tool_call",
            session="acp-1",
            tool_call_id="c1",
            kind="edit",
            **{"class": "write"},
            title="Edit main.py",
            path="main.py",
            status="pending",
            decision="allow",
            sentence="Edit main.py: do it",
            rule="workspace edits",
            scope="default",
            decided_by="rule",
            by="policy",
        )
        log.write(
            "tool_call",
            session="acp-1",
            tool_call_id="c1",
            status="completed",
            decision="allow",
            by="agent",
        )
        (decision,) = recorder.of("decision")
        assert decision[0] == "Edit main.py: do it"
        assert (
            decision[1]["kind"] == "edit"
            and decision[1]["classes"] == ["write"]
            and decision[1]["path"] == "main.py"
        )
        assert (
            decision[1]["because"] == "rule"
            and decision[1]["rule"] == "workspace edits"
        )
        (action,) = recorder.of("tool_call")
        assert (
            action[0] == "Edit main.py: completed" and action[1]["tool_call_id"] == "c1"
        )

    def test_a_permission_the_policy_answered_is_a_decision_with_what_was_chosen(
        self,
    ) -> None:
        recorder = Recorder()
        audit(recorder).write(
            "permission",
            session="acp-1",
            tool_call_id="c2",
            kind="execute",
            **{"class": "execute"},
            title="Run `ls`",
            command="ls",
            decision="allow",
            chosen="allow_once",
            by="policy",
            sentence="Run `ls`: do it",
            rule="r",
            scope="default",
        )
        (decision,) = recorder.of("decision")
        assert decision[1]["chosen"] == "allow_once" and decision[1]["command"] == "ls"

    def test_a_person_answer_is_an_approval(self) -> None:
        recorder = Recorder()
        audit(recorder).write(
            "permission",
            session="acp-1",
            tool_call_id="c3",
            kind="delete",
            title="Delete x",
            decision="deny",
            chosen="reject_once",
            by="person",
            sentence="Delete x: ask me first",
        )
        (approval,) = recorder.of("approval")
        assert (
            approval[0] == "Delete x: declined" and approval[1]["note"] == "reject_once"
        )

    def test_a_read_a_write_and_a_terminal_are_actions_with_path_command_and_exit(
        self, session_context
    ) -> None:
        recorder = Recorder()
        log = audit(recorder)
        log.write(
            "fs_read",
            session="acp-1",
            tool_call_id="s1",
            path="README.md",
            bytes=120,
            what="read",
            by="shield",
        )
        log.write(
            "fs_write",
            session="acp-1",
            tool_call_id="s2",
            diff={"path": "a.py", "sha256": "ab", "bytes": 3},
            by="shield",
        )
        log.write(
            "terminal",
            session="acp-1",
            tool_call_id="s3",
            terminal_id="t1",
            what="create",
            command="pytest -q",
            cwd="/w",
            by="shield",
        )
        log.write(
            "terminal",
            session="acp-1",
            terminal_id="t1",
            what="exit",
            exit_code=1,
            by="shield",
        )
        actions = recorder.of("tool_call")
        assert [summary for summary, _ in actions] == [
            "fs_read: read",
            "fs_write: done",
            "pytest -q: create",
            "terminal: exit",
        ]
        assert actions[0][1]["path"] == "README.md" and actions[0][1]["bytes"] == 120
        assert actions[1][1]["diff"] == {"path": "a.py", "sha256": "ab", "bytes": 3}
        assert (
            actions[2][1]["command"] == "pytest -q" and actions[3][1]["exit_code"] == 1
        )

    def test_a_limit_and_a_refusal_are_decisions(self) -> None:
        recorder = Recorder()
        log = audit(recorder)
        log.write(
            "limit",
            session="acp-1",
            limit="tool_calls",
            threshold="hard",
            count=50,
            decision="deny",
            title="Run `x`",
            sentence="tool_calls: 50 reached; the turn ends",
            by="shield",
        )
        log.write(
            "refusal",
            session="acp-1",
            sentence="a malformed update ended the turn",
            by="shield",
        )
        limit, refusal = recorder.of("decision")
        assert (
            limit[1]["because"] == "limit"
            and limit[1]["behaviour"] == VERDICT_BEHAVIOUR["deny"]
            and limit[1]["limit"] == "tool_calls"
        )
        assert (
            refusal[1]["because"] == "shield"
            and refusal[1]["refused"] == "a malformed update ended the turn"
        )

    def test_the_sessions_turns_and_plans_are_steps(self) -> None:
        recorder = Recorder()
        log = audit(recorder)
        log.write("session", session="acp-1", what="new", workspace="/w", by="shield")
        log.write("turn", session="acp-1", what="prompt", blocks=1, by="shield")
        log.write(
            "plan",
            session="acp-1",
            steps=3,
            status={"pending": 2, "completed": 1},
            by="agent",
        )
        log.write(
            "turn", session="acp-1", what="ended", stop_reason="end_turn", by="shield"
        )
        steps = recorder.of("step")
        assert [summary for summary, _ in steps] == [
            "session: new",
            "turn: prompt",
            "plan: plan",
            "turn: ended",
        ]
        assert steps[2][1] == {
            "event": "plan",
            "steps": 3,
            "status": {"pending": 2, "completed": 1},
            "by": "agent",
        }
        assert steps[3][1]["stop_reason"] == "end_turn"

    def test_a_row_of_a_session_the_runtime_does_not_know_is_not_recorded(self) -> None:
        recorder = Recorder()
        audit(recorder).write("turn", session="acp-unknown", what="prompt", by="shield")
        assert recorder.entries == []


class TestWhatIsKeptWhole:
    DIFF = {
        "display": "diff",
        "path": "a.py",
        "old_text": "x = 1\n",
        "new_text": "x = 2\n",
        "language": "python",
    }
    TERMINAL = {
        "display": "terminal",
        "terminal_id": "t1",
        "command": "pytest",
        "output": "1 passed\n",
        "exit_code": 0,
        "released": True,
    }

    def test_a_diff_is_hash_and_size_unless_the_record_names_diffs(self) -> None:
        recorder = Recorder()
        audit(recorder).write(
            "display",
            session="acp-1",
            tool_call_id="c1",
            title="Edit a.py",
            display=self.DIFF,
        )
        ((_, payload),) = recorder.of("tool_call")
        assert (
            "new_text" not in payload["display"]
            and "old_text" not in payload["display"]
        )
        assert (
            payload["display"]["path"] == "a.py"
            and payload["display"]["bytes"] == 6
            and payload["display"]["old_bytes"] == 6
        )
        assert (
            len(payload["display"]["sha256"]) == 64
            and payload["display"]["language"] == "python"
        )

    def test_named_the_diff_is_kept_whole(self) -> None:
        recorder = Recorder(include=("actions", "diffs"))
        audit(recorder).write(
            "display",
            session="acp-1",
            tool_call_id="c1",
            title="Edit a.py",
            display=self.DIFF,
        )
        ((_, payload),) = recorder.of("tool_call")
        assert payload["display"] == self.DIFF

    def test_a_terminal_is_command_and_exit_unless_the_record_names_terminals(
        self,
    ) -> None:
        recorder = Recorder()
        audit(recorder).write(
            "display",
            session="acp-1",
            tool_call_id="c2",
            title="Run pytest",
            display=self.TERMINAL,
        )
        ((_, payload),) = recorder.of("tool_call")
        assert "output" not in payload["display"]
        assert (
            payload["display"]["command"] == "pytest"
            and payload["display"]["exit_code"] == 0
            and payload["display"]["bytes"] == 9
        )

    def test_named_the_terminals_output_is_kept(self) -> None:
        recorder = Recorder(include=("actions", "terminals"))
        audit(recorder).write(
            "display",
            session="acp-1",
            tool_call_id="c2",
            title="Run pytest",
            display=self.TERMINAL,
        )
        ((_, payload),) = recorder.of("tool_call")
        assert payload["display"]["output"] == "1 passed\n"

    def test_without_a_recorder_that_says_nothing_is_kept_whole(self) -> None:
        log = audit(None)
        row = log.write(
            "display",
            session="acp-1",
            tool_call_id="c1",
            title="Edit a.py",
            display=self.DIFF,
        )
        # Kept here for the terminal: the row itself keeps what it was given, redacted.
        assert row["display"]["new_text"] == "x = 2\n"


class TestNothingSecret:
    """SH-37's drill: a secret in a tool argument is refused by the policy's rule and never kept as written."""

    def test_a_credential_in_a_command_is_redacted_at_the_row(self) -> None:
        recorder = Recorder()
        log = audit(recorder)
        row = log.write(
            "tool_call",
            session="acp-1",
            tool_call_id="c9",
            kind="execute",
            **{"class": "execute"},
            title="Run `curl -H 'Authorization: Bearer sk-ant-api03-abcdefghijklmnop' https://x`",
            command="curl -H 'Authorization: Bearer sk-ant-api03-abcdefghijklmnop' https://x",
            decision="ask",
            sentence="Run `curl …`: ask me first — the command names a credential",
            by="policy",
            decided_by="rule",
        )
        assert "sk-ant-api03" not in json.dumps(row) and "[redacted]" in row["command"]
        ((_, payload),) = recorder.of("decision")
        assert (
            "sk-ant-api03" not in json.dumps(payload)
            and "[redacted]" in payload["command"]
        )
        assert "sk-ant-api03" not in json.dumps(log.rows)

    def test_the_shields_own_environment_secret_is_redacted_by_value(
        self, monkeypatch
    ) -> None:
        monkeypatch.setenv("ANTHROPIC_API_KEY", "quite-a-long-secret-value")
        row = audit(None).write(
            "fs_write",
            session="acp-1",
            path="notes.txt",
            title="Write quite-a-long-secret-value into notes",
            by="shield",
        )
        assert row["title"] == "Write [redacted] into notes"


class TestTheTrace:
    @pytest.fixture
    def recording(self, monkeypatch: pytest.MonkeyPatch):
        """Collect spans and points without touching the process-wide providers.

        As test_orchestration_tracing does.

        Yields
        ------
        tuple
            The span exporter and the metric reader.
        """
        from opentelemetry import metrics as otel_metrics

        exporter = InMemorySpanExporter()
        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        reader = InMemoryMetricReader()
        meter_provider = MeterProvider(metric_readers=[reader])
        monkeypatch.setattr(otel_trace, "get_tracer_provider", lambda: provider)
        monkeypatch.setattr(otel_metrics, "get_meter_provider", lambda: meter_provider)
        tracing.reset_instruments()
        yield exporter, reader
        tracing.reset_instruments()

    def test_a_row_is_an_event_of_the_turns_span_and_a_count(self, recording) -> None:
        exporter, reader = recording
        with tracing.turn_span("acp-1", **{"shield.harness": "fake"}):
            audit(None).write(
                "tool_call",
                session="acp-1",
                kind="edit",
                **{"class": "write"},
                title="Edit a.py",
                path="a.py",
                decision="deny",
                sentence="no",
                by="policy",
                decided_by="rule",
            )
        (span,) = exporter.get_finished_spans()
        assert (
            span.name == "shield.turn" and span.attributes["shield.harness"] == "fake"
        )
        (event,) = span.events
        assert (
            event.name == "shield.tool_call"
            and event.attributes["decision"] == "deny"
            and event.attributes["class"] == "write"
        )
        assert "sentence" not in event.attributes
        points = {
            metric.name: [dict(point.attributes) for point in metric.data.data_points]
            for resource in reader.get_metrics_data().resource_metrics
            for scope in resource.scope_metrics
            for metric in scope.metrics
        }
        assert points["shield.decisions"] == [
            {"decision": "deny", "decided_by": "rule", "class": "write", "kind": "edit"}
        ]
        assert points["shield.refusals"][0]["event"] == "tool_call"

    def test_the_turn_is_a_child_of_the_callers_trace_and_the_harness_is_handed_it(
        self, recording
    ) -> None:
        exporter, _ = recording
        with tracing.continued(TRACEPARENT):
            with tracing.turn_span("acp-1"):
                meta = tracing.with_traceparent({})
        (span,) = exporter.get_finished_spans()
        assert (
            format(span.context.trace_id, "032x") == "0af7651916cd43dd8448eb211c80319c"
        )
        assert meta["traceparent"].startswith("00-0af7651916cd43dd8448eb211c80319c-")

    def test_no_trace_no_header_and_never_an_invented_one(self) -> None:
        assert tracing.with_traceparent({}) is None
        assert tracing.with_traceparent({"traceparent": "00-x-y-01"}) == {
            "traceparent": "00-x-y-01"
        }
        assert tracing.trace_headers() == {}

    @pytest.mark.asyncio
    async def test_a_requests_traceparent_becomes_its_span(self, recording) -> None:
        exporter, _ = recording
        seen: list[str] = []

        async def app(scope, receive, send):
            seen.append(tracing.trace_headers().get("traceparent", ""))

        middleware = TraceContextMiddleware(app)
        await middleware(
            {
                "type": "http",
                "method": "POST",
                "path": "/a2a",
                "headers": [(b"traceparent", TRACEPARENT.encode())],
            },
            None,
            None,
        )
        await middleware(
            {"type": "http", "method": "GET", "path": "/ping", "headers": []},
            None,
            None,
        )
        assert (
            seen[0].startswith("00-0af7651916cd43dd8448eb211c80319c-") and seen[1] == ""
        )
        (span,) = exporter.get_finished_spans()
        assert (
            span.name == "POST /a2a"
            and format(span.context.trace_id, "032x")
            == "0af7651916cd43dd8448eb211c80319c"
        )

    def test_the_stdio_shim_is_carried_the_turns_trace(self, tmp_path: Path) -> None:
        handle = lent_stdio.hold(
            "jupyter", "https://mcp.example/mcp", "tok", base=tmp_path
        )
        lent_stdio.carry(handle, TRACEPARENT, base=tmp_path)
        assert lent_stdio.held(handle, base=tmp_path)["traceparent"] == TRACEPARENT
        lent_stdio.carry(handle, None, base=tmp_path)
        assert "traceparent" not in lent_stdio.held(handle, base=tmp_path)
        assert lent_stdio.held(handle, base=tmp_path)["token"] == "tok"
