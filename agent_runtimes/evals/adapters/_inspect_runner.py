# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What `inspect_ai.py` runs in the sandbox, with the interpreter that holds Inspect.

Imports Inspect and the source's own code, so it never runs outside a sandbox,
and imports nothing of this package. Reads a request on stdin and writes one
JSON document to `answer.json` in its working directory: Inspect owns stdout.

`inspect` loads the tasks and reads their datasets, solvers, scorers and
sandboxes; it runs no solver and calls no model. `execute` runs one sample
through `inspect_ai.eval`, with the log written beside the answer.
"""

from __future__ import annotations

import importlib.metadata
import json
import os
import sys
import tomllib
from pathlib import Path
from typing import Any


def _plain(value: Any) -> Any:
    """A value as JSON can carry it."""
    from pydantic_core import to_jsonable_python

    return to_jsonable_python(value, fallback=str)


def _named(item: Any) -> dict[str, Any]:
    """A component by its registered name and arguments."""
    from inspect_ai._util.registry import (
        is_registry_object,
        registry_log_name,
        registry_params,
    )

    if not is_registry_object(item):
        return {"name": type(item).__name__, "params": {}}
    return {"name": registry_log_name(item), "params": _plain(registry_params(item))}


def _solvers(solver: Any) -> list[dict[str, Any]]:
    """A solver chain, flattened, in order."""
    from inspect_ai.solver._chain import Chain

    if solver is None:
        return []
    if isinstance(solver, Chain):
        found: list[dict[str, Any]] = []
        for step in solver:
            found.extend(_solvers(step))
        return found
    return [_named(solver)]


def _tool_names(solvers: list[dict[str, Any]]) -> list[str]:
    """The tools a chain makes available, by name."""
    names: list[str] = []
    for solver in solvers:
        tools = (
            solver["params"].get("tools")
            if solver["name"].rsplit("/", 1)[-1] == "use_tools"
            else None
        )
        for tool in tools if isinstance(tools, list) else []:
            name = tool.get("name") if isinstance(tool, dict) else tool
            if isinstance(name, str) and name not in names:
                names.append(name)
    return names


def _scorers(task: Any) -> list[dict[str, Any]]:
    """A task's scorers with their metrics."""
    from inspect_ai.scorer._scorer import scorer_metrics

    found = []
    for scorer in task.scorer or []:
        metrics = scorer_metrics(scorer)
        named = (
            metrics
            if isinstance(metrics, list)
            else [item for values in metrics.values() for item in values]
            if isinstance(metrics, dict)
            else []
        )
        found.append(
            {**_named(scorer), "metrics": [_named(item)["name"] for item in named]}
        )
    return found


def _sandbox_of(value: Any) -> dict[str, Any] | None:
    """A sandbox specification, as JSON can carry it."""
    if value is None:
        return None
    return {"type": str(value.type), "config": _plain(value.config)}


def _sample(sample: Any, index: int) -> dict[str, Any]:
    """One sample, with the id Inspect runs it under."""
    return {
        # Inspect numbers a sample that has no id from 1, in dataset order.
        "id": sample.id if sample.id is not None else index + 1,
        "explicit_id": sample.id is not None,
        "input": _plain(sample.input),
        "target": _plain(sample.target),
        "choices": _plain(sample.choices),
        "metadata": _plain(sample.metadata or {}),
        "files": sorted(sample.files or {}),
        "has_setup": bool(sample.setup),
        "sandbox": _sandbox_of(sample.sandbox),
    }


def _declared(source: Path) -> list[str]:
    """What the project says it needs, by requirement line."""
    declared: list[str] = []
    for path in source.glob("requirements*.txt"):
        declared.extend(
            line.strip()
            for line in path.read_text().splitlines()
            if line.strip() and not line.startswith(("#", "-"))
        )
    pyproject = source / "pyproject.toml"
    if pyproject.exists():
        declared.extend(
            tomllib.loads(pyproject.read_text())
            .get("project", {})
            .get("dependencies", [])
        )
    return declared


