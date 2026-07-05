# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Kernel manager for Datalayer runtimes."""

from __future__ import annotations

import re
import time
from typing import Any, Optional

import requests
from datalayer_core.utils.date import timestamp_to_local_date
from datalayer_core.utils.urls import DatalayerURLs
from jupyter_kernel_client.manager import REQUEST_TIMEOUT, KernelHttpManager
from jupyter_server.utils import url_path_join

from agent_runtimes.client import DatalayerClient
from agent_runtimes.displays.runtimes import display_runtimes

HTTP_PROTOCOL_REGEXP = re.compile(r"^http")


class RuntimeManager(KernelHttpManager):
    """
    Manages a single Runtime.

    Parameters
    ----------
    run_url : str
        The runtime URL.
    token : str
        Authentication token.
    username : str
        Username for the runtime.
    **kwargs : dict[str, Any]
        Additional keyword arguments.
    """

    def __init__(
        self, run_url: str, token: str, username: str, **kwargs: dict[str, Any]
    ):
        """
        Initialize the gateway Runtime manager.

        Parameters
        ----------
        run_url : str
            The runtime URL.
        token : str
            Authentication token.
        username : str
            Username for the runtime.
        **kwargs : dict[str, Any]
            Additional keyword arguments.
        """
        _ = kwargs.pop("kernel_id", None)  # kernel_id not supported
        super().__init__(server_url="", token="", username=username, **kwargs)
        self._kernel_id = ""
        self.runtime_uid = ""
        self.runtime_name = ""
        self.runtime_pod_name = ""
        self.runtime_created_in_start = False
        self.run_url = run_url
        self.run_token = token
        self.username = username

        # Initialize DatalayerClient for modern API access
        urls = DatalayerURLs.from_environment(run_url=run_url)
        self._client = DatalayerClient(urls=urls, token=token)

    @property
    def kernel_url(self) -> Optional[str]:
        """
        Get the kernel URL.

        Returns
        -------
        Optional[str]
            The kernel URL if available, None otherwise.
        """
        if self.kernel:
            kernel_id = self.kernel["id"]
            return url_path_join(self.server_url, "api/kernels", kernel_id)
        elif self._kernel_id:
            return url_path_join(self.server_url, "api/kernels", self._kernel_id)
        else:
            return None

    # --------------------------------------------------------------------------
    # Runtime management
    # --------------------------------------------------------------------------
    def start_kernel(
        self,
        name: str = "",
        path: Optional[str] = None,
        timeout: float = REQUEST_TIMEOUT,
    ) -> Optional[dict[str, Any]]:
        """
        Start a kernel on Datalayer cloud.

        Parameters
        ----------
        name : str
            Runtime name.
        path : str
            [optional] API path from root to the cwd of the kernel.
        timeout : float
            Request timeout.

        Returns
        -------
        dict[str, Any] | None
            The kernel model.
        """
        if self.has_kernel:
            raise RuntimeError(
                "A kernel is already started. Shutdown it before starting a new one."
            )

        # Reset per-start state markers.
        self.runtime_created_in_start = False

        runtime_name = name
        runtime = None

        # Use DatalayerClient to get runtime information.
        runtimes = self._client.list_runtimes()

        if not runtime_name:
            self.log.debug("No Agent name provided. Picking the first available Agent…")
            if not runtimes:
                # Historical behaviour: when no Agent is running, offer to
                # launch one from the first available environment instead of
                # failing outright.
                launched = self._prompt_and_launch_agent()
                if launched is None:
                    raise RuntimeError(
                        "No Agent running. Start one first with: "
                        "`d agents create <ENVIRONMENT_NAME> --time-reservation 10`"
                    )
                runtimes = [launched]

            selected = self._pick_accessible_runtime(runtimes)

            if selected is None:
                # The accessibility probe is best-effort (a freshly launched
                # Agent may still be warming up its ingress). Fall back to the
                # first listed Agent and let `_ensure_kernel_id` retry until the
                # kernel endpoint is reachable.
                selected = runtimes[0]

            runtime_name = selected.name or selected.uid or selected.pod_name or ""
            self.runtime_uid = str(selected.uid or "")
            self.runtime_name = str(selected.name or runtime_name or "")
            self.runtime_pod_name = str(selected.pod_name or "")
            runtime = {
                "pod_name": selected.pod_name,
                "ingress": selected.ingress,
                "token": selected.jupyter_token or self.run_token,
                "expired_at": selected.expired_at,
            }
        else:
            selected = None
            for r in runtimes:
                if r.name == runtime_name or r.uid == runtime_name:
                    selected = r
                    break
            if selected is None:
                raise RuntimeError(f"Agent '{runtime_name}' not found")
            self.runtime_uid = str(selected.uid or "")
            self.runtime_name = str(selected.name or runtime_name or "")
            self.runtime_pod_name = str(selected.pod_name or "")
            runtime = {
                "pod_name": selected.pod_name,
                "ingress": selected.ingress,
                "token": selected.jupyter_token or self.run_token,
                "expired_at": selected.expired_at,
            }

        if runtime is None:
            raise RuntimeError("Unable to find an Agent.")

        self.server_url = runtime["ingress"]
        self.token = runtime.get("token", "")

        # Ensure runtime endpoint is ready and a usable kernel exists.
        self._kernel_id = self._ensure_kernel_id()

        kernel_model = self.refresh_model()
        msg = f"RuntimeManager using existing Agent {runtime_name}"
        expired_at = runtime.get("expired_at")
        if expired_at is not None:
            msg += f" expiring at {timestamp_to_local_date(expired_at)}"
        self.log.info(msg)

        return kernel_model

    def _pick_accessible_runtime(self, runtimes: list[Any]) -> Optional[Any]:
        """Return first runtime that responds on /api/kernels with its runtime token."""
        for runtime in runtimes:
            if self._runtime_is_accessible(runtime):
                return runtime
        return None

    def _prompt_and_launch_agent(self) -> Optional[Any]:
        """Offer to launch an Agent from the first environment when none is running.

        Mirrors the historical console behaviour: if no Agent is running, ask
        the user whether to create one from the first available environment with
        a default 10-minute reservation. Returns the launched runtime (waiting
        until it is listed and reachable), or ``None`` when the user declines.
        """
        environments = self._client.list_environments()
        if not environments:
            raise RuntimeError("No environments available to create an Agent from.")

        first_environment = environments[0]
        first_environment_name = first_environment.name

        # Default 10-minute reservation; estimate the reserved credits to inform
        # the user before they confirm.
        burning_rate = float(getattr(first_environment, "burning_rate", 0.0) or 0.0)
        credits_limit = burning_rate * 60.0 * 10.0

        prompt = (
            "No Agent running.\n"
            f"Do you want to launch an Agent from the environment "
            f"{first_environment_name} with {credits_limit:.2f} reserved credits? "
            "(yes/no) [default: yes]: "
        )
        try:
            answer = (input(prompt) or "yes").strip().lower()
        except EOFError:
            answer = "yes"
        if answer not in ("y", "yes"):
            return None

        new_runtime = self._client.create_runtime(
            name=f"console-agent-{first_environment_name}",
            environment=first_environment_name,
            time_reservation=10.0,
        )

        # Surface the freshly created Agent, mirroring the historical flow.
        try:
            display_runtimes(
                [
                    {
                        "given_name": new_runtime.name,
                        "environment_name": new_runtime.environment,
                        "pod_name": new_runtime.pod_name,
                        "ingress": new_runtime.ingress,
                        "reservation_id": getattr(new_runtime, "reservation_id", ""),
                        "uid": new_runtime.uid,
                        "burning_rate": getattr(new_runtime, "burning_rate", 0.0),
                        "token": new_runtime.jupyter_token,
                        "started_at": getattr(new_runtime, "started_at", ""),
                        "expired_at": new_runtime.expired_at,
                    }
                ]
            )
        except Exception:
            pass

        # Wait until the launched Agent is listed and reachable before using it,
        # falling back to the freshly created handle if the probe times out.
        launched = self._wait_for_listed_accessible_runtime(str(new_runtime.uid or ""))
        return launched or new_runtime

    def _wait_for_listed_accessible_runtime(self, preferred_uid: str) -> Optional[Any]:
        """Wait for a launched runtime to be listed and reachable before use."""
        attempts = 30
        for _ in range(attempts):
            runtimes = self._client.list_runtimes()

            if preferred_uid:
                for runtime in runtimes:
                    if str(
                        runtime.uid or ""
                    ) == preferred_uid and self._runtime_is_accessible(runtime):
                        return runtime

            selected = self._pick_accessible_runtime(runtimes)
            if selected is not None:
                return selected

            time.sleep(1.0)

        return None

    def _runtime_is_accessible(self, runtime: Any) -> bool:
        """Best-effort HTTP accessibility check for runtime ingress and token."""
        ingress = str(getattr(runtime, "ingress", "") or "").rstrip("/")
        token = str(getattr(runtime, "jupyter_token", "") or self.run_token or "")
        if not ingress or not token:
            return False

        from datalayer_core.utils.network import fetch

        try:
            fetch(f"{ingress}/api/kernels", token=token, timeout=10)
            return True
        except Exception:
            return False

    def _ensure_kernel_id(self) -> str:
        """Return the runtime's existing kernel id.

        Datalayer runtimes are provisioned with a kernel already running and
        wired to the runtime ingress. We must connect to that existing kernel
        instead of creating a new one: a freshly created kernel id is not the
        one the ingress routes to, which leads to no execution output and 404
        responses on kernel endpoints (e.g. /interrupt).
        """
        from datalayer_core.utils.network import fetch

        kernels_url = f"{str(self.server_url or '').rstrip('/')}/api/kernels"
        max_attempts = 30
        last_error: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            try:
                response = fetch(kernels_url, token=self.token, timeout=20)
                kernels = response.json() if response.content else []
                if isinstance(kernels, list) and kernels:
                    # Freshly launched runtimes can briefly expose stale kernel IDs
                    # in the list endpoint; verify a kernel can be read directly
                    # before selecting it.
                    ordered_kernels = sorted(
                        kernels,
                        key=lambda kernel: str((kernel or {}).get("id") or ""),
                    )
                    for kernel in ordered_kernels:
                        kernel_id = str((kernel or {}).get("id") or "")
                        if not kernel_id:
                            continue
                        try:
                            fetch(
                                f"{kernels_url}/{kernel_id}",
                                token=self.token,
                                timeout=20,
                            )
                            return kernel_id
                        except requests.exceptions.HTTPError as e:
                            status = (
                                e.response.status_code
                                if getattr(e, "response", None) is not None
                                else None
                            )
                            if status in (404, 410):
                                # Kernel disappeared while ingress was warming.
                                continue
                            last_error = e
                        except requests.exceptions.ConnectionError as e:
                            last_error = e
            except requests.exceptions.HTTPError as e:
                status = (
                    e.response.status_code
                    if getattr(e, "response", None) is not None
                    else None
                )
                if status not in (404, 502, 503, 504):
                    raise
                last_error = e
            except requests.exceptions.ConnectionError as e:
                last_error = e

            # The kernel may still be registering on a freshly launched runtime.
            time.sleep(1.0)

        raise RuntimeError(
            f"Runtime has no available kernel at '{kernels_url}': {last_error}"
        )
