# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Harbor's environment provider on a Datalayer sandbox.

Imported by Harbor, by path, inside the sandbox: `EnvironmentConfig.import_path`.
A trial's commands run as processes in the sandbox's own root, which holds the
paths a task names (`/logs`, `/tests`, `/solution`). The sandbox is the
environment, so there is nothing else to start, and ending it ends everything
in it.
"""

from __future__ import annotations

import asyncio
import os
import shutil
from pathlib import Path

from harbor.environments.base import BaseEnvironment, ExecResult
from harbor.environments.capabilities import EnvironmentCapabilities

__all__ = ["SandboxEnvironment"]


class SandboxEnvironment(BaseEnvironment):
    """One trial's environment: the sandbox it runs in."""

    @staticmethod
    def type() -> str:
        """Name this provider."""
        return "datalayer-sandbox"

    @property
    def capabilities(self) -> EnvironmentCapabilities:
        """Answer what a process in a sandbox can do: nothing beyond the defaults."""
        return EnvironmentCapabilities()

    def _validate_definition(self) -> None:
        """Accept any definition: the adapter classified it before the launch."""

    async def start(self, force_build: bool) -> None:
        """Make the directories a task may expect."""
        for path in ("/workspace", "/logs/agent", "/logs/verifier", "/logs/artifacts"):
            os.makedirs(path, exist_ok=True)

    async def stop(self, delete: bool) -> None:
        """Leave it: the sandbox's end ends what is in it."""

    async def prepare_logs_for_host(self) -> None:
        """Leave them: the logs are read from where they are."""

    async def upload_file(self, source_path: Path | str, target_path: str) -> None:
        """Copy a file in."""
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        shutil.copy(str(source_path), target_path)

    async def upload_dir(self, source_dir: Path | str, target_dir: str) -> None:
        """Copy a directory in."""
        shutil.copytree(str(source_dir), target_dir, dirs_exist_ok=True)

    async def download_file(self, source_path: str, target_path: Path | str) -> None:
        """Copy a file out."""
        os.makedirs(os.path.dirname(str(target_path)), exist_ok=True)
        shutil.copy(source_path, str(target_path))

    async def download_dir(self, source_dir: str, target_dir: Path | str) -> None:
        """Copy a directory out."""
        shutil.copytree(source_dir, str(target_dir), dirs_exist_ok=True)

    async def exec(
        self,
        command: str,
        cwd: str | None = None,
        env: dict[str, str] | None = None,
        timeout_sec: int | None = None,
        user: str | int | None = None,
    ) -> ExecResult:
        """Run one command, as the sandbox's own user."""
        process = await asyncio.create_subprocess_exec(
            "/bin/bash",
            "-c",
            command,
            cwd=cwd or "/workspace",
            env={**os.environ, **(env or {})},
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=timeout_sec
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            return ExecResult(
                stdout="", stderr=f"timed out after {timeout_sec}s", return_code=124
            )
        return ExecResult(
            stdout=stdout.decode("utf-8", "replace"),
            stderr=stderr.decode("utf-8", "replace"),
            return_code=process.returncode or 0,
        )
