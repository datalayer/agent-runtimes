# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Third-party tokens for tools and skills, whatever the provider (ID-22).

One call::

    token = await identity.oauth_token("github", scopes=["read:user"])

or the decorator form, the shape of AWS's ``@requires_access_token`` so an
AgentCore sample ports in one line::

    @requires_oauth("github", scopes=["read:user"])
    async def my_repos(*, access_token: str) -> list[str]: ...

The provider is the runtime's: ``AGENT_RUNTIMES_TARGET=agentcore`` (set on
every AgentCore deployment) uses ``agentcore``, any other ``datalayer``; it is
read from the ``identity.provider`` contributions the seam accepted, and one
missing is refused, never replaced.

When the person must grant access first, the authorization URL is emitted as
an AG-UI custom event (``identity.authorization_required``, naming the
authorization, the agent, the provider and the scopes) to the sink the run set
(:func:`use_authorization_sink`), and the provider waits for the grant; with
no sink, :class:`AuthorizationRequired` carries the URL to the caller. The
person declining in the chat (:func:`decline_authorization`) ends the wait
with :class:`AuthorizationDeclined`; ``@requires_oauth`` ends its tool call
then, or on a timeout, with the refusal's sentence, and the agent carries on.
A visitor is never asked: the token is refused.

What a provider needs to know of the run — the agent, the person's token, the
deployment — is the run's identity context (:func:`use_identity_context`).
"""

from __future__ import annotations

import asyncio
import functools
import inspect
import os
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Callable, Iterator, Mapping, Optional, Sequence

from agent_runtimes.plugins.points import (
    IDENTITY_PROVIDERS,
    AuthorizationDeclined,
    AuthorizationRequired,
    AuthorizationTimedOut,
    IdentityProvider,
    IdentityRefused,
)

#: The AG-UI custom event's name for an authorization URL to show.
AUTHORIZATION_EVENT = "identity.authorization_required"

#: Where an authorization event goes for the run being served.
_SINK: ContextVar[Optional[Callable[[Any], Any]]] = ContextVar(
    "identity_authorization_sink", default=None
)
#: What a provider is told of the run being served.
_CONTEXT: ContextVar[Mapping[str, Any]] = ContextVar("identity_context", default={})
#: The authorizations shown and not yet answered, by id: set when declined.
_PENDING: dict[str, asyncio.Event] = {}


@contextmanager
def use_authorization_sink(sink: Callable[[Any], Any]) -> Iterator[None]:
    """Send the run's authorization events to ``sink`` (an AG-UI stream's emitter)."""
    reset = _SINK.set(sink)
    try:
        yield
    finally:
        _SINK.reset(reset)


@contextmanager
def use_identity_context(context: Mapping[str, Any]) -> Iterator[None]:
    """Hold what the providers are told of the run.

    The keys are ``agent_id``, ``bearer``, ``deployment_uid``, ``user_token``
    and ``workload_access_token``.
    """
    reset = _CONTEXT.set(dict(context))
    try:
        yield
    finally:
        _CONTEXT.reset(reset)


def authorization_event(
    authorization_id: str, agent: str, provider: str, scopes: Sequence[str], url: str
) -> Any:
    """Build the AG-UI custom event that asks the person to grant ``provider``."""
    from ag_ui.core import CustomEvent

    return CustomEvent(
        name=AUTHORIZATION_EVENT,
        value={
            "id": authorization_id,
            "agent": agent,
            "provider": provider,
            "scopes": list(scopes),
            "url": url,
        },
    )


def decline_authorization(authorization_id: str) -> bool:
    """End the wait for the grant ``authorization_id`` names: the person declined.

    Returns ``False`` when no authorization of that id waits (answered,
    timed out, or never shown).
    """
    declined = _PENDING.get(authorization_id)
    if declined is None:
        return False
    declined.set()
    return True


def _a_visitor_s() -> bool:
    """Tell whether the turn under way is a visitor's, or the runtime the visitors'."""
    from agent_runtimes.apps.visitors import in_visitor_turn, visitors_runtime

    return visitors_runtime() or in_visitor_turn()


def active_provider_id() -> str:
    """Return the provider the runtime's target sets: ``agentcore`` on AgentCore, else ``datalayer``."""
    from agent_runtimes.agentcore.target import AGENTCORE_TARGET_ID, TARGET_ENV
    from agent_runtimes.identity.datalayer import DATALAYER_IDENTITY_ID

    return (
        AGENTCORE_TARGET_ID
        if os.environ.get(TARGET_ENV) == AGENTCORE_TARGET_ID
        else DATALAYER_IDENTITY_ID
    )


