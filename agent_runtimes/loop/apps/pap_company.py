# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""An application that is a company personal agents work with (PAP_DATALAYER B-04).

Datalayer's company service (ai-agents) asks the deployed application over A2A,
marking the message ``metadata.pap``. Two kinds of turn come that way:

- **A conversation turn.** The application answers as it always does, a
  visitor's turn that only reads (LOOP R-30) — except that a call to a tool
  its Appspec declares as an operation (``pap.company.operations``) is not
  refused: it is *proposed*. The tool does not run; its arguments become the
  operation's terms, returned beside the answer as a ``pap_operation`` data
  artifact, and the company service shows the person the exact terms.
- **A perform turn**, once the person confirmed that revision. The message
  carries only a one-use ticket; the runtime redeems it at the company service,
  which answers the action and terms it confirmed. The run may then call the
  declared tool, with exactly those terms, once; anything else that does more
  than read stays refused.

What is proposed and what is performed is decided by the Appspec and the
company service's record, never by the model or by the message.
"""

from __future__ import annotations

import logging
import string
from contextvars import ContextVar, Token
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional

logger = logging.getLogger(__name__)

#: Where ai-agents marks a message sent for a company conversation.
PAP_META_KEY = "pap"


@dataclass
class Performing:
    """The operation a perform turn was redeemed for."""

    action: str
    tool: str
    terms: dict[str, Any]
    done: bool = False


@dataclass
class PapTurn:
    """A turn asked by a personal agent through the company service."""

    proposals: list[dict[str, Any]] = field(default_factory=list)
    performing: Optional[Performing] = None
    #: The ticket a perform turn redeems before it runs.
    ticket: str = ""


_PAP_TURN: ContextVar[Optional[PapTurn]] = ContextVar("pap_turn", default=None)


def pap_turn_of(meta: Any) -> Optional[PapTurn]:
    """The company turn an A2A message was marked for, or None."""
    ours = meta.get(PAP_META_KEY) if isinstance(meta, Mapping) else None
    if not isinstance(ours, Mapping):
        return None
    perform = ours.get("perform")
    ticket = perform.get("ticket") if isinstance(perform, Mapping) else None
    return PapTurn(ticket=ticket if isinstance(ticket, str) else "")


def enter_pap_turn(turn: Optional[PapTurn]) -> Token[Optional[PapTurn]]:
    return _PAP_TURN.set(turn)


def leave_pap_turn(token: Token[Optional[PapTurn]]) -> None:
    _PAP_TURN.reset(token)


def current_pap_turn() -> Optional[PapTurn]:
    return _PAP_TURN.get()


def _operations(app: Any) -> list[Any]:
    pap = getattr(app, "pap", None)
    company = getattr(pap, "company", None)
    if company is None or not getattr(company, "enabled", False):
        return []
    return list(getattr(company, "operations", None) or [])


def operation_for_tool(app: Any, tool_name: str) -> Any:
    """The operation the Appspec declares for a tool, or None."""
    for operation in _operations(app):
        if operation.tool == tool_name:
            return operation
    return None


def operation_for_action(app: Any, action: str) -> Any:
    for operation in _operations(app):
        if operation.action == action:
            return operation
    return None


def summary_of(template: str, terms: Mapping[str, Any]) -> str:
    """The Maker's sentence with the terms in it; a term it names and the call lacks reads `?`."""
    names = [name for _, name, _, _ in string.Formatter().parse(template) if name]
    return template.format_map({name: terms.get(name, "?") for name in names})


def propose(app: Any, tool_name: str, args: Mapping[str, Any]) -> Optional[str]:
    """In a company conversation turn, propose a declared tool's call instead of making it.

    Answers the sentence the model is given in place of the tool's result, or
    None when the call is not one to propose (not a company turn, a perform
    turn, or a tool no operation names).
    """
    turn = current_pap_turn()
    if turn is None or turn.ticket or turn.performing is not None:
        return None
    operation = operation_for_tool(app, tool_name)
    if operation is None:
        return None
    terms = {str(key): value for key, value in args.items()}
    summary = summary_of(operation.summary, terms)
    turn.proposals.append(
        {"action": operation.action, "summary": summary, "terms": terms}
    )
    return (
        f"Proposed to the person, not done: {summary}. "
        "It is done only once they confirm these exact terms; tell them so."
    )


def performs(app: Any, tool_name: str, args: Mapping[str, Any]) -> Optional[bool]:
    """In a perform turn: True for the one confirmed call, False for any other.

    None outside a perform turn. The confirmed call is the tool the Appspec
    declares for the confirmed action, with exactly the confirmed terms, once.
    """
    turn = current_pap_turn()
    if turn is None or turn.performing is None:
        return None
    performing = turn.performing
    declared = operation_for_action(app, performing.action)
    if declared is None or declared.tool != performing.tool:
        return False
    if performing.done or tool_name != performing.tool:
        return False
    if {str(key): value for key, value in args.items()} != performing.terms:
        return False
    performing.done = True
    return True


def perform_prompt(performing: Performing) -> str:
    """What a perform turn asks: the one confirmed call, with its terms."""
    import json  # noqa: PLC0415

    return (
        f"The person confirmed this operation ({performing.action}). Call `{performing.tool}` "
        f"once, with exactly these arguments, then say in one sentence what was done, "
        f"including anything that did not complete:\n{json.dumps(performing.terms, sort_keys=True)}"
    )


async def redeem(turn: PapTurn, credential: str = "") -> Performing:
    """Take the confirmed operation a perform turn's ticket names, from the company service.

    The service answers the action, the tool its Appspec declares for it and
    the confirmed terms; the call is checked against this runtime's own
    Appspec when it is made (`performs`). Raises when the ticket is not
    honoured: nothing is performed then.
    """
    import httpx  # noqa: PLC0415
    from datalayer_core.utils.urls import DatalayerURLs  # noqa: PLC0415

    base = (
        getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    ).rstrip("/")
    if not base:
        raise RuntimeError("No company service to redeem the operation at")
    headers = {"Authorization": f"Bearer {credential}"} if credential else {}
    async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
        answered = await client.post(
            f"{base}/api/ai-agents/v1/pap-company/operations/redeem",
            json={"ticket": turn.ticket},
        )
    if answered.status_code != 200:
        raise RuntimeError(
            f"The company service did not honour the ticket ({answered.status_code})"
        )
    body = answered.json()
    action, tool, terms = body.get("action"), body.get("tool"), body.get("terms")
    if (
        not isinstance(action, str)
        or not isinstance(tool, str)
        or not isinstance(terms, dict)
    ):
        raise RuntimeError("The company service answered no operation")
    turn.performing = Performing(action=action, tool=tool, terms=terms)
    return turn.performing


def proposal_artifacts(turn: Optional[PapTurn]) -> list[Any]:
    """The operations a turn proposed, as one A2A data artifact."""
    if turn is None or not turn.proposals:
        return []
    import uuid  # noqa: PLC0415

    from fasta2a.schema import Artifact, Part  # noqa: PLC0415

    return [
        Artifact(
            artifact_id=str(uuid.uuid4()),
            name="pap_operations",
            description="Operations proposed to the person, done only once they confirm.",
            parts=[
                Part(data={"pap_operation": proposal}) for proposal in turn.proposals
            ],
        )
    ]
