# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Where MCP credentials live.

The naive answer — "on the server" — does not survive contact with how `loop`
runs: the CLI spawns its own agent-runtimes process on a random port and kills
it when the session ends. A refresh token written there is gone by morning.

So there are two tiers (D26):

1. **Connected.** Tokens live in the Datalayer platform, keyed by user. Every
   front-end — the ephemeral local server, the SaaS server, the JupyterLab
   extension — reads them from the same place, which is the only arrangement
   where "authenticate once, works everywhere" is true rather than aspirational.
2. **Offline.** No Datalayer account, or no reachable platform: fall back to the
   OS keychain through the `keyring` library. The platform's own encryption, no
   key management of ours, and nothing readable in a config file.

The second tier has a sharp edge worth naming rather than discovering: on a
headless Linux box there is often no Secret Service backend, and `keyring`
refuses. That is a real answer ("no durable store here — connect an account"),
not a crash.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Optional, Protocol

logger = logging.getLogger(__name__)

#: Keyring service name under which MCP credentials are filed.
KEYRING_SERVICE = "datalayer-loop-mcp"

#: Refresh this many seconds before expiry, so a token never expires mid-call.
EXPIRY_MARGIN_SECONDS = 60


@dataclass
class OAuthToken:
    """What an authorization server gave us for one MCP server."""

    access_token: str
    token_type: str = "Bearer"
    refresh_token: Optional[str] = None
    #: Absolute epoch seconds. Absolute rather than a duration because a stored
    #: `expires_in` is meaningless once it has been sitting in a keychain.
    expires_at: Optional[float] = None
    scope: str = ""
    #: Client id from dynamic registration, needed to refresh later.
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    #: Where to go to refresh or revoke.
    token_endpoint: Optional[str] = None
    revocation_endpoint: Optional[str] = None

    def is_expired(self, *, now: Optional[float] = None, margin: float = EXPIRY_MARGIN_SECONDS) -> bool:
        """Whether this token is past use, counting the safety margin."""
        if self.expires_at is None:
            return False
        moment = now if now is not None else time.time()
        return self.expires_at - margin <= moment

    def to_json(self) -> str:
        return json.dumps(asdict(self))

    @classmethod
    def from_json(cls, raw: str) -> "OAuthToken":
        data = json.loads(raw)
        known = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in known})


class TokenStore(Protocol):
    """Somewhere durable to keep one user's MCP credentials."""

    #: Human name for the tier, shown when explaining where a token lives.
    name: str

    def available(self) -> bool:
        """Whether this store can actually be used right now."""

    def get(self, server_id: str) -> Optional[OAuthToken]: ...

    def put(self, server_id: str, token: OAuthToken) -> None: ...

    def delete(self, server_id: str) -> None: ...

    def list_servers(self) -> tuple[str, ...]: ...


@dataclass
class MemoryTokenStore:
    """Tokens for the length of one process. The tier of last resort.

    Used in tests, and when neither the platform nor a keychain is reachable —
    where the honest behaviour is "you will authenticate again next time",
    not a crash at the moment someone tries to connect a server.
    """

    name: str = "memory"
    _tokens: dict[str, OAuthToken] = field(default_factory=dict)

    def available(self) -> bool:
        return True

    def get(self, server_id: str) -> Optional[OAuthToken]:
        return self._tokens.get(server_id)

    def put(self, server_id: str, token: OAuthToken) -> None:
        self._tokens[server_id] = token

    def delete(self, server_id: str) -> None:
        self._tokens.pop(server_id, None)

    def list_servers(self) -> tuple[str, ...]:
        return tuple(sorted(self._tokens))


