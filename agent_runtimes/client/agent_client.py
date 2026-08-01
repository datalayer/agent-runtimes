# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agent client for agent-runtimes.

Extends the account-only ``datalayer_core.DatalayerClient`` with runtime
creation, environments, snapshots, Ray, evals, code execution, and local/remote
agent lifecycle helpers — migrated out of datalayer-core.
"""

import json
import logging
import os
import socket
import subprocess
import time
import uuid
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Optional, Union
from urllib.parse import urlparse

import requests
from datalayer_core.client.client import DatalayerClient as _BaseDatalayerClient
from datalayer_core.utils.defaults import (
    DEFAULT_ENVIRONMENT,
    DEFAULT_TIME_RESERVATION,
)
from datalayer_core.utils.types import Minutes
from jupyter_kernel_client import JupyterKernelClient

from agent_runtimes.mixins.environments import EnvironmentsMixin
from agent_runtimes.mixins.evals import EvalsMixin
from agent_runtimes.mixins.events import EventsMixin
from agent_runtimes.mixins.ray import RayMixin
from agent_runtimes.mixins.runtimes import RuntimesMixin
from agent_runtimes.mixins.sandbox_snapshots import SandboxSnapshotsMixin
from agent_runtimes.models.environment import EnvironmentModel
from agent_runtimes.models.sandbox_snapshot import SandboxSnapshotModel
from agent_runtimes.sandboxes.code_sandbox_snapshots import (
    as_code_sandbox_snapshots,
    create_snapshot,
)

logger = logging.getLogger(__name__)


def _runtime_environment_name(runtime_data: dict[str, Any]) -> str:
    environment = runtime_data.get("environment")
    if isinstance(environment, dict):
        name = str(environment.get("name") or "").strip()
        if name:
            return name
    return str(runtime_data.get("environment_name") or "").strip()

DEFAULT_LOCAL_HOST = "127.0.0.1"
DEFAULT_LOCAL_AGENT_NAME = "default"
DEFAULT_LOCAL_PROTOCOL = "vercel-ai"
DEFAULT_LOCAL_LOG_LEVEL = "info"

# Map Datalayer Bedrock credentials onto the AWS variables the local
# agent-runtimes server expects.
_BEDROCK_ENV_MAPPINGS = {
    "DATALAYER_BEDROCK_AWS_ACCESS_KEY_ID": "AWS_ACCESS_KEY_ID",
    "DATALAYER_BEDROCK_AWS_SECRET_ACCESS_KEY": "AWS_SECRET_ACCESS_KEY",
    "DATALAYER_BEDROCK_AWS_DEFAULT_REGION": "AWS_DEFAULT_REGION",
}


@dataclass
class LocalAgentRuntime:
    """Handle to a running local ``agent-runtimes`` server."""

    base_url: str
    agent_name: str
    agent_spec_id: str
    process: Optional[subprocess.Popen[Any]] = field(default=None, repr=False)

    @property
    def chat_endpoint(self) -> str:
        """Vercel AI chat endpoint for this runtime's agent."""
        return f"{self.base_url.rstrip('/')}/api/v1/vercel-ai/{self.agent_name}"

    def terminate(self) -> None:
        """Terminate the underlying server process (if any)."""
        terminate_local_agent_runtime(self)


