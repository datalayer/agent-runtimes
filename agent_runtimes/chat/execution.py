# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Execution helpers for TUX local shell and sandbox code execution."""

from __future__ import annotations

import asyncio
import subprocess
from dataclasses import dataclass
from typing import Any


@dataclass
class ShellExecutionResult:
    """Normalized result for local shell command execution."""

    command: str
    exit_code: int
    stdout: str
    stderr: str

    @property
    def success(self) -> bool:
        return self.exit_code == 0


@dataclass
class SandboxExecutionResult:
    """Normalized result for sandbox python execution."""

    code: str
    success: bool
    execution_ok: bool
    stdout: str
    stderr: str
    result: Any | None = None


class TuxExecutionGateway:
    """High-level execution abstraction for TUX.

    Provides two stable operations used by TUX input prefixes:
    - ``!``: local shell execution (runs where the TUX process runs)
    - ``!!``: python execution in the agent's *existing* server-side sandbox

    Because the TUX runs in a separate OS process from the agent-runtimes
    server, sandbox code is executed by POSTing to the server's
    ``/sandbox/execute`` endpoint. This reuses the sandbox the server already
    created for the agent (e.g. the per-agent Jupyter kernel) instead of
    spinning up a fresh sandbox inside the TUX process.
    """

    def __init__(
        self,
        agent_id: str,
        server_url: str = "http://127.0.0.1:8000",
        api_prefix: str = "/api/v1",
    ) -> None:
        self.agent_id = agent_id
        self.server_url = server_url.rstrip("/")
        self.api_prefix = api_prefix.rstrip("/")

    async def run_local_shell(self, command: str) -> ShellExecutionResult:
        """Execute a shell command locally via Python subprocess."""

        def _run() -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
            )

        proc = await asyncio.to_thread(_run)
        return ShellExecutionResult(
            command=command,
            exit_code=int(proc.returncode),
            stdout=proc.stdout or "",
            stderr=proc.stderr or "",
        )

    async def run_sandbox_python(self, code: str) -> SandboxExecutionResult:
        """Execute Python code in the agent's server-side sandbox.

        Routes the code to the running agent-runtimes server so the existing
        sandbox (e.g. the per-agent Jupyter kernel) is reused rather than
        creating a new one in the TUX process.
        """
        import httpx

        url = f"{self.server_url}{self.api_prefix}/sandbox/execute"
        payload = {
            "code": code,
            "agent_id": self.agent_id,
            "language": "python",
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
        except Exception as exc:  # noqa: BLE001 - surfaced to the user
            return SandboxExecutionResult(
                code=code,
                success=False,
                execution_ok=False,
                stdout="",
                stderr=f"Failed to reach sandbox on server ({url}): {exc}",
                result=None,
            )

        return SandboxExecutionResult(
            code=code,
            success=bool(data.get("success", False)),
            execution_ok=bool(data.get("execution_ok", False)),
            stdout=data.get("stdout", "") or "",
            stderr=data.get("stderr", "") or "",
            result=data.get("results") or None,
        )
