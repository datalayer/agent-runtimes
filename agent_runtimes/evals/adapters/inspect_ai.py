# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Inspect AI adapter.

Inspect's definitions are Python, so everything of them runs in framework-run
mode, in a sandbox, at the pinned version: `_inspect_runner.py` loads the tasks
to read what they declare, and runs one sample per trial through
`inspect_ai.eval`, so a sample is a durable task and the launch's pool is the
only scheduler (`max_samples=1`). This module reads what comes back.

The mapping:

- a task is an entry point, `file.py@name`; a sample is a case whose id derives
  from the task, the sample's id and the source's digest;
- solvers, scorers and metrics are classified `framework-run` and kept by name
  and arguments in the external definition;
- a tool is `framework-run` once the launch approves it by name, `unsupported`
  until then; at run time an Inspect approval policy approves exactly those
  and rejects any other call;
- every model call goes through ai-inference: a model is a catalogue id
  (`bedrock:…`, `alibaba:…`), reached from the sandbox through the relay on the
  run's token, with no key and no network of its own. Any other model, a
  provider key, or a launch asking for the pod's network is `unsupported`;
- a sandbox type the deployment does not provide, an epoch count above one, a
  requirement the image lacks, an approval policy of the definition's own and
  a dataset whose implicit ids are not stable are each `unsupported`, by name.

