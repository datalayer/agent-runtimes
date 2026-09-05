# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Runtime services for Datalayer.

Provides runtime management and code execution capabilities in Datalayer environments.
"""

import logging
import os
import time
from pathlib import Path
from typing import Any, Optional, Union

import requests
from code_sandboxes import CodeSandboxClient
from datalayer_core.mixins.authn import AuthnMixin
from datalayer_core.models import ExecutionResponse
from datalayer_core.utils.defaults import (
    DEFAULT_ENVIRONMENT,
    DEFAULT_TIME_RESERVATION,
)
from datalayer_core.utils.types import (
    CreditsPerSecond,
    Minutes,
    Seconds,
)
from datalayer_core.utils.urls import DEFAULT_DATALAYER_RUNTIMES_URL, DatalayerURLs

from agent_runtimes.runtimes.client import RuntimesMixin

logger = logging.getLogger(__name__)
from agent_runtimes.mixins.sandbox_snapshots import SandboxSnapshotsMixin
from agent_runtimes.models.runtime import RuntimeModel
from agent_runtimes.models.sandbox_snapshot import SandboxSnapshotModel
from agent_runtimes.sandboxes.code_sandbox_snapshots import (
    as_code_sandbox_snapshots,
    create_snapshot,
)
from agent_runtimes.utils.notebook_utils import get_cells


class RuntimeService(AuthnMixin, RuntimesMixin, SandboxSnapshotsMixin):
    """
    Service for managing Datalayer runtime operations.

    This service handles runtime lifecycle operations such as starting, stopping,
    code execution, and variable management. The runtime data is managed through
    the RuntimeModel.

    Parameters
    ----------
    runtime_model : RuntimeModel
        The runtime model containing all configuration and state data.
    """

    def __init__(
        self,
        name: str,
        environment: str = DEFAULT_ENVIRONMENT,
        time_reservation: Minutes = DEFAULT_TIME_RESERVATION,
        runtimes_url: str = DEFAULT_DATALAYER_RUNTIMES_URL,
        iam_url: Optional[str] = None,
        token: Optional[str] = None,
        api_key: Optional[str] = None,
        runtime_name: Optional[str] = None,
        ingress: Optional[str] = None,
        reservation_id: Optional[str] = None,
        uid: Optional[str] = None,
        burning_rate: Optional[CreditsPerSecond] = None,
        jupyter_token: Optional[str] = None,
        started_at: Optional[str] = None,
        expired_at: Optional[str] = None,
    ):
        """
        Initialize a runtime service.

        Parameters
        ----------
        name : str
            Name of the runtime (kernel).
        environment : str
            Environment type (e.g., "ai-agents-env"). Type of resources needed (cpu, gpu, etc.).
        time_reservation : Minutes
            Time reservation in minutes for the runtime. Defaults to 10 minutes.
        runtimes_url : str
            Datalayer Runtimes server URL.
        iam_url : Optional[str]
            Datalayer IAM server URL.
        token : Optional[str]
            Authentication token (can also be set via DATALAYER_API_KEY env var).
        api_key : Optional[str]
            Authentication API key alias for ``token``.
        runtime_name : Optional[str]
            Name of the pod running the runtime.
        ingress : Optional[str]
            Ingress URL for the runtime.
        reservation_id : Optional[str]
            Reservation ID for the runtime.
        uid : Optional[str]
            ID for the runtime.
        burning_rate : Optional[float]
            Burning rate for the runtime.
        jupyter_token : Optional[str]
            Token used by the code sandbox client.
        started_at : Optional[str]
            Start time for the runtime.
        expired_at : Optional[str]
            Expiration time for the runtime.
        """
        # Initialize the runtime model with all the data fields
        self._model = RuntimeModel(
            name=name,
            environment=environment,
            time_reservation=time_reservation,
            runtimes_url=runtimes_url,
            iam_url=iam_url,
            token=token or api_key,
            external_token=None,
            runtime_name=runtime_name,
            ingress=ingress,
            reservation_id=reservation_id,
            uid=uid,
            burning_rate=burning_rate,
            jupyter_token=jupyter_token,
            started_at=started_at,
            expired_at=expired_at,
            runtime={},
            sandbox_client=None,
            kernel_id=None,
            executing=False,
        )

    @property
    def model(self) -> RuntimeModel:
        """
        Get the runtime model containing all configuration and state data.

        Provides access to all runtime properties including:
        - Configuration: name, environment, runtimes_url, iam_url
        - Authentication: token, external_token
        - Runtime state: sandbox_client, kernel_id, executing
        - Infrastructure: runtime_name, ingress, uid, reservation_id

        Returns
        -------
        RuntimeModel
            The runtime model with all runtime data and configuration.
        """
        return self._model

    # Properties for AuthnMixin compatibility
    @property
    def _token(self) -> Optional[str]:
        """Get the authentication token."""
        return self._model.token

    @_token.setter
    def _token(self, value: Optional[str]) -> None:
        """Set the authentication token."""
        self._model.token = value

    @property
    def sandbox_client(self) -> Optional[CodeSandboxClient]:
        """Get the variant-neutral code sandbox client."""
        return self._model.sandbox_client

    @property
    def _external_token(self) -> Optional[str]:
        """Get the external authentication token."""
        return self._model.external_token

    @_external_token.setter
    def _external_token(self, value: Optional[str]) -> None:
        """Set the external authentication token."""
        self._model.external_token = value

    @property
    def urls(self) -> DatalayerURLs:
        """
        Get a DatalayerURLs object with the configured URLs.

        Returns
        -------
        DatalayerURLs
            URLs object with the runtimes and IAM URLs of the runtime configuration.
        """
        from datalayer_core.utils.urls import DatalayerURLs

        return DatalayerURLs.from_environment(
            runtimes_url=self._model.runtimes_url,
            iam_url=self._model.iam_url,
        )

    @property
    def runtime_name(self) -> Optional[str]:
        """Get the pod name."""
        return self._model.runtime_name

    @property
    def name(self) -> str:
        """Get the runtime name."""
        return self._model.name

    @property
    def ingress(self) -> Optional[str]:
        """Get the ingress URL."""
        return self._model.ingress

    @property
    def jupyter_token(self) -> Optional[str]:
        """Get the kernel token."""
        return self._model.jupyter_token

    @property
    def expired_at(self) -> Optional[str]:
        """Get the expiration time."""
        return self._model.expired_at

    @property
    def environment(self) -> str:
        """Get the environment name."""
        return self._model.environment

    @property
    def reservation_id(self) -> Optional[str]:
        """Get the reservation ID."""
        return self._model.reservation_id

    @property
    def uid(self) -> Optional[str]:
        """Get the runtime UID."""
        return self._model.uid

    @property
    def burning_rate(self) -> Optional[float]:
        """Get the burning rate."""
        return self._model.burning_rate

    @property
    def started_at(self) -> Optional[str]:
        """Get the start time."""
        return self._model.started_at

    def __del__(self) -> None:
        """Clean up resources when the runtime object is deleted."""
        # self.stop()
        pass

    def __enter__(self) -> "RuntimeService":
        """
        Context manager entry.

        Returns
        -------
        RuntimesService
            The runtime instance.

        Raises
        ------
        RuntimeError
            If runtime startup fails.
        """
        try:
            self._start()
            return self
        except Exception as e:
            # Give back whatever was already reserved before re-raising.
            #
            # `_start` books the runtime first and connects to it second, so a
            # failure to connect leaves a live runtime nobody holds — and
            # because Python does not call `__exit__` when `__enter__` raises,
            # `with` is no protection here. Each such failure used to burn a
            # slot in the environment permanently, so one bad start made the
            # next start likelier to fail, and the one after that certain to.
            self._stop()
            print(f"Failed to start runtime: {str(e)}")
            raise

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """
        Context manager exit.

        Parameters
        ----------
        exc_type : Any
            Exception type.
        exc_val : Any
            Exception value.
        exc_tb : Any
            Exception traceback.
        """
        self._stop()

    def __repr__(self) -> str:
        return f"RuntimeService(uid='{self.model.uid}', name='{self.model.name}')"

    def start(self) -> None:
        """
        Start the runtime and code sandbox client.

        This is a public wrapper for `_start()` to support non-context usage.
        """
        self._start()

    def stop(self) -> bool:
        """
        Stop the runtime and terminate the code sandbox client.

        This is a public wrapper for `_stop()` to support non-context usage.
        """
        return self._stop()

    def _start(self) -> None:
        """Start the runtime."""
        if self.model.ingress is not None and self.model.jupyter_token is not None:
            self.model.sandbox_client = CodeSandboxClient.create(
                variant="jupyter-server",
                server_url=self.model.ingress,
                token=self.model.jupyter_token,
            )
            self.model.sandbox_client.start()

        if self.model.sandbox_client is None:
            self.model.runtime = self.runtimes.create(self.model.environment)

            # Check if runtime creation was successful
            if not self.model.runtime.get("success", True):
                error_msg = self.model.runtime.get(
                    "message", "Unknown error during runtime creation"
                )
                raise RuntimeError(f"Failed to create runtime: {error_msg}")

            # Check if runtime data is present
            if "runtime" not in self.model.runtime:
                raise RuntimeError(
                    "Runtime creation succeeded but runtime data is missing from response"
                )

            runtime: dict[str, str] = self.model.runtime["runtime"]

            # Validate required runtime fields
            required_fields = [
                "ingress",
                "token",
                "runtime_name",
                "uid",
                "reservation_id",
                "burning_rate",
                "started_at",
                "expired_at",
            ]
            missing_fields = [
                field for field in required_fields if field not in runtime
            ]

            if missing_fields:
                raise RuntimeError(
                    f"Runtime data is missing required fields: {', '.join(missing_fields)}"
                )

            # print("runtime", runtime)
            self.model.ingress = runtime["ingress"]
            self.model.jupyter_token = runtime["token"]
            self.model.runtime_name = runtime["runtime_name"]
            self.model.uid = runtime["uid"]
            self.model.reservation_id = runtime["reservation_id"]

            try:
                self.model.burning_rate = float(runtime["burning_rate"])
            except (ValueError, TypeError) as e:
                raise RuntimeError(
                    f"Invalid burning_rate value: {runtime['burning_rate']} - {str(e)}"
                )

            self.model.started_at = runtime["started_at"]
            self.model.expired_at = runtime["expired_at"]

            # Create and start the code sandbox client.
            last_error: Optional[Exception] = None
            for attempt in range(1, 4):
                try:
                    self.model.sandbox_client = CodeSandboxClient.create(
                        variant="jupyter-server",
                        server_url=self.model.ingress,
                        token=self.model.jupyter_token,
                    )
                    self.model.sandbox_client.start()
                    print(f"Runtime started successfully: {self.model.uid}")
                    break
                except requests.exceptions.HTTPError as e:
                    status = (
                        e.response.status_code
                        if getattr(e, "response", None) is not None
                        else None
                    )
                    last_error = e
                    # Retry transient gateway/proxy failures that happen while
                    # the runtime ingress and kernel API are warming up.
                    if status in (502, 503, 504) and attempt < 3:
                        time.sleep(2)
                        continue
                    raise RuntimeError(f"Failed to start code sandbox client: {str(e)}")
                except Exception as e:
                    last_error = e
                    raise RuntimeError(f"Failed to start code sandbox client: {str(e)}")

            if self.model.sandbox_client is None:
                raise RuntimeError(
                    "Failed to start code sandbox client: "
                    f"{str(last_error) if last_error else 'unknown error'}"
                )

    #: Set once this runtime has been handed back, so a second `stop()` — or a
    #: `__exit__` after `__enter__` already cleaned up — does not ask again.
    _terminated: bool = False

    def _stop(self) -> bool:
        """
        Stop the runtime.

        Returns
        -------
        bool
            True if runtime was successfully stopped, False otherwise.
        """
        if self.model.sandbox_client:
            try:
                self.model.sandbox_client.stop()
            except Exception as error:  # noqa: BLE001
                # A client that will not shut down cleanly is not a reason to
                # keep paying for the runtime behind it.
                logger.warning(
                    "Could not stop the sandbox client for %s: %s",
                    self.model.runtime_name,
                    error,
                )
            finally:
                self.model.sandbox_client = None
                self.model.kernel_id = None

        # Terminate whatever was booked, whether or not anything ever connected
        # to it. This used to be nested inside the branch above, so a runtime
        # that was created but never reached — the common failure — was left
        # running for good.
        if self.model.runtime_name and not self._terminated:
            # Flagged rather than clearing `runtime_name`: stopping twice must
            # not send a second termination, but a caller inspecting which
            # runtime this was after the fact should still be able to.
            self._terminated = True
            response = self.runtimes.stop(self.model.runtime_name)
            stopped = bool(response.get("success"))
            if not stopped:
                logger.warning(
                    "Could not terminate the runtime %s: %s",
                    self.model.runtime_name,
                    response.get("message") or response,
                )
            return stopped
        return False

    def _check_file(self, path: Union[str, Path]) -> bool:
        """
        Check if a file exists and can be opened.

        Parameters
        ----------
        path : Union[str, Path]
            Path to the file to check.

        Returns
        -------
        bool
            True if file exists and can be opened, False otherwise.
        """
        fname = Path(path).expanduser().resolve()
        try:
            with fname.open("rb"):
                pass
            return Path(path).exists()
        except Exception:
            return False

    def get_variable(self, name: str) -> Any:
        """
        Get a variable from the runtime.

        Parameters
        ----------
        name : str
            Name of the variable to retrieve.

        Returns
        -------
        Any
            Value of the variable, or None if not found or runtime not started.
        """
        if self.model.sandbox_client:
            try:
                # The sandbox client returns the deserialized value.
                return self.model.sandbox_client.get_variable(name)
            except Exception as e:
                print(f"Warning: Failed to get variable '{name}': {e}")
                return None
        return None

    def set_variable(self, name: str, value: Any) -> None:
        """
        Set a variable in the runtime.

        Parameters
        ----------
        name : str
            Name of the variable to set.
        value : Any
            Value to assign to the variable.

        Returns
        -------
        Response
            Response object containing execution results.
        """
        self.set_variables({name: value})

    def set_variables(self, variables: dict[str, Any]) -> None:
        """
        Set variables in the runtime.

        Parameters
        ----------
        variables : dict[str, Any]
            Dictionary of variable names and values to set.

        Returns
        -------
        Response
            Response object containing execution results.
        """
        if self.model.sandbox_client and variables is not None:
            for name, value in variables.items():
                try:
                    self.model.sandbox_client.set_variable(name, value)
                except Exception as e:
                    print(f"Warning: Failed to set variable '{name}': {e}")
                    # Continue with other variables instead of failing completely

    def execute_file(
        self,
        path: Union[str, Path],
        variables: Optional[dict[str, Any]] = None,
        output: Optional[str] = None,
        debug: bool = False,
        timeout: Seconds = 10.0,
    ) -> ExecutionResponse:
        """
        Execute a Python file in the runtime.

        Parameters
        ----------
        path : Union[str, Path]
            Path to the Python file to execute.
        variables : Optional[dict[str, Any]]
            Optional variables to set before executing the code.
        output : Optional[str]
            Optional output variable to return as result.
        debug : bool
            Whether to enable debug mode. If `True`, the output and error streams will be printed.
        timeout : Seconds
            Timeout for the execution.

        Returns
        -------
        Response
            The result of the code execution.
        """
        fname = Path(path).expanduser().resolve()
        if self._check_file(fname):
            if variables:
                self.set_variables(variables)

            if self.model.sandbox_client:
                outputs = []
                for _id, cell in get_cells(fname):
                    reply = self.model.sandbox_client.execute_interactive(
                        cell,
                        silent=False,
                        timeout=timeout,
                    )
                    # print(reply)
                    outputs.append(reply.get("outputs", []))
                response = ExecutionResponse(
                    success=True,
                    message="Code execution completed",
                    execute_response=outputs,
                )
                if debug:
                    print(response.stdout)
                    print(response.stderr)

                if output is not None:
                    return self.get_variable(output)

                return response
        return ExecutionResponse(
            success=False,
            message="No execution response available",
            execute_response=[],
        )

    def execute_code(
        self,
        code: str,
        variables: Optional[dict[str, Any]] = None,
        output: Optional[str] = None,
        debug: bool = False,
        timeout: Seconds = 10.0,
    ) -> Union[ExecutionResponse, Any]:
        """
        Execute code in the runtime.

        Parameters
        ----------
        code : str
            The Python code to execute.
        variables : Optional[dict[str, Any]]
            Optional variables to set before executing the code.
        output : Optional[str]
            Optional output variable to return as result.
        debug : bool
            Whether to enable debug mode. If `True`, the output and error streams will be printed.
        timeout : Seconds
            Timeout for the execution.

        Returns
        -------
        Union[Response, Any]
            The result of the code execution.
        """
        if not self._check_file(code):
            if self.model.sandbox_client is not None:
                if variables:
                    self.set_variables(variables)
                reply = self.model.sandbox_client.execute(code, timeout=timeout)

                response = ExecutionResponse(
                    success=True,
                    message="Code executed successfully",
                    execute_response=reply.get("outputs", {}),
                )
                if debug:
                    print(response.stdout)
                    print(response.stderr)

                if output is not None:
                    return self.get_variable(output)
            else:
                raise RuntimeError(
                    "Kernel client is not started. Call `start()` first."
                )

            return response

        return ExecutionResponse(
            success=False,
            message="Execution failed or no response",
            execute_response=[],
        )

    def execute(
        self,
        code_or_path: Union[str, Path],
        variables: Optional[dict[str, Any]] = None,
        output: Optional[str] = None,
        debug: bool = False,
        timeout: Seconds = 10.0,
    ) -> Union[ExecutionResponse, Any]:
        """
        Execute code in the runtime.

        Parameters
        ----------
        code_or_path : Union[str, Path]
            The Python code or path to the file to execute.
        variables : Optional[dict[str, Any]]
            Optional variables to set before executing the code.
        output : Optional[str]
            Optional output variable to return as result.
        debug : bool
            Whether to enable debug mode. If `True`, the output and error streams will be printed.
        timeout : Seconds
            Timeout for the execution.

        Returns
        -------
        Union[Response, Any]
            The result of the code execution.
        """
        if self._check_file(code_or_path):
            return self.execute_file(
                str(code_or_path),
                variables=variables,
                output=output,
                debug=debug,
                timeout=timeout,
            )
        else:
            return self.execute_code(
                str(code_or_path),
                variables=variables,
                output=output,
                debug=debug,
                timeout=timeout,
            )

    def terminate(self) -> bool:
        """
        Terminate the Runtime.

        Returns
        -------
        bool
            True if termination was successful, False otherwise.
        """
        return self._stop()

    def create_snapshot(
        self,
        name: Optional[str] = None,
        description: Optional[str] = None,
        stop: bool = True,
    ) -> "SandboxSnapshotModel":
        """
        Create a new snapshot from the current state.

        Parameters
        ----------
        name : Optional[str]
            Name for the new snapshot.
        description : Optional[str]
            Description for the new snapshot.
        stop : bool
            Whether to stop the runtime after creating the snapshot.

        Returns
        -------
        SandboxSnapshot
            A new snapshot object.
        """
        if self.model.runtime_name is None:
            raise RuntimeError("Runtime not started!")

        name, description = create_snapshot(name=name, description=description)
        response = self._create_snapshot(
            runtime_name=self.model.runtime_name,
            name=name,
            description=description,
            stop=stop,
        )
        if isinstance(response, dict) and not response.get("success", True):
            raise RuntimeError(
                f"Failed to create snapshot '{name}': {response.get('message', 'unknown error')}"
            )
        if stop:
            self.model.sandbox_client = None
            self.model.kernel_id = None
            try:
                if self.model.runtime_name:
                    self.runtimes.stop(self.model.runtime_name)
            except Exception:
                pass

        response = self._list_snapshots()
        snapshot_objects = as_code_sandbox_snapshots(response)
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
            snapshot = next((s for s in snapshot_objects if s.name == name), None)
            if snapshot is not None:
                break
            time.sleep(poll_interval_seconds)
            response = self._list_snapshots()
            snapshot_objects = as_code_sandbox_snapshots(response)

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
