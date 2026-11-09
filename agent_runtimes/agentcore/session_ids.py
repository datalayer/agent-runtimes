# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A session uid as AgentCore's ``runtimeSessionId``, and back (AC-03).

AgentCore Runtime takes a ``runtimeSessionId`` of 33 to 256 characters; a
session uid is 8 to 128 letters, digits, hyphens or underscores
(``apps.sessions.SESSION_UID``). One fixed rule, applied to every uid
whatever its length, so that it is always reversible: the uid behind the
25 characters of `PADDING`. Nothing is ever cut: the shortest uid (8) gives
33 characters, the longest (128) gives 153.
"""

from __future__ import annotations

from agent_runtimes.apps.sessions import SESSION_UID

#: What every session uid is given in front of it to be an AgentCore session id.
PADDING = "datalayer-session-padded-"

#: The shortest ``runtimeSessionId`` AgentCore takes.
AGENTCORE_MIN = 33

#: The longest ``runtimeSessionId`` AgentCore takes.
AGENTCORE_MAX = 256


def session_uid_to_agentcore(uid: str) -> str:
    """The AgentCore ``runtimeSessionId`` of a session uid.

    Parameters
    ----------
    uid : str
        A session uid (8 to 128 letters, digits, hyphens or underscores).

    Returns
    -------
    str
        The uid behind `PADDING`.

    Raises
    ------
    ValueError
        When ``uid`` is not a session uid, in a sentence.
    """
    if not SESSION_UID.match(uid or ""):
        raise ValueError(
            f"{uid!r} is not a session uid: 8 to 128 letters, digits, hyphens or underscores."
        )
    return PADDING + uid


def agentcore_to_session_uid(sid: str) -> str:
    """The session uid of an AgentCore ``runtimeSessionId`` made by `session_uid_to_agentcore`.

    Parameters
    ----------
    sid : str
        The ``X-Amzn-Bedrock-AgentCore-Runtime-Session-Id`` of an invocation.

    Returns
    -------
    str
        The session uid behind `PADDING`.

    Raises
    ------
    ValueError
        When ``sid`` is not a session uid behind `PADDING`, in a sentence.
    """
    sid = sid or ""
    uid = sid[len(PADDING) :] if sid.startswith(PADDING) else ""
    if not uid or not SESSION_UID.match(uid):
        raise ValueError(
            f"The AgentCore session id {sid!r} is not a Datalayer session: "
            f"it is a session uid behind {PADDING!r}."
        )
    return uid


__all__ = [
    "AGENTCORE_MAX",
    "AGENTCORE_MIN",
    "PADDING",
    "agentcore_to_session_uid",
    "session_uid_to_agentcore",
]