def find_free_port(host: str = DEFAULT_LOCAL_HOST) -> int:
    """Return a free TCP port bound on ``host``."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def build_agent_runtime_env() -> tuple[dict[str, str], list[str]]:
    """Build subprocess env with Bedrock-to-AWS variable mappings."""
    runtime_env = os.environ.copy()
    mapped_targets: list[str] = []
    for source, target in _BEDROCK_ENV_MAPPINGS.items():
        value = (runtime_env.get(source) or "").strip()
        if value:
            runtime_env[target] = value
            mapped_targets.append(target)
    return runtime_env, mapped_targets


def wait_for_local_runtime(base_url: str, timeout_seconds: int = 25) -> None:
    """Block until the local runtime ``/health`` endpoint responds."""
    endpoint = f"{base_url.rstrip('/')}/health"
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            response = requests.get(endpoint, timeout=2)
            if response.status_code < 500:
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError(
        f"Local agent-runtimes server did not become ready at {endpoint} "
        f"within {timeout_seconds}s."
    )


def start_local_agent_runtime(
    *,
    agent_spec_id: str,
    agent_name: str = DEFAULT_LOCAL_AGENT_NAME,
    host: str = DEFAULT_LOCAL_HOST,
    port: Optional[int] = None,
    protocol: str = DEFAULT_LOCAL_PROTOCOL,
    log_level: str = DEFAULT_LOCAL_LOG_LEVEL,
    wait: bool = True,
    disable_tool_approvals: bool = False,
) -> LocalAgentRuntime:
    """Launch a local ``agent-runtimes`` server as a subprocess."""
    resolved_port = port or find_free_port(host)
    base_url = f"http://{host}:{resolved_port}"

    command = [
        "agent-runtimes",
        "serve",
        "--host",
        host,
        "--port",
        str(resolved_port),
        "--protocol",
        protocol,
        "--agent-id",
        agent_spec_id,
        "--agent-name",
        agent_name,
        "--log-level",
        log_level,
    ]
    if disable_tool_approvals:
        command.append("--disable-tool-approvals")

    runtime_env, mapped_targets = build_agent_runtime_env()
    if mapped_targets:
        logger.info(
            "Launching local agent-runtimes with Bedrock env mapping: "
            "DATALAYER_BEDROCK_* -> %s",
            ", ".join(mapped_targets),
        )
    else:
        logger.info(
            "Launching local agent-runtimes without DATALAYER_BEDROCK_* mapping "
            "(no DATALAYER_BEDROCK_AWS_* variables detected)."
        )

    try:
        process = subprocess.Popen(command, env=runtime_env)
    except FileNotFoundError as exc:
        raise RuntimeError(
            "Could not start local agent runtime: the 'agent-runtimes' command "
            "was not found on PATH. Install the agent-runtimes package first."
        ) from exc
    except Exception as exc:
        raise RuntimeError(f"Failed to start local agent runtime: {exc}") from exc

    runtime = LocalAgentRuntime(
        base_url=base_url,
        agent_name=agent_name,
        agent_spec_id=agent_spec_id,
        process=process,
    )

    if wait:
        try:
            wait_for_local_runtime(base_url)
        except Exception:
            terminate_local_agent_runtime(runtime)
            raise

    return runtime


def terminate_local_agent_runtime(runtime: LocalAgentRuntime) -> None:
    """Terminate a local runtime process, escalating to kill if needed."""
    process = runtime.process
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def ensure_local_agent(
    *,
    base_url: str,
    agent_name: str,
    token: str,
    agent_spec_id: str,
    agent_library: str = "pydantic-ai",
    transport: str = DEFAULT_LOCAL_PROTOCOL,
    enable_skills: bool = True,
    description: Optional[str] = None,
    timeout: int = 120,
    disable_tool_approvals: bool = False,
) -> None:
    """Ensure a local agent with the expected transport is registered."""
    base = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {token}"}

    try:
        response = requests.get(f"{base}/api/v1/agents", headers=headers, timeout=30)
        payload = response.json() if response.content else {}
    except Exception:
        payload = {}

    existing_agents = payload.get("agents") if isinstance(payload, dict) else []
    if not isinstance(existing_agents, list):
        existing_agents = []

    for agent in existing_agents:
        if not isinstance(agent, dict):
            continue
        existing_id = str(agent.get("id") or "").strip()
        existing_name = str(agent.get("name") or "").strip()
        if agent_name and (existing_id == agent_name or existing_name == agent_name):
            existing_transport = str(agent.get("transport") or "").strip().lower()
            if existing_transport in {"vercel-ai", "vercel_ai"}:
                return

            delete_target = existing_id or agent_name
            try:
                requests.delete(
                    f"{base}/api/v1/agents/{delete_target}",
                    headers=headers,
                    timeout=30,
                )
            except Exception as exc:
                raise RuntimeError(
                    "Local agent exists with incompatible transport "
                    f"'{existing_transport or 'unknown'}' and could not be "
                    f"replaced: {exc}"
                ) from exc
            break

    body = {
        "name": agent_name,
        "description": description
        or f"Local agent '{agent_name}' registered by datalayer-core.",
        "agent_library": agent_library,
        "transport": transport,
        "agent_spec_id": agent_spec_id,
        "enable_skills": enable_skills,
        "tools": [],
        "disableToolApprovals": disable_tool_approvals,
    }
    try:
        response = requests.post(
            f"{base}/api/v1/agents",
            json=body,
            headers=headers,
            timeout=timeout,
        )
    except requests.exceptions.RequestException as exc:
        parsed = urlparse(base_url)
        host = parsed.hostname or DEFAULT_LOCAL_HOST
        port = parsed.port or 8000
        scheme = parsed.scheme or "http"
        raise RuntimeError(
            "Local agent bootstrap request failed: "
            f"{exc}. Start agent-runtimes first, for example: "
            f"agent-runtimes serve --host {host} --port {port} "
            f"--agent-id {agent_spec_id} --agent-name {agent_name} "
            f"(base URL: {scheme}://{host}:{port})."
        ) from exc

    if response.status_code < 400:
        return
    body_text = response.text or ""
    if response.status_code == 409 and "already exists" in body_text.lower():
        return
    raise RuntimeError(
        f"Local agent bootstrap failed ({response.status_code}): "
        f"{body_text or 'unknown error'}"
    )


def delete_local_agents(*, base_url: str, token: str) -> tuple[int, int]:
    """Delete all locally-registered agents."""
    base = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.get(f"{base}/api/v1/agents", headers=headers, timeout=30)
        payload = response.json() if response.content else {}
    except Exception as exc:
        logger.warning("Unable to list local agents for cleanup: %s", exc)
        return (0, 0)

    agents = payload.get("agents") if isinstance(payload, dict) else []
    if not isinstance(agents, list):
        agents = []

    deleted = 0
    for agent in agents:
        if not isinstance(agent, dict):
            continue
        agent_id = str(agent.get("id") or "").strip()
        if not agent_id:
            continue
        try:
            requests.delete(
                f"{base}/api/v1/agents/{agent_id}",
                headers=headers,
                timeout=30,
            )
            deleted += 1
        except Exception as exc:
            logger.warning("Unable to delete local agent %s: %s", agent_id, exc)

    return (len(agents), deleted)


def delete_local_agent(*, base_url: str, token: str, agent_name: str) -> bool:
    """Delete a single locally-registered agent by id or name."""
    target_name = str(agent_name or "").strip()
    if not target_name:
        return False

    base = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {token}"}
    try:
        response = requests.get(f"{base}/api/v1/agents", headers=headers, timeout=30)
        payload = response.json() if response.content else {}
    except Exception as exc:
        logger.warning("Unable to list local agents for cleanup: %s", exc)
        return False

    agents = payload.get("agents") if isinstance(payload, dict) else []
    if not isinstance(agents, list):
        return False

    for agent in agents:
        if not isinstance(agent, dict):
            continue
        agent_id = str(agent.get("id") or "").strip()
        name = str(agent.get("name") or "").strip()
        if target_name not in {agent_id, name}:
            continue
        delete_target = agent_id or target_name
        try:
            response = requests.delete(
                f"{base}/api/v1/agents/{delete_target}",
                headers=headers,
                timeout=30,
            )
            return response.status_code < 400
        except Exception as exc:
            logger.warning("Unable to delete local agent %s: %s", delete_target, exc)
            return False

    return False


def extract_vercel_stream_text(raw: str) -> str:
    """Extract concatenated text deltas from a Vercel AI SSE stream."""
    text_parts: list[str] = []
    for line in raw.splitlines():
        if not line.startswith("data: "):
            continue
        payload = line[6:].strip()
        if not payload or payload == "[DONE]":
            continue
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue

        if isinstance(event, str):
            if event.strip():
                text_parts.append(event)
            continue
        if not isinstance(event, dict):
            continue

        for key in ("delta", "text", "content", "outputText", "textDelta"):
            value = event.get(key)
            if isinstance(value, str) and value:
                text_parts.append(value)

    return "".join(text_parts).strip()


def _coerce_usage_payload(candidate: Any) -> dict[str, Any]:
    if not isinstance(candidate, dict) or not candidate:
        return {}
    nested = candidate.get("usage")
    if isinstance(nested, dict) and nested:
        merged = dict(nested)
        for key, value in candidate.items():
            if key == "usage":
                continue
            merged.setdefault(str(key), value)
        return merged
    return dict(candidate)


def _usage_payload_score(payload: dict[str, Any]) -> int:
    if not payload:
        return 0
    token_keys = {
        "prompt_tokens",
        "promptTokens",
        "input_tokens",
        "inputTokens",
        "completion_tokens",
        "completionTokens",
        "output_tokens",
        "outputTokens",
        "total_tokens",
        "totalTokens",
        "tokens_total",
        "token_total",
    }
    score = len(payload)
    if any(key in payload for key in token_keys):
        score += 100
    if any(
        key in payload
        for key in (
            "credits_consumed",
            "creditsConsumed",
            "credits",
            "total_credits",
            "cost_credits",
        )
    ):
        score += 10
    return score


def extract_vercel_stream_usage(raw: str) -> dict[str, Any]:
    """Extract best-effort pydantic usage metadata from a Vercel AI SSE stream."""
    best: dict[str, Any] = {}
    best_score = 0
    for line in raw.splitlines():
        if not line.startswith("data: "):
            continue
        payload = line[6:].strip()
        if not payload or payload == "[DONE]":
            continue
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue

        candidates: list[dict[str, Any]] = []
        message_metadata = event.get("messageMetadata")
        if isinstance(message_metadata, dict):
            candidates.extend(
                [
                    _coerce_usage_payload(message_metadata.get("pydantic_ai")),
                    _coerce_usage_payload(message_metadata.get("pydanticAI")),
                    _coerce_usage_payload(message_metadata.get("usage")),
                ]
            )
        candidates.extend(
            [
                _coerce_usage_payload(event.get("pydantic_ai_usage")),
                _coerce_usage_payload(event.get("pydantic_ai")),
                _coerce_usage_payload(event.get("usage")),
            ]
        )
        for candidate in candidates:
            score = _usage_payload_score(candidate)
            if score > best_score:
                best = candidate
                best_score = score
    return best


def _vercel_ai_error_message(raw: str) -> Optional[str]:
    """Detect a non-stream error body returned with an HTTP 200 status."""
    text = (raw or "").strip()
    if not text:
        return "Empty response body"
    if "data:" in text:
        return None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return None
    if isinstance(payload, dict):
        error = payload.get("error") or payload.get("message")
        if error:
            return str(error)
    return None


def _post_vercel_ai_chat(
    *,
    endpoint: str,
    token: str,
    prompt: str,
    timeout: int,
    source_label: str,
) -> dict[str, Any]:
    """POST a single prompt to a Vercel AI chat endpoint."""
    message_id = f"chat-{int(time.time() * 1000)}"
    parts = [{"type": "text", "text": prompt}]
    message = {"id": message_id, "role": "user", "parts": parts}
    body = {
        "trigger": "submit-message",
        "id": f"chat-{message_id}",
        "message": message,
        "messages": [message],
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }
    try:
        response = requests.post(
            endpoint,
            json=body,
            headers=headers,
            timeout=timeout,
        )
    except requests.exceptions.RequestException as exc:
        message_text = f"{source_label} chat request failed: {exc}"
        return {
            "status": "failed",
            "output": {"text": "", "raw_stream_excerpt": ""},
            "failure_cause": {
                "stage": "runtime_execution",
                "type": "runtime_unreachable",
                "message": message_text,
                "detail_excerpt": message_text,
                "execution_url": endpoint,
            },
        }

    raw = response.text or ""
    if response.status_code >= 400:
        message_text = f"{source_label} chat failed (HTTP {response.status_code})"
        return {
            "status": "failed",
            "output": {"text": "", "raw_stream_excerpt": raw[:2000]},
            "failure_cause": {
                "stage": "runtime_execution",
                "type": "runtime_http_error",
                "message": message_text,
                "detail_excerpt": raw[:2000] or message_text,
                "execution_url": endpoint,
            },
        }

    output_text = extract_vercel_stream_text(raw)
    usage = extract_vercel_stream_usage(raw)
    if not output_text:
        error_message = _vercel_ai_error_message(raw)
        if error_message is not None:
            message_text = f"{source_label} chat returned no output: {error_message}"
            return {
                "status": "failed",
                "output": {"text": "", "raw_stream_excerpt": raw[:2000]},
                "failure_cause": {
                    "stage": "runtime_execution",
                    "type": "runtime_agent_unavailable",
                    "message": message_text,
                    "detail_excerpt": raw[:2000] or message_text,
                    "execution_url": endpoint,
                },
            }
    output: dict[str, Any] = {
        "text": output_text,
        "raw_stream_excerpt": raw[:2000],
    }
    result: dict[str, Any] = {
        "status": "completed",
        "output": output,
    }
    if usage:
        output["pydantic_ai_usage"] = usage
        result["usage"] = usage
    return result


def run_local_agent_chat(
    *,
    base_url: str,
    agent_name: str,
    token: str,
    prompt: str,
    timeout: int = 300,
) -> dict[str, Any]:
    """Send a single prompt to a local agent via the Vercel AI endpoint."""
    endpoint = f"{base_url.rstrip('/')}/api/v1/vercel-ai/{agent_name}"
    return _post_vercel_ai_chat(
        endpoint=endpoint,
        token=token,
        prompt=prompt,
        timeout=timeout,
        source_label="Local agent",
    )


def build_agent_runtimes_base_url(ingress: str) -> str:
    """Derive cloud ``agent-runtimes`` base URL from a runtime ingress."""
    base = (ingress or "").rstrip("/")
    if "/jupyter/server/" in base:
        base = base.replace("/jupyter/server/", "/agent-runtimes/", 1)
    return base


def runtime_route_candidates(
    *,
    agent_name: Optional[str] = None,
    agent_spec_id: Optional[str] = None,
    pod_name: Optional[str] = None,
) -> list[str]:
    """Build ordered and de-duplicated Vercel AI route candidates."""
    candidates: list[str] = []
    for value in (agent_name, agent_spec_id, pod_name, DEFAULT_LOCAL_AGENT_NAME):
        token = str(value or "").strip()
        if token and token not in candidates:
            candidates.append(token)
    return candidates


def run_cloud_agent_chat(
    *,
    ingress: str,
    token: str,
    prompt: str,
    route_candidates: list[str],
    timeout: int = 300,
) -> dict[str, Any]:
    """Send a single prompt to a cloud runtime agent via Vercel AI."""
    base_url = build_agent_runtimes_base_url(ingress)
    candidates = [c for c in route_candidates if str(c or "").strip()]
    if not candidates:
        candidates = [DEFAULT_LOCAL_AGENT_NAME]

    attempted: list[str] = []
    last_result: dict[str, Any] | None = None
    for route in candidates:
        endpoint = f"{base_url}/api/v1/vercel-ai/{route}"
        attempted.append(endpoint)
        result = _post_vercel_ai_chat(
            endpoint=endpoint,
            token=token,
            prompt=prompt,
            timeout=timeout,
            source_label="Cloud agent",
        )
        if str(result.get("status") or "").strip().lower() == "completed":
            return result
        last_result = result

    if last_result is None:
        last_result = {
            "status": "failed",
            "output": {"text": "", "raw_stream_excerpt": ""},
            "failure_cause": {
                "stage": "runtime_execution",
                "type": "runtime_unreachable",
                "message": "No cloud agent route candidates available.",
                "detail_excerpt": "No cloud agent route candidates available.",
                "execution_url": base_url,
            },
        }
    elif len(attempted) > 1:
        failure_cause = last_result.get("failure_cause")
        if isinstance(failure_cause, dict):
            tried = "; ".join(attempted)
            base_detail = str(failure_cause.get("detail_excerpt") or "")
            failure_cause["detail_excerpt"] = (
                f"{base_detail}\nAttempted routes: {tried}"
            ).strip()
            failure_cause["attempted_urls"] = attempted
    return last_result


class AgentClient(
    _BaseDatalayerClient,
    RuntimesMixin,
    EnvironmentsMixin,
    EvalsMixin,
    EventsMixin,
    RayMixin,
    SandboxSnapshotsMixin,
):
    """Datalayer client with runtime creation, code execution, and agent lifecycle.

    Supports both remote (cloud runtime) and local (``agent-runtimes`` server)
    agent execution via the ``start_local_agent_runtime``, ``ensure_local_agent``,
    ``run_local_agent_chat``, and ``run_cloud_agent_chat`` helpers exposed as
    methods.
    """

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
        billing_entity_uid: Optional[str] = None,
        billing_entity_type: Optional[str] = None,
        billing_entity_handle: Optional[str] = None,
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
            client_for_request = _BaseDatalayerClient(urls=self._urls, api_key=api_key)

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
                billing_entity_uid=billing_entity_uid,
                billing_entity_type=billing_entity_type,
                billing_entity_handle=billing_entity_handle,
            )
        else:
            # Create runtime without snapshot
            response = client_for_request._create_runtime(
                given_name=name,
                environment_name=environment,
                agent_spec_id=agent_spec_id,
                agent_spec=agent_spec,
                credits_limit=credits_limit,
                billing_entity_uid=billing_entity_uid,
                billing_entity_type=billing_entity_type,
                billing_entity_handle=billing_entity_handle,
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
            raise RuntimeError(f"Runtime creation failed ({context}): {message}")

        runtime_data = response["runtime"]
        runtime = RuntimeService(
            name=runtime_data["given_name"],
            environment=_runtime_environment_name(runtime_data),
            datalayer_url=self._urls.datalayer_url,
            iam_url=self._urls.iam_url,
            token=api_key or self._get_api_key(),
            ingress=runtime_data["ingress"],
            jupyter_token=runtime_data["token"],
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
                    environment=_runtime_environment_name(runtime),
                    pod_name=runtime["pod_name"],
                    token=self._get_api_key(),
                    ingress=runtime["ingress"],
                    reservation_id=runtime["reservation_id"],
                    uid=runtime["uid"],
                    burning_rate=runtime["burning_rate"],
                    jupyter_token=runtime["token"],
                    datalayer_url=self._urls.datalayer_url,
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
                client_for_request = _BaseDatalayerClient(
                    urls=self._urls, api_key=api_key
                )
                return client_for_request._terminate_runtime(pod_name).get(
                    "success", False
                )
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
            environment=_runtime_environment_name(runtime_data),
            pod_name=runtime_data.get("pod_name", pod_name),
            token=self._get_api_key(),
            ingress=runtime_data.get("ingress"),
            reservation_id=runtime_data.get("reservation_id"),
            uid=runtime_data.get("uid"),
            burning_rate=runtime_data.get("burning_rate"),
            jupyter_token=runtime_data.get("token"),
            datalayer_url=self._urls.datalayer_url,
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
            client_for_request = _BaseDatalayerClient(urls=self._urls, api_key=api_key)

        runtime_service = (
            runtime
            if isinstance(runtime, RuntimeService)
            else client_for_request.get_runtime(runtime)
        )

        endpoint = str(runtime_service.ingress or "").rstrip("/")
        runtime_token = str(
            runtime_service.jupyter_token or client_for_request._get_api_key() or ""
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

        kernel_client: Optional[JupyterKernelClient] = None
        try:
            kernel_client = JupyterKernelClient(server_url=endpoint, token=runtime_token)
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

    # ------------------------------------------------------------------
    # Local / remote agent lifecycle
    # ------------------------------------------------------------------

    def start_local_agent_runtime(
        self,
        *,
        agent_spec_id: str,
        agent_name: str = DEFAULT_LOCAL_AGENT_NAME,
        host: str = "127.0.0.1",
        port: Optional[int] = None,
        protocol: str = "vercel-ai",
        log_level: str = "info",
        wait: bool = True,
        disable_tool_approvals: bool = False,
    ) -> LocalAgentRuntime:
        """Launch a local ``agent-runtimes`` server as a subprocess.

        Parameters
        ----------
        agent_spec_id : str
            Agentspec id to boot the runtime with.
        agent_name : str
            Registered agent name/id served by the runtime.
        host : str
            Host interface to bind to.
        port : Optional[int]
            Port to bind to. A free port is selected when omitted.
        protocol : str
            Transport protocol exposed by the runtime (e.g. ``vercel-ai``).
        log_level : str
            Log level for the runtime process.
        wait : bool
            Whether to block until the runtime reports healthy.
        disable_tool_approvals : bool
            Whether to disable tool approvals on the launched runtime.

        Returns
        -------
        LocalAgentRuntime
            Handle pointing at the running server.
        """
        return start_local_agent_runtime(
            agent_spec_id=agent_spec_id,
            agent_name=agent_name,
            host=host,
            port=port,
            protocol=protocol,
            log_level=log_level,
            wait=wait,
            disable_tool_approvals=disable_tool_approvals,
        )

    def ensure_local_agent(
        self,
        *,
        base_url: str,
        agent_name: str,
        agent_spec_id: str,
        token: Optional[str] = None,
        transport: str = "vercel-ai",
        enable_skills: bool = True,
        description: Optional[str] = None,
        timeout: int = 120,
        disable_tool_approvals: bool = False,
    ) -> None:
        """Ensure a local agent with the expected transport is registered.

        Parameters
        ----------
        base_url : str
            Local ``agent-runtimes`` base URL.
        agent_name : str
            Agent name/id to register.
        agent_spec_id : str
            Agentspec id backing the agent.
        token : Optional[str]
            Bearer token; falls back to this client's API key when omitted.
        transport : str
            Transport protocol to register (e.g. ``vercel-ai``).
        enable_skills : bool
            Whether to enable skills for the registered agent.
        description : Optional[str]
            Optional description for the agent.
        timeout : int
            Registration request timeout in seconds.
        disable_tool_approvals : bool
            Whether to disable tool approvals for the agent.
        """
        ensure_local_agent(
            base_url=base_url,
            agent_name=agent_name,
            token=str(token or self._get_api_key() or ""),
            agent_spec_id=agent_spec_id,
            transport=transport,
            enable_skills=enable_skills,
            description=description,
            timeout=timeout,
            disable_tool_approvals=disable_tool_approvals,
        )

    def delete_local_agent(
        self, *, base_url: str, agent_name: str, token: Optional[str] = None
    ) -> bool:
        """Delete a single locally-registered agent by id or name.

        Parameters
        ----------
        base_url : str
            Local ``agent-runtimes`` base URL.
        agent_name : str
            Agent id or name to delete.
        token : Optional[str]
            Bearer token; falls back to this client's API key when omitted.

        Returns
        -------
        bool
            ``True`` when a matching agent was found and delete accepted.
        """
        return delete_local_agent(
            base_url=base_url,
            token=str(token or self._get_api_key() or ""),
            agent_name=agent_name,
        )

    def delete_local_agents(
        self, *, base_url: str, token: Optional[str] = None
    ) -> tuple[int, int]:
        """Delete all locally-registered agents.

        Parameters
        ----------
        base_url : str
            Local ``agent-runtimes`` base URL.
        token : Optional[str]
            Bearer token; falls back to this client's API key when omitted.

        Returns
        -------
        tuple[int, int]
            ``(total_agents, deleted_agents)``.
        """
        return delete_local_agents(
            base_url=base_url,
            token=str(token or self._get_api_key() or ""),
        )

    def run_local_agent_chat(
        self,
        *,
        base_url: str,
        agent_name: str,
        prompt: str,
        token: Optional[str] = None,
        timeout: int = 300,
    ) -> dict[str, Any]:
        """Send a single prompt to a local agent via the Vercel AI endpoint.

        Parameters
        ----------
        base_url : str
            Local ``agent-runtimes`` base URL.
        agent_name : str
            Registered agent name/id to target.
        prompt : str
            Prompt to send.
        token : Optional[str]
            Bearer token; falls back to this client's API key when omitted.
        timeout : int
            Per-request timeout in seconds.

        Returns
        -------
        dict[str, Any]
            Structured chat result (``status``/``output``/``failure_cause``).
        """
        return run_local_agent_chat(
            base_url=base_url,
            agent_name=agent_name,
            token=str(token or self._get_api_key() or ""),
            prompt=prompt,
            timeout=timeout,
        )

    def run_cloud_agent_chat(
        self,
        *,
        ingress: str,
        prompt: str,
        route_candidates: Optional[list[str]] = None,
        agent_name: Optional[str] = None,
        agent_spec_id: Optional[str] = None,
        pod_name: Optional[str] = None,
        token: Optional[str] = None,
        timeout: int = 300,
    ) -> dict[str, Any]:
        """Send a single prompt to a cloud runtime agent via Vercel AI.

        Parameters
        ----------
        ingress : str
            Runtime ingress URL.
        prompt : str
            Prompt to send.
        route_candidates : Optional[list[str]]
            Explicit ordered route candidates. When omitted they are derived
            from ``agent_name``/``agent_spec_id``/``pod_name``.
        agent_name : Optional[str]
            Agent name used to derive route candidates.
        agent_spec_id : Optional[str]
            Agentspec id used to derive route candidates.
        pod_name : Optional[str]
            Runtime pod name used to derive route candidates.
        token : Optional[str]
            Bearer token; falls back to this client's API key when omitted.
        timeout : int
            Per-request timeout in seconds.

        Returns
        -------
        dict[str, Any]
            Structured chat result (``status``/``output``/``failure_cause``).
        """
        candidates = route_candidates or runtime_route_candidates(
            agent_name=agent_name,
            agent_spec_id=agent_spec_id,
            pod_name=pod_name,
        )
        return run_cloud_agent_chat(
            ingress=ingress,
            token=str(token or self._get_api_key() or ""),
            prompt=prompt,
            route_candidates=candidates,
            timeout=timeout,
        )
