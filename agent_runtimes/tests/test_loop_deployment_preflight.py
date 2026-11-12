# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A session of a paused deployment: marked in the list, asked about before
anything is launched.

Found on 12 November 2026: a session listed `paused` was resumed from the
picker, an environment was asked for, a runtime launched and waited for —
and only then did the runtime answer that the deployment was paused (its
principal acts for nobody). The check is made first now, on what the
person's own list of deployments says; a runtime launched for an
application that never came up on it is stopped without asking; and a
refusal is a sentence.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from agent_runtimes.apps.deployments import Deployment, DeployRefused
from agent_runtimes.commands import apps as command
from agent_runtimes.commands.apps import ResumeRefused
from agent_runtimes.loop.paused import AGENT_WHY_NOT, is_listed, paused_of
from agent_runtimes.loop.picker import why_not
from agent_runtimes.loop.session_table import cells_of_row


class Store:
    """The person's deployments, standing in for ai-agents."""

    def __init__(self, state: str = "paused", refuse: str = "") -> None:
        self.deployment = Deployment(
            uid="dep-1", app_uid="app-1", version=3, state=state
        )
        self.changes: List[Dict[str, Any]] = []
        self.refuse = refuse

    def list(self, app_uid: str = "") -> List[Deployment]:
        return [self.deployment]

    def change(self, uid: str, **changes: Any) -> Dict[str, Any]:
        if self.refuse:
            raise DeployRefused(f"The deployment could not be changed: {self.refuse}")
        self.changes.append({"uid": uid, **changes})
        return {"uid": uid, **changes}


def _never() -> Any:
    raise AssertionError("nobody is asked about a live deployment")


def test_a_live_deployment_passes_and_nobody_is_asked() -> None:
    store = Store("live")
    assert (
        command.deployment_preflight(store.deployment, store, _never)
        is store.deployment
    )
    assert store.changes == []


def test_a_paused_deployment_is_asked_about_first_and_yes_resumes_it() -> None:
    store, asked = Store(), []

    def yes() -> bool:
        asked.append(command.RESUME_DEPLOYMENT_QUESTION)
        return True

    command.deployment_preflight(store.deployment, store, yes)
    assert asked == ["Its deployment is paused. Resume the deployment and go on?"]
    assert store.changes == [{"uid": "dep-1", "state": "live"}]


def test_no_stops_there_with_nothing_launched() -> None:
    store = Store()
    with pytest.raises(ResumeRefused) as refused:
        command.deployment_preflight(store.deployment, store, lambda: False)
    assert (
        str(refused.value)
        == "Not resumed: its deployment stays paused, and nothing was launched."
    )
    assert store.changes == []


def test_where_nobody_can_be_asked_it_is_refused_in_a_sentence() -> None:
    store = Store()
    with pytest.raises(ResumeRefused) as refused:
        command.deployment_preflight(store.deployment, store, lambda: None)
    assert "Its deployment is paused" in str(
        refused.value
    ) and "nothing was launched" in str(refused.value)
    assert store.changes == []


def test_a_resume_ai_agents_refuses_is_said_in_its_sentence() -> None:
    store = Store(refuse="Its spend limit is reached.")
    with pytest.raises(ResumeRefused) as refused:
        command.deployment_preflight(store.deployment, store, lambda: True)
    assert str(refused.value) == (
        "Its deployment was not resumed: The deployment could not be changed: "
        "Its spend limit is reached. Nothing was launched."
    )


def test_the_check_is_made_before_the_application_is_read_or_anything_launched(
    monkeypatch: Any,
) -> None:
    """`deployed_application` is the first thing a resume does: refused there, no environment is asked for."""
    import agent_runtimes.apps.store as studio

    def pull(store: Any, app_uid: str) -> Any:
        raise AssertionError(
            "the application is not read for a deployment that stays paused"
        )

    monkeypatch.setattr(studio, "pull", pull)
    monkeypatch.setattr(command, "launch_cloud", _never, raising=False)
    with pytest.raises(ResumeRefused):
        command.deployed_application("dep-1", Store(), lambda: False)
    with pytest.raises(ResumeRefused) as stranger:
        command.deployed_application("dep-other", Store("live"), _never)
    assert "not one of yours" in str(stranger.value)


