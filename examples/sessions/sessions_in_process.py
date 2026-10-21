#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A session's life, on an in-process runtime: open, swap, clone, export, import.

The runtime's own routes, in this process, on an application whose agent is
a model that answers what it was told (no key, nothing running); the
sessions kept in a file store of this run's own. What a person does on the
web or with `loop sessions` is done here over the session API::

    python sessions_in_process.py

Against Datalayer, the same verbs are `loop sessions … --cloud --server <the
deployment's runtime>`; the session id is the same in both because the record
is one.

The swap binds another agent to the session's agent through
`configure-from-spec` on a real runtime; here, with no model, a stand-in
re-registers the agent with a second answering model, so the swap's own
work — the refusals, the sentence, the record's row — is the runtime's.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, AsyncIterator, Dict, List

os.environ.setdefault("AGENT_RUNTIMES_SESSION_STORE", "file")
os.environ.setdefault(
    "AGENT_RUNTIMES_SESSIONS_PATH", tempfile.mkdtemp(prefix="sessions-example-")
)

from fastapi.testclient import TestClient  # noqa: E402
from pydantic_ai import Agent  # noqa: E402
from pydantic_ai.messages import (  # noqa: E402
    ModelMessage,
    ModelResponse,
    TextPart,
    UserPromptPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel  # noqa: E402

from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter  # noqa: E402
from agent_runtimes.app import create_app  # noqa: E402
from agent_runtimes.loop.apps import (  # noqa: E402
    opening,
    plugins,
    principal,
    sessions,
)
from agent_runtimes.loop.apps.agent import app_capabilities  # noqa: E402
from agent_runtimes.loop.apps.loading import load_app  # noqa: E402
from agent_runtimes.loop.apps.record import (
    AppRecorder,
    keep_agent_recorder,
    send_to_store,
)  # noqa: E402
from agent_runtimes.routes import agents as agent_routes  # noqa: E402
from agent_runtimes.routes import apps as app_routes  # noqa: E402
from agent_runtimes.routes.agui import register_agui_agent  # noqa: E402
from agent_runtimes.transports import AGUITransport  # noqa: E402

#: The application: a chat, its conversations kept.
NOTES: Dict[str, Any] = {
    "schema": "loop.app/v1",
    "id": "notes",
    "name": "Notes",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "record": {
        "keep_for": "30_days",
        "include": ["conversations", "actions", "outputs"],
    },
}
AGENT = "notes"
HEADERS = {"Authorization": "Bearer ada"}


class Answers:
    """A model that answers in its own voice what it was last told."""

    def __init__(self, voice: str) -> None:
        self.voice = voice

    def said(self, messages: List[ModelMessage]) -> str:
        asked = [
            part.content
            for message in messages
            for part in getattr(message, "parts", [])
            if isinstance(part, UserPromptPart) and isinstance(part.content, str)
        ]
        return f"{self.voice}: {asked[-1].splitlines()[0] if asked else ''}"

    def __call__(self, messages: List[ModelMessage], info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[TextPart(self.said(messages))])

    async def stream(
        self, messages: List[ModelMessage], info: AgentInfo
    ) -> AsyncIterator[str]:
        """A run streams: the answer in two pieces, as a model's would come."""
        text = self.said(messages)
        yield text[:5]
        yield text[5:]


def bind(voice: str, spec_id: str) -> None:
    """Register the application's agent with a model, as the create route does."""
    app = load_app(NOTES)
    plugins.register_app(app)
    recorder = AppRecorder(app=app, app_uid="app-notes", version=1, send=send_to_store)
    model = Answers(voice)
    agent = Agent(
        FunctionModel(model, stream_function=model.stream),
        capabilities=app_capabilities(app, recorder=recorder, agent_id=AGENT),
    )
    register_agui_agent(
        AGENT, AGUITransport(PydanticAIAdapter(agent, agent_id=AGENT), agent_id=AGENT)
    )
    agent_routes._agentspecs[AGENT] = {
        "agent_spec_id": spec_id,
        "app_spec": NOTES,
        "app_instance": {"app_uid": "app-notes", "version": 1},
    }
    keep_agent_recorder(AGENT, recorder)


class Verifier:
    """Every token is the person it names."""

    async def verify(self, token: str, app_uid: str = "") -> Any:
        from agent_runtimes.loop.apps.callers import Caller

        return Caller(kind="person", uid=token)


async def _everybody(deployment: str, bearer: str) -> Any:
    return 200, ""


async def _preview_token(app_uid: str, grants: Any, bearer: Any) -> Dict[str, Any]:
    """A Preview's own token, narrowed by the platform on a real runtime; nothing to narrow here."""
    return {"access_token": "ada-preview", "expires_in": 3600}


async def _rebind(live: Any, agent: str, request: Any) -> None:
    """The stand-in for configure-from-spec: the second model answers from here."""
    bind("Second", agent)


def another_agent() -> str:
    """A framework agentspec of the library to swap to: no key, no policy to pull for a harness."""
    from agent_runtimes.specs.agents.agents import list_agentspecs

    return next(
        spec.id
        for spec in list_agentspecs()
        if spec.harness in ("pydantic-ai", "vercel-ai")
    )


def events_of(text: str) -> List[Dict[str, Any]]:
    found = []
    for block in text.split("\n\n"):
        data = "".join(
            line[5:].strip() for line in block.splitlines() if line.startswith("data:")
        )
        if data:
            found.append(json.loads(data))
    return found


def answer_of(text: str) -> str:
    return "".join(
        str(e.get("delta") or "")
        for e in events_of(text)
        if e.get("type") == "TEXT_MESSAGE_CONTENT"
    )


def main() -> int:
    app_routes.VERIFIER = Verifier()  # type: ignore[assignment]
    opening.use_opener(_everybody)
    principal.use_preview_asker(_preview_token)
    sessions.use_rebinder(_rebind)
    bind("Claude", "notes-claude")
    with TestClient(create_app(), client=("10.0.0.4", 50000)) as client:
        base = "/api/v1/apps/sessions"
        opened = client.post(
            base,
            headers=HEADERS,
            json={
                "agent": AGENT,
                "app_uid": "app-notes",
                "version": 1,
                "opener": "Plan the refactor",
            },
        )
        uid = events_of(opened.text)[0]["value"]["uid"]
        print(f"opened     {uid}: {answer_of(opened.text)}")
        second = client.post(
            f"{base}/{uid}/messages",
            headers=HEADERS,
            json={"text": "Start with the tests"},
        )
        print(f"turn 2     {answer_of(second.text)}")

        target = another_agent()
        swapped = client.post(
            f"{base}/{uid}/agent", headers=HEADERS, json={"agent": target}
        )
        if swapped.status_code != 200:
            print(f"refused    {swapped.json().get('detail')}")
            return 1
        swapped = swapped.json()
        print(f'swapped    {swapped["agent"]} is told: "{swapped["said"]}"')
        third = client.post(
            f"{base}/{uid}/messages", headers=HEADERS, json={"text": "Go on"}
        )
        print(f"turn 3     {answer_of(third.text)}")

        clone = client.post(
            f"{base}/{uid}/clone",
            headers=HEADERS,
            json={"up_to_turn": 1, "title": "Before the tests"},
        ).json()
        print(
            f"cloned     {clone['uid']} ({clone['state']}, {clone['turns']} turn, from {clone['lineage']['forked_from']['uid']} at turn 1)"
        )
        refused = client.post(
            f"{base}/{uid}/clone", headers=HEADERS, json={"up_to_turn": 9}
        ).json()
        print(f"refused    {refused['detail']}")

        exported = client.get(f"{base}/{uid}/export", headers=HEADERS)
        head = json.loads(exported.text.split("\n", 1)[0])
        out = Path(os.environ["AGENT_RUNTIMES_SESSIONS_PATH"]) / f"{uid}.session.jsonl"
        out.write_text(exported.text, encoding="utf-8")
        print(
            f"exported   {head['turns']} turns, {head['entries']} entries, {head['redactions']} redactions → {out.name}"
        )

        imported = client.post(
            f"{base}/import?agent={AGENT}",
            headers={**HEADERS, "Content-Type": "application/x-ndjson"},
            content=exported.text,
        ).json()
        print(
            f"imported   {imported['uid']} ({imported['state']}, {imported['turns']} turns, from {imported['lineage']['imported_from']['digest'][:19]}…)"
        )
        resumed = client.post(
            f"{base}/{imported['uid']}/resume", headers=HEADERS, json={"agent": AGENT}
        )
        replayed = sum(
            1
            for e in events_of(resumed.text)
            if e.get("type") == "MESSAGES_SNAPSHOT"
            for m in e["messages"]
            if m["role"] == "user"
        )
        print(f"resumed    {imported['uid']}: {replayed} turns replayed")

        listed = client.get(f"{base}?limit=10", headers=HEADERS).json()
        for session in listed["sessions"]:
            lineage = session.get("lineage") or {}
            said = (
                f"cloned from {lineage['forked_from']['uid']}"
                if lineage.get("forked_from")
                else "imported"
                if lineage.get("imported_from")
                else ""
            )
            print(
                f"listed     {session['uid']}  {session['state']:<6} {session['agent']}  {session['turns']} turns  {said}"
            )
        ended = client.post(f"{base}/{uid}/end", headers=HEADERS).json()
        print(f"ended      {ended['uid']} ({ended['state']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
