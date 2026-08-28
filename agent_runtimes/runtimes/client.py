# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Runtimes API, speaking the sandbox vocabulary.

A pod and an in-process sandbox are the same idea at different scales, and for
a long time they were the same idea under different names: this service said
`terminate`, `code_sandboxes` said `stop`, and every caller that touched both
carried a private translation between them. Those translations disagreed.

So the client is written to `code_sandboxes.lifecycle` rather than wrapped in
something that speaks it — the verbs here *are* the verbs there. `RuntimesClient`
is the manager shape (`create`, `list`, `get`, `update`); `RuntimeHandle` narrows
it to one runtime and satisfies `SandboxLifecycle`, so code that works against a
`Sandbox` works against a pod without knowing which answered.

One verb the API genuinely cannot do is `execute`. Running code goes over the
kernel protocol, not REST, and `code_sandboxes.DatalayerSandbox` is what does it.
The client says so through `supports("execute")` rather than by failing late.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from typing import Any, Optional, Protocol

import requests
from code_sandboxes.lifecycle import (
    LIFECYCLE_OPERATIONS,
    MANAGER_OPERATIONS,
    runtimes_url,
    sandbox_snapshots_url,
    unsupported,
)
from datalayer_core.utils.defaults import get_default_credits_limit

logger = logging.getLogger(__name__)

#: Every verb except `execute`, which needs the kernel protocol rather than REST.
SUPPORTED_OPERATIONS: frozenset[str] = frozenset(LIFECYCLE_OPERATIONS) - {"execute"}


def _is_transient_runtime_create_error(message: str) -> bool:
    """Return True when the error looks transient and safe to retry."""
    lower = message.lower()
    return (
        "status=502" in lower
        or "status=503" in lower
        or "status=504" in lower
        or "bad gateway" in lower
        or "service unavailable" in lower
        or "gateway timeout" in lower
        or "timed out" in lower
        or "timeout" in lower
    )


class _Transport(Protocol):
    """What the client needs from whoever owns the credentials."""

    urls: Any

    def _fetch(self, request: str, **kwargs: Any) -> requests.Response: ...


def _failure(message: str) -> dict[str, Any]:
    logger.error(message)
    return {"success": False, "message": message}


def _with_details(message: str, response: requests.Response) -> str:
    """Append the server's own explanation, when it gave one."""
    try:
        details = response.json()
    except Exception:
        return message
    for key in ("message", "detail"):
        if key in details:
            return f"{message} - {details[key]}"
    return message


