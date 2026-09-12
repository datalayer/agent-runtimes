# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Getting a token with nobody at the keyboard.

`oauth.py` is the flow with a person in it: a browser, a consent screen, a
redirect. A service agent — an agent that runs on a schedule, a CI job, a
sub-agent a parent launched — has none of those, and the authorization-code
flow cannot be made to work for it by any amount of automation.

Two grants, both RFC, both without a redirect:

- **`client_credentials`** (RFC 6749 §4.4). The agent *is* the principal. It
  proves itself with a secret or with the assertion below, and gets a token
  for itself rather than for a person.
- **`private_key_jwt`** (RFC 7523 §2.2) as the client authentication *method*
  for either grant. The agent signs a short-lived assertion with a private key
  the authorization server never sees, instead of sending a shared secret.
  Which matters for a reason worth stating: a client secret is a bearer
  credential that has to be transmitted to be used, so every party that
  handles a request handles the secret. An assertion is not — the key stays
  where it was generated, and what crosses the wire is useless a minute later
  and at any other endpoint.

Three properties this file is mostly about.

**A machine token carries no refresh token.** RFC 6749 §4.4.3 says one SHOULD
NOT be issued, and this drops one that arrives anyway. A refresh token is a
long-lived credential; the whole point of a machine identity is that getting a
new token costs one call to an endpoint the agent already has credentials for.
Keeping a refresh token beside those credentials means a stolen refresh token
outlives the secret rotation that was supposed to end it.

**An assertion is bound to one endpoint and one moment.** `aud` is the token
endpoint, not the issuer (RFC 7523 §3), so an assertion minted for one
authorization server cannot be replayed at another. `jti` is unique and `exp`
is two minutes out, so one that is captured is worth nothing by the time it is
read.

**A secret is never in a token record, a log, or an error.** The message a
person sees says what was refused, not what was sent.

@module agent_runtimes.mcp.auth.machine
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

from agent_runtimes.mcp.auth.oauth import OAuthError, ServerMetadata, _token_from_payload
from agent_runtimes.mcp.auth.tokens import OAuthToken

logger = logging.getLogger(__name__)

#: RFC 7523 §2.2: what `client_assertion_type` must say for a private-key JWT.
CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"

#: How long an assertion is valid. Two minutes: long enough for clock skew
#: between the agent and the authorization server, short enough that one
#: captured in transit is worthless before it can be used.
ASSERTION_LIFETIME_SECONDS = 120