No aggregate is invented. Every scorer's value stays on the task. With one
scorer its value is the headline; with several, the selection names the
aggregation, and with none the task has no headline and waits in `review`.
"""

from __future__ import annotations

import base64
import json
import os
import shlex
import sys
from pathlib import Path
from typing import Any, Mapping

from agent_runtimes.evals.adapters.base import (
    AdapterPlan,
    Capability,
    ExternalAdapter,
    ExternalDefinition,
    ImportedDefinition,
    InspectedCase,
    Inspection,
    LaunchGrant,
    NormalizedResult,
    NormalizedScore,
    RawResult,
    ResultArtifact,
    Sandbox,
    Selection,
    SourceRef,
    SourceTree,
    Trial,
    is_inference_model,
    is_provider_key,
    policy_to,
    stable_case_id,
)
from agent_runtimes.evals.adapters.sandbox import SandboxPolicy

__all__ = ["InspectAdapter", "score_as_float"]

ADAPTER_VERSION = "1"
#: The one Inspect this adapter was tested against. Another is refused.
INSPECT_VERSION = "0.3.286"
#: The Runtimes environment whose image holds that Inspect.
ENVIRONMENT = "inspect-ai-env"

PYTHON_VARIABLE = "DATALAYER_INSPECT_AI_PYTHON"
#: Where the image holds tiktoken's encodings. Inspect counts tokens with them
#: and would fetch them on first use, which a sandbox with no network refuses.
TIKTOKEN_VARIABLE = "DATALAYER_INSPECT_AI_TIKTOKEN_CACHE"
#: The sandbox types this deployment's runtimes provide, beside `local`.
SANDBOXES_VARIABLE = "DATALAYER_INSPECT_AI_SANDBOXES"

_RUNNER = Path(__file__).with_name("_inspect_runner.py")
LOG_MEDIA_TYPE = "application/json"

#: Inspect's own mock calls nothing, so it needs no route. Every other model is
#: ai-inference's, as Inspect's OpenAI-compatible provider names it.
MOCK_PREFIX = "mockllm/"
INSPECT_INFERENCE_PREFIX = "openai-api/datalayer/"


def inspect_model(model: str) -> str:
    """A model as Inspect is told it: the mock as it is, a catalogue id through
    ai-inference's OpenAI-compatible chat completions.
    """
    return f"{INSPECT_INFERENCE_PREFIX}{model}" if is_inference_model(model) else model


def score_as_float(value: Any) -> float | None:
    """A scorer's value as Inspect's `value_to_float` reads a scalar: `C` 1,
    `P` 0.5, `I` and `N` 0, booleans and numbers as they are. `None` for what
    has no number (a dict, a list), which Inspect turns into a warned zero.
    """
    if isinstance(value, bool):
        return 1.0 if value else 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        mapped = {"C": 1.0, "P": 0.5, "I": 0.0, "N": 0.0}.get(text)
        if mapped is not None:
            return mapped
        lowered = text.lower()
        if lowered in {"yes", "true"}:
            return 1.0
        if lowered in {"no", "false"}:
            return 0.0
        try:
            return float(text)
        except ValueError:
            return None
    return None


def _command_capability(
    *, component: str, kind: str, reason: str, code: str
) -> Capability:
    """A component that stops a launch."""
    return Capability(
        component=component, kind=kind, status="unsupported", reason=reason, code=code
    )


def _sandboxes() -> set[str]:
    """The sandbox types this deployment provides."""
    declared = {
        item.strip()
        for item in os.environ.get(SANDBOXES_VARIABLE, "").split(",")
        if item.strip()
    }
    return {"local"} | declared


class InspectAdapter(ExternalAdapter):
    """The adapter of Inspect AI, at its pinned version."""

    framework = "inspect-ai"
    adapter_version = ADAPTER_VERSION
    framework_version = INSPECT_VERSION
    environment = ENVIRONMENT
    default_policy = SandboxPolicy(
        wall_seconds=1800,
        cpu_seconds=1800,
        memory_bytes=8 * 1024 * 1024 * 1024,
        max_files=20_000,
        max_bytes=1024 * 1024 * 1024,
    )

    def _run(
        self,
        request: dict[str, Any],
        *,
        sandbox: Sandbox,
        env: Mapping[str, str] | None = None,
    ) -> Any:
        """Run the runner in the sandbox, with the interpreter that holds Inspect."""
        python = os.environ.get(PYTHON_VARIABLE) or sys.executable
        # `-I` keeps this directory off the path: this module's name is Inspect's.
        cache = os.environ.get(TIKTOKEN_VARIABLE)
        environment = {
            **({"TIKTOKEN_CACHE_DIR": cache} if cache else {}),
            **dict(env or {}),
        }
        return sandbox(
            [python, "-I", "-B", str(_RUNNER)],
            stdin=json.dumps(request).encode(),
            env=environment,
        )

    def _pinned(self, version: str) -> None:
        """Refuse any Inspect but the pinned one."""
        if version != self.framework_version:
            raise ValueError(
                f"the sandbox holds Inspect {version}; this adapter is pinned to {self.framework_version}"
            )

    def inspect(
        self, source: SourceTree, *, sandbox: Sandbox, options: dict[str, Any]
    ) -> Inspection:
        """Load the tasks in the sandbox and read what they declare."""
        task_args = dict(options.get("task_args") or {})
        outcome = self._run(
            {"op": "inspect", "source": source.root, "task_args": task_args},
            sandbox=sandbox,
        )
        answer = Path(sandbox.workdir) / "answer.json"
        if outcome.returncode != 0 or not answer.exists():
            raise ValueError(
                outcome.stderr.decode("utf-8", "replace")[-2000:]
                or "Inspect left no answer"
            )
        found = json.loads(answer.read_text())
        self._pinned(str(found["version"]))
        tasks = list(found["tasks"])
        if not tasks:
            raise ValueError("the source defines no Inspect task")
        models = sorted(
            {
                str(model)
                for task in tasks
                for model in [
                    task.get("model"),
                    *(task.get("model_roles") or {}).values(),
                ]
                if model
            }
        )
        inspection = Inspection(
            framework=self.framework,
            adapter_version=self.adapter_version,
            framework_version=self.framework_version,
            archive_digest=source.archive_digest,
            content_digest=source.content_digest,
            name=str(tasks[0]["name"]),
            description=str(tasks[0].get("description") or ""),
            entry_points=[str(task["entry_point"]) for task in tasks],
            cases=[
                InspectedCase(
                    native_id=str(sample["id"]),
                    name=str(sample["id"]),
                    input=sample["input"],
                    target=sample["target"],
                    entry_point=str(task["entry_point"]),
                    metadata=dict(sample.get("metadata") or {}),
                )
                for task in tasks
                for sample in task["samples"]
            ],
            subjects=[
                {"entry_point": task["entry_point"], "solvers": task["solvers"]}
                for task in tasks
            ],
            scorers=[
                {"entry_point": task["entry_point"], "scorers": task["scorers"]}
                for task in tasks
            ],
            models=models,
            tools=sorted({str(name) for task in tasks for name in task["tools"]}),
            environment={
                "python": found.get("python"),
                "declared": found.get("declared") or [],
                "missing": found.get("missing") or [],
            },
            configuration={
                "tasks": [
                    {key: value for key, value in task.items() if key != "samples"}
                    | {
                        "sample_count": len(task["samples"]),
                        "implicit_ids": sum(
                            1 for sample in task["samples"] if not sample["explicit_id"]
                        ),
                        "sample_sandboxes": sorted(
                            {
                                sample["sandbox"]["type"]
                                for sample in task["samples"]
                                if sample.get("sandbox")
                            }
                        ),
                    }
                    for task in tasks
                ],
                "task_args": task_args,
            },
        )
        return inspection.model_copy(update={"capabilities": self.validate(inspection)})

    def _declared_capabilities(
        self, tasks: list[dict[str, Any]], *, missing: list[str]
    ) -> list[Capability]:
        """What the tasks declare, classified."""
        capabilities: list[Capability] = []
        for task in tasks:
            entry = str(task["entry_point"])
            for solver in task.get("solvers") or []:
                capabilities.append(
                    Capability(
                        component=f"{entry}:{solver['name']}",
                        kind="solver",
                        status="framework-run",
                    )
                )
            for scorer in task.get("scorers") or []:
                capabilities.append(
                    Capability(
                        component=f"{entry}:{scorer['name']}",
                        kind="scorer",
                        status="framework-run",
                    )
                )
                for metric in scorer.get("metrics") or []:
                    capabilities.append(
                        Capability(
                            component=f"{entry}:{scorer['name']}:{metric}",
                            kind="metric",
                            status="framework-run",
                        )
                    )
            for kind in sorted(
                {
                    *([task["sandbox"]["type"]] if task.get("sandbox") else []),
                    *(task.get("sample_sandboxes") or []),
                }
            ):
                if kind in _sandboxes():
                    capabilities.append(
                        Capability(
                            component=f"{entry}:sandbox:{kind}",
                            kind="sandbox",
                            status="framework-run",
                        )
                    )
                else:
                    capabilities.append(
                        _command_capability(
                            component=f"{entry}:sandbox:{kind}",
                            kind="sandbox",
                            code="sandbox_unavailable",
                            reason=f"The task runs tools in a {kind} sandbox, which this deployment's runtimes do not provide.",
                        )
                    )
            if int(task.get("epochs") or 1) > 1:
                capabilities.append(
                    _command_capability(
                        component=f"{entry}:epochs",
                        kind="epochs",
                        code="epochs_unsupported",
                        reason=f"The task runs {task['epochs']} epochs; a sample is one task of a launch, run once.",
                    )
                )
            if task.get("approval"):
                capabilities.append(
                    _command_capability(
                        component=f"{entry}:approval",
                        kind="approval",
                        code="approval_policy",
                        reason="The task brings its own approval policy; a launch's approvals decide what its tools may do.",
                    )
                )
            if (task.get("dataset") or {}).get("dynamic"):
                capabilities.append(
                    _command_capability(
                        component=f"{entry}:dataset",
                        kind="dataset",
                        code="dynamic_dataset",
                        reason="The task's samples are produced while it runs, so they cannot be listed as tasks before a launch.",
                    )
                )
            if (task.get("dataset") or {}).get("shuffled") and task.get("implicit_ids"):
                capabilities.append(
                    _command_capability(
                        component=f"{entry}:dataset",
                        kind="dataset",
                        code="unstable_ids",
                        reason="The dataset is shuffled and its samples have no ids, so a sample would not keep its identity between runs.",
                    )
                )
        for line in missing:
            capabilities.append(
                _command_capability(
                    component=f"dependency:{line}",
                    kind="dependency",
                    code="dependency_missing",
                    reason=f"The project needs {line}, which the adapter's image does not hold.",
                )
            )
        return capabilities

    def _granted(
        self, *, tools: list[str], models: list[str], grant: LaunchGrant | None
    ) -> list[Capability]:
        """What a definition needs of a launch. Before a launch is known
        (`grant` None) a need is listed, and refused only if it never could be.
        """
        capabilities: list[Capability] = []
        for name in tools:
            approved = grant is None or name in grant.tools
            capabilities.append(
                Capability(
                    component=f"tool:{name}",
                    kind="tool",
                    status="framework-run" if approved else "unsupported",
                    reason=""
                    if approved
                    else f"The tool {name} needs the launch to approve it.",
                    code="" if approved else "tool_not_approved",
                )
            )
        for model in models:
            if model.startswith(MOCK_PREFIX) or is_inference_model(model):
                capabilities.append(
                    Capability(
                        component=f"model:{model}", kind="model", status="framework-run"
                    )
                )
            else:
                capabilities.append(
                    _command_capability(
                        component=f"model:{model}",
                        kind="model",
                        code="model_not_on_inference",
                        reason=f"Every model call goes through ai-inference, so a model is one of its catalogue's (bedrock:… or alibaba:…), not {model}.",
                    )
                )
        if grant is not None and grant.network == "boundary":
            capabilities.append(
                _command_capability(
                    component="network:boundary",
                    kind="network",
                    code="direct_network_refused",
                    reason="A framework reaches nothing but ai-inference: the pod's network would be a direct path to a provider.",
                )
            )
        for name in grant.secrets if grant is not None else []:
            if is_provider_key(name):
                capabilities.append(
                    _command_capability(
                        component=f"secret:{name}",
                        kind="secret",
                        code="provider_key_refused",
                        reason=f"{name} is a provider's key, and no such key reaches a sandbox: model calls go through ai-inference.",
                    )
                )
        return capabilities

    def validate(
        self, inspection: Inspection, *, grant: LaunchGrant | None = None
    ) -> list[Capability]:
        """Every component, under what a launch grants."""
        tasks = list(inspection.configuration.get("tasks") or [])
        return self._declared_capabilities(
            tasks, missing=list(inspection.environment.get("missing") or [])
        ) + self._granted(tools=inspection.tools, models=inspection.models, grant=grant)

    def import_definition(
        self, inspection: Inspection, *, selection: Selection, source: SourceRef
    ) -> ImportedDefinition:
        """An evalset of the chosen tasks, one experiment per model."""
        chosen = selection.entry_points or inspection.entry_points
        unknown = set(chosen) - set(inspection.entry_points)
        if unknown:
            raise ValueError(
                f"no such task in the source: {', '.join(sorted(unknown))}"
            )
        tasks = [
            task
            for task in inspection.configuration.get("tasks") or []
            if task["entry_point"] in chosen
        ]
        own_models = {
            str(task["entry_point"]): str(task.get("model") or "") for task in tasks
        }
        if not selection.models and not all(own_models.values()):
            raise ValueError(
                "choose at least one model: a task of this source names none"
            )
        for model in selection.models:
            if not is_inference_model(model):
                raise ValueError(
                    f"{model} is not one of ai-inference's models: every model call goes through it"
                )
        aggregation = dict(selection.aggregation)
        scorers = sorted(
            {
                str(scorer["name"])
                for task in tasks
                for scorer in task.get("scorers") or []
            }
        )
        if aggregation.get("scorer") and aggregation["scorer"] not in scorers:
            raise ValueError(
                f"no scorer {aggregation['scorer']} in the selected tasks; scorers: {', '.join(scorers)}"
            )
        if aggregation and not (
            aggregation.get("scorer") or aggregation.get("kind") in {"mean", "all"}
        ):
            raise ValueError("an aggregation names a scorer, or is of kind mean or all")
        cases = [case for case in inspection.cases if case.entry_point in chosen]
        cases = cases[: selection.limit] if selection.limit else cases
        models = list(selection.models)
        used = sorted(
            {*models, *(model for model in own_models.values() if model and not models)}
        )
        return ImportedDefinition(
            name=selection.name or inspection.name or "Imported benchmark",
            description=inspection.description,
            cases=[
                {
                    "id": stable_case_id(
                        framework=self.framework,
                        native_id=f"{case.entry_point}#{case.native_id}",
                        content_digest=inspection.content_digest,
                    ),
                    "name": case.name or case.native_id,
                    "inputs": {
                        "prompt": case.input
                        if isinstance(case.input, str)
                        else json.dumps(case.input)
                    },
                    "expected_output": case.target,
                    "evaluators": [],
                    "metadata": {
                        **case.metadata,
                        "external": {
                            "native_id": case.native_id,
                            "entry_point": case.entry_point,
                        },
                    },
                }
                for case in cases
            ],
            experiments=[
                {
                    "name": model,
                    "subject": {
                        "kind": "external",
                        "ref": self.framework,
                        "model": model,
                    },
                }
                for model in models
            ]
            or [
                {
                    "name": "task model",
                    "subject": {"kind": "external", "ref": self.framework},
                }
            ],
            external_definition=ExternalDefinition(
                framework=self.framework,
                adapter_version=self.adapter_version,
                framework_version=self.framework_version,
                source=source,
                entry_point=",".join(chosen),
                configuration={
                    "tasks": tasks,
                    "task_args": inspection.configuration.get("task_args") or {},
                    "models": used,
                    "tools": sorted(
                        {
                            str(name)
                            for task in tasks
                            for name in task.get("tools") or []
                        }
                    ),
                    "missing": list(inspection.environment.get("missing") or []),
                    "aggregation": aggregation,
                    "scorers": scorers,
                },
                capabilities=inspection.capabilities,
                content_digest=inspection.content_digest,
            ),
        )

    def plan(
        self, definition: ExternalDefinition, *, grant: LaunchGrant
    ) -> AdapterPlan:
        """How a launch runs: the policy, the approved tools, the reproduction."""
        configuration = definition.configuration
        models = [str(model) for model in configuration.get("models") or []]
        tools = [str(name) for name in configuration.get("tools") or []]
        capabilities = self._declared_capabilities(
            list(configuration.get("tasks") or []),
            missing=list(configuration.get("missing") or []),
        )
        capabilities += self._granted(tools=tools, models=models, grant=grant)
        policy = SandboxPolicy(
            network="inference"
            if any(is_inference_model(model) for model in models)
            else "none",
            wall_seconds=self.default_policy.wall_seconds,
            cpu_seconds=self.default_policy.cpu_seconds,
            memory_bytes=self.default_policy.memory_bytes,
            max_files=self.default_policy.max_files,
            max_bytes=self.default_policy.max_bytes,
        )
        task_args = dict(configuration.get("task_args") or {})
        return AdapterPlan(
            framework=self.framework,
            adapter_version=self.adapter_version,
            framework_version=self.framework_version,
            environment=self.environment,
            policy=policy_to(policy),
            capabilities=capabilities,
            resolved_configuration={
                "task_args": task_args,
                "approved_tools": sorted(set(tools) & set(grant.tools)),
                "aggregation": dict(configuration.get("aggregation") or {}),
                "max_samples": 1,
            },
            reproduction=self._reproduction(
                definition, task_args=task_args, models=models
            ),
        )

    def _reproduction(
        self,
        definition: ExternalDefinition,
        *,
        task_args: dict[str, Any],
        models: list[str],
    ) -> str:
        """The pinned command, with no secret in it."""
        arguments = " ".join(
            f"-T {shlex.quote(f'{name}={json.dumps(value)}')}"
            for name, value in task_args.items()
        )
        routed = any(is_inference_model(model) for model in models)
        environment = (
            "DATALAYER_BASE_URL=<ai-inference>/api/ai-inference/v1 DATALAYER_API_KEY=<your Datalayer token> "
            if routed
            else ""
        )
        lines = [f"pip install inspect-ai=={self.framework_version}"]
        for entry in definition.entry_point.split(","):
            for model in models or [""]:
                command = f"{environment}inspect eval {shlex.quote(entry)}"
                if model:
                    command += f" --model {shlex.quote(inspect_model(model))}"
                if arguments:
                    command += f" {arguments}"
                lines.append(f"{command} --log-format json")
        return "\n".join(lines)

    def execute(
        self,
        trial: Trial,
        *,
        plan: AdapterPlan,
        source: SourceTree,
        sandbox: Sandbox,
        env: Mapping[str, str],
    ) -> RawResult:
        """Run one sample through Inspect, and keep its log."""
        subject = dict(trial.configuration.get("subject") or {})
        outcome = self._run(
            {
                "op": "execute",
                "source": source.root,
                "entry_point": trial.entry_point,
                "native_id": trial.native_id,
                "model": inspect_model(str(subject.get("model") or "")),
                "task_args": dict(plan.resolved_configuration.get("task_args") or {}),
                "approved_tools": list(
                    plan.resolved_configuration.get("approved_tools") or []
                ),
            },
            sandbox=sandbox,
            env=env,
        )
        workdir = Path(sandbox.workdir)
        logs = (
            sorted((workdir / "logs").glob("*.json"))
            if (workdir / "logs").exists()
            else []
        )
        artifacts = (
            [
                ResultArtifact(
                    name="inspect-log.json",
                    media_type=LOG_MEDIA_TYPE,
                    content_base64=base64.b64encode(logs[-1].read_bytes()).decode(),
                )
            ]
            if logs
            else []
        )
        payload = None
        if logs:
            payload = {"log": json.loads(logs[-1].read_text())}
        return RawResult(
            returncode=outcome.returncode,
            stdout=outcome.stdout.decode("utf-8", "replace")[-20_000:],
            stderr=outcome.stderr.decode("utf-8", "replace")[-20_000:],
            seconds=outcome.seconds,
            payload=payload,
            artifacts=artifacts,
        )

    def normalize_result(
        self, trial: Trial, raw: RawResult, *, plan: AdapterPlan
    ) -> NormalizedResult:
        """One task result, with every scorer on it."""
        log = (raw.payload or {}).get("log") if raw.payload else None
        if not isinstance(log, dict):
            return NormalizedResult(
                status="failed",
                failure_stage="infrastructure",
                failure_mode="no_eval_log",
                explanation=(
                    raw.stderr[-500:] or raw.stdout[-500:] or "Inspect left no log."
                ),
                framework={
                    "returncode": raw.returncode,
                    "stderr": raw.stderr[-4000:],
                    "stdout": raw.stdout[-4000:],
                },
                artifacts=raw.artifacts,
            )
        self._pinned(
            str(((log.get("eval") or {}).get("packages") or {}).get("inspect_ai") or "")
        )
        samples = [
            item
            for item in log.get("samples") or []
            if str(item.get("id")) == trial.native_id
        ]
        framework = {
            "eval_id": (log.get("eval") or {}).get("eval_id"),
            "task": (log.get("eval") or {}).get("task"),
            "model": (log.get("eval") or {}).get("model"),
            "status": log.get("status"),
            "results": log.get("results"),
            "returncode": raw.returncode,
        }
        if not samples:
            error = log.get("error") or {}
            stage, mode = _failure_stage(
                str(error.get("traceback") or error.get("message") or "")
            )
            return NormalizedResult(
                status="failed",
                failure_stage=stage,
                failure_mode=mode,
                explanation=str(
                    error.get("message")
                    or f"The log holds no sample {trial.native_id}."
                ),
                framework=framework,
                artifacts=raw.artifacts,
            )
        sample = samples[0]
        scores = [
            NormalizedScore(
                name=name,
                value=entry.get("value"),
                answer=str(entry.get("answer") or ""),
                explanation=str(entry.get("explanation") or ""),
                metadata=dict(entry.get("metadata") or {}),
            )
            for name, entry in (sample.get("scores") or {}).items()
        ]
        usage = _usage(sample)
        common: dict[str, Any] = {
            "prompt": _text_of(sample.get("input")),
            "output": str((sample.get("output") or {}).get("completion") or ""),
            "trajectory": _trajectory(sample.get("messages") or []),
            "scores": scores,
            "usage": usage,
            "framework": {
                **framework,
                "sample_id": sample.get("id"),
                "epoch": sample.get("epoch"),
                "total_time": sample.get("total_time"),
                "working_time": sample.get("working_time"),
                "limit": sample.get("limit"),
            },
            "artifacts": raw.artifacts,
        }
        error = sample.get("error")
        if error:
            stage, mode = _failure_stage(
                str(error.get("traceback") or error.get("message") or "")
            )
            return NormalizedResult(
                status="failed",
                failure_stage=stage,
                failure_mode=mode,
                explanation=str(error.get("message") or ""),
                **common,
            )
        limit = sample.get("limit")
        if limit:
            return NormalizedResult(
                status="failed",
                failure_stage="agent",
                failure_mode=f"limit_{limit.get('type')}",
                explanation=f"The sample reached its {limit.get('type')} limit of {limit.get('limit')}.",
                **common,
            )
        return _with_headline(
            scores,
            aggregation=dict(plan.resolved_configuration.get("aggregation") or {}),
            common=common,
        )


def _with_headline(
    scores: list[NormalizedScore],
    *,
    aggregation: dict[str, Any],
    common: dict[str, Any],
) -> NormalizedResult:
    """The headline a selection asked for, or the one scorer's own; else none."""
    threshold = (
        float(aggregation["threshold"])
        if aggregation.get("threshold") is not None
        else None
    )
    values = {score.name: score_as_float(score.value) for score in scores}
    headline: float | None = None
    if aggregation.get("scorer"):
        headline = values.get(str(aggregation["scorer"]))
    elif aggregation.get("kind") == "mean":
        numbers = [value for value in values.values() if value is not None]
        headline = sum(numbers) / len(numbers) if numbers else None
    elif aggregation.get("kind") == "all":
        headline = (
            1.0
            if values
            and all(
                (value or 0.0) >= (threshold if threshold is not None else 1.0)
                for value in values.values()
            )
            else 0.0
        )
    elif len(scores) == 1:
        headline = values[scores[0].name]
    if headline is None:
        explanation = "; ".join(f"{score.name}: {score.value}" for score in scores)
        return NormalizedResult(
            status="review",
            explanation=f"No headline score was chosen. {explanation}",
            **common,
        )
    if threshold is None and headline not in (0.0, 1.0):
        # A graded value with no threshold: the score stands, the verdict is a person's.
        return NormalizedResult(
            status="review",
            score=headline,
            explanation=f"Scored {headline} with no threshold chosen.",
            **common,
        )
    passed = headline >= (threshold if threshold is not None else 1.0)
    explanation = "; ".join(score.explanation for score in scores if score.explanation)
    return NormalizedResult(
        status="passed" if passed else "failed",
        score=headline,
        passed=passed,
        explanation=explanation,
        failure_stage="" if passed else "scorer",
        failure_mode="" if passed else "wrong_answer",
        **common,
    )


