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
provider and the scopes) to the sink the run set
(:func:`use_authorization_sink`), and the provider waits for the grant; with
no sink, :class:`AuthorizationRequired` carries the URL to the caller.

What a provider needs to know of the run — the agent, the person's token, the
deployment — is the run's identity context (:func:`use_identity_context`).
"""

from __future__ import annotations

import functools
import inspect
import os
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
    """What the providers are told of the run: ``agent_id``, ``bearer``,
    ``deployment_uid``, ``user_token``, ``workload_access_token``…"""
    reset = _CONTEXT.set(dict(context))
    try:
        yield
    finally:
        _CONTEXT.reset(reset)


def authorization_event(provider: str, scopes: Sequence[str], url: str) -> Any:
    """The AG-UI custom event that asks the person to grant ``provider``."""
    from ag_ui.core import CustomEvent

    return CustomEvent(
        name=AUTHORIZATION_EVENT,
        value={"provider": provider, "scopes": list(scopes), "url": url},
    )


def active_provider_id() -> str:
    """The provider the runtime's target sets: ``agentcore`` on AgentCore, else ``datalayer``."""
    from agent_runtimes.agentcore.target import AGENTCORE_TARGET_ID, TARGET_ENV
    from agent_runtimes.identity.datalayer import DATALAYER_IDENTITY_ID

    return (
        AGENTCORE_TARGET_ID
        if os.environ.get(TARGET_ENV) == AGENTCORE_TARGET_ID
        else DATALAYER_IDENTITY_ID
    )


def active_provider(platform: Any = None) -> IdentityProvider:
    """The accepted ``identity.provider`` contribution the runtime's target sets."""
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
    """A third party's access token for the person the run acts for."""
    chosen = identity if identity is not None else active_provider()
    sink = _SINK.get()
    on_auth_url: Optional[Callable[[str], Any]] = None
    if sink is not None:

        def on_auth_url(url: str) -> Any:
            return sink(authorization_event(provider, scopes, url))

    extra = {"force_authentication": True} if force_authentication else {}
    return await chosen.oauth_token(
        provider,
        list(scopes),
        flow,
        on_auth_url,
        context=_CONTEXT.get() if context is None else context,
        **extra,
    )


def requires_oauth(
    provider: str,
    *,
    scopes: Sequence[str],
    flow: str = "USER_FEDERATION",
    into: str = "access_token",
    force_authentication: bool = False,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Give a coroutine function ``provider``'s token as the keyword ``into``."""

    def decorate(function: Callable[..., Any]) -> Callable[..., Any]:
        if not inspect.iscoroutinefunction(function):
            raise TypeError(
                f"@requires_oauth decorates a coroutine function, and {function.__name__} is not: "
                "the grant may be waited for."
            )

        @functools.wraps(function)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            kwargs[into] = await oauth_token(
                provider,
                scopes=scopes,
                flow=flow,
                force_authentication=force_authentication,
            )
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
    "oauth_token",
    "requires_oauth",
    "use_authorization_sink",
    "use_identity_context",
]
