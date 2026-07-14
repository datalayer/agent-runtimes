# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Cloud agent runtime provisioning helpers.

Reusable logic for launching cloud ``agent-runtimes`` from a
:class:`~datalayer_core.client.client.DatalayerClient`. Shared by the eval
examples and the GitHub Actions integration so credit/time-reservation math,
environment burning-rate lookup, and ``create_runtime`` error handling are not
duplicated across consumers.
"""

from __future__ import annotations

import math
from typing import Any, Optional


def resolve_environment_burning_rate(
    client: Any,
    environment_name: str,
) -> float:
    """Return the positive burning rate for an environment.

    Parameters
    ----------
    client : DatalayerClient
        An authenticated client able to list environments.
    environment_name : str
        The environment to look up.

    Returns
    -------
    float
        The environment's positive burning rate.

    Raises
    ------
    RuntimeError
        If the environment cannot be listed, is not found, or has no positive
        burning rate.
    """

    def _to_float(value: Any) -> Optional[float]:
        try:
            if value is None:
                return None
            parsed = float(value)
            if parsed > 0:
                return parsed
        except (TypeError, ValueError):
            return None
        return None

    response = client._list_environments()
    if not response.get("success", True):
        raise RuntimeError(
            f"Failed to list environments: {response.get('message', 'Unknown error')}"
        )
    environments = response.get("environments")
    if not isinstance(environments, list):
        raise RuntimeError("Failed to list environments: invalid environments payload.")

    matched_environment: Optional[dict[str, Any]] = None
    for raw_env in environments:
        if (
            isinstance(raw_env, dict)
            and str(raw_env.get("name") or "") == environment_name
        ):
            matched_environment = raw_env
            break

    if matched_environment is None:
        available = [
            str(env.get("name") or "") for env in environments if isinstance(env, dict)
        ]
        raise RuntimeError(
            f"Environment '{environment_name}' not found for cloud runtime launch. "
            f"Available environments: {available}"
        )

    parsed = _to_float(matched_environment.get("burning_rate"))
    if parsed is not None:
        return parsed

    available_keys = sorted(matched_environment.keys())
    raise RuntimeError(
        f"Environment '{environment_name}' is missing a positive burning rate "
        "in backend payload. Checked key: burning_rate. "
        f"Environment keys: {available_keys}"
    )


def compute_time_reservation_minutes(
    *,
    credits_limit: float,
    burning_rate: float,
) -> int:
    """Compute a time reservation (minutes) from a credits budget.

    ``create_runtime`` charges ``burning_rate * 60 * time_reservation`` credits,
    so this returns the smallest whole-minute reservation whose cost is at least
    ``credits_limit`` (minimum 1 minute).

    Raises
    ------
    ValueError
        If ``burning_rate`` is not positive.
    """
    if burning_rate <= 0:
        raise ValueError("burning_rate must be positive.")
    return max(1, int(math.ceil(float(credits_limit) / (burning_rate * 60.0))))


def create_cloud_agent_runtime(
    client: Any,
    *,
    environment_name: str,
    name: Optional[str] = None,
    agent_spec_id: Optional[str] = None,
    agent_spec: Optional[dict[str, Any]] = None,
    credits_limit: Optional[float] = None,
    time_reservation: Optional[int] = None,
    billing_entity_uid: Optional[str] = None,
    billing_entity_type: Optional[str] = None,
    billing_entity_handle: Optional[str] = None,
) -> Any:
    """Create a cloud agent runtime via the core client.

    Either ``time_reservation`` (in minutes) or ``credits_limit`` must be
    provided. When only ``credits_limit`` is given, the time reservation is
    derived from the environment's burning rate.

    Parameters
    ----------
    client : DatalayerClient
        An authenticated client.
    environment_name : str
        The runtime environment to launch in.
    name : Optional[str]
        Optional runtime name.
    agent_spec_id : Optional[str]
        Registered agentspec id (ignored when ``agent_spec`` is provided).
    agent_spec : Optional[dict[str, Any]]
        Inline agentspec payload (takes precedence over ``agent_spec_id``).
    credits_limit : Optional[float]
        Target credits budget used to derive ``time_reservation`` when the
        latter is not supplied.
    time_reservation : Optional[int]
        Explicit time reservation in minutes.
    billing_entity_uid : Optional[str]
        Optional billing entity UID used for runtime billing attribution.
    billing_entity_type : Optional[str]
        Optional billing entity type (user, organization, team).
    billing_entity_handle : Optional[str]
        Optional billing entity handle.

    Returns
    -------
    Any
        The created runtime object (exposes ``pod_name`` and ``ingress``).

    Raises
    ------
    ValueError
        If neither ``time_reservation`` nor ``credits_limit`` is provided.
    RuntimeError
        If runtime creation fails or returns no ``pod_name``.
    """
    if time_reservation is None:
        if credits_limit is None:
            raise ValueError("Provide either time_reservation or credits_limit.")
        burning_rate = resolve_environment_burning_rate(client, environment_name)
        time_reservation = compute_time_reservation_minutes(
            credits_limit=credits_limit,
            burning_rate=burning_rate,
        )

    try:
        runtime = client.create_runtime(
            name=name,
            environment=environment_name,
            time_reservation=int(time_reservation),
            agent_spec_id=None if agent_spec else agent_spec_id,
            agent_spec=agent_spec,
            billing_entity_uid=billing_entity_uid,
            billing_entity_type=billing_entity_type,
            billing_entity_handle=billing_entity_handle,
        )
    except Exception as exc:
        spec_hint = "inline spec payload" if agent_spec else (agent_spec_id or "<none>")
        raise RuntimeError(
            "Cloud runtime creation failed. "
            f"environment={environment_name}, agent_spec={spec_hint}, error={exc}"
        ) from exc

    pod_name = str(getattr(runtime, "pod_name", "") or "").strip()
    if not pod_name:
        raise RuntimeError("Runtime creation succeeded but pod_name is missing.")
    return runtime


def terminate_cloud_agent_runtime(
    client: Any,
    runtime_or_pod_name: Any,
    *,
    raise_on_error: bool = False,
) -> bool:
    """Terminate a cloud runtime created for agent execution.

    Parameters
    ----------
    client : DatalayerClient
        An authenticated client exposing ``terminate_runtime``.
    runtime_or_pod_name : Any
        Runtime object (with ``pod_name``) or raw pod-name string.
    raise_on_error : bool
        When ``True``, raise :class:`RuntimeError` if termination fails.

    Returns
    -------
    bool
        ``True`` when the runtime was terminated, otherwise ``False``.
    """
    if isinstance(runtime_or_pod_name, str):
        pod_name = runtime_or_pod_name.strip()
    else:
        pod_name = str(getattr(runtime_or_pod_name, "pod_name", "") or "").strip()

    if not pod_name:
        if raise_on_error:
            raise RuntimeError("Cannot terminate cloud runtime: pod_name is missing.")
        return False

    try:
        success = bool(client.terminate_runtime(pod_name))
    except Exception as exc:
        if raise_on_error:
            raise RuntimeError(
                f"Cloud runtime termination failed for pod {pod_name}: {exc}"
            ) from exc
        return False

    if not success and raise_on_error:
        raise RuntimeError(
            f"Cloud runtime termination returned unsuccessful for pod {pod_name}."
        )
    return success


def teardown_agent_execution_resources(
    client: Any,
    *,
    execution_target: str,
    cloud_runtime_or_pod_name: Any = None,
    local_base_url: Optional[str] = None,
    local_agent_name: Optional[str] = None,
    token: Optional[str] = None,
    local_runtime: Any = None,
) -> dict[str, bool]:
    """Teardown resources used by agent execution.

    Handles both cloud and local cleanup using a single API so consumers
    (examples, GitHub Actions) don't duplicate teardown logic.
    """
    result = {
        "cloud_runtime_terminated": False,
        "local_agent_deleted": False,
        "local_runtime_terminated": False,
    }

    target = str(execution_target or "").strip().lower()
    if target == "cloud":
        if cloud_runtime_or_pod_name:
            result["cloud_runtime_terminated"] = terminate_cloud_agent_runtime(
                client,
                cloud_runtime_or_pod_name,
            )
        return result

    if target == "local":
        if local_base_url and token and local_agent_name:
            from agent_runtimes.client.agent_client import delete_local_agent

            result["local_agent_deleted"] = delete_local_agent(
                base_url=local_base_url,
                token=token,
                agent_name=local_agent_name,
            )
        if local_runtime is not None:
            from agent_runtimes.client.agent_client import terminate_local_agent_runtime

            terminate_local_agent_runtime(local_runtime)
            result["local_runtime_terminated"] = True

    return result
