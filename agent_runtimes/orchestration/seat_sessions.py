# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A team seat's work happens inside an apps session (MH-38, decision T).

On the platform a seat is a child execution worked by this runtime's A2A
worker — an agent made from the seat's registration, a harness behind the
Shield or a model with a prompt. Its task used to run as a bare adapter run
and keep nothing a person could come back to. Now the task is **a turn of a
session**: at the seat's first task the worker opens an apps session of the
team's application (``agent_runtimes.orchestration.teams.team_app``) with
``runs_on: {kind: team_run, execution_id, seat}`` and answers its uid to the
control plane in the task result's metadata; the control plane carries the
uid on the seat's next task (MH-P05), which the worker resumes — the
session held here, or rebuilt from its record — and the run's end ends it.
The seat's conversation — its turns, its tool rows, its decisions — is
thereby in the record like any session's, and a swap, a clone, an export act
on it unchanged.

What is refused, in a sentence: a session handed for another run than the
one the task names; a seat of a team the catalogue does not have; a handed
session nobody can find.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional

from ..context.delegation import (
    execution_of,
    run_execution,
    seat_of,
    session_meta,
    session_of_meta,
)

logger = logging.getLogger(__name__)


class SeatRefused(RuntimeError):
    """What stops a seat's task from running in a session, in a sentence."""


def _text_of(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(part.get("text") or "") for part in content if isinstance(part, Mapping)
        )
    return str(content or "")