#: The signing algorithms this will use. Asymmetric only — an `HS256`
#: assertion is signed with a shared secret, which is the thing private-key
#: JWT exists to stop sending. `none` is not a signature.
ASSERTION_ALGORITHMS = frozenset({"RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "PS256"})


class MachineAuthError(OAuthError):
    """A machine identity could not get a token."""


@dataclass
class ClientCredentials:
    """What a service agent proves itself with.

    Either a secret or a key, never both in use at once: a client configured
    with both would silently pick one, and which one it picked is exactly what
    somebody debugging a refused token needs to know.
    """

    client_id: str
    client_secret: Optional[str] = None
    #: PEM. Never logged, never stored in an `OAuthToken`.
    private_key: Optional[str] = None
    private_key_id: Optional[str] = None
    algorithm: str = "RS256"
    #: What the token should be good for. Empty asks the server for its
    #: default, which for the Datalayer gateway is the agent's granted scopes.
    scope: str = ""

    def __post_init__(self) -> None:
        if not self.client_id:
            raise MachineAuthError("a service agent needs a client id")
        if bool(self.client_secret) == bool(self.private_key):
            raise MachineAuthError(
                "a service agent authenticates with a client secret or a "
                "private key, not both and not neither"
            )
        if self.private_key and self.algorithm not in ASSERTION_ALGORITHMS:
            raise MachineAuthError(
                f"{self.algorithm} cannot sign a client assertion; use one of "
                f"{', '.join(sorted(ASSERTION_ALGORITHMS))}. A symmetric "
                f"algorithm would sign with the secret this method exists to "
                f"avoid sending."
            )

    @property
    def method(self) -> str:
        """How this authenticates, for a log line that has to stay truthful."""
        return "private_key_jwt" if self.private_key else "client_secret_post"

    def __repr__(self) -> str:
        """Never the secret, never the key.

        The generated dataclass repr would print both, and this object appears
        in tracebacks, in `logger.debug("%s", credentials)`, and in any
        debugger somebody attaches. A credential printed once is a credential
        in a log aggregator forever.
        """
        return f"ClientCredentials(client_id={self.client_id!r}, method={self.method!r})"


def build_assertion(
    credentials: ClientCredentials,
    token_endpoint: str,
    *,
    now: Optional[float] = None,
    lifetime: int = ASSERTION_LIFETIME_SECONDS,
) -> str:
    """One single-use JWT proving the client holds the key (RFC 7523 §2.2).

    `aud` is the **token endpoint**, which is what binds the assertion to one
    authorization server. Using the issuer instead — an easy mistake, since
    every other `aud` in OAuth names an issuer or a resource — would let an
    assertion captured at one server be presented at another that trusts the
    same key.
    """
    if not credentials.private_key:
        raise MachineAuthError("no private key to sign a client assertion with")
    if not token_endpoint:
        raise MachineAuthError(
            "a client assertion is bound to the token endpoint, and there is none"
        )
    try:
        import jwt  # noqa: PLC0415
    except ImportError as error:  # pragma: no cover - packaging
        raise MachineAuthError(
            "signing a client assertion needs PyJWT with cryptography installed"
        ) from error

    moment = int(now if now is not None else time.time())
    claims = {
        # RFC 7523 §3: the client is both the issuer and the subject.
        "iss": credentials.client_id,
        "sub": credentials.client_id,
        "aud": token_endpoint,
        "jti": uuid.uuid4().hex,
        "iat": moment,
        "exp": moment + int(lifetime),
    }
    headers = {"kid": credentials.private_key_id} if credentials.private_key_id else None
    try:
        return jwt.encode(
            claims, credentials.private_key, algorithm=credentials.algorithm, headers=headers
        )
    except Exception as error:  # noqa: BLE001
        # The key itself must not reach the message. "Bad key" plus the
        # algorithm is enough to fix it; the PEM in a log is a new incident.
        raise MachineAuthError(
            f"the private key could not sign a {credentials.algorithm} assertion; "
            f"check that it is a PEM private key of the right type"
        ) from error


def _authentication_fields(
    credentials: ClientCredentials, token_endpoint: str, *, now: Optional[float] = None
) -> dict[str, str]:
    """The client-authentication half of a token request."""
    if credentials.private_key:
        return {
            "client_assertion_type": CLIENT_ASSERTION_TYPE,
            "client_assertion": build_assertion(credentials, token_endpoint, now=now),
        }
    return {"client_secret": credentials.client_secret or ""}


def _drop_refresh(token: OAuthToken) -> OAuthToken:
    """A machine token holds no refresh token, whatever the server sent.

    RFC 6749 §4.4.3 says one SHOULD NOT be issued for `client_credentials`,
    and a server that sends one anyway is handing the agent a second,
    longer-lived credential to look after. The agent already holds what it
    needs to ask again.
    """
    if token.refresh_token is None:
        return token
    logger.debug(
        "The authorization server returned a refresh token for a "
        "client_credentials grant; dropping it (RFC 6749 §4.4.3)"
    )
    token.refresh_token = None
    return token


async def fetch_token(
    credentials: ClientCredentials,
    metadata: ServerMetadata,
    *,
    resource: str = "",
    timeout: float = 10.0,
    now: Optional[float] = None,
) -> OAuthToken:
    """A token for the agent itself — `client_credentials`, no redirect.

    `resource` (RFC 8707) is what makes the token's `aud` name the MCP server
    rather than being good at whatever else the authorization server protects.
    Sent whenever it is known, because a token with no audience is a token any
    resource that trusts this issuer will accept.
    """
    if not metadata.token_endpoint:
        raise MachineAuthError(
            "the authorization server metadata names no token endpoint"
        )
    body: dict[str, str] = {
        "grant_type": "client_credentials",
        "client_id": credentials.client_id,
        **_authentication_fields(credentials, metadata.token_endpoint, now=now),
    }
    if credentials.scope:
        body["scope"] = credentials.scope
    target = resource or metadata.resource or ""
    if target:
        body["resource"] = target

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(metadata.token_endpoint, data=body)
    if response.status_code != 200:
        raise MachineAuthError(
            f"the service agent {credentials.client_id} was refused a token "
            f"({response.status_code}) using {credentials.method}: "
            f"{response.text[:200]}"
        )

    return _drop_refresh(
        _token_from_payload(
            response.json(),
            metadata,
            client_id=credentials.client_id,
            # Deliberately not `credentials.client_secret`. `oauth.py` keeps
            # the secret on the token so a later refresh can be made from the
            # record alone; a machine token is re-fetched from the
            # `ClientCredentials` the caller already holds, so storing it here
            # would copy a credential into something that gets serialised into
            # a keychain, a log and any JSON dump of the session.
            client_secret=None,
            now=now,
        )
    )


async def exchange_for_subagent(
    token: OAuthToken,
    metadata: ServerMetadata,
    *,
    audience: str = "",
    scope: str = "",
    credentials: Optional[ClientCredentials] = None,
    timeout: float = 10.0,
    now: Optional[float] = None,
) -> OAuthToken:
    """A narrower token for a sub-agent, delegated from this one (RFC 8693).

    The parent's token is the `subject_token`; what comes back names the
    parent in `act` so the platform can attribute what the sub-agent does to
    the chain that launched it.

    `scope` here can only *narrow*: the authorization server decides, and this
    asks. Nothing on this side should treat the request as the answer — a
    caller that logs "narrowed to notebooks:read" before reading the response
    is describing what it wanted rather than what it got.
    """
    if not metadata.token_endpoint:
        raise MachineAuthError("the authorization server metadata names no token endpoint")
    if not token.access_token:
        raise MachineAuthError("there is no token to exchange")

    body: dict[str, str] = {
        "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
        "subject_token": token.access_token,
        "subject_token_type": "urn:ietf:params:oauth:token-type:access_token",
        "requested_token_type": "urn:ietf:params:oauth:token-type:access_token",
    }
    if audience:
        body["audience"] = audience
    if scope:
        body["scope"] = scope
    if credentials is not None:
        body["client_id"] = credentials.client_id
        body.update(_authentication_fields(credentials, metadata.token_endpoint, now=now))
    elif token.client_id:
        body["client_id"] = token.client_id

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(metadata.token_endpoint, data=body)
    if response.status_code != 200:
        raise MachineAuthError(
            f"the sub-agent token exchange was refused ({response.status_code}): "
            f"{response.text[:200]}"
        )

    # A delegated token is as short-lived as the server made it and is not
    # refreshable on its own: refreshing it would be the sub-agent renewing a
    # delegation the parent may have ended. And the parent's credential does
    # not travel with it — see `fetch_token`.
    return _drop_refresh(
        _token_from_payload(
            response.json(),
            metadata,
            client_id=(credentials.client_id if credentials else token.client_id) or "",
            client_secret=None,
            now=now,
        )
    )


@dataclass
class MachineTokenProvider:
    """Holds a machine token and gets a new one when it runs out.

    The `Authorization` header of every call goes through `authorization()`,
    which is where the expiry is checked. Checking at use rather than on a
    timer is what makes a token that expired while the agent was idle a
    non-event: the next call notices, and a call is the only place it matters.
    """

    credentials: ClientCredentials
    metadata: ServerMetadata
    resource: str = ""
    _token: Optional[OAuthToken] = field(default=None, repr=False)

    async def token(self, *, now: Optional[float] = None) -> OAuthToken:
        current = self._token
        if current is not None and not current.is_expired(now=now):
            return current
        self._token = await fetch_token(
            self.credentials, self.metadata, resource=self.resource, now=now
        )
        return self._token

    async def authorization(self, *, now: Optional[float] = None) -> str:
        issued = await self.token(now=now)
        return f"{issued.token_type} {issued.access_token}"

    def forget(self) -> None:
        """Drop the cached token, so the next call asks for a new one.

        What a caller does on a `401`: the server has decided this token is no
        longer good, and the agent's own expiry check cannot know that.
        """
        self._token = None

    def __repr__(self) -> str:
        # A dataclass repr would print the credentials, and a credentials
        # repr would print the key. This is what ends up in a traceback.
        return (
            f"MachineTokenProvider(client_id={self.credentials.client_id!r}, "
            f"method={self.credentials.method!r}, "
            f"token={'held' if self._token else 'none'})"
        )