class RuntimesClient:
    """The Runtimes REST API in the converged vocabulary.

    Holds no credentials of its own: it borrows the authenticated transport of
    whoever built it, which is how the same client serves both `AgentClient`
    and `RuntimeService` without either handing over its token.
    """

    def __init__(self, transport: _Transport) -> None:
        self._transport = transport

    # -- plumbing ----------------------------------------------------------

    @property
    def _urls(self) -> Any:
        return self._transport.urls

    def _url(self, path: str = "") -> str:
        """A runtimes URL, spelled where the vocabulary spells it."""
        return f"{runtimes_url(self._urls.runtimes_url)}{path}"

    def _fetch(self, url: str, **kwargs: Any) -> requests.Response:
        return self._transport._fetch(url, **kwargs)

    def supports(self, operation: str) -> bool:
        """Whether the Runtimes API can do a lifecycle verb at all.

        `execute` is the one it cannot: code runs over the kernel protocol, and
        `code_sandboxes.DatalayerSandbox` is what speaks it.
        """
        return operation in SUPPORTED_OPERATIONS

    def handle(self, runtime_name: str) -> "RuntimeHandle":
        """Narrow this client to one runtime, in the `SandboxLifecycle` shape."""
        return RuntimeHandle(self, runtime_name)

    # -- manager verbs -----------------------------------------------------

    def create(  # noqa: C901
        self,
        environment_name: str = "python-env",
        given_name: Optional[str] = None,
        credits_limit: Optional[float] = None,
        from_snapshot_uid: Optional[str] = None,
        agent_spec_id: Optional[str] = None,
        agent_spec: Optional[dict[str, Any]] = None,
        billing_entity_uid: Optional[str] = None,
        billing_entity_type: Optional[str] = None,
        billing_entity_handle: Optional[str] = None,
        runtime_name: Optional[str] = None,
        content_attachment_uids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Create a runtime — ``POST /runtimes``.

        Parameters
        ----------
        environment_name : str
            Name of the environment to use.
        given_name : Optional[str]
            Custom name for the runtime.
        credits_limit : Optional[float]
            Credit limit for the runtime. Resolved from the account's
            reservations when not given.
        from_snapshot_uid : Optional[str]
            UID of the snapshot to create the runtime from.
        runtime_name : Optional[str]
            Pod name (``runtime-<ULID>``) the Contents attachments were made
            for; the runtime is created under it.
        content_attachment_uids : Optional[list[str]]
            Contents attachments to mount, created for ``runtime_name`` before the
            runtime: a Home Folder attachment mounts the caller's home
            folders, a Volume attachment mounts its Volume.

        Returns
        -------
        dict[str, Any]
            Response containing runtime creation details.
        """
        body: dict[str, Any] = {
            "type": "notebook",
            "environment": {"name": environment_name},
        }

        resolved_billing_entity_uid = (
            billing_entity_uid
            or os.environ.get("DATALAYER_ACCOUNT_UID")
            or os.environ.get("DATALAYER_BILLING_ENTITY_UID")
        )
        resolved_billing_entity_handle = billing_entity_handle or os.environ.get(
            "DATALAYER_ACCOUNT_HANDLE"
        )

        if given_name:
            body["given_name"] = given_name

        try:
            if credits_limit is None:
                credits_query = {}
                if resolved_billing_entity_uid:
                    credits_query["billing_entity_uid"] = resolved_billing_entity_uid
                response = self._fetch(
                    "{}/api/iam/v1/usage/credits".format(self._urls.iam_url),
                    method="GET",
                    params=credits_query or None,
                )

                if response.status_code != 200:
                    return _failure(
                        f"Failed to fetch credits: HTTP {response.status_code}"
                    )

                try:
                    raw_credits = response.json()
                except Exception as e:
                    return _failure(f"Failed to parse credits response: {str(e)}")

                if "success" in raw_credits and not raw_credits["success"]:
                    return _failure(
                        "Credits API returned error: "
                        f"{raw_credits.get('message', 'Unknown error')}"
                    )

                credits_limit = get_default_credits_limit(
                    raw_credits.get("reservations", []), raw_credits.get("credits", 0)
                )
                logger.debug("Runtime will use credits limit: %.2f", credits_limit)

            if credits_limit < sys.float_info.epsilon:
                return _failure(
                    "Credits reservation is not positive. Cannot create runtime."
                )

            body["credits_limit"] = credits_limit

            if from_snapshot_uid:
                body["from"] = from_snapshot_uid

            if agent_spec_id:
                body["agent_spec_id"] = agent_spec_id
            if agent_spec:
                body["agent_spec"] = agent_spec

            if resolved_billing_entity_uid:
                body["billing_entity_uid"] = resolved_billing_entity_uid
            if billing_entity_type:
                body["billing_entity_type"] = billing_entity_type
            if resolved_billing_entity_handle:
                body["billing_entity_handle"] = resolved_billing_entity_handle

            if runtime_name:
                body["runtime_name"] = runtime_name
            if content_attachment_uids:
                body["content_attachment_uids"] = list(content_attachment_uids)

            runtime_url = self._url()
            logger.debug(
                "Creating runtime via %s with payload keys=%s",
                runtime_url,
                sorted(body.keys()),
            )
            logger.debug("Runtime create payload: %s", body)

            response = None
            max_attempts = 4
            for attempt in range(1, max_attempts + 1):
                try:
                    response = self._fetch(runtime_url, method="POST", json=body)
                    break
                except Exception as e:
                    message = str(e)
                    is_transient = isinstance(
                        e, requests.exceptions.Timeout
                    ) or _is_transient_runtime_create_error(message)
                    if is_transient and attempt < max_attempts:
                        delay_seconds = 2 ** (attempt - 1)
                        logger.warning(
                            "Transient runtime create error (attempt %s/%s): %s. Retrying in %ss",
                            attempt,
                            max_attempts,
                            message,
                            delay_seconds,
                        )
                        time.sleep(delay_seconds)
                        continue
                    raise

            if response is None:
                return {
                    "success": False,
                    "message": "Failed to create runtime: no HTTP response",
                }

            if response.status_code not in [200, 201]:
                return _failure(
                    _with_details(
                        f"Failed to create runtime: HTTP {response.status_code}",
                        response,
                    )
                )

            try:
                result = response.json()
                if "success" in result and not result["success"]:
                    return _failure(
                        "Runtime creation failed: "
                        f"{result.get('message', 'Unknown error')}"
                    )

                logger.debug(
                    "Runtime created successfully: %s",
                    result.get("runtime", {}).get("uid", "N/A"),
                )
                return result
            except Exception as e:
                return _failure(f"Failed to parse runtime creation response: {str(e)}")

        except Exception as e:
            return _failure(f"Unexpected error during runtime creation: {str(e)}")

    def list(self) -> dict[str, Any]:
        """Every runtime this caller can see — ``GET /runtimes``."""
        try:
            response = self._fetch(self._url())

            if response.status_code != 200:
                return _failure(f"Failed to list runtimes: HTTP {response.status_code}")

            try:
                result = response.json()
                if "success" in result and not result["success"]:
                    return _failure(
                        f"List runtimes failed: {result.get('message', 'Unknown error')}"
                    )
                return result
            except Exception as e:
                return _failure(f"Failed to parse runtimes list response: {str(e)}")

        except Exception as e:
            return _failure(f"Unexpected error listing runtimes: {str(e)}")

    def get(self, runtime_name: str) -> dict[str, Any]:
        """One runtime, by name — ``GET /runtimes/{runtime_name}``."""
        try:
            response = self._fetch(self._url(f"/{runtime_name}"))

            if response.status_code != 200:
                return _failure(
                    _with_details(
                        f"Failed to get runtime: HTTP {response.status_code}", response
                    )
                )

            try:
                result = response.json()
                if "success" in result and not result["success"]:
                    return _failure(
                        f"Get runtime failed: {result.get('message', 'Unknown error')}"
                    )
                return result
            except Exception as e:
                return _failure(f"Failed to parse runtime response: {str(e)}")

        except Exception as e:
            return _failure(f"Unexpected error getting runtime {runtime_name}: {str(e)}")

    def update(self, runtime_name: str, capabilities: list[str]) -> dict[str, Any]:
        """Change a runtime in place — ``PUT /runtimes/{runtime_name}``."""
        try:
            response = self._fetch(
                self._url(f"/{runtime_name}"),
                method="PUT",
                json={"capabilities": capabilities},
            )

            if response.status_code not in [200, 201, 202]:
                return _failure(
                    _with_details(
                        f"Failed to update runtime: HTTP {response.status_code}",
                        response,
                    )
                )

            try:
                result = response.json()
                if "success" in result and not result["success"]:
                    return _failure(
                        f"Update runtime failed: {result.get('message', 'Unknown error')}"
                    )
                return result
            except Exception as e:
                return _failure(f"Failed to parse runtime update response: {str(e)}")

        except Exception as e:
            return _failure(f"Unexpected error updating runtime {runtime_name}: {str(e)}")

    # -- instance verbs ----------------------------------------------------

    def stop(self, runtime_name: str, reason: Optional[str] = None) -> dict[str, Any]:
        """Take a runtime down — ``DELETE /runtimes/{runtime_name}``.

        Works whether the runtime is running or paused: the endpoint reaps the
        pod in the first case and the checkpoints in the second, so a caller
        that only wants it gone does not have to know which it is.
        """
        try:
            response = self._fetch(
                self._url(f"/{runtime_name}"),
                method="DELETE",
                params={"reason": reason} if reason else None,
            )

            if response.status_code in [200, 204]:
                logger.debug("Runtime %s stopped successfully", runtime_name)
                return {"success": True, "message": "Runtime stopped successfully."}

            return _failure(
                _with_details(
                    f"Failed to stop runtime: HTTP {response.status_code}", response
                )
            )

        except Exception as e:
            return _failure(f"Unexpected error stopping runtime {runtime_name}: {str(e)}")

    def pause(self, runtime_name: str, **body: Any) -> dict[str, Any]:
        """Suspend a runtime, keeping its state — ``POST /runtimes/{runtime_name}/pause``.

        Returns as soon as the service accepts it: the checkpoint itself runs in
        the background, and the runtime reaches ``paused`` some time after this
        call returns.
        """
        return self._accepted(
            "pause", runtime_name, self._url(f"/{runtime_name}/pause"), body
        )

    def resume(self, runtime_name: str, **body: Any) -> dict[str, Any]:
        """Bring a paused runtime back — ``POST /runtimes/{runtime_name}/resume``.

        Also asynchronous: the restore runs in the background and the runtime
        goes ``resuming`` → ``running`` after this returns.
        """
        return self._accepted(
            "resume", runtime_name, self._url(f"/{runtime_name}/resume"), body
        )

    def _accepted(
        self, verb: str, runtime_name: str, url: str, body: dict[str, Any]
    ) -> dict[str, Any]:
        """POST something the service answers with 202, and read its reply."""
        try:
            response = self._fetch(url, method="POST", json=body or {})

            if response.status_code not in [200, 201, 202]:
                return _failure(
                    _with_details(
                        f"Failed to {verb} runtime: HTTP {response.status_code}",
                        response,
                    )
                )

            try:
                result = response.json()
            except Exception:
                return {"success": True, "message": f"Runtime {verb} accepted."}

            if "success" in result and not result["success"]:
                return _failure(
                    f"{verb.capitalize()} runtime failed: "
                    f"{result.get('message', 'Unknown error')}"
                )
            return result

        except Exception as e:
            return _failure(f"Unexpected error during {verb} of {runtime_name}: {str(e)}")

    def snapshot(self, runtime_name: str, name: str, **kwargs: Any) -> dict[str, Any]:
        """Capture a runtime's state under a name — ``POST /sandbox-snapshots``.

        The snapshot outlives the runtime it came from, which is why it is its
        own resource rather than a sub-path of the pod.
        """
        body: dict[str, Any] = {"runtime_name": runtime_name, "name": name, **kwargs}
        try:
            response = self._fetch(
                sandbox_snapshots_url(self._urls.runtimes_url),
                method="POST",
                json=body,
            )

            if response.status_code not in [200, 201, 202]:
                return _failure(
                    _with_details(
                        f"Failed to snapshot runtime: HTTP {response.status_code}",
                        response,
                    )
                )

            try:
                return response.json()
            except Exception as e:
                return _failure(f"Failed to parse snapshot response: {str(e)}")

        except Exception as e:
            return _failure(f"Unexpected error snapshotting {runtime_name}: {str(e)}")


class RuntimeHandle:
    """One runtime, in the `code_sandboxes.SandboxLifecycle` shape.

    The point of the narrowing: code written against a `Sandbox` — start it,
    pause it, snapshot it — runs unchanged against a pod, because the verbs are
    the same verbs. `run_code` is the exception and says so.
    """

    def __init__(self, client: RuntimesClient, runtime_name: str) -> None:
        self._client = client
        self.runtime_name = runtime_name

    def __repr__(self) -> str:
        return f"RuntimeHandle({self.runtime_name!r})"

    def supports(self, operation: str) -> bool:
        """Whether this runtime can do a verb — the manager verbs are not its own."""
        return operation not in MANAGER_OPERATIONS and self._client.supports(operation)

    def start(self, **kwargs: Any) -> None:
        """A runtime starts when it is created; there is nothing else to do.

        Idempotent by construction, which is what the vocabulary promises.
        """
        return None

    def stop(self, **kwargs: Any) -> None:
        """Take this runtime down."""
        self._client.stop(self.runtime_name, **kwargs)

    def pause(self, **kwargs: Any) -> None:
        """Suspend this runtime, keeping its state."""
        self._client.pause(self.runtime_name, **kwargs)

    def resume(self, **kwargs: Any) -> None:
        """Bring this runtime back with its state intact."""
        self._client.resume(self.runtime_name, **kwargs)

    def snapshot(self, name: str, **kwargs: Any) -> Any:
        """Capture this runtime's state under a name."""
        return self._client.snapshot(self.runtime_name, name, **kwargs)

    def run_code(self, code: str, **kwargs: Any) -> Any:
        """Not over REST. `code_sandboxes.DatalayerSandbox` speaks the kernel protocol."""
        raise unsupported("execute", "runtimes")

    def get(self) -> dict[str, Any]:
        """This runtime's current state."""
        return self._client.get(self.runtime_name)


class RuntimesMixin:
    """Gives a class the Runtimes API in the lifecycle vocabulary.

    The client borrows this object's authenticated transport rather than
    holding credentials of its own, so `AgentClient` and `RuntimeService` each
    reach the API as themselves::

        client.runtimes.create(environment_name="python-env")
        client.runtimes.stop(runtime_name)
        client.runtimes.handle(runtime_name).pause()
    """

    @property
    def runtimes(self) -> RuntimesClient:
        """The Runtimes API, borrowing this object's credentials."""
        cached = getattr(self, "_runtimes_client", None)
        if cached is None:
            cached = RuntimesClient(self)
            self._runtimes_client = cached
        return cached


__all__ = [
    "SUPPORTED_OPERATIONS",
    "RuntimeHandle",
    "RuntimesClient",
    "RuntimesMixin",
]
