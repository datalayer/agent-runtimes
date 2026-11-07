# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Inspect's sandbox `datalayer`, through its extension API.

Imported by the runner, in the adapter's sandbox, before Inspect looks for it.
A sample's tools run in the task's environment through the client beside this
file, so a tool runs in the task's own image and the framework still reaches
nothing but the relay.
"""

from __future__ import annotations

import asyncio
from typing import Any, Literal, overload

import _environment_client as client
from inspect_ai.util import ExecResult, SandboxEnvironment, sandboxenv

__all__ = ["DatalayerSandbox"]


@sandboxenv(name="datalayer")
class DatalayerSandbox(SandboxEnvironment):
    """One sample's sandbox: the task's environment, reached through the relay."""

    @classmethod
    async def sample_init(
        cls, task_name: str, config: Any, metadata: dict[str, str]
    ) -> dict[str, SandboxEnvironment]:
        """Answer the one environment of this execution."""
        if not client.available():
            raise RuntimeError("This execution has no task environment.")
        return {"default": cls()}

    @classmethod
    async def sample_cleanup(
        cls,
        task_name: str,
        config: Any,
        environments: dict[str, SandboxEnvironment],
        interrupted: bool,
    ) -> None:
        """Leave it: the service that launched it releases it."""

    async def exec(
        self,
        cmd: list[str],
        input: str | bytes | None = None,
        cwd: str | None = None,
        env: dict[str, str] | None = None,
        user: str | None = None,
        timeout: int | None = None,
        timeout_retry: bool = True,
        concurrency: bool = True,
    ) -> ExecResult[str]:
        """Run one command in the task's environment."""
        stdin = input.encode() if isinstance(input, str) else (input or b"")
        answer = await asyncio.to_thread(
            client.exec_command,
            cmd,
            stdin=stdin,
            cwd=cwd,
            env=env,
            timeout=timeout,
            user=user,
        )
        if timeout is not None and int(answer["returncode"]) == 124:
            raise TimeoutError(f"The command timed out after {timeout} seconds.")
        return ExecResult(
            success=int(answer["returncode"]) == 0,
            returncode=int(answer["returncode"]),
            stdout=str(answer["stdout"]),
            stderr=str(answer["stderr"]),
        )

    async def write_file(self, file: str, contents: str | bytes) -> None:
        """Write one file in the task's environment."""
        await asyncio.to_thread(
            client.write_file,
            file,
            contents.encode() if isinstance(contents, str) else contents,
        )

    @overload
    async def read_file(self, file: str, text: Literal[True] = True) -> str: ...

    @overload
    async def read_file(self, file: str, text: Literal[False]) -> bytes: ...

    async def read_file(self, file: str, text: bool = True) -> str | bytes:
        """Read one file of the task's environment."""
        data = await asyncio.to_thread(client.read_file, file)
        return data.decode("utf-8") if text else data
