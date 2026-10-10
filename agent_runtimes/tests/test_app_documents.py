# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application knows (LOOP U-24, R-29).

An application that names documents is given one tool, `search_documents`,
which asks Contents for the passages of those documents that answer a
question — as its principal on a deployment, as the person in a Preview — and
tells the model each with its document and where in it, to cite. It only
reads, so its rules do not ask before it. One that names none is given none.
"""

from typing import Any, Dict, List

import httpx
import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.loop.apps import documents
from agent_runtimes.loop.apps.agent import app_capabilities
from agent_runtimes.loop.apps.documents import (
    SEARCH_TOOL,
    AppDocumentsCapability,
    DocumentsNotSearched,
    documents_of,
    passages_in_words,
    search_on_contents,
)
from agent_runtimes.loop.apps.plugins import rules_for
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.rules import UNCLASSED
from agent_runtimes.types import AppSpec

RETURNS = "eric/support/returns.md"
PLANS = "eric/support/plans.pdf"

PASSAGE = {
    "path": RETURNS,
    "name": "returns.md",
    "location": "Returns › Time limit, lines 5–9",
    "position": 1,
    "text": "You may return a product within thirty days of delivery.",
    "score": 3.2,
}


def desk(contents: List[str] | None = None) -> AppSpec:
    return AppSpec.model_validate(
        {
            "id": "support-desk",
            "name": "Support Desk",
            "kind": "chat",
            "agent": "worker-document-qa:0.0.1",
            "contents": contents
            if contents is not None
            else [RETURNS, f"/{RETURNS}", PLANS, " "],
        }
    )


class Searched:
    def __init__(self, answer: Dict[str, Any] | Exception) -> None:
        self.answer = answer
        self.calls: List[tuple] = []

    async def __call__(
        self,
        app_uid: str,
        deployment_uid: str,
        question: str,
        paths: List[str],
        rows: int,
    ):
        self.calls.append((app_uid, deployment_uid, question, paths, rows))
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


def test_its_documents_are_the_paths_it_names_once_each() -> None:
    assert documents_of(desk()) == [RETURNS, PLANS]
    assert documents_of(desk([])) == []


def test_it_is_given_the_tool_only_when_it_names_documents() -> None:
    assert AppDocumentsCapability(app=desk([])).get_toolset() is None
    toolset = AppDocumentsCapability(app=desk(), app_uid="app-1").get_toolset()
    assert toolset is not None and set(toolset.tools) == {SEARCH_TOOL}


async def test_it_searches_its_documents_and_says_where_each_passage_is() -> None:
    searched = Searched({"passages": [PASSAGE]})
    capability = AppDocumentsCapability(
        app=desk(), app_uid="app-1", deployment_uid="dep-1", search=searched
    )
    told = await capability.search_documents("  How long   to return? ")
    assert searched.calls == [
        ("app-1", "dep-1", "How long to return?", [RETURNS, PLANS], 6)
    ]
    assert "[1] (returns.md, Returns › Time limit, lines 5–9)" in told
    assert "thirty days" in told and "cite each passage" in told


async def test_nothing_found_is_said_and_nothing_is_made_up() -> None:
    told = await AppDocumentsCapability(
        app=desk(), app_uid="app-1", search=Searched({"passages": []})
    ).search_documents("price next year")
    assert (
        "None of the documents you were given" in told
        and "do not answer from anything else" in told
    )


async def test_an_application_not_saved_on_datalayer_has_nothing_read() -> None:
    searched = Searched({"passages": [PASSAGE]})
    told = await AppDocumentsCapability(app=desk(), search=searched).search_documents(
        "returns"
    )
    assert (
        searched.calls == [] and "Nothing has been read of your documents here" in told
    )


async def test_a_search_that_failed_is_said_to_the_model() -> None:
    capability = AppDocumentsCapability(
        app=desk(),
        app_uid="app-1",
        search=Searched(DocumentsNotSearched("Contents answered 403: no.")),
    )
    told = await capability.search_documents("returns")
    assert told.startswith(
        "Your documents could not be searched: Contents answered 403: no."
    )


def test_the_passages_are_numbered_with_their_document_and_place() -> None:
    told = passages_in_words(
        "q",
        [
            PASSAGE,
            {**PASSAGE, "name": "plans.pdf", "location": "page 2", "text": "Team."},
        ],
    )
    assert "[2] (plans.pdf, page 2)\nTeam." in told


def test_its_rules_read_the_search_as_reading_only_when_it_has_documents() -> None:
    decided = rules_for(desk()).decide(SEARCH_TOOL, {"question": "returns"})
    assert decided.decision.classes == ("read",)
    assert decided.decision.because != UNCLASSED
    unknown = rules_for(desk([])).decide(SEARCH_TOOL, {"question": "returns"})
    assert unknown.decision.because == UNCLASSED


async def test_its_agent_calls_the_search_without_asking_and_cites_from_it() -> None:
    searched = Searched({"passages": [PASSAGE]})
    returned: List[str] = []
    calls = iter([ToolCallPart(SEARCH_TOOL, {"question": "How long to return?"})])

    def model(messages: list, info: AgentInfo) -> ModelResponse:
        last = messages[-1].parts[-1]
        if getattr(last, "part_kind", "") == "tool-return":
            returned.append(str(last.content))
        call = next(calls, None)
        return ModelResponse(
            parts=[call]
            if call
            else [
                TextPart("Thirty days (returns.md, Returns › Time limit, lines 5–9).")
            ]
        )

    async def never(*_: Any) -> None:
        raise AssertionError("a search is not asked about")

    rules = rules_for(desk())
    rules.ask = never
    agent = Agent(
        FunctionModel(model),
        capabilities=[
            rules,
            AppDocumentsCapability(app=desk(), app_uid="app-1", search=searched),
        ],
    )
    result = await agent.run("How long do I have to return it?")
    assert searched.calls and "thirty days" in returned[0]
    assert "returns.md" in result.output


def test_a_local_agent_is_given_it_too_and_nothing_was_read_for_it() -> None:
    recorder = AppRecorder(app=desk())
    given = app_capabilities(desk(), recorder=recorder)
    assert any(isinstance(capability, AppDocumentsCapability) for capability in given)
    assert not any(
        isinstance(capability, AppDocumentsCapability)
        for capability in app_capabilities(desk([]), recorder=AppRecorder(app=desk([])))
    )


@pytest.fixture
def contents(monkeypatch: pytest.MonkeyPatch) -> List[httpx.Request]:
    seen: List[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.headers["Authorization"] == "Bearer refused":
            return httpx.Response(
                403, json={"code": "NOT_ITS_DOCUMENTS", "message": "Not its documents."}
            )
        return httpx.Response(
            200, json={"app_uid": "app-1", "question": "q", "passages": [PASSAGE]}
        )

    real = httpx.AsyncClient

    def client(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        return real(*args, transport=httpx.MockTransport(answer), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client)
    monkeypatch.setattr(documents, "_contents_url", lambda: "https://contents.test/")
    return seen


async def test_on_a_deployment_it_searches_as_its_principal(
    contents, monkeypatch
) -> None:
    from agent_runtimes.loop.apps import principal

    monkeypatch.setattr(
        principal,
        "principal_token",
        lambda deployment: "principal-token" if deployment == "dep-1" else None,
    )
    found = await search_on_contents("app 1", "dep-1", "How long?", [RETURNS, PLANS], 6)
    assert found["passages"][0]["name"] == "returns.md"
    request = contents[0]
    assert request.headers["Authorization"] == "Bearer principal-token"
    assert (
        request.url.raw_path.split(b"?")[0] == b"/api/contents/v1/apps/app%201/passages"
    )
    assert request.url.params.get_list("path") == [RETURNS, PLANS]
    assert request.url.params["q"] == "How long?" and request.url.params["rows"] == "6"


async def test_in_a_preview_it_searches_as_the_person(contents, monkeypatch) -> None:
    from agent_runtimes.context import identities

    monkeypatch.setattr(identities, "get_request_user_jwt", lambda: "person-token")
    await search_on_contents("app-1", "", "q", [RETURNS], 6)
    assert contents[0].headers["Authorization"] == "Bearer person-token"


async def test_a_refusal_of_contents_is_said_in_its_words(
    contents, monkeypatch
) -> None:
    from agent_runtimes.context import identities

    monkeypatch.setattr(identities, "get_request_user_jwt", lambda: "refused")
    with pytest.raises(
        DocumentsNotSearched, match="Contents answered 403: Not its documents."
    ):
        await search_on_contents("app-1", "", "q", [RETURNS], 6)


async def test_a_deployment_without_its_principals_token_searches_nothing(
    contents, monkeypatch
) -> None:
    from agent_runtimes.loop.apps import principal

    monkeypatch.setattr(principal, "principal_token", lambda deployment: None)
    monkeypatch.setattr(
        principal, "principal_token_refusal", lambda deployment: "it has none."
    )
    with pytest.raises(
        DocumentsNotSearched, match="no token to search them with: it has none."
    ):
        await search_on_contents("app-1", "dep-1", "q", [RETURNS], 6)
    assert contents == []
