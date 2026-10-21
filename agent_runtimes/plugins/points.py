# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The contribution points of the session (MH-F01): what a plugin may offer.

The session — one conversation of one person with one application's agent,
kept in the record — is extended through the reactor and nothing else: the
harnesses, where sessions are kept, the file formats they travel as, what a
swap carries, and what runs before each operation are each a named, typed
contribution point of the ``agent-runtimes`` reactor extension
(:mod:`agent_runtimes.plugins.extension`). The catalogue contributes itself,
the platform its stores and hooks, a third party a harness or a format from a
pip package by the same route (``datalayer.reactor.extensions``).

Points:

- ``harness`` — a :class:`HarnessContribution`: a harness spec (its
  capabilities table is the spec's, never the contribution's) and the
  adapter that drives it, known by the spec's id.
- ``session.store`` — a :class:`SessionStore`: the entries half of where
  sessions are kept (the harness rows stay the protocol state store's).
  One is active, chosen by configuration; two refuse the host.
- ``session.format`` — a :class:`SessionFormat`: an exporter and importer
  pair under a format id (``datalayer-session/1``).
- ``session.carry`` — a :class:`SessionCarry`: what a swap or a clone carries
  and drops, with the sentence said.
- ``session.hook`` — a :class:`SessionHook`: ``on_open``, ``on_resume``,
  ``on_swap``, ``on_clone``, ``on_export``, ``on_import``, ``on_end``, each
  given the session and the operation's facts, each free to refuse in a
  sentence before the operation runs.

**Fail fast at the seam.** A contribution whose value is not the point's
shape, or whose id another plugin contributed first, is refused with the
plugin's name and the field (:func:`check`), listed by ``loop plugins``, and
never read: the host runs with the rest.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import (
    Any,
    Awaitable,
    Callable,
    Dict,
    List,
    Mapping,
    Optional,
    Protocol,
    Sequence,
    runtime_checkable,
)

from reactor import Contribution, ContributionPoint, define_contribution_point

from agent_runtimes.types import HarnessSpec

#: The harnesses: the catalogue's, an organization's, a third party's.
HARNESSES: ContributionPoint["HarnessContribution"] = define_contribution_point(
    "harness"
)
#: Where sessions are kept (the entries half).
SESSION_STORES: ContributionPoint["SessionStore"] = define_contribution_point(
    "session.store"
)
#: The file formats a session travels as.
SESSION_FORMATS: ContributionPoint["SessionFormat"] = define_contribution_point(
    "session.format"
)
#: What a swap or a clone carries.
SESSION_CARRY: ContributionPoint["SessionCarry"] = define_contribution_point(
    "session.carry"
)
#: What runs before each operation of a session.
SESSION_HOOKS: ContributionPoint["SessionHook"] = define_contribution_point(
    "session.hook"
)

#: The points, in the order ``loop plugins`` lists them.
POINTS: tuple[ContributionPoint[Any], ...] = (
    HARNESSES,
    SESSION_STORES,
    SESSION_FORMATS,
    SESSION_CARRY,
    SESSION_HOOKS,
)

#: The operations a hook may run before.
HOOK_EVENTS = ("open", "resume", "swap", "clone", "export", "import", "end")


class ContributionRefused(ValueError):
    """A contribution the point refuses, said in a sentence naming the plugin."""


@dataclass(frozen=True)
class HarnessContribution:
    """A harness and the adapter that drives it.

    ``adapter`` makes the agent for an agent id on this harness: what
    :func:`agent_runtimes.adapters.acp_agent.harness_agent` does for the
    catalogue's, given ``(agent_id, spec, **facts)``.
    """

    spec: HarnessSpec
    adapter: Callable[..., Any]

    @property
    def id(self) -> str:
        return self.spec.id


@runtime_checkable
class SessionStore(Protocol):
    """Where a session's entries are kept: the record (ai-agents), or a file.

    The harness rows — ``harness_session`` per (session, agent) — are the
    protocol state store's, not this half's.
    """

    #: Its name, as the configuration chooses it: ``record``, ``file``.
    name: str

    async def list(
        self,
        owner: Mapping[str, str],
        *,
        app: str = "",
        after: str = "",
        limit: int = 50,
        agent: str = "",
        state: str = "",
        query: str = "",
        archived: bool = False,
    ) -> "SessionPage":
        """The owner's sessions, newest first, paged."""
        ...

    async def get(self, uid: str) -> Optional[Dict[str, Any]]:
        """One session as the record says it, or ``None``."""
        ...

    async def entries(
        self, uid: str, *, up_to_turn: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """The session's entries in order, up to a turn when one is named."""
        ...

    async def append(self, uid: str, entries: Sequence[Mapping[str, Any]]) -> None:
        """Add entries to a session's record."""
        ...

    async def copy(
        self, uid: str, to_uid: str, *, up_to_turn: Optional[int] = None
    ) -> int:
        """Copy a session's entries under a new uid; how many went."""
        ...

    async def lineage(self, uid: str) -> Dict[str, Any]:
        """``{forked_from, imported_from}`` of a session."""
        ...


@dataclass
class SessionPage:
    """A page of sessions, and whether more follow."""

    sessions: List[Dict[str, Any]]
    has_more: bool = False


@runtime_checkable
class SessionFormat(Protocol):
    """An exporter and importer pair under a format id."""

    #: ``datalayer-session/1``.
    id: str

    def export(
        self,
        session: Mapping[str, Any],
        entries: Sequence[Mapping[str, Any]],
        **facts: Any,
    ) -> "Exported":
        """The file's lines, redacted, and the count of redactions."""
        ...

    def import_(self, lines: Sequence[str], **facts: Any) -> "Imported":
        """The session and its entries read from the file, validated line by line."""
        ...


@dataclass
class Exported:
    """What an exporter answers: the lines of the file, and what it redacted."""

    lines: List[str]
    redactions: int
    turns: int
    entries: int


@dataclass
class Imported:
    """What an importer answers: the session line as a dict, and the entries."""

    session: Dict[str, Any]
    entries: List[Dict[str, Any]]
    redactions: int


@dataclass
class Carried:
    """What a swap or a clone carries, what it drops, and the sentence said."""

    carried: Dict[str, Any]
    dropped: Dict[str, Any]
    said: str
    #: The mode the clone starts in (the application's default), or ``""``.
    mode: str = ""


@runtime_checkable
class SessionCarry(Protocol):
    """The swap and clone policy."""

    def swap(self, session: Any, target: Mapping[str, Any]) -> Carried:
        """What carries onto the target agent, and the sentence the new agent is told."""
        ...

    def clone(self, session: Any, target: Mapping[str, Any]) -> Carried:
        """What a clone carries (its mode reset), and the sentence when its agent differs."""
        ...


class SessionHook(Protocol):
    """Runs before an operation; refuses it by raising :class:`HookRefused`.

    Any of ``on_open``, ``on_resume``, ``on_swap``, ``on_clone``,
    ``on_export``, ``on_import``, ``on_end`` — ``(session, facts)``, sync or
    async; a hook implements the ones it cares for.
    """


class HookRefused(Exception):
    """A hook refused the operation, in a sentence; the operation does not run."""

    def __init__(self, status: int, reason: str):
        super().__init__(reason)
        self.status = status
        self.reason = reason


@dataclass(frozen=True)
class Refusal:
    """A contribution refused at the seam, as ``loop plugins`` lists it."""

    plugin: str
    point: str
    contribution_id: str
    reason: str

    def line(self) -> str:
        return f"{self.plugin}: {self.point} {self.contribution_id!r} refused — {self.reason}"


def _sentence(
    contribution: Contribution[Any], point: ContributionPoint[Any], what: str
) -> str:
    return f"{contribution.plugin} contributes {point.id} {contribution.id!r} {what}"


def _check_one(point: ContributionPoint[Any], contribution: Contribution[Any]) -> None:
    """Raise :class:`ContributionRefused` when a contribution is not the point's shape."""
    value = contribution.value
    if point is HARNESSES:
        if not isinstance(value, HarnessContribution):
            raise ContributionRefused(
                _sentence(
                    contribution,
                    point,
                    "that is not a HarnessContribution (a spec and its adapter).",
                )
            )
        if value.spec.id != contribution.id:
            raise ContributionRefused(
                _sentence(
                    contribution,
                    point,
                    f"whose spec says id {value.spec.id!r}: a harness is contributed under its own id.",
                )
            )
        if (
            not value.spec.terms.licence.strip()
            or not value.spec.terms.served_to_third_parties
        ):
            raise ContributionRefused(
                _sentence(
                    contribution,
                    point,
                    "without terms: a harness whose terms are unknown is not served.",
                )
            )
        if not callable(value.adapter):
            raise ContributionRefused(
                _sentence(contribution, point, "without an adapter to drive it.")
            )
        return
    if point is SESSION_STORES:
        missing = [
            name
            for name in ("list", "get", "entries", "append", "copy", "lineage")
            if not callable(getattr(value, name, None))
        ]
        if (
            missing
            or not isinstance(getattr(value, "name", None), str)
            or not value.name
        ):
            raise ContributionRefused(
                _sentence(
                    contribution,
                    point,
                    f"that is not a SessionStore: it lacks {', '.join(missing) or 'a name'}.",
                )
            )
        if value.name != contribution.id:
            raise ContributionRefused(
                _sentence(
                    contribution,
                    point,
                    f"whose store is named {value.name!r}: a store is contributed under its name.",
                )
            )
        return
    if point is SESSION_FORMATS:
        if (
            not isinstance(getattr(value, "id", None), str)
            or not callable(getattr(value, "export", None))
            or not callable(getattr(value, "import_", None))
        ):
            raise ContributionRefused(
                _sentence(
                    contribution,
                    point,
                    "that is not a SessionFormat (an id, export and import_).",
                )
            )
        if value.id != contribution.id:
            raise ContributionRefused(
                _sentence(
                    contribution,
                    point,
                    f"whose format says {value.id!r}: a format is contributed under its id.",
                )
            )
        return
    if point is SESSION_CARRY:
        if not callable(getattr(value, "swap", None)) or not callable(
            getattr(value, "clone", None)
        ):
            raise ContributionRefused(
                _sentence(
                    contribution, point, "that is not a SessionCarry (swap and clone)."
                )
            )
        return
    if point is SESSION_HOOKS:
        if not any(
            callable(getattr(value, f"on_{event}", None)) for event in HOOK_EVENTS
        ):
            raise ContributionRefused(
                _sentence(
                    contribution,
                    point,
                    f"that hooks nothing: one of on_{', on_'.join(HOOK_EVENTS)}.",
                )
            )
        return


def check(
    point: ContributionPoint[Any], contributions: Sequence[Contribution[Any]]
) -> tuple[List[Contribution[Any]], List[Refusal]]:
    """The contributions a point accepts, and those it refuses — a malformed
    one, or a second under an id already contributed (the first as the
    registry orders them — by order, then registration — stands; the
    built-ins come first at order 0).
    """
    accepted: List[Contribution[Any]] = []
    refused: List[Refusal] = []
    seen: Dict[str, str] = {}
    for contribution in contributions:
        try:
            _check_one(point, contribution)
        except ContributionRefused as why:
            refused.append(
                Refusal(contribution.plugin, point.id, contribution.id, str(why))
            )
            continue
        if point is not SESSION_HOOKS and contribution.id in seen:
            refused.append(
                Refusal(
                    contribution.plugin,
                    point.id,
                    contribution.id,
                    f"{contribution.plugin} contributes {point.id} {contribution.id!r}, which {seen[contribution.id]} contributed first: one {point.id} per id.",
                )
            )
            continue
        seen[contribution.id] = contribution.plugin
        accepted.append(contribution)
    return accepted, refused


async def run_hook(
    hook: Any, event: str, session: Any, facts: Mapping[str, Any]
) -> None:
    """Call one hook's ``on_<event>`` when it has one, awaiting a coroutine."""
    handler = getattr(hook, f"on_{event}", None)
    if handler is None:
        return
    answer = handler(session, facts)
    if isinstance(answer, Awaitable):
        await answer


__all__ = [
    "HARNESSES",
    "HOOK_EVENTS",
    "POINTS",
    "SESSION_CARRY",
    "SESSION_FORMATS",
    "SESSION_HOOKS",
    "SESSION_STORES",
    "Carried",
    "ContributionRefused",
    "Exported",
    "HarnessContribution",
    "HookRefused",
    "Imported",
    "Refusal",
    "SessionCarry",
    "SessionFormat",
    "SessionHook",
    "SessionPage",
    "SessionStore",
    "check",
    "run_hook",
]
