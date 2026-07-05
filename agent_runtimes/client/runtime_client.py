# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Runtime client for agent-runtimes.

Extends the account-only ``datalayer_core.DatalayerClient`` with runtime
creation, environments, snapshots, Ray, evals, and code execution — migrated
out of datalayer-core.
"""

import logging
import os
import time
import uuid
from functools import lru_cache
from typing import Any, Optional, Union

from jupyter_kernel_client import KernelClient

from datalayer_core.client.client import DatalayerClient

from agent_runtimes.mixins.environments import EnvironmentsMixin
from agent_runtimes.mixins.evals import EvalsMixin
from agent_runtimes.mixins.events import EventsMixin
from agent_runtimes.mixins.ray import RayMixin
from agent_runtimes.mixins.runtimes import RuntimesMixin
from agent_runtimes.mixins.sandbox_snapshots import SandboxSnapshotsMixin
from agent_runtimes.models.environment import EnvironmentModel
from agent_runtimes.models.sandbox_snapshot import SandboxSnapshotModel
from agent_runtimes.runtimes.runtime_service import RuntimeService
from agent_runtimes.sandboxes.code_sandbox_snapshots import (
    as_code_sandbox_snapshots,
    create_snapshot,
)
from datalayer_core.utils.defaults import (
    DEFAULT_ENVIRONMENT,
    DEFAULT_TIME_RESERVATION,
)
from datalayer_core.utils.types import Minutes

logger = logging.getLogger(__name__)


class RuntimeClient(
    DatalayerClient,
    RuntimesMixin,
    EnvironmentsMixin,
    EvalsMixin,
    EventsMixin,
    RayMixin,
    SandboxSnapshotsMixin,
):
    """Datalayer client with runtime creation and code execution capabilities."""

    @lru_cache
    def list_environments(self) -> list[EnvironmentModel]:
        """
        List all available environments.

        Returns
        -------
        list[Environment]
            A list of available environments.
        """
        response = self._list_environments()

        # Some API failures return payloads without an `environments` key.
        # Surface a clear runtime error instead of raising KeyError.
        if not response.get("success", True):
            raise RuntimeError(
                f"Failed to list environments: {response.get('message', 'Unknown error')}"
            )

        environments_raw = response.get("environments")
        if environments_raw is None:
            raise RuntimeError(
                "Failed to list environments: missing 'environments' field in response"
            )

        if not isinstance(environments_raw, list):
            raise RuntimeError(
                "Failed to list environments: invalid 'environments' field type"
            )

        self._available_environments = environments_raw
        self._available_environments_names = []
        env_objs = []
        for env in self._available_environments:
            if not isinstance(env, dict):
                continue
            self._available_environments_names.append(env.get("name"))
            env_data = dict(env)
            env_objs.append(
                EnvironmentModel(
                    name=env_data.pop("name"),
                    title=env_data.pop("title"),
                    burning_rate=env_data.pop("burning_rate", 0.0),
                    language=env_data.pop("language"),
                    owner=env_data.pop("owner"),
                    visibility=env_data.pop("visibility"),
                    metadata=env_data,
                )
            )
        return env_objs

    def create_runtime(
        self,
        name: Optional[str] = None,
        environment: str = DEFAULT_ENVIRONMENT,
        time_reservation: Minutes = DEFAULT_TIME_RESERVATION,
        snapshot_name: Optional[str] = None,
        agent_spec_id: Optional[str] = None,
        agent_spec: Optional[dict[str, Any]] = None,
        billable_account_uid: Optional[str] = None,
        billable_account_type: Optional[str] = None,
        billable_account_handle: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> RuntimeService:
        """
        Create a new runtime (kernel) for code execution.

        Parameters
        ----------
        name : str, optional
            Name of the runtime to create.
        environment : str, optional
            Environment type (e.g., "ai-agents-env"). Type of resources needed (cpu, gpu, etc.).
        time_reservation : Minutes, optional
            Time reservation in minutes for the runtime. Defaults to 10 minutes.
        snapshot_name : Optional[str], optional
            Name of the snapshot to create from. If provided, the runtime will be created from this snapshot.

        Returns
        -------
        Runtime
            A runtime object for code execution.
        """
        envs = self.list_environments()
        if environment not in self._available_environments_names:
            raise ValueError(
                f"Environment '{environment}' not found. Available environments: {self._available_environments_names}"
            )

        burning_rate = None
        credits_limit = None
        for env in envs:
            if env.name == environment:
                burning_rate = env.burning_rate
                credits_limit = env.burning_rate * 60.0 * time_reservation
                break
        if burning_rate is None or credits_limit is None:
            raise ValueError(
                f"Environment '{environment}' not found in environments list. Available: {[env.name for env in envs]}"
            )

        if name is None:
            name = f"runtime-{environment}-{uuid.uuid4()}"

        # print(f"Runtime {name}")

        client_for_request = self
        if api_key:
            client_for_request = DatalayerClient(urls=self._urls, token=api_key)

        if snapshot_name is not None:
            snapshots = self.list_snapshots()
            snapshot_uid = None
            for snapshot in snapshots:
                if snapshot.name == snapshot_name:
                    snapshot_uid = snapshot.uid
                    break

            if snapshot_uid is None:
                raise ValueError(
                    f"Snapshot '{snapshot_name}' not found. Available snapshots: {[s.name for s in snapshots]}"
                )

            response = client_for_request._create_runtime(
                given_name=name,
                environment_name=environment,
                from_snapshot_uid=snapshot_uid,
                agent_spec_id=agent_spec_id,
                agent_spec=agent_spec,
                credits_limit=credits_limit,
                billable_account_uid=billable_account_uid,
                billable_account_type=billable_account_type,
                billable_account_handle=billable_account_handle,
            )
        else:
            # Create runtime without snapshot
            response = client_for_request._create_runtime(
                given_name=name,
                environment_name=environment,
                agent_spec_id=agent_spec_id,
                agent_spec=agent_spec,
                credits_limit=credits_limit,
                billable_account_uid=billable_account_uid,
                billable_account_type=billable_account_type,
                billable_account_handle=billable_account_handle,
            )

        # Process the response and create RuntimesService object
        if not response.get("success", True):
            message = response.get("message", "Unknown error")
            context_parts = [f"environment='{environment}'"]
            if agent_spec_id:
                context_parts.append(f"agent_spec_id='{agent_spec_id}'")
            if agent_spec:
                context_parts.append("agent_spec=<inline>")
            reason = response.get("reason")
            if reason:
                context_parts.append(f"reason='{reason}'")
            retry_after = response.get("retry_after_seconds")
            if retry_after:
                context_parts.append(f"retry_after_seconds={retry_after}")
            context = ", ".join(context_parts)
            raise RuntimeError(
                f"Runtime creation failed ({context}): {message}"
            )

        runtime_data = response["runtime"]
        runtime = RuntimeService(
            name=runtime_data["given_name"],
            environment=runtime_data["environment_name"],
            run_url=self._urls.run_url,
            iam_url=self._urls.iam_url,
            token=api_key or self._token,
            ingress=runtime_data["ingress"],
            jupyter_token=runtime_data["token"],
            pod_name=runtime_data["pod_name"],
            uid=runtime_data.get("uid"),
            reservation_id=runtime_data.get("reservation_id"),
            burning_rate=runtime_data.get("burning_rate"),
            started_at=runtime_data.get("started_at"),
            expired_at=runtime_data.get("expired_at"),
        )
        return runtime

    def list_runtimes(self) -> list[RuntimeService]:
        """
        List all running runtimes.

        Returns
        -------
        list[Runtime]
            List of Runtime objects representing active runtimes.
        """
        response = self._list_runtimes()

        if not response.get("success", True):
            message = response.get("message", "Unknown error")
            logger.error("Failed to list runtimes: %s", message)
            raise RuntimeError(f"Failed to list runtimes: {message}")

        runtimes_raw = response.get("runtimes")
        if runtimes_raw is None:
            logger.error("Failed to list runtimes: missing 'runtimes' field")
            raise RuntimeError(
                "Failed to list runtimes: missing 'runtimes' field in response"
            )
        if not isinstance(runtimes_raw, list):
            logger.error("Failed to list runtimes: invalid 'runtimes' field type")
            raise RuntimeError("Failed to list runtimes: invalid 'runtimes' field type")

        runtimes: list[dict[str, Any]] = runtimes_raw
        runtime_services = []
        for runtime in runtimes:
            runtime_services.append(
                RuntimeService(
                    name=runtime["given_name"],
                    environment=runtime["environment_name"],
                    pod_name=runtime["pod_name"],
                    token=self._token,
                    ingress=runtime["ingress"],
                    reservation_id=runtime["reservation_id"],
                    uid=runtime["uid"],
                    burning_rate=runtime["burning_rate"],
                    jupyter_token=runtime["token"],
                    run_url=self._urls.run_url,
                    iam_url=self._urls.iam_url,
                    started_at=runtime["started_at"],
                    expired_at=runtime["expired_at"],
                )
            )
        return runtime_services

    def terminate_runtime(
        self,
        runtime: Union[RuntimeService, str],
        api_key: Optional[str] = None,
    ) -> bool:
        """
        Terminate a running Runtime.

        Parameters
        ----------
        runtime : Union[Runtime, str]
            Runtime object or pod name string to terminate.

        Returns
        -------
        bool
            True if termination was successful, False otherwise.
        """
        pod_name = runtime.pod_name if isinstance(runtime, RuntimeService) else runtime
        if pod_name is not None:
            if api_key:
                client_for_request = DatalayerClient(urls=self._urls, token=api_key)
                return client_for_request._terminate_runtime(pod_name).get("success", False)
            return self._terminate_runtime(pod_name)["success"]
        else:
            return False

    def get_runtime(self, runtime: Union[RuntimeService, str]) -> RuntimeService:
        """
        Get a single running Runtime by pod name.

        Parameters
        ----------
        runtime : Union[Runtime, str]
            Runtime object or pod name string to fetch.

        Returns
        -------
        Runtime
            The Runtime object matching the pod name.

        Raises
        ------
        RuntimeError
            If the runtime cannot be retrieved.
        """
        pod_name = runtime.pod_name if isinstance(runtime, RuntimeService) else runtime
        if not pod_name:
            raise RuntimeError("A pod name is required to get a runtime.")

        response = self._get_runtime(pod_name)
        if not response.get("success", True):
            message = response.get("message", "Unknown error")
            raise RuntimeError(f"Failed to get runtime '{pod_name}': {message}")

        runtime_data = response.get("runtime")
        if not isinstance(runtime_data, dict):
            raise RuntimeError(
                f"Failed to get runtime '{pod_name}': missing 'runtime' field in response"
            )

        return RuntimeService(
            name=runtime_data.get("given_name", pod_name),
            environment=runtime_data.get("environment_name", ""),
            pod_name=runtime_data.get("pod_name", pod_name),
            token=self._token,
            ingress=runtime_data.get("ingress"),
            reservation_id=runtime_data.get("reservation_id"),
            uid=runtime_data.get("uid"),
            burning_rate=runtime_data.get("burning_rate"),
            jupyter_token=runtime_data.get("token"),
            run_url=self._urls.run_url,
            iam_url=self._urls.iam_url,
            started_at=runtime_data.get("started_at"),
            expired_at=runtime_data.get("expired_at"),
        )

    def update_runtime(
        self,
        runtime: Union[RuntimeService, str],
        capabilities: list[str],
    ) -> bool:
        """
        Update a running Runtime's capabilities.

        Parameters
        ----------
        runtime : Union[Runtime, str]
            Runtime object or pod name string to update.
        capabilities : list[str]
            New capabilities to apply to the runtime.

        Returns
        -------
        bool
            True if the update succeeded.

        Raises
        ------
        RuntimeError
            If the update fails.
        """
        pod_name = runtime.pod_name if isinstance(runtime, RuntimeService) else runtime
        if not pod_name:
            raise RuntimeError("A pod name is required to update a runtime.")

        response = self._update_runtime(pod_name, capabilities)
        if not response.get("success", True):
            message = response.get("message", "Unknown error")
            raise RuntimeError(f"Failed to update runtime '{pod_name}': {message}")
        return True

    def check_runtime_health(
        self,
        runtime: Union[RuntimeService, str],
        probe_code: str = "print('datalayer runtime health probe')",
        timeout: float = 20.0,
        api_key: Optional[str] = None,
    ) -> dict[str, Any]:
        """Check runtime reachability and execute a probe on the sandbox.

        Parameters
        ----------
        runtime : Union[RuntimeService, str]
            Runtime object or runtime identifier (pod name/uid/name).
        probe_code : str
            Python code to execute as health probe on the sandbox.
        timeout : float
            Probe execution timeout in seconds.
        api_key : Optional[str]
            Optional API key override used for runtime lookup.

        Returns
        -------
        dict[str, Any]
            Health result with success flag and diagnostics.
        """
        client_for_request = self
        if api_key:
            client_for_request = DatalayerClient(urls=self._urls, token=api_key)

        runtime_service = (
            runtime if isinstance(runtime, RuntimeService) else client_for_request.get_runtime(runtime)
        )

        endpoint = str(runtime_service.ingress or "").rstrip("/")
        runtime_token = str(
            runtime_service.jupyter_token
            or client_for_request._get_token()
            or ""
        ).strip()

        result: dict[str, Any] = {
            "success": False,
            "runtime_uid": runtime_service.uid,
            "runtime_pod_name": runtime_service.pod_name,
            "runtime_name": runtime_service.name,
            "ingress": endpoint,
            "probe_mode": "sandbox_execute_code",
        }

        if not endpoint:
            result["message"] = "runtime ingress is missing"
            return result
        if not runtime_token:
            result["message"] = "runtime token is missing"
            return result

        kernel_client: Optional[KernelClient] = None
        try:
            kernel_client = KernelClient(server_url=endpoint, token=runtime_token)
            kernel_client.start()
            reply = kernel_client.execute(probe_code, timeout=timeout)
            outputs = reply.get("outputs", [])
            if not isinstance(outputs, list):
                outputs = []

            error_outputs = [
                output
                for output in outputs
                if isinstance(output, dict)
                and str(output.get("output_type") or "") == "error"
            ]

            if error_outputs:
                first_error = error_outputs[0]
                result["message"] = "sandbox probe execution failed"
                result["error_name"] = first_error.get("ename")
                result["error_value"] = first_error.get("evalue")
                traceback_lines = first_error.get("traceback")
                if isinstance(traceback_lines, list):
                    result["traceback_tail"] = "\n".join(
                        [str(line) for line in traceback_lines if line is not None]
                    )[-4000:]
                return result

            stream_text_parts = []
            for output in outputs:
                if not isinstance(output, dict):
                    continue
                if str(output.get("output_type") or "") == "stream":
                    stream_text_parts.append(str(output.get("text") or ""))

            result["success"] = True
            result["message"] = "runtime reachable and sandbox probe executed"
            result["stdout_tail"] = "".join(stream_text_parts)[-1000:]
            return result
        except Exception as exc:
            result["message"] = f"runtime health probe exception: {exc}"
            return result
        finally:
            if kernel_client is not None:
                try:
                    kernel_client.stop()
                except Exception:
                    pass

    def create_snapshot(
        self,
        runtime: Optional["RuntimeService"] = None,
        pod_name: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        stop: bool = True,
    ) -> "SandboxSnapshotModel":
        """
        Create a snapshot of the current runtime state.

        Parameters
        ----------
        runtime : Optional[Runtime]
            The runtime object to create a snapshot from.
        pod_name : Optional[str]
            The pod name of the runtime.
        name : Optional[str]
            Name for the new snapshot.
        description : Optional[str]
            Description for the new snapshot.
        stop : bool
            Whether to stop the runtime after creating snapshot.

        Returns
        -------
        SandboxSnapshotModel
            The created snapshot object.
        """
        if pod_name is None and runtime is None:
            raise ValueError(
                "Either 'runtime' or 'pod_name' must be provided to create a snapshot."
            )
        elif runtime is not None:
            pod_name = runtime.pod_name

        if pod_name is None:
            raise ValueError(
                "Pod name is required to create a snapshot. Ensure the runtime has a valid pod_name."
            )

        name, description = create_snapshot(name=name, description=description)
        response = self._create_snapshot(
            pod_name=pod_name,
            name=name,
            description=description,
            stop=stop,
        )
        if isinstance(response, dict) and not response.get("success", True):
            raise RuntimeError(
                f"Failed to create snapshot '{name}': {response.get('message', 'unknown error')}"
            )
        snapshot: Optional[SandboxSnapshotModel] = None
        max_poll_attempts = max(
            1,
            int(os.getenv("DATALAYER_SNAPSHOT_POLL_ATTEMPTS", "30")),
        )
        poll_interval_seconds = max(
            0.1,
            float(os.getenv("DATALAYER_SNAPSHOT_POLL_INTERVAL", "1.0")),
        )
        for _ in range(max_poll_attempts):
            snapshots_objects = self.list_snapshots()
            snapshot = next((s for s in snapshots_objects if s.name == name), None)
            if snapshot is not None:
                break
            time.sleep(poll_interval_seconds)

        if snapshot is None:
            raise RuntimeError(
                f"Snapshot '{name}' was created but not found in snapshot listing"
            )

        return SandboxSnapshotModel(
            uid=snapshot.uid,
            name=name,
            description=description,
            environment=snapshot.environment,
            metadata=response,
        )

    def list_snapshots(self) -> list[SandboxSnapshotModel]:
        """
        List all snapshots.

        Returns
        -------
        list[SandboxSnapshotModel]
            A list of snapshots associated with the user.
        """
        response = self._list_snapshots()
        snapshot_objects = as_code_sandbox_snapshots(response)
        return snapshot_objects

    def delete_snapshot(
        self, snapshot: Union[str, SandboxSnapshotModel]
    ) -> dict[str, str]:
        """
        Delete a specific snapshot.

        Parameters
        ----------
        snapshot : Union[str, SandboxSnapshotModel]
            Snapshot object or UID string to delete.

        Returns
        -------
        dict[str, str]
            The result of the deletion operation.
        """
        snapshot_uid = (
            snapshot.uid if isinstance(snapshot, SandboxSnapshotModel) else snapshot
        )
        return self._delete_snapshot(snapshot_uid)
