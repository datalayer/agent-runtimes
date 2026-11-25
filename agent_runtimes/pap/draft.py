# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Additions of the Personal Agent Protocol's unpublished draft 1.1, each off until a host turns it on.

A runtime speaks the Personal Agent Protocol 1.0 as published, and announces nothing else.
Upstream's draft 1.1 adds to it, and says of itself that it can change until it is published.
Two of its additions concern a personal agent's sign-in, are standard OAuth and Web Bot Auth,
and a 1.0 company accepts or ignores them. A host may turn each on:

``AGENT_RUNTIMES_PAP_OFFLINE_ACCESS``
    A sign-in names the ``offline_access`` scope when the company's issuer lists it in its
    ``scopes_supported``. Some issuers give a refresh token only to a sign-in that asked for
    it. It is never one of the scopes granted.

``AGENT_RUNTIMES_PAP_OPERATOR_SIGNS_OAUTH``
    The operator signature a host contributes (``pap.operatorSigner``) also signs the agent's
    requests to a company's pushed authorization request, token, device authorization and
    revocation endpoints, over their content digest (:func:`operator_signer`).

Both are off by default, and both need a Personal Agent Protocol SDK that has them: the SDK's
pre-release ``personal-agent-protocol==1.1.0a1``, which an installation names itself, since
``pip`` never takes a pre-release otherwise. The stable SDK (1.0.x) has neither: a setting
turned on there is refused, saying which SDK it needs, instead of being silently off.
"""

from __future__ import annotations

import inspect
import os
from typing import Any

#: A sign-in asks for ``offline_access`` when the issuer lists it.
OFFLINE_ACCESS_ENV = "AGENT_RUNTIMES_PAP_OFFLINE_ACCESS"
#: The operator signature also signs the requests to the OAuth endpoints.
OPERATOR_SIGNS_OAUTH_ENV = "AGENT_RUNTIMES_PAP_OPERATOR_SIGNS_OAUTH"
#: The scope that asks an issuer for a refresh token (OpenID Connect Core 11).
OFFLINE_ACCESS_SCOPE = "offline_access"
#: The SDK release that first has the draft's additions.
DRAFT_SDK = "1.1.0a1"

_ON = frozenset({"1", "true", "yes", "on"})
_OFF = frozenset({"", "0", "false", "no", "off"})


class PapDraftUnavailable(RuntimeError):
    """A draft 1.1 addition is turned on and the installed SDK does not have it."""


def _sdk_version() -> str:
    from importlib.metadata import PackageNotFoundError, version

    try:
        return version("personal-agent-protocol")
    except PackageNotFoundError:
        import personal_agent_protocol

        return str(getattr(personal_agent_protocol, "__version__", "unknown"))


def sdk_has_offline_access() -> bool:
    """Whether the installed SDK's Device Sign-In reads the issuer's ``scopes_supported``."""
    from personal_agent_protocol import DeviceSignInClient

    return "scopes_supported" in inspect.signature(DeviceSignInClient.begin).parameters


def sdk_has_oauth_signatures() -> bool:
    """Whether the installed SDK's operator signer can sign the OAuth endpoints' requests."""
    from personal_agent_protocol.operator_signatures import WebBotAuthSigner

    return "oauth_endpoints" in inspect.signature(WebBotAuthSigner.__init__).parameters


_SDK_HAS = {
    OFFLINE_ACCESS_ENV: sdk_has_offline_access,
    OPERATOR_SIGNS_OAUTH_ENV: sdk_has_oauth_signatures,
}


def _unavailable(setting: str) -> PapDraftUnavailable:
    return PapDraftUnavailable(
        f"{setting} is on, and the installed personal-agent-protocol ({_sdk_version()}) does "
        f"not have what it turns on: install personal-agent-protocol=={DRAFT_SDK}, or leave "
        f"{setting} off"
    )


def enabled(setting: str, chosen: bool | None = None) -> bool:
    """Whether an addition is on: ``chosen`` when the host said, else its environment variable.

    Off by default. A value that is neither on nor off is refused, and so is an addition
    turned on with an SDK that does not have it (:class:`PapDraftUnavailable`).
    """
    if chosen is None:
        said = os.environ.get(setting, "").strip().lower()
        if said in _OFF:
            return False
        if said not in _ON:
            raise ValueError(f"{setting} is true or false")
    elif not chosen:
        return False
    if not _SDK_HAS[setting]():
        raise _unavailable(setting)
    return True


def offline_access(chosen: bool | None = None) -> bool:
    """Whether a sign-in asks for ``offline_access`` when the issuer lists it."""
    return enabled(OFFLINE_ACCESS_ENV, chosen)


def operator_signs_oauth(chosen: bool | None = None) -> bool:
    """Whether the operator signature also signs the requests to the OAuth endpoints."""
    return enabled(OPERATOR_SIGNS_OAUTH_ENV, chosen)


def sign_in_scopes(metadata: Any, on: bool) -> dict[str, Any]:
    """What a sign-in is given so that it names ``offline_access`` when the issuer lists it.

    The issuer's ``scopes_supported``, for the SDK to read, when the addition is on; nothing
    otherwise, and the request then names the account scopes alone, as the stable SDK does.
    """
    if not on:
        return {}
    return {"scopes_supported": getattr(metadata, "scopes_supported", None)}


def operator_signer(
    key: Any,
    *,
    signature_agent: str,
    oauth_endpoints: bool | None = None,
    **options: Any,
) -> Any:
    """The SDK's ``WebBotAuthSigner`` for a host's ``pap.operatorSigner``.

    With the addition on (``oauth_endpoints``, else ``AGENT_RUNTIMES_PAP_OPERATOR_SIGNS_OAUTH``)
    it also signs the requests to the OAuth endpoints; off, it is the signer the stable SDK
    makes, which signs the requests that carry the Session header.
    """
    from personal_agent_protocol.operator_signatures import WebBotAuthSigner

    if operator_signs_oauth(oauth_endpoints):
        return WebBotAuthSigner(
            key, signature_agent=signature_agent, oauth_endpoints=True, **options
        )
    return WebBotAuthSigner(key, signature_agent=signature_agent, **options)


__all__ = [
    "DRAFT_SDK",
    "OFFLINE_ACCESS_ENV",
    "OFFLINE_ACCESS_SCOPE",
    "OPERATOR_SIGNS_OAUTH_ENV",
    "PapDraftUnavailable",
    "enabled",
    "offline_access",
    "operator_signer",
    "operator_signs_oauth",
    "sdk_has_oauth_signatures",
    "sdk_has_offline_access",
    "sign_in_scopes",
]
