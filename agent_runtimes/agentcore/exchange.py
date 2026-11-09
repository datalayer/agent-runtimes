# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Exchange the token AgentCore validated for the platform's tokens (AC-06).

An AgentCore runtime behind Datalayer IAM's JWT authorizer is invoked with
IAM's RS256 token, its audience the runtime's ARN. That token opens the
runtime and nothing else: the record, ai-inference and the MCP servers
accept the platform's own tokens. Each invocation exchanges it at IAM
(RFC 8693) for two of them, as a pool pod holds ``DATALAYER_USER_TOKEN`` and
its inference token:

- the **platform token** (``audience`` :data:`PLATFORM_AUDIENCE`), the
  caller's token of the run: the record, the MCP servers, the metrics;
- the **inference token** (``audience`` :data:`INFERENCE_AUDIENCE`), what
  the run's model calls send to ai-inference.

``POST {DATALAYER_IAM_URL}/api/iam/v1/oauth/token``, form encoded, with
``resource`` the runtime's ARN (``AGENTCORE_RUNTIME_ARN``), which IAM checks
against the token's ``aud``. The answer is kept per inbound token until the
first of the two expires. A refusal is the invocation's: 401, in IAM's
sentence.

The exchange is on when ``AGENTCORE_RUNTIME_ARN`` is set: a runtime deployed
with a person's own AWS credentials and no Datalayer account is invoked with
SigV4, carries no IAM token, and runs with the headers it is given.
"""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Optional

import httpx

from agent_runtimes.guardrails.credentials import hold

#: RFC 8693's grant.
GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange"

#: What is exchanged: an access token.
ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token"

#: The runtime's own ARN: the ``resource`` of the exchange, the token's ``aud``.
RUNTIME_ARN_VARIABLE = "AGENTCORE_RUNTIME_ARN"

#: Where IAM answers.
IAM_URL_VARIABLE = "DATALAYER_IAM_URL"

#: IAM's token endpoint.
TOKEN_PATH = "/api/iam/v1/oauth/token"

#: The audience of the token the run's model calls send to ai-inference.
INFERENCE_AUDIENCE = "datalayer:ai-inference"

#: The audience of the caller's platform token (the record, the MCP servers).
PLATFORM_AUDIENCE = "datalayer:platform"

#: Seconds before a token's expiry it is exchanged again rather than used.
EXPIRY_MARGIN = 30.0

#: How long IAM is waited for, in seconds.
TIMEOUT = 10.0


class ExchangeRefused(Exception):
    """An exchange IAM refused or could not answer: a status and a sentence."""

    def __init__(self, status: int, sentence: str) -> None:
        self.status = status
        self.sentence = sentence
        super().__init__(sentence)


@dataclass(frozen=True)
class PlatformTokens:
    """The platform's tokens an invocation runs with."""

    #: The caller's token for the record, the MCP servers and the metrics.
    platform: str
    #: The token the run's model calls send to ai-inference.
    inference: str
    #: When the first of the two expires, in epoch seconds.
    expires_at: float