class KeyringTokenStore:
    """The offline tier: the operating system's own keychain.

    Uses `keyring`, so the encryption is the platform's and there is no key of
    ours to manage or leak. An index entry is kept alongside the credentials
    because keyrings can store values but cannot enumerate them.
    """

    name = "keyring"
    _INDEX_KEY = "__servers__"

    def __init__(self, service: str = KEYRING_SERVICE) -> None:
        self._service = service

    def _keyring(self) -> Any:
        try:
            import keyring
            from keyring.errors import NoKeyringError
        except ImportError:  # pragma: no cover - dependency absent
            return None
        try:
            backend = keyring.get_keyring()
        except Exception:  # noqa: BLE001  # pragma: no cover
            return None
        # A headless box often resolves to a backend that refuses on use.
        if backend is None or "fail" in type(backend).__name__.lower():
            return None
        _ = NoKeyringError  # imported for clarity about what "unavailable" means
        return keyring

    def available(self) -> bool:
        return self._keyring() is not None

    def get(self, server_id: str) -> Optional[OAuthToken]:
        keyring = self._keyring()
        if keyring is None:
            return None
        try:
            raw = keyring.get_password(self._service, server_id)
        except Exception as error:  # noqa: BLE001
            logger.warning("Could not read %s from the keychain: %s", server_id, error)
            return None
        if not raw:
            return None
        try:
            return OAuthToken.from_json(raw)
        except Exception as error:  # noqa: BLE001
            logger.warning("Stored credentials for %s are unreadable: %s", server_id, error)
            return None

    def put(self, server_id: str, token: OAuthToken) -> None:
        keyring = self._keyring()
        if keyring is None:
            raise RuntimeError(
                "No OS keychain is available here. Connect a Datalayer account "
                "so credentials can be stored, or run where a keychain exists."
            )
        keyring.set_password(self._service, server_id, token.to_json())
        self._index_add(server_id)

    def delete(self, server_id: str) -> None:
        keyring = self._keyring()
        if keyring is None:
            return
        try:
            keyring.delete_password(self._service, server_id)
        except Exception:  # noqa: BLE001
            pass  # Already gone is the outcome we wanted.
        self._index_remove(server_id)

    def list_servers(self) -> tuple[str, ...]:
        return tuple(sorted(self._index()))

    def _index(self) -> set[str]:
        keyring = self._keyring()
        if keyring is None:
            return set()
        try:
            raw = keyring.get_password(self._service, self._INDEX_KEY)
            return set(json.loads(raw)) if raw else set()
        except Exception:  # noqa: BLE001
            return set()

    def _write_index(self, servers: set[str]) -> None:
        keyring = self._keyring()
        if keyring is None:
            return
        keyring.set_password(self._service, self._INDEX_KEY, json.dumps(sorted(servers)))

    def _index_add(self, server_id: str) -> None:
        servers = self._index()
        servers.add(server_id)
        self._write_index(servers)

    def _index_remove(self, server_id: str) -> None:
        servers = self._index()
        servers.discard(server_id)
        self._write_index(servers)


#: Marks a secret as an MCP login rather than a user's own API key, so the two
#: never collide in one vault and a listing can tell them apart.
PLATFORM_SECRET_VARIANT = "mcp-oauth"

#: Secret name for a server's credentials.
def _secret_name(server_id: str) -> str:
    return f"mcp:{server_id}"


