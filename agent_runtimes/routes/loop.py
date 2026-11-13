# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Handing a live session from one front-end to another.

`/browser` in the terminal should not open a fresh page. It should open *this*
conversation, with this agent and this sandbox, in a browser — a continuation,
not a second session.

The mechanism is a single-use code rather than a token in a URL. A URL is
written into shell history, terminal scrollback and, if the user is unlucky, a
screenshot; an access token there outlives the moment. A handoff code is bound
to one session, expires in under a minute, and dies the first time it is
exchanged.
"""

from __future__ import annotations

import logging
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/loop", tags=["loop"])

#: How long a handoff code stays valid. Long enough to open a browser, short
#: enough that a code left in scrollback is worthless.
HANDOFF_TTL_SECONDS = 60


@dataclass
class _Handoff:
    """One outstanding handoff."""

    session_id: str
    payload: dict[str, Any]
    expires_at: float
    user: Optional[str] = None


@dataclass
class HandoffStore:
    """Outstanding handoff codes, in memory.

    In memory is the right scope: a code is meaningful only to the server that
    minted it, and it outlives its usefulness in under a minute.
    """

    _codes: dict[str, _Handoff] = field(default_factory=dict)

    def mint(
        self,
        session_id: str,
        payload: dict[str, Any],
        *,
        user: Optional[str] = None,
        ttl: int = HANDOFF_TTL_SECONDS,
        now: Optional[float] = None,
    ) -> tuple[str, float]:
        """Create a code for a session. Returns ``(code, expires_at)``."""
        self.purge(now=now)
        code = secrets.token_urlsafe(24)
        expires_at = (now if now is not None else time.time()) + ttl
        self._codes[code] = _Handoff(
            session_id=session_id, payload=payload, expires_at=expires_at, user=user
        )
        return code, expires_at

    def exchange(
        self, code: str, *, now: Optional[float] = None
    ) -> Optional[dict[str, Any]]:
        """Redeem a code, once. Returns the session payload, or ``None``."""
        self.purge(now=now)
        handoff = self._codes.pop(code, None)
        if handoff is None:
            return None
        moment = now if now is not None else time.time()
        if handoff.expires_at < moment:
            return None
        return {"session_id": handoff.session_id, **handoff.payload}

    def purge(self, *, now: Optional[float] = None) -> int:
        """Drop expired codes. Returns how many went."""
        moment = now if now is not None else time.time()
        expired = [code for code, h in self._codes.items() if h.expires_at < moment]
        for code in expired:
            del self._codes[code]
        return len(expired)

    def __len__(self) -> int:
        return len(self._codes)


#: Process-wide store. One server, one set of outstanding codes.
handoffs = HandoffStore()


class HandoffRuntime(BaseModel):
    """Where the session's agent runs, and how the page reaches its Jupyter server.

    The page cannot work this out for itself: on Datalayer it is served through
    the terminal's relay at ``http://127.0.0.1:<port>``, which looks exactly
    like a local server, and the relay carries no WebSocket — so a page that
    guessed *Local* waited for a sandbox status that never came. The terminal
    knows, and says so here.

    The Jupyter token travels in this payload, never in the page's URL: the
    exchange returns it once, to the page that redeems the code (see this
    module's docstring).
    """

    where: Literal["local", "datalayer"] = Field(
        description="local: the agent runs on this machine; datalayer: on a "
        "Datalayer runtime, reached through the terminal's relay"
    )
    name: Optional[str] = Field(
        default=None, description="The Datalayer runtime's name"
    )
    jupyter_url: Optional[str] = Field(
        default=None, description="The runtime's Jupyter base URL (its ingress)"
    )
    jupyter_token: Optional[str] = Field(
        default=None, description="The runtime's own Jupyter server token"
    )

    @model_validator(mode="after")
    def _datalayer_names_its_jupyter(self) -> "HandoffRuntime":
        if self.where == "datalayer" and not (
            self.name and self.jupyter_url and self.jupyter_token
        ):
            raise ValueError(
                "A session on Datalayer is handed over with its runtime's name, "
                "Jupyter base URL and token."
            )
        return self


class HandoffRequest(BaseModel):
    """What the terminal knows about the session it is handing over."""

    agent_id: str = Field(default="", description="Agent bound to the session")
    conversation_id: Optional[str] = Field(
        default=None, description="Conversation to continue"
    )
    model: Optional[str] = Field(default=None, description="Active model id")
    view: str = Field(
        default="chat",
        description="Which view the browser should open on: chat, notebook, "
        "document, sandbox, a2ui",
    )
    sandbox: dict[str, Any] = Field(
        default_factory=dict, description="Sandbox facts as the terminal sees them"
    )
    runtime: HandoffRuntime = Field(
        description="Where the agent runs: the page takes that place and no other"
    )


class HandoffResponse(BaseModel):
    """A code and the URL that redeems it."""

    code: str
    expires_at: float
    expires_in: int
    url: str


@router.post("/sessions/{session_id}/handoff", response_model=HandoffResponse)
async def create_handoff(session_id: str, body: HandoffRequest) -> HandoffResponse:
    """Mint a single-use code that hands this session to a browser."""
    code, expires_at = handoffs.mint(
        session_id,
        {
            "agent_id": body.agent_id,
            "conversation_id": body.conversation_id,
            "model": body.model,
            "view": body.view,
            "sandbox": body.sandbox,
            "runtime": body.runtime.model_dump(),
        },
    )
    logger.info(
        "Minted a handoff for session %s (view=%s, where=%s)",
        session_id,
        body.view,
        body.runtime.where,
    )
    return HandoffResponse(
        code=code,
        expires_at=expires_at,
        expires_in=HANDOFF_TTL_SECONDS,
        url=f"/loop?handoff={code}",
    )


class SwitchAgentRequest(BaseModel):
    """What the old route took: kept so the refusal reads the body too."""

    agent_id: str = Field(
        default="", description="Agentspec id, with or without a version"
    )


@router.post("/sessions/{session_id}/agent", status_code=410)
async def switch_agent(session_id: str, body: SwitchAgentRequest) -> dict[str, Any]:
    """Gone (MH-07): a session's agent is swapped at the session route.

    The swap is the session's — its conversation carried, the new agent told
    in a sentence, the record saying it — which this route never did: it
    reconfigured the runtime's agent and ignored the session. It answers
    ``410`` with the sentence naming the route, and nothing else.
    """
    raise HTTPException(
        status_code=410,
        detail=(
            f"A session's agent is swapped at POST /api/v1/apps/sessions/{session_id}/agent; "
            "this route is gone."
        ),
    )


@router.post("/handoff/exchange")
async def exchange_handoff(code: str) -> dict[str, Any]:
    """Redeem a handoff code, once.

    A code that is unknown, already used or expired gets the same answer: there
    is nothing to tell apart for a caller holding a bad code, and saying which
    would help someone guessing.
    """
    session = handoffs.exchange(code)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown or expired handoff code")
    return session
