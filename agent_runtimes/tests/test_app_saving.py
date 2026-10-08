# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Approve and save (LOOP R-24).

An application granted a Space to write is given `save_to_space`; the call is
always asked — the whole text shown — whatever its rules say short of
*Leave it to me*, and never passed by an approval given in advance; approved,
the result is written as an editable page of the Space and its link answered;
declined, nothing is written; a retry under the same key is one page.
"""

from typing import Any, Dict, List

import httpx
import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.loop.apps.agent import app_capabilities
from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError, sentence_of
from agent_runtimes.loop.apps.plugins import rules_for
from agent_runtimes.loop.apps.record import _SESSION, AppRecorder
from agent_runtimes.loop.apps.rules import UNCLASSED
from agent_runtimes.loop.apps.saving import (
    APPROVE_AND_SAVE,
    DRAFT_LIMIT,
    SAVE_TOOL,
    SPACE_NOT_GRANTED,
    AppSavingCapability,
    NotSaved,
    authorship,
    byline,
    idempotency_key,
    link_of,
    not_granted,
    saves,
    writable_spaces,
    write_on_spacer,
)
from agent_runtimes.orchestration.documents import markdown_document
from agent_runtimes.types import AppSpec

DIGEST = "## This week\n\n- Three releases\n- One incident\n\nNothing else."


def digest(
    spaces: List[Dict[str, str]] | None = None, rules: List[Any] | None = None
) -> AppSpec:
    return AppSpec.model_validate(
        {
            "id": "weekly-digest",
            "name": "Weekly Digest",
            "kind": "worker",
            "agent": "cog-crawler:0.0.1",
            "permissions": {
                "spaces": spaces
                if spaces is not None
                else [
                    {"space": "sp-wiki", "access": "read"},
                    {"space": "sp-notes", "access": "write"},
                    {"space": "sp-notes", "access": "write"},
                    {"space": "sp-reports", "access": "write"},
                ]
            },
            "rules": rules or [],
        }
    )


class Written:
    def __init__(self, fail: int = 0) -> None:
        self.calls: List[tuple] = []
        self.pages: Dict[str, str] = {}
        self.fail = fail

    async def __call__(
        self,
        space: str,
        title: str,
        state: Dict[str, Any],
        key: str,
        about: Dict[str, Any],
    ):
        self.calls.append((space, title, state, key))
        self.about = about
        uid = self.pages.setdefault(key, f"doc-{len(self.pages) + 1}")
        if self.fail:
            self.fail -= 1
            raise NotSaved("Spacer did not answer in time.")
        return {
            "document": {"uid": uid},
            "space": {"uid": space, "handle_s": "notes", "owner_handle_s": "eric"},
        }


def test_it_saves_only_in_the_spaces_it_may_write() -> None:
    assert writable_spaces(digest()) == ["sp-notes", "sp-reports"]
    assert not saves(digest([{"space": "sp-wiki", "access": "read"}]))
    recorder = AppRecorder(app=digest())
    assert any(
        isinstance(c, AppSavingCapability)
        for c in app_capabilities(digest(), recorder=recorder)
    )
    plain = digest([])
    assert not any(
        isinstance(c, AppSavingCapability)
        for c in app_capabilities(plain, recorder=AppRecorder(app=plain))
    )


def test_a_save_is_always_asked_and_only_leave_it_to_me_refuses_it() -> None:
    allowed = rules_for(
        digest(
            rules=[{"action": "Write", "applies_to": ["write"], "behaviour": "do_it"}]
        )
    ).decide(SAVE_TOOL, {"title": "t", "content": "c"})
    assert (allowed.decision.behaviour, allowed.decision.because) == (
        "ask_first",
        APPROVE_AND_SAVE,
    )
    assert "Approve and save, or Decline" in sentence_of(allowed.decision)
    in_advance = rules_for(
        digest(
            rules=[
                {"action": "Write", "applies_to": ["write"], "behaviour": "if_asked"}
            ]
        )
    ).decide(SAVE_TOOL, {})
    assert in_advance.decision.behaviour == "ask_first"
    never = rules_for(
        digest(
            rules=[
                {"action": "Write", "applies_to": ["write"], "behaviour": "leave_to_me"}
            ]
        )
    ).decide(SAVE_TOOL, {})
    assert never.decision.behaviour == "leave_to_me"
    # Granted no Space to write, it is nobody's tool.
    assert rules_for(digest([])).decide(SAVE_TOOL, {}).decision.because == UNCLASSED


def _run(app: AppSpec, capability: AppSavingCapability, ask) -> tuple[Agent, List[str]]:
    returned: List[str] = []
    calls = iter(
        [ToolCallPart(SAVE_TOOL, {"title": "Weekly digest", "content": DIGEST})]
    )

    def model(messages: list, info: AgentInfo) -> ModelResponse:
        last = messages[-1].parts[-1]
        if getattr(last, "part_kind", "") == "tool-return":
            returned.append(str(last.content))
        call = next(calls, None)
        return ModelResponse(parts=[call] if call else [TextPart("Done.")])

    rules = rules_for(app)
    rules.ask = ask
    return Agent(FunctionModel(model), capabilities=[rules, capability]), returned


async def test_approved_it_is_saved_as_a_page_of_the_space_and_its_link_answered() -> (
    None
):
    asked: List[tuple] = []

    async def ask(tool: str, args: Dict[str, Any], decision: Any) -> None:
        asked.append((tool, dict(args), decision.behaviour))

    written = Written()
    app = digest()
    agent, returned = _run(
        app, AppSavingCapability(app=app, app_uid="app-1", write=written), ask
    )
    await agent.run("Save this week's digest.")
    # Shown first, whole.
    assert asked == [
        (
            SAVE_TOOL,
            {"title": "Weekly digest", "content": DIGEST, "space": ""},
            "ask_first",
        )
    ]
    [(space, title, state, key)] = written.calls
    assert (space, title) == ("sp-notes", "Weekly digest")
    # Its byline closes the page (I-10).
    assert state == markdown_document(
        "Weekly digest", DIGEST + "\n\n*Written by 👀 Weekly Digest.*"
    )
    assert written.about["app"] == {
        "id": "weekly-digest",
        "uid": "app-1",
        "name": "Weekly Digest",
        "emoji": "👀",
    }
    assert key.startswith("loop:app-1:")
    assert returned == ["Saved as “Weekly digest”: /eric/notes/documents/doc-1"]


async def test_declined_nothing_is_kept() -> None:
    async def decline(tool: str, args: Dict[str, Any], decision: Any) -> None:
        raise AppRuleBlockedError(decision, "Declined.")

    written = Written()
    app = digest()
    agent, _ = _run(
        app, AppSavingCapability(app=app, app_uid="app-1", write=written), decline
    )
    with pytest.raises(AppRuleBlockedError, match="Declined"):
        await agent.run("Save this week's digest.")
    assert written.calls == []


async def test_a_retry_after_a_failure_is_the_same_page() -> None:
    written = Written(fail=1)
    saving = AppSavingCapability(app=digest(), app_uid="app-1", write=written)
    failed = await saving.save_to_space("Weekly digest", DIGEST)
    assert failed.startswith(
        "It was approved, but not saved: Spacer did not answer in time."
    )
    again = await saving.save_to_space("Weekly digest", DIGEST)
    assert again.endswith("/eric/notes/documents/doc-1")
    assert written.calls[0][3] == written.calls[1][3] and len(written.pages) == 1
    # Something else saved is another page.
    other = await saving.save_to_space("Weekly digest", DIGEST + "\n\nOne more.")
    assert other.endswith("doc-2")


async def test_what_cannot_be_saved_is_said_to_the_model() -> None:
    saving = AppSavingCapability(app=digest(), app_uid="app-1", write=Written())
    assert "only in sp-notes, sp-reports" in await saving.save_to_space(
        "t", "c", space="sp-wiki"
    )
    assert (await saving.save_to_space("t", "c", space="sp-reports")).startswith(
        "Saved"
    )
    assert "title and the whole text" in await saving.save_to_space(" ", "c")
    assert "at most 20,000" in await saving.save_to_space("t", "x" * (DRAFT_LIMIT + 1))
    nothing = AppSavingCapability(app=digest([]), write=Written())
    assert "No Space is granted" in await nothing.save_to_space("t", "c")
    assert nothing.get_toolset() is None


def test_the_key_and_the_link() -> None:
    key = idempotency_key("app-1", "s-1", "sp-notes", "T", "body")
    assert key == idempotency_key("app-1", "s-1", "sp-notes", "T", "body")
    assert key != idempotency_key("app-1", "s-2", "sp-notes", "T", "body")
    assert key != idempotency_key("app-1", "s-1", "sp-reports", "T", "body")
    assert (
        link_of({"owner_handle_s": "eric", "handle_s": "my notes"}, "d 1")
        == "/eric/my%20notes/documents/d%201"
    )
    assert link_of({}, "d1") == "/documents/d1"


async def test_it_writes_through_spacer_under_its_key(monkeypatch) -> None:
    from datalayer_core.utils import urls

    seen: List[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.method == "GET":
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "space": {"uid": "sp-notes", "handle_s": "notes"},
                },
            )
        return httpx.Response(201, json={"success": True, "document": {"uid": "doc-9"}})

    real = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **k: real(*a, transport=httpx.MockTransport(answer), **k),
    )
    monkeypatch.setenv("DATALAYER_SPACER_URL", "https://spacer.test")
    assert urls.DatalayerURLs.from_environment().spacer_url == "https://spacer.test"
    written = await write_on_spacer(
        "sp-notes", "T", {"root": {}}, "loop:k", {"saved_by": "loop.app"}, token="tok"
    )
    assert written["document"]["uid"] == "doc-9"
    assert seen[0].url.path == "/api/spacer/v1/spaces/sp-notes"
    post = seen[1]
    assert post.headers["Authorization"] == "Bearer tok"
    body = post.content.decode()
    assert 'name="idempotencyKey"' in body and "loop:k" in body
    assert 'name="documentType"' in body and "lexical" in body
    # Who wrote it, in the document's metadata (I-10).
    assert 'name="metadata"' in body and "loop.app" in body


async def test_a_refusal_of_spacer_is_said(monkeypatch) -> None:
    def answer(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(
                403, json={"detail": "Not authorized to access this space."}
            )
        raise AssertionError("nothing is written")

    real = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **k: real(*a, transport=httpx.MockTransport(answer), **k),
    )
    monkeypatch.setenv("DATALAYER_SPACER_URL", "https://spacer.test")
    with pytest.raises(
        NotSaved, match="the Space sp-notes cannot be reached: Not authorized"
    ):
        await write_on_spacer("sp-notes", "T", {}, "k", {}, token="tok")


async def test_on_a_deployment_it_saves_as_its_principal(monkeypatch) -> None:
    from agent_runtimes.loop.apps import principal, saving

    monkeypatch.setattr(
        principal, "principal_token", lambda d: "p-token" if d == "dep-1" else None
    )
    tokens: List[str] = []

    async def write(space, title, state, key, about, *, token):
        tokens.append(token)
        return {"document": {"uid": "doc-1"}, "space": {}}

    monkeypatch.setattr(saving, "write_on_spacer", write)
    said = await AppSavingCapability(
        app=digest(), app_uid="app-1", deployment_uid="dep-1"
    ).save_to_space("T", "c")
    assert tokens == ["p-token"] and said == "Saved as “T”: /documents/doc-1"


# What it writes says who wrote it (LOOP I-10).


def test_its_byline_carries_its_face_and_says_when_it_wrote_on_its_own() -> None:
    app = digest().model_copy(update={"emoji": "📬"})
    assert byline(app, on_its_own=False) == "*Written by 📬 Weekly Digest.*"
    assert byline(app, on_its_own=True) == "*Written by 📬 Weekly Digest, on its own.*"
    # Until its builder chooses one, its face is the eyes.
    assert byline(digest(), on_its_own=False) == "*Written by 👀 Weekly Digest.*"


def test_the_page_names_the_application_and_the_person_it_acted_for() -> None:
    app = digest().model_copy(update={"emoji": "📬"})
    assert authorship(
        app,
        app_uid="app-1",
        deployment_uid="dep-1",
        person_uid="u-eric",
        on_its_own=False,
        session="s-1",
    ) == {
        "saved_by": "loop.app",
        "app": {
            "id": "weekly-digest",
            "uid": "app-1",
            "name": "Weekly Digest",
            "emoji": "📬",
        },
        "deployment": "dep-1",
        "for": "u-eric",
        "on_its_own": False,
        "session": "s-1",
    }


async def test_a_save_says_who_it_was_for_or_that_nobody_was_there() -> None:
    from agent_runtimes.loop.apps.record import _SESSION

    written = Written()
    saving = AppSavingCapability(
        app=digest(),
        app_uid="app-1",
        deployment_uid="dep-1",
        write=written,
        person=lambda session: "u-eric" if session == "s-1" else "",
        woken=lambda session: {"trigger": "weekly"} if session == "s-2" else {},
    )
    token = _SESSION.set("s-1")
    try:
        await saving.save_to_space("Weekly digest", DIGEST)
    finally:
        _SESSION.reset(token)
    assert (written.about["for"], written.about["on_its_own"]) == ("u-eric", False)
    assert written.about["session"] == "s-1"
    assert written.about["deployment"] == "dep-1"
    token = _SESSION.set("s-2")
    try:
        await saving.save_to_space("Weekly digest", DIGEST)
    finally:
        _SESSION.reset(token)
    assert (written.about["for"], written.about["on_its_own"]) == ("", True)
    page = written.calls[-1][2]
    assert page == markdown_document(
        "Weekly digest", DIGEST + "\n\n*Written by 👀 Weekly Digest, on its own.*"
    )


def test_its_capability_knows_who_opened_each_session() -> None:
    recorder = AppRecorder(app=digest())
    [saving] = [
        c
        for c in app_capabilities(digest(), recorder=recorder)
        if isinstance(c, AppSavingCapability)
    ]
    recorder.opened("s-1", "u-eric")
    assert saving.person is not None and saving.person("s-1") == "u-eric"
    assert saving.woken is not None and not saving.woken("s-1")


async def test_a_space_not_granted_is_refused_before_anybody_is_asked() -> None:
    """LOOP R-25: the grant is read before the person is asked, not after."""
    app = digest()
    decided = rules_for(app).decide(
        SAVE_TOOL, {"title": "t", "content": "c", "space": "sp-wiki"}
    )
    assert (decided.decision.behaviour, decided.decision.because) == (
        "do_it",
        SPACE_NOT_GRANTED,
    )
    assert "not granted to write" in sentence_of(decided.decision)
    # A Space granted, or none named, is still asked.
    for space in ("sp-reports", ""):
        assert (
            rules_for(app)
            .decide(SAVE_TOOL, {"title": "t", "content": "c", "space": space})
            .decision.because
            == APPROVE_AND_SAVE
        )
    # *Leave it to me* still refuses it outright.
    never = rules_for(
        digest(
            rules=[
                {"action": "Write", "applies_to": ["write"], "behaviour": "leave_to_me"}
            ]
        )
    ).decide(SAVE_TOOL, {"space": "sp-wiki"})
    assert never.decision.behaviour == "leave_to_me"

    asked: List[tuple] = []

    async def ask(tool: str, args: Dict[str, Any], decision: Any) -> None:
        asked.append((tool, dict(args)))

    written = Written()
    returned: List[str] = []
    calls = iter(
        [
            ToolCallPart(
                SAVE_TOOL,
                {"title": "Weekly digest", "content": DIGEST, "space": "sp-wiki"},
            )
        ]
    )

    def model(messages: list, info: AgentInfo) -> ModelResponse:
        last = messages[-1].parts[-1]
        if getattr(last, "part_kind", "") == "tool-return":
            returned.append(str(last.content))
        call = next(calls, None)
        return ModelResponse(parts=[call] if call else [TextPart("Done.")])

    rules = rules_for(app)
    rules.ask = ask
    # What the record says of it (found in the R-25 drill of 2026-10-07: it
    # said `do_it`): refused, not granted — never the behaviour that let the
    # tool run only to refuse it.
    recorder = AppRecorder(
        app=app.model_copy(
            update={"record": app.record.model_copy(update={"include": ["decisions"]})}
        ),
        app_uid="app-1",
    )
    rules.record = recorder.decided
    _SESSION.set("s-r25")
    capability = AppSavingCapability(app=app, app_uid="app-1", write=written)
    await Agent(FunctionModel(model), capabilities=[rules, capability]).run(
        "Save it in the wiki."
    )
    [entry] = [e for e in recorder._pending.get("s-r25", []) if e["kind"] == "decision"]
    assert entry["summary"] == f"{SAVE_TOOL}: refused (not granted to write that Space)"
    assert {
        key: entry["payload"][key] for key in ("behaviour", "because", "refused")
    } == {
        "behaviour": "refused",
        "because": SPACE_NOT_GRANTED,
        "refused": SPACE_NOT_GRANTED,
    }
    assert asked == []
    assert written.calls == []
    assert returned == [
        "You may save only in sp-notes, sp-reports, not in sp-wiki: "
        "save it in one of those, or say that you cannot."
    ]
    assert not_granted(app, "sp-notes") == "" and not_granted(app) == ""