def test_a_refusal_is_a_sentence_not_the_raw_answer() -> None:
    raw = (
        '{"detail":"ai-agents gave deployment f3afc958 no principal\'s token (409): '
        'The deployment is paused: its principal acts for nobody.."}'
    )
    assert command._sentence(raw) == (
        "ai-agents gave deployment f3afc958 no principal's token (409): "
        "The deployment is paused: its principal acts for nobody."
    )
    assert command._sentence("Bad gateway") == "Bad gateway."
    assert command._sentence('{"detail": {"problems": ["one", "two."]}}') == "one; two."


class Launch:
    said = "cloud app runtime"
    runtime_name = "01m77xgtbjr5t8q8647ehnpeh4"
    attached = False

    def __init__(self, stops: bool = True) -> None:
        self.stopped = 0
        self.stops = stops

    def stop(self) -> bool:
        self.stopped += 1
        return self.stops


def test_a_runtime_the_application_never_ran_on_is_stopped_without_asking(
    monkeypatch: Any,
) -> None:
    import agent_runtimes.loop.launch as launch_module

    finished: List[Any] = []
    monkeypatch.setattr(
        launch_module,
        "finish_cloud",
        lambda launch, keep=False: finished.append((launch, keep)),
    )
    said: List[str] = []
    launch = Launch()
    command.stop_or_finish(launch, started=False, say=said.append)
    assert launch.stopped == 1 and finished == []
    assert said == [
        "Stopped cloud app runtime 01m77xgtbjr5t8q8647ehnpeh4: the application never ran on it."
    ]
    # One the application ran on, one asked to be kept, one that was running before: finished as usual, asked.
    for facts in ({"started": True}, {"started": False, "keep": True}):
        other = Launch()
        command.stop_or_finish(other, say=said.append, **facts)
        assert other.stopped == 0
    attached = Launch()
    attached.attached = True
    command.stop_or_finish(attached, started=False, say=said.append)
    assert attached.stopped == 0 and len(finished) == 3
    # Not stopped: said, with the command that does.
    command.stop_or_finish(Launch(stops=False), started=False, say=said.append)
    assert "loop agents terminate 01m77xgtbjr5t8q8647ehnpeh4" in said[-1]


# --- the list -------------------------------------------------------------------------


def _rows(deployments: Dict[str, Dict[str, Any]], **session: Any) -> Any:
    described = {
        "uid": "s-1",
        "state": "paused",
        "agent": "mh49-pi",
        "app_uid": "app-1",
        "deployment_uid": "dep-1",
        "started_at": "2026-10-28T15:56:05+00:00",
        **session,
    }
    [row] = paused_of(
        [described],
        "record",
        deployments,
        {},
        ("open", "paused", "ended"),
        lambda spec: spec == "example-simple",
    )
    return row


def test_a_session_of_ones_own_paused_deployment_is_listed_and_marked() -> None:
    mine = {"dep-1": {"uid": "dep-1", "app_name": "mh49-pi", "state": "paused"}}
    row = _rows(mine)
    assert row.deployment_paused and is_listed(row) and why_not("resume", row) == ""
    assert (
        row.state == "paused" and cells_of_row(row, 1)[2] == "paused, deployment paused"
    )
    live = _rows({"dep-1": {"uid": "dep-1", "app_name": "mh49-pi", "state": "live"}})
    assert not live.deployment_paused and cells_of_row(live, 1)[2] == "paused"
    # Somebody else's, paused or not: not the caller's to resume, not listed.
    theirs = _rows({})
    assert not theirs.deployment_paused and not is_listed(theirs)


def test_a_session_of_an_agent_that_left_the_catalogue_is_not_listed() -> None:
    gone = _rows(
        {}, app_uid="agent:retired-agent", deployment_uid="", agent="retired-agent"
    )
    assert gone.why_not == AGENT_WHY_NOT.format(
        agent="retired-agent"
    ) and not is_listed(gone)
    assert "no longer an agentspec of the catalogue" in why_not("resume", gone)
    kept = _rows(
        {}, app_uid="agent:example-simple", deployment_uid="", agent="example-simple"
    )
    assert kept.why_not == "" and is_listed(kept)