def history_of(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """The session's messages as an adapter's conversation history: ``{role, content, agent?}``."""
    history: List[Dict[str, Any]] = []
    for message in messages:
        role = "user" if message.get("role") == "user" else "assistant"
        item: Dict[str, Any] = {
            "role": role,
            "content": _text_of(message.get("content")),
        }
        if message.get("agent"):
            item["agent"] = message["agent"]
        history.append(item)
    return history


async def _drained(stream: Any) -> None:
    async for _ in stream:
        pass


async def _resumed(live: Any) -> None:
    """A seat's session opened again on this worker: the record's and the hooks' part of
    ``LiveSession.resume`` — a ``session`` entry with ``state: open`` and ``runs_on``
    rewritten (MH-01) — without its replay on a socket a seat does not have.
    """
    from ..loop.apps.sessions import run_hooks

    if live.state == "ended":
        raise SeatRefused(
            f"Session {live.uid} ended; an ended session is not resumed — clone it to go on from it."
        )
    held = not live.resumed
    live.state = "open"
    live.turn = "idle"
    await run_hooks("resume", live, {"held": held, "runs_on": live.runs_on})
    live.recorder.forget_started(live.uid)
    live.recorder.start(live.uid, resumed=True, facts=live.facts())
    await live.recorder.flush(live.uid)


@dataclass
class SeatRun:
    """One task of a seat, as a turn of its session."""

    live: Any
    team_id: str
    seat: str
    #: The team run: the root execution.
    execution_id: str
    asked: str
    #: Whether the session was opened by this task (its first) or resumed.
    opened: bool
    _calls: Dict[str, Dict[str, Any]] = field(default_factory=dict, init=False)

    @property
    def uid(self) -> str:
        return str(self.live.uid)

    def history(self) -> List[Dict[str, Any]]:
        """The conversation before this turn, for the adapter."""
        return history_of(list(self.live.messages)[:-1])

    def tool_called(self, called: Mapping[str, Any]) -> None:
        self._calls[str(called.get("id") or "")] = dict(called)

    def tool_answered(self, answered: Mapping[str, Any]) -> None:
        """A tool row in the record: the call and its result, as the audit keeps one."""
        from ..loop.apps.record import _short

        called = self._calls.pop(str(answered.get("id") or ""), {})
        name = str(called.get("name") or answered.get("name") or "")
        if not name:
            return
        self.live.recorder.add(
            "tool_call",
            f"{name} called",
            {
                "tool": name,
                "arguments": _short(called.get("arguments")),
                "result": _short(
                    answered.get("result") or answered.get("error") or "", 300
                ),
                **({"error": True} if answered.get("error") else {}),
            },
        )

    async def answered(self, text: str) -> Dict[str, Any]:
        """The turn is over: its answer kept, the record sent. What the task result says of the session."""
        from ..loop.apps.record import _short
        from ..loop.apps.sessions import _new_id

        if text:
            self.live.messages.append(
                {"id": _new_id(), "role": "assistant", "content": text}
            )
        recorder = self.live.recorder
        recorder.turned(self.asked, text)
        recorder.ended("answered", _short(text, 300), {"length": len(text)})
        await recorder.flush(self.uid)
        self.live.turn = "idle"
        return self.meta()

    async def failed(self, reason: str) -> Dict[str, Any]:
        """The turn stopped: said on the record, sent."""
        from ..loop.apps.record import _short

        recorder = self.live.recorder
        # The task's turn is kept though it stopped: a seat session whose
        # only turn was refused is still a session of one turn (MH-42).
        recorder.turned(self.asked, f"Stopped: {reason}")
        recorder.ended(
            "stopped", f"Stopped: {_short(reason, 300)}", {"error": _short(reason, 300)}
        )
        await recorder.flush(self.uid)
        self.live.turn = "idle"
        return self.meta()

    def meta(self) -> Dict[str, Any]:
        return session_meta(self.uid, self.seat, self.execution_id)


def _caller_of(credential: Optional[str]) -> Any:
    """Who the seat's session is opened as: the person — or the principal — the
    execution's token names, else the machine itself.

    The token is the execution's own: the control plane exchanged it for the
    run (O1-17) and the route that carried the task authenticated the request
    it came on; the worker already acts with it. Its claims say whose name the
    session is in; the platform is not asked a second time (a pool pod's
    worker has no IAM to ask in every setting).
    """
    from ..loop.apps.callers import LOCAL, Caller, _unverified_claims, person_name

    if not credential:
        return LOCAL
    claims = _unverified_claims(credential)
    subject = str(claims.get("sub") or claims.get("uid") or "")
    if not subject:
        raise SeatRefused(
            "The execution's token names nobody to open the seat's session as."
        )
    agent = str(claims.get("agent_uid") or "")
    if agent and agent == subject:
        return Caller(
            kind="principal", uid=agent, app_uid=str(claims.get("app_uid") or "")
        )
    return Caller(kind="person", uid=subject, name=person_name(claims))


async def seat_run(
    agent: Any,
    agent_id: Optional[str],
    meta: Any,
    credential: Optional[str],
    prompt: str,
) -> Optional[SeatRun]:
    """
    The seat's session for a task, opened or resumed, with the task as its next turn.

    Parameters
    ----------
    agent : Any
        The adapter the worker runs: its ``spec_id`` names what the session is bound to.
    agent_id : str | None
        The id the agent is served under here.
    meta : Any
        The task message's metadata: the execution, the seat and the session the delegation names.
    credential : str | None
        The execution's token, which the session is opened with.
    prompt : str
        The task, which becomes the turn.

    Returns
    -------
    SeatRun | None
        The turn, or ``None`` when the task is nobody's seat (no session then).

    Raises
    ------
    SeatRefused
        A seat of a team the catalogue lacks; a session handed for another
        run; a handed session that cannot be found or resumed.
    """
    seat = seat_of(meta)
    if seat is None:
        return None
    execution = run_execution() or {}
    root = str(execution.get("rootExecutionId") or execution_of(meta) or "")
    if not root:
        return None
    from ..loop.apps.loading import load_app
    from ..loop.apps.sessions import (
        SessionRefused,
        apply_rules,
        new_session,
        rebuilt_from_record,
        session_of,
    )
    from ..specs.teams import get_team_spec
    from .teams import seat_instance, seat_runs_on, team_app

    team = get_team_spec(seat["team"])
    if team is None:
        raise SeatRefused(
            f"The task names seat {seat['seat']!r} of team {seat['team']!r}, which the catalogue does not have."
        )
    if seat["seat"] != "supervisor" and all(
        one.id != seat["seat"] for one in team.agents
    ):
        raise SeatRefused(f"Team {team.id} has no seat {seat['seat']!r}.")
    app = load_app(team_app(team))
    instance = seat_instance(team)
    runs_on = seat_runs_on(root, seat["seat"])
    uid = session_of_meta(meta) or ""
    bound = str(getattr(agent, "spec_id", "") or "")
    caller = _caller_of(credential)
    acts_as = {"kind": str(caller.kind), "uid": str(caller.uid or "")}
    opened = False
    try:
        live = session_of(uid) if uid else None
        if live is not None:
            theirs = str((live.runs_on or {}).get("execution_id") or "")
            if (live.runs_on or {}).get("kind") != "team_run" or theirs != root:
                raise SeatRefused(
                    f"Session {uid} is not this run's: it runs "
                    + (f"on team run {theirs}" if theirs else "elsewhere")
                    + f", and the task names run {root}."
                )
            if live.state == "paused":
                await _resumed(live)
            elif live.state == "ended":
                raise SeatRefused(
                    f"Session {uid} ended; an ended session is not resumed — clone it to go on from it."
                )
        elif uid:
            rebuilt = await rebuilt_from_record(uid, app, instance, credential or "")
            if rebuilt.state == "ended":
                raise SeatRefused(
                    f"Session {uid} ended; an ended session is not resumed — clone it to go on from it."
                )
            live = new_session(
                agent_id=agent_id or bound or "seat",
                app=app,
                instance=instance,
                opened_by=caller,
                acts_as=acts_as,
                uid=uid,
                messages=rebuilt.messages,
                files=rebuilt.files,
                resumed=True,
                title=rebuilt.title,
                archived=rebuilt.archived,
                lineage=rebuilt.lineage,
                runs_on=runs_on,
            )
            if bound:
                live.bound_agent = bound
            apply_rules(live, rebuilt.rules)
            await _resumed(live)
        else:
            live = new_session(
                agent_id=agent_id or bound or "seat",
                app=app,
                instance=instance,
                opened_by=caller,
                acts_as=acts_as,
                runs_on=runs_on,
            )
            if bound:
                live.bound_agent = bound
            await _drained(live.open(head=""))
            opened = True
    except SessionRefused as refused:
        raise SeatRefused(refused.reason) from None
    live.turn = "running"
    live._with_turn(prompt)
    live.recorder.start(live.uid, facts=live.facts())
    live.recorder.ran(live.uid)
    return SeatRun(
        live=live,
        team_id=team.id,
        seat=seat["seat"],
        execution_id=root,
        asked=prompt,
        opened=opened,
    )


__all__ = ["SeatRefused", "SeatRun", "history_of", "seat_run"]