class TokenExchange:
    """Exchange inbound AgentCore tokens at IAM, kept per token until expiry.

    Parameters
    ----------
    iam_url : str
        Where IAM answers.
    runtime_arn : str
        This runtime's ARN, the inbound tokens' audience.
    client : Callable[[], httpx.AsyncClient], optional
        Make the HTTP client IAM is asked with (a test's transport).
    clock : Callable[[], float], optional
        The time, in epoch seconds.
    """

    def __init__(
        self,
        iam_url: str,
        runtime_arn: str,
        *,
        client: Optional[Callable[[], httpx.AsyncClient]] = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.iam_url = iam_url.rstrip("/")
        self.runtime_arn = runtime_arn
        self._client = client or (lambda: httpx.AsyncClient(timeout=TIMEOUT))
        self._clock = clock
        self._kept: dict[str, PlatformTokens] = {}
        self._lock = asyncio.Lock()

    async def tokens_for(self, inbound: str) -> PlatformTokens:
        """Return the platform tokens of an inbound token, exchanged once per expiry.

        Parameters
        ----------
        inbound : str
            The RS256 token AgentCore validated (the invocation's bearer).

        Returns
        -------
        PlatformTokens
            The platform and inference tokens, held as secrets.

        Raises
        ------
        ExchangeRefused
            When there is no inbound token, or IAM refuses or cannot be asked.
        """
        if not inbound:
            raise ExchangeRefused(
                401,
                "An invocation of this runtime carries the token AgentCore "
                "validated in its Authorization header.",
            )
        async with self._lock:
            now = self._clock()
            self._kept = {
                token: kept
                for token, kept in self._kept.items()
                if kept.expires_at - EXPIRY_MARGIN > now
            }
            kept = self._kept.get(inbound)
            if kept is not None:
                return kept
            async with self._client() as client:
                platform, platform_expiry = await self._exchange(
                    client, inbound, PLATFORM_AUDIENCE
                )
                inference, inference_expiry = await self._exchange(
                    client, inbound, INFERENCE_AUDIENCE
                )
            tokens = PlatformTokens(
                platform=platform,
                inference=inference,
                expires_at=min(platform_expiry, inference_expiry),
            )
            self._kept[inbound] = tokens
            return tokens

    async def _exchange(
        self, client: httpx.AsyncClient, inbound: str, audience: str
    ) -> tuple[str, float]:
        """Ask IAM for one token of ``audience``; answer it and when it expires."""
        url = f"{self.iam_url}{TOKEN_PATH}"
        try:
            response = await client.post(
                url,
                data={
                    "grant_type": GRANT_TYPE,
                    "subject_token": inbound,
                    "subject_token_type": ACCESS_TOKEN_TYPE,
                    "resource": self.runtime_arn,
                    "audience": audience,
                },
                headers={"Accept": "application/json"},
            )
        except httpx.HTTPError as error:
            raise ExchangeRefused(
                502,
                f"IAM at {self.iam_url} could not be asked to exchange the "
                f"invocation's token ({type(error).__name__}).",
            ) from error
        answer = _json_of(response)
        if response.status_code != 200:
            said = str(
                answer.get("error_description")
                or answer.get("error")
                or f"HTTP {response.status_code}"
            )
            raise ExchangeRefused(
                401, f"IAM refused the token AgentCore validated: {said}"
            )
        token = str(answer.get("access_token") or "")
        lifetime = answer.get("expires_in")
        if not token or not isinstance(lifetime, (int, float)):
            raise ExchangeRefused(
                502,
                "IAM answered the exchange without an access_token and its expires_in.",
            )
        hold(token)
        return token, self._clock() + float(lifetime)


def _json_of(response: httpx.Response) -> dict[str, Any]:
    """Read an answer's JSON object, or an empty one."""
    try:
        answer = response.json()
    except ValueError:
        return {}
    return answer if isinstance(answer, dict) else {}


def exchange_from_env(
    environ: Optional[Mapping[str, str]] = None,
) -> Optional[TokenExchange]:
    """Make the exchange the environment configures, or none when it is off.

    Parameters
    ----------
    environ : Mapping[str, str], optional
        The environment; ``os.environ`` when not given.

    Returns
    -------
    TokenExchange or None
        The exchange when ``AGENTCORE_RUNTIME_ARN`` is set, else ``None``.

    Raises
    ------
    ValueError
        When the runtime's ARN is set and IAM's URL is not, in a sentence.
    """
    env = os.environ if environ is None else environ
    arn = (env.get(RUNTIME_ARN_VARIABLE) or "").strip()
    if not arn:
        return None
    iam = (env.get(IAM_URL_VARIABLE) or "").strip()
    if not iam:
        raise ValueError(
            f"{RUNTIME_ARN_VARIABLE} is set, so each invocation's token is "
            f"exchanged at IAM, but {IAM_URL_VARIABLE} does not say where IAM is."
        )
    return TokenExchange(iam, arn)


#: This process's exchange, made from the environment when first asked.
_EXCHANGE: dict[str, Optional[TokenExchange]] = {}


def runtime_exchange() -> Optional[TokenExchange]:
    """Return this process's exchange, made from the environment once.

    Returns
    -------
    TokenExchange or None
        The exchange, or ``None`` when it is off.
    """
    if "current" not in _EXCHANGE:
        _EXCHANGE["current"] = exchange_from_env()
    return _EXCHANGE["current"]


def use_exchange(exchange: Optional[TokenExchange]) -> None:
    """Make ``exchange`` this process's (a test); ``None`` turns it off."""
    _EXCHANGE["current"] = exchange


def forget_exchange() -> None:
    """Forget this process's exchange: it is made from the environment again."""
    _EXCHANGE.clear()


__all__ = [
    "ACCESS_TOKEN_TYPE",
    "GRANT_TYPE",
    "IAM_URL_VARIABLE",
    "INFERENCE_AUDIENCE",
    "PLATFORM_AUDIENCE",
    "RUNTIME_ARN_VARIABLE",
    "TOKEN_PATH",
    "ExchangeRefused",
    "PlatformTokens",
    "TokenExchange",
    "exchange_from_env",
    "forget_exchange",
    "runtime_exchange",
    "use_exchange",
]
