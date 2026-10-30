# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What `harbor.py` runs in the sandbox, with the interpreter that holds Harbor.

Imports Harbor and reads the source, so it never runs outside a sandbox, and
imports nothing of this package but the environment provider beside it. Reads a
request on stdin and writes one JSON document to `answer.json`.

`inspect` reads and lints the task packages and runs nothing of them. `execute`
runs one trial, one attempt of one task, through Harbor's own `Trial`.
"""

from __future__ import annotations

import asyncio
import importlib.metadata
import json
import sys
from pathlib import Path
from typing import Any


def _tasks(source: Path) -> list[Path]:
    """Every task package of the source."""
    return sorted(path.parent for path in source.rglob("task.toml"))


def _task_record(path: Path, source: Path) -> dict[str, Any]:
    """One task package, as the adapter classifies it."""
    from harbor.lint.task import lint_task
    from harbor.models.task.task import Task

    task = Task(path)
    environment = task.config.environment
    directory = path / "environment"
    return {
        "name": path.name,
        "path": path.relative_to(source).as_posix(),
        "instruction": task.instruction,
        "metadata": dict(task.config.metadata or {}),
        "docker_image": environment.docker_image or "",
        "dockerfile": (directory / "Dockerfile").exists(),
        "dockerfile_content": (directory / "Dockerfile").read_text()
        if (directory / "Dockerfile").exists()
        else "",
        "build_context": sorted(
            item.name for item in directory.iterdir() if item.name != "Dockerfile"
        )
        if directory.is_dir()
        else [],
        "compose": any(
            (directory / name).exists()
            for name in ("compose.yaml", "docker-compose.yaml")
        ),
        "os": str(getattr(environment.os, "value", environment.os)),
        "gpus": int(environment.gpus or 0),
        "tpu": environment.tpu is not None,
        "allow_internet": bool(environment.allow_internet),
        "mcp_servers": len(environment.mcp_servers or []),
        "separate_verifier": str(
            getattr(task.config.verifier.environment_mode, "value", "") or ""
        )
        == "separate",
        "findings": [item.model_dump(mode="json") for item in lint_task(path)],
    }


def inspect_source(request: dict[str, Any]) -> dict[str, Any]:
    """What the source defines. Runs nothing of it."""
    import yaml

    source = Path(request["source"])
    job_file = next(
        (source / name for name in ("job.yaml", "job.yml") if (source / name).exists()),
        None,
    )
    job = yaml.safe_load(job_file.read_text()) if job_file else {}
    return {
        "version": importlib.metadata.version("harbor"),
        "tasks": [_task_record(path, source) for path in _tasks(source)],
        "job": job or {},
    }


def agent_arguments(request: dict[str, Any]) -> dict[str, Any]:
    """What an agent is told of its model. Its key is a placeholder: the relay holds the token."""
    arguments: dict[str, Any] = (
        {"model_name": request["model"]} if request.get("model") else {}
    )
    if request.get("anthropic_url"):
        arguments["env"] = {
            "ANTHROPIC_BASE_URL": request["anthropic_url"],
            "ANTHROPIC_AUTH_TOKEN": "held-by-the-relay",
        }
    return arguments


async def _trial(request: dict[str, Any]) -> dict[str, Any]:
    """One attempt of one task, through Harbor's own trial."""
    from harbor.models.trial.config import (
        AgentConfig,
        EnvironmentConfig,
        TaskConfig,
        TrialConfig,
    )
    from harbor.trial.trial import Trial

    source = Path(request["source"])
    config = TrialConfig(
        task=TaskConfig(path=source / request["entry_point"]),
        trial_name=f"attempt-{request['attempt']}",
        trials_dir=Path("trials").resolve(),
        agent=AgentConfig(name=request["agent"], **agent_arguments(request)),
        environment=EnvironmentConfig(
            import_path=f"_harbor_environment:{'TaskEnvironment' if request.get('task_environment') else 'SandboxEnvironment'}"
        ),
    )
    result = await (await Trial.create(config)).run()
    return {
        "version": importlib.metadata.version("harbor"),
        "result": json.loads(result.model_dump_json()),
    }


def main() -> None:
    """Answer one request in `answer.json`."""
    request = json.loads(sys.stdin.read())
    # Its own folder: this one holds a `harbor.py` that would hide Harbor.
    sys.path.insert(0, str(Path(__file__).parent / "_providers"))
    answer = (
        inspect_source(request)
        if request["op"] == "inspect"
        else asyncio.run(_trial(request))
    )
    Path("answer.json").write_text(json.dumps(answer))


main()