def _missing(declared: list[str]) -> list[str]:
    """The declared requirements this environment does not satisfy, by name."""
    if not declared:
        return []
    try:
        from packaging.requirements import Requirement
    except ImportError:
        # Nothing here can read a requirement, so none counts as met.
        return [f"{line} (cannot be checked here)" for line in declared]

    missing = []
    for line in declared:
        requirement = Requirement(line)
        try:
            version = importlib.metadata.version(requirement.name)
        except importlib.metadata.PackageNotFoundError:
            missing.append(line)
            continue
        if not requirement.specifier.contains(version, prereleases=True):
            missing.append(f"{line} (installed {version})")
    return missing


def inspect_source(request: dict[str, Any]) -> dict[str, Any]:
    """What the source defines. Runs no solver and calls no model."""
    from inspect_ai import list_tasks
    from inspect_ai._eval.loader import load_tasks

    source = Path(request["source"])
    task_args = request.get("task_args") or {}
    tasks = []
    for info in list_tasks(root_dir=source):
        entry = f"{info.file}@{info.name}"
        [task] = load_tasks([str(source / entry)], task_args=task_args)
        solvers = _solvers(task.solver)
        samples = [_sample(sample, index) for index, sample in enumerate(task.dataset)]
        tasks.append(
            {
                "entry_point": entry,
                "name": info.name,
                "description": str(getattr(task, "description", "") or ""),
                "dataset": {
                    "name": task.dataset.name,
                    "location": task.dataset.location,
                    "shuffled": bool(task.dataset.shuffled),
                    "dynamic": task.sample_source is not None,
                },
                "samples": samples,
                "solvers": solvers,
                "tools": _tool_names(solvers),
                "scorers": _scorers(task),
                "model": str(task.model) if task.model is not None else "",
                "model_roles": {
                    name: str(model) for name, model in (task.model_roles or {}).items()
                },
                "sandbox": _sandbox_of(task.sandbox),
                "approval": bool(task.approval),
                "epochs": task.epochs or 1,
                "limits": {
                    name: getattr(task, name)
                    for name in (
                        "message_limit",
                        "turn_limit",
                        "time_limit",
                        "working_limit",
                        "cost_limit",
                    )
                },
            }
        )
    declared = _declared(source)
    return {
        "version": importlib.metadata.version("inspect_ai"),
        "python": sys.version.split()[0],
        "tasks": tasks,
        "declared": declared,
        "missing": _missing(declared),
    }


def execute(request: dict[str, Any]) -> dict[str, Any]:
    """Run one sample through `inspect_ai.eval`."""
    from inspect_ai import eval as run_eval
    from inspect_ai.approval import ApprovalPolicy, auto_approver

    source = Path(request["source"])
    native = request["native_id"]
    approved = list(request.get("approved_tools") or [])
    # Tools the launch approved run; any other a model calls is rejected.
    policies = (
        [ApprovalPolicy(auto_approver("approve"), approved)] if approved else []
    ) + [ApprovalPolicy(auto_approver("reject"), "*")]
    if str(request.get("model") or "").startswith("openai-api/"):
        # Inspect leaves without a word when its OpenAI client is missing.
        import openai  # noqa: F401

    logs = run_eval(
        str(source / request["entry_point"]),
        model=request.get("model") or None,
        task_args=request.get("task_args") or {},
        sample_id=[native],
        log_dir="logs",
        log_format="json",
        display="none",
        max_samples=1,
        max_tasks=1,
        retry_on_error=0,
        fail_on_error=False,
        approval=policies,
        log_level="warning",
    )
    return {
        "version": importlib.metadata.version("inspect_ai"),
        "logs": [log.location for log in logs],
    }


def main() -> None:
    """Answer one request in `answer.json`."""
    request = json.loads(sys.stdin.read())
    answer = inspect_source(request) if request["op"] == "inspect" else execute(request)
    Path("answer.json").write_text(json.dumps(answer))


os.environ.setdefault("INSPECT_DISPLAY", "none")
main()