def _failure_stage(traceback: str) -> tuple[str, str]:
    """Which of Inspect's parts failed, from where the traceback stood."""
    if "/inspect_ai/model/" in traceback or "ModelAPI" in traceback:
        return "agent", "model_error"
    if "/inspect_ai/util/_sandbox" in traceback or "SandboxEnvironment" in traceback:
        return "infrastructure", "sandbox_error"
    if (
        "/inspect_ai/scorer/" in traceback
        or "score" in traceback.rsplit("File ", 1)[-1]
    ):
        return "scorer", "scorer_error"
    if "/inspect_ai/tool/" in traceback:
        return "agent", "tool_error"
    return "agent", "solver_error"


def _usage(sample: Mapping[str, Any]) -> dict[str, Any]:
    """A sample's tokens, across its models."""
    used = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    for entry in (sample.get("model_usage") or {}).values():
        for key in used:
            used[key] += int((entry or {}).get(key) or 0)
    return used


def _text_of(value: Any) -> str:
    """A message's or an input's text."""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(
            _text_of(item.get("content") if isinstance(item, dict) else item)
            for item in value
        )
    if isinstance(value, dict):
        return str(value.get("text") or "")
    return "" if value is None else str(value)


def _trajectory(messages: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """What was said, in order, with the tool calls."""
    steps: list[dict[str, Any]] = []
    for message in messages:
        step: dict[str, Any] = {
            "role": str(message.get("role") or ""),
            "text": _text_of(message.get("content")),
        }
        calls = message.get("tool_calls")
        if calls:
            step["tool_calls"] = [
                {"function": call.get("function"), "arguments": call.get("arguments")}
                for call in calls
            ]
        if message.get("error"):
            step["error"] = message["error"]
        steps.append(step)
    return steps