def active_provider(platform: Any = None) -> IdentityProvider:
    """Return the accepted ``identity.provider`` contribution the runtime's target sets."""
    from agent_runtimes.plugins.host import accepted, session_platform

    wanted = active_provider_id()
    providers = accepted(session_platform(platform), IDENTITY_PROVIDERS)
    for contribution in providers:
        if contribution.id == wanted:
            return contribution.value
    raise IdentityRefused(
        f"No identity provider {wanted!r} is contributed: one of "
        f"{', '.join(c.id for c in providers) or 'none'}."
    )


async def oauth_token(
    provider: str,
    *,
    scopes: Sequence[str],
    flow: str = "USER_FEDERATION",
    force_authentication: bool = False,
    identity: Optional[IdentityProvider] = None,
    context: Optional[Mapping[str, Any]] = None,
) -> str:
    """Return a third party's access token for the person the run acts for."""
    if _a_visitor_s():
        raise IdentityRefused(
            f"A visitor grants no access to {provider}: this tool runs for a signed-in person."
        )
    chosen = identity if identity is not None else active_provider()
    told = _CONTEXT.get() if context is None else context
    extra = {"force_authentication": True} if force_authentication else {}
    sink = _SINK.get()
    if sink is None:
        return await chosen.oauth_token(
            provider, list(scopes), flow, None, context=told, **extra
        )
    authorization_id = uuid.uuid4().hex
    agent = str(told.get("agent_id") or "")

    def on_auth_url(url: str) -> Any:
        return sink(authorization_event(authorization_id, agent, provider, scopes, url))

    declined = asyncio.Event()
    _PENDING[authorization_id] = declined
    asked = asyncio.ensure_future(
        chosen.oauth_token(
            provider, list(scopes), flow, on_auth_url, context=told, **extra
        )
    )
    answered = asyncio.ensure_future(declined.wait())
    try:
        await asyncio.wait({asked, answered}, return_when=asyncio.FIRST_COMPLETED)
        if asked.done():
            return asked.result()
        asked.cancel()
        raise AuthorizationDeclined(
            f"Access to {provider} was declined: the tool call ends without it."
        )
    finally:
        _PENDING.pop(authorization_id, None)
        for task in (asked, answered):
            if not task.done():
                task.cancel()


def requires_oauth(
    provider: str,
    *,
    scopes: Sequence[str],
    flow: str = "USER_FEDERATION",
    into: str = "access_token",
    force_authentication: bool = False,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Give a coroutine function ``provider``'s token as the keyword ``into``.

    A grant declined or not completed in time ends the call with the
    refusal's sentence as its result, so the agent carries on without it.
    """

    def decorate(function: Callable[..., Any]) -> Callable[..., Any]:
        if not inspect.iscoroutinefunction(function):
            raise TypeError(
                f"@requires_oauth decorates a coroutine function, and {function.__name__} is not: "
                "the grant may be waited for."
            )

        @functools.wraps(function)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                kwargs[into] = await oauth_token(
                    provider,
                    scopes=scopes,
                    flow=flow,
                    force_authentication=force_authentication,
                )
            except (AuthorizationDeclined, AuthorizationTimedOut) as refused:
                return str(refused)
            return await function(*args, **kwargs)

        return wrapper

    return decorate


__all__ = [
    "AUTHORIZATION_EVENT",
    "AuthorizationDeclined",
    "AuthorizationRequired",
    "AuthorizationTimedOut",
    "IdentityRefused",
    "active_provider",
    "active_provider_id",
    "authorization_event",
    "decline_authorization",
    "oauth_token",
    "requires_oauth",
    "use_authorization_sink",
    "use_identity_context",
]