class PlatformTokenStore:
    """The connected tier: credentials held by the Datalayer platform.

    Not a new service — IAM already keeps per-user secrets in the vault, which
    is exactly what this needs: encrypted at rest, scoped to a user, reachable
    from wherever that user is. An MCP login is a secret with a variant that
    says what it is.

    That is what makes "authenticate once, works in every front-end" true: the
    ephemeral server the CLI spawns, the SaaS server and the JupyterLab
    extension all read the same vault, so a login survives the process that
    created it.
    """

    name = "platform"

    def __init__(self, base_url: str = "", token: str = "") -> None:
        self._base_url = (base_url or os.getenv("DATALAYER_IAM_URL") or "").rstrip("/")
        self._token = token or os.getenv("DATALAYER_API_KEY") or ""

    # -- plumbing ---------------------------------------------------------

    @property
    def _secrets_url(self) -> str:
        return f"{self._base_url}/api/iam/v1/secrets"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._token}",
            "content-type": "application/json",
        }

    def _request(self, method: str, url: str, **kwargs: Any) -> Any:
        import httpx

        response = httpx.request(
            method, url, headers=self._headers(), timeout=15.0, **kwargs
        )
        response.raise_for_status()
        return response.json() if response.content else {}

    def _secrets(self) -> list[dict[str, Any]]:
        """Every MCP secret this user has, with uids so one can be replaced."""
        payload = self._request("GET", self._secrets_url)
        secrets = payload.get("secrets") if isinstance(payload, dict) else payload
        return [
            secret
            for secret in (secrets or [])
            if isinstance(secret, dict)
            and secret.get("variant_s", secret.get("variant")) == PLATFORM_SECRET_VARIANT
        ]

    # -- the store --------------------------------------------------------

    def available(self) -> bool:
        """Whether there is a platform to talk to, and a way in.

        Conservative on purpose: a store that silently drops credentials is
        worse than one that says no and lets the keychain take over.
        """
        return bool(self._base_url and self._token)

    def get(self, server_id: str) -> Optional[OAuthToken]:
        name = _secret_name(server_id)
        try:
            values = self._request("GET", f"{self._secrets_url}/values")
        except Exception as error:  # noqa: BLE001
            logger.warning("Could not read credentials from the platform: %s", error)
            return None

        raw = (values or {}).get(name)
        if not raw:
            return None
        try:
            return OAuthToken.from_json(_decode(raw))
        except Exception as error:  # noqa: BLE001
            logger.warning("Stored credentials for %s are unreadable: %s", server_id, error)
            return None

    def put(self, server_id: str, token: OAuthToken) -> None:
        name = _secret_name(server_id)
        body = {
            "name": name,
            "description": f"MCP login for {server_id}",
            "variant": PLATFORM_SECRET_VARIANT,
            # The API's convention: clients base64 the value before sending.
            "value": _encode(token.to_json()),
        }

        existing = next(
            (s for s in self._secrets() if s.get("name_s", s.get("name")) == name),
            None,
        )
        if existing and existing.get("uid"):
            self._request("PUT", f"{self._secrets_url}/{existing['uid']}", json=body)
        else:
            self._request("POST", self._secrets_url, json=body)

    def delete(self, server_id: str) -> None:
        name = _secret_name(server_id)
        for secret in self._secrets():
            if secret.get("name_s", secret.get("name")) == name and secret.get("uid"):
                self._request("DELETE", f"{self._secrets_url}/{secret['uid']}")

    def list_servers(self) -> tuple[str, ...]:
        prefix = _secret_name("")
        names = [
            str(secret.get("name_s", secret.get("name", "")))
            for secret in self._secrets()
        ]
        return tuple(
            sorted(name[len(prefix) :] for name in names if name.startswith(prefix))
        )


def _encode(value: str) -> str:
    import base64

    return base64.b64encode(value.encode("utf-8")).decode("ascii")


def _decode(value: str) -> str:
    import base64

    try:
        return base64.b64decode(value).decode("utf-8")
    except Exception:  # noqa: BLE001
        # Tolerate a value that was stored unencoded: refusing to read a
        # credential because of its wrapping helps nobody.
        return value


def get_token_store(
    *,
    platform_base_url: str = "",
    platform_token: str = "",
    prefer: Optional[str] = None,
) -> TokenStore:
    """Pick the best tier available, most durable first.

    ``prefer`` forces a tier by name, for tests and for a user who wants to be
    told plainly that their choice is unavailable rather than quietly demoted.
    """
    candidates: list[TokenStore] = [
        PlatformTokenStore(platform_base_url, platform_token),
        KeyringTokenStore(),
        MemoryTokenStore(),
    ]

    if prefer:
        for store in candidates:
            if store.name == prefer:
                return store
        raise ValueError(f"Unknown token store {prefer!r}")

    for store in candidates:
        if store.available():
            if store.name == "memory":
                logger.warning(
                    "No durable credential store is available: MCP logins will "
                    "not survive this session."
                )
            return store
    return MemoryTokenStore()  # pragma: no cover - MemoryTokenStore is always available
