# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Local agent runtime lifecycle helpers.

Provides a reusable API to launch, register, interact with, and tear down a
local ``agent-runtimes`` server. Shared by the ``agent-runtimes agents`` CLI
(``--local`` flag) and by examples so the same logic is not duplicated.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import subprocess
import time
from dataclasses import dataclass, field
from typing import Any, Optional
from urllib.parse import urlparse

import requests

logger = logging.getLogger(__name__)

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
    """Build the subprocess environment with Bedrock -> AWS variable mapping.

    Returns
    -------
    tuple[dict[str, str], list[str]]
        The environment mapping and the list of AWS targets that were mapped.
    """
    runtime_env = os.environ.copy()
    mapped_targets: list[str] = []
    for source, target in _BEDROCK_ENV_MAPPINGS.items():
        value = (runtime_env.get(source) or "").strip()
        if value:
            runtime_env[target] = value
            mapped_targets.append(target)
    return runtime_env, mapped_targets


def wait_for_local_runtime(base_url: str, timeout_seconds: int = 25) -> None:
    """Block until the local runtime ``/health`` endpoint responds.

    Parameters
    ----------
    base_url : str
        Base URL of the local agent-runtimes server.
    timeout_seconds : int
        Maximum number of seconds to wait.

    Raises
    ------
    RuntimeError
        If the server does not become ready before the timeout.
    """
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

    Returns
    -------
    LocalAgentRuntime
        Handle pointing at the running server.

    Raises
    ------
    RuntimeError
        If the runtime cannot be started or does not become ready.
    """
    resolved_port = port or find_free_port(host)
    scheme = "http"
    base_url = f"{scheme}://{host}:{resolved_port}"

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
        raise RuntimeError(
            f"Failed to start local agent runtime: {exc}"
        ) from exc

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
    """Ensure a local agent with the expected transport is registered.

    Lists existing agents, replaces a mismatched-transport registration when
    needed, and creates the agent if it is missing.

    Raises
    ------
    RuntimeError
        If the agent cannot be registered.
    """
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

            # Replace mismatched transport registration so local interactions
            # use the Vercel AI chat endpoint.
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
    """Delete all locally-registered agents.

    Returns
    -------
    tuple[int, int]
        ``(total_agents, deleted_agents)``.
    """
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
    """Delete a single locally-registered agent by id or name.

    Parameters
    ----------
    base_url : str
        Local agent-runtimes base URL.
    token : str
        Bearer token used for local API calls.
    agent_name : str
        Agent id or name to delete.

    Returns
    -------
    bool
        ``True`` when a matching agent was found and delete accepted.
    """
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
    """Detect a non-stream error body returned with an HTTP 200 status.

    The ``agent-runtimes`` server answers an unknown agent route with HTTP 200
    and a JSON error body (for example
    ``{"error": "Agent '...' not found", "message": "No agent registered ..."}``)
    instead of an SSE stream. Such a body must NOT be treated as a successful
    completion, otherwise route-candidate fallback stops at the first wrong
    route and an empty answer is recorded.

    Returns
    -------
    Optional[str]
        The error message when the body is an error payload (or an empty body),
        otherwise ``None`` when the body is a genuine SSE stream.
    """
    text = (raw or "").strip()
    if not text:
        return "Empty response body"
    # A genuine Vercel AI response is an SSE stream of ``data:`` lines.
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
    """POST a single prompt to a Vercel AI chat endpoint.

    Shared by local and cloud chat helpers. Failures are captured into a
    structured ``failure_cause`` (matching the eval report schema) instead of
    raising.

    Returns
    -------
    dict[str, Any]
        On success: ``{"status": "completed", "output": {...}}``.
        On failure: ``{"status": "failed", "output": {...},
        "failure_cause": {"stage", "type", "message", "detail_excerpt",
        "execution_url"}}``.
    """
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
            message_text = (
                f"{source_label} chat returned no output: {error_message}"
            )
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
    """Send a single prompt to a local agent via the Vercel AI endpoint.

    Failures are captured into a structured ``failure_cause`` (matching the
    eval report schema) instead of raising, so callers can persist failed runs
    and have them surfaced in reports.

    Returns
    -------
    dict[str, Any]
        On success: ``{"status": "completed", "output": {...}}``.
        On failure: ``{"status": "failed", "output": {...},
        "failure_cause": {"stage", "type", "message", "detail_excerpt",
        "execution_url"}}``.
    """
    endpoint = f"{base_url.rstrip('/')}/api/v1/vercel-ai/{agent_name}"
    return _post_vercel_ai_chat(
        endpoint=endpoint,
        token=token,
        prompt=prompt,
        timeout=timeout,
        source_label="Local agent",
    )


def build_agent_runtimes_base_url(ingress: str) -> str:
    """Derive the cloud ``agent-runtimes`` base URL from a runtime ingress.

    A runtime's ``ingress`` (returned by :meth:`DatalayerClient.create_runtime`)
    points at the Jupyter server path on the runtimes host, e.g.
    ``https://r1.datalayer.run/jupyter/server/<pool>/<runtime>``. The
    ``agent-runtimes`` container is exposed under the sibling path
    ``/agent-runtimes/<pool>/<runtime>`` on the **same** host. Using the
    runtime's own ingress guarantees the correct runtimes host (e.g. ``r1``)
    rather than the IAM/control-plane host (e.g. ``prod1``).

    Parameters
    ----------
    ingress : str
        The runtime ingress URL.

    Returns
    -------
    str
        The agent-runtimes base URL (without a trailing slash).
    """
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
    """Build an ordered, de-duplicated list of Vercel AI route candidates.

    The ``agent-runtimes`` server inside a cloud runtime may register its agent
    under different names depending on how it was launched. Trying a few known
    candidates (explicit agent name, agentspec id, pod name, then the default
    route) makes cloud execution resilient.
    """
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
    """Send a single prompt to a cloud runtime agent via the Vercel AI endpoint.

    The execution URL is derived from the runtime's ``ingress`` (via
    :func:`build_agent_runtimes_base_url`) so the request targets the correct
    runtimes host (e.g. ``r1.datalayer.run``). Each route candidate is tried in
    order until one succeeds; if all fail, the last structured failure is
    returned with every attempted URL recorded in ``detail_excerpt``.

    Returns
    -------
    dict[str, Any]
        Same contract as :func:`run_local_agent_chat`.
    """
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

