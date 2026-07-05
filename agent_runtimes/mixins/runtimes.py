# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Runtime management module for Datalayer Core."""

import logging
import os
import sys
import time
from typing import Any, Optional

import requests

from datalayer_core.utils.defaults import get_default_credits_limit

logger = logging.getLogger(__name__)


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


class RuntimesCreateMixin:
    """Mixin for creating a Datalayer Runtime."""

    def _create_runtime(
        self,
        environment_name: str = "python-env",
        given_name: Optional[str] = None,
        credits_limit: Optional[float] = None,
        from_snapshot_uid: Optional[str] = None,
        agent_spec_id: Optional[str] = None,
        agent_spec: Optional[dict[str, Any]] = None,
        billable_account_uid: Optional[str] = None,
        billable_account_type: Optional[str] = None,
        billable_account_handle: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Create a Runtime with the given environment name.

        Parameters
        ----------
        environment_name : str
            Name of the environment to use.
        given_name : Optional[str]
            Custom name for the runtime.
        credits_limit : Optional[float]
            Credit limit for the runtime.
        from_snapshot_uid : Optional[str]
            UID of snapshot to create runtime from.

        Returns
        -------
        dict[str, Any]
            Response containing runtime creation details.
        """
        body: dict[str, Any] = {
            "type": "notebook",
            "environment_name": environment_name,
        }

        resolved_billable_account_uid = (
            billable_account_uid
            or os.environ.get("DATALAYER_ACCOUNT_UID")
            or os.environ.get("DATALAYER_BILLABLE_ACCOUNT_UID")
        )
        resolved_billable_account_handle = (
            billable_account_handle or os.environ.get("DATALAYER_ACCOUNT_HANDLE")
        )

        if given_name:
            body["given_name"] = given_name

        try:
            if credits_limit is None:
                response = self._fetch(
                    "{}/api/iam/v1/usage/credits".format(self.urls.iam_url),
                    method="GET",
                )

                if response.status_code != 200:
                    error_msg = f"Failed to fetch credits: HTTP {response.status_code}"
                    logger.error(error_msg)
                    return {"success": False, "message": error_msg}

                try:
                    raw_credits = response.json()
                except Exception as e:
                    error_msg = f"Failed to parse credits response: {str(e)}"
                    logger.error(error_msg)
                    return {"success": False, "message": error_msg}

                if "success" in raw_credits and not raw_credits["success"]:
                    error_msg = f"Credits API returned error: {raw_credits.get('message', 'Unknown error')}"
                    logger.error(error_msg)
                    return {"success": False, "message": error_msg}

                credits_limit = get_default_credits_limit(
                    raw_credits.get("reservations", []), raw_credits.get("credits", 0)
                )
                logger.debug("Runtime will use credits limit: %.2f", credits_limit)

            if credits_limit < sys.float_info.epsilon:
                error_msg = (
                    "Credits reservation is not positive. Cannot create runtime."
                )
                logger.error(error_msg)
                return {"success": False, "message": error_msg}

            body["credits_limit"] = credits_limit

            if from_snapshot_uid:
                body["from"] = from_snapshot_uid

            if agent_spec_id:
                body["agent_spec_id"] = agent_spec_id
            if agent_spec:
                body["agent_spec"] = agent_spec

            if resolved_billable_account_uid:
                body["billable_account_uid"] = resolved_billable_account_uid
            if billable_account_type:
                body["billable_account_type"] = billable_account_type
            if resolved_billable_account_handle:
                body["billable_account_handle"] = resolved_billable_account_handle

            runtime_url = "{}/api/runtimes/v1/runtimes".format(self.urls.runtimes_url)
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
                    response = self._fetch(
                        runtime_url,
                        method="POST",
                        json=body,
                    )
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
                error_msg = f"Failed to create runtime: HTTP {response.status_code}"
                logger.error(error_msg)
                try:
                    error_details = response.json()
                    if "message" in error_details:
                        error_msg += f" - {error_details['message']}"
                        logger.error("Details: %s", error_details["message"])
                except Exception:
                    pass
                return {"success": False, "message": error_msg}

            try:
                result = response.json()
                if "success" in result and not result["success"]:
                    error_msg = f"Runtime creation failed: {result.get('message', 'Unknown error')}"
                    logger.error(error_msg)
                    return {"success": False, "message": error_msg}

                logger.debug(
                    "Runtime created successfully: %s",
                    result.get("runtime", {}).get("uid", "N/A"),
                )
                return result
            except Exception as e:
                error_msg = f"Failed to parse runtime creation response: {str(e)}"
                logger.error(error_msg)
                return {"success": False, "message": error_msg}

        except Exception as e:
            error_msg = f"Unexpected error during runtime creation: {str(e)}"
            logger.error(error_msg)
            return {"success": False, "message": error_msg}


class RuntimesListMixin:
    """Mixin for listing Datalayer runtimes."""

    def _list_runtimes(self) -> dict[str, Any]:
        """
        List all available runtimes.

        Returns
        -------
        dict
            A dictionary containing the response.
        """
        try:
            response = self._fetch(
                "{}/api/runtimes/v1/runtimes".format(self.urls.runtimes_url),
            )

            if response.status_code != 200:
                error_msg = f"Failed to list runtimes: HTTP {response.status_code}"
                logger.error(error_msg)
                return {"success": False, "message": error_msg}

            try:
                result = response.json()
                if "success" in result and not result["success"]:
                    error_msg = f"List runtimes failed: {result.get('message', 'Unknown error')}"
                    logger.error(error_msg)
                    return {"success": False, "message": error_msg}

                return result
            except Exception as e:
                error_msg = f"Failed to parse runtimes list response: {str(e)}"
                logger.error(error_msg)
                return {"success": False, "message": error_msg}

        except Exception as e:
            error_msg = f"Unexpected error listing runtimes: {str(e)}"
            logger.error(error_msg)
            return {"success": False, "message": error_msg}


class RuntimesTerminateMixin:
    """
    Mixin for terminating Datalayer runtimes.
    """

    def _terminate_runtime(self: Any, pod_name: str) -> dict[str, Any]:
        """
        Terminate a Runtime with the given kernel ID.

        Parameters
        ----------
        pod_name : str
            The pod name of the runtime to terminate.

        Returns
        -------
        dict[str, Any]
            Response containing termination status.
        """
        try:
            response = self._fetch(
                "{}/api/runtimes/v1/runtimes/{}".format(
                    self.urls.runtimes_url, pod_name
                ),
                method="DELETE",
            )

            if response.status_code in [200, 204]:
                logger.debug("Runtime %s terminated successfully", pod_name)
                return {
                    "success": True,
                    "message": "Runtime terminated successfully.",
                }
            else:
                error_msg = f"Failed to terminate runtime: HTTP {response.status_code}"
                logger.error(error_msg)
                try:
                    error_details = response.json()
                    if "message" in error_details:
                        error_msg += f" - {error_details['message']}"
                        logger.error("Details: %s", error_details["message"])
                except Exception:
                    pass
                return {"success": False, "message": error_msg}

        except Exception as e:
            error_msg = f"Unexpected error terminating runtime {pod_name}: {str(e)}"
            logger.error(error_msg)
            return {"success": False, "message": error_msg}


class RuntimesGetMixin:
    """Mixin for reading a single Datalayer runtime."""

    def _get_runtime(self: Any, pod_name: str) -> dict[str, Any]:
        """
        Get a single Runtime by pod name.

        Parameters
        ----------
        pod_name : str
            The pod name of the runtime to fetch.

        Returns
        -------
        dict[str, Any]
            Response containing the runtime payload.
        """
        try:
            response = self._fetch(
                "{}/api/runtimes/v1/runtimes/{}".format(
                    self.urls.runtimes_url, pod_name
                ),
            )

            if response.status_code != 200:
                error_msg = f"Failed to get runtime: HTTP {response.status_code}"
                logger.error(error_msg)
                try:
                    error_details = response.json()
                    if "message" in error_details:
                        error_msg += f" - {error_details['message']}"
                except Exception:
                    pass
                return {"success": False, "message": error_msg}

            try:
                result = response.json()
                if "success" in result and not result["success"]:
                    error_msg = f"Get runtime failed: {result.get('message', 'Unknown error')}"
                    logger.error(error_msg)
                    return {"success": False, "message": error_msg}
                return result
            except Exception as e:
                error_msg = f"Failed to parse runtime response: {str(e)}"
                logger.error(error_msg)
                return {"success": False, "message": error_msg}

        except Exception as e:
            error_msg = f"Unexpected error getting runtime {pod_name}: {str(e)}"
            logger.error(error_msg)
            return {"success": False, "message": error_msg}


class RuntimesUpdateMixin:
    """Mixin for updating a Datalayer runtime."""

    def _update_runtime(
        self: Any,
        pod_name: str,
        capabilities: list[str],
    ) -> dict[str, Any]:
        """
        Update a Runtime's capabilities.

        Parameters
        ----------
        pod_name : str
            The pod name of the runtime to update.
        capabilities : list[str]
            New capabilities to apply to the runtime.

        Returns
        -------
        dict[str, Any]
            Response containing the update status.
        """
        try:
            response = self._fetch(
                "{}/api/runtimes/v1/runtimes/{}".format(
                    self.urls.runtimes_url, pod_name
                ),
                method="PUT",
                json={"capabilities": capabilities},
            )

            if response.status_code not in [200, 201, 202]:
                error_msg = f"Failed to update runtime: HTTP {response.status_code}"
                logger.error(error_msg)
                try:
                    error_details = response.json()
                    if "message" in error_details:
                        error_msg += f" - {error_details['message']}"
                    elif "detail" in error_details:
                        error_msg += f" - {error_details['detail']}"
                except Exception:
                    pass
                return {"success": False, "message": error_msg}

            try:
                result = response.json()
                if "success" in result and not result["success"]:
                    error_msg = f"Update runtime failed: {result.get('message', 'Unknown error')}"
                    logger.error(error_msg)
                    return {"success": False, "message": error_msg}
                return result
            except Exception as e:
                error_msg = f"Failed to parse runtime update response: {str(e)}"
                logger.error(error_msg)
                return {"success": False, "message": error_msg}

        except Exception as e:
            error_msg = f"Unexpected error updating runtime {pod_name}: {str(e)}"
            logger.error(error_msg)
            return {"success": False, "message": error_msg}


class RuntimesMixin(
    RuntimesCreateMixin,
    RuntimesListMixin,
    RuntimesGetMixin,
    RuntimesUpdateMixin,
    RuntimesTerminateMixin,
):
    """
    Mixin class that provides runtime management functionality.
    """
