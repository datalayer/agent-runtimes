# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Harbor adapter.

Harbor's tasks are packages: an instruction, an environment, tests that write a
reward. One attempt of one task is one trial and one durable task of the launch,
in its own sandbox: Datalayer's pool is the admission, and Harbor is handed one
trial at a time, so it has nothing to schedule.

What a task may run on is decided here. The sandbox is the environment, through
the provider in `_harbor_environment.py`, so a task that names no image runs on
the adapter's image. A task naming an image, a Dockerfile, a Compose file, a
separate verifier, Windows, a GPU or the internet is `unsupported`, by name,
unless the deployment says its runtimes provide that kind of environment.

Every model call goes through ai-inference. An agent is offered only once it is
known to reach it: `oracle` and `nop` call no model, and each other agent is
`unsupported`, saying why. Default-deny, so an agent Harbor adds is refused until
somebody has read how it reaches its model.

A reward's dimensions all stay, as scores. No aggregate is invented: one
dimension is the headline, several need a selection or a person.
"""

from __future__ import annotations

import base64
import json
import os
import shlex
import sys
from dataclasses import replace
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
from agent_runtimes.evals.adapters.inspect_ai import _with_headline
from agent_runtimes.evals.adapters.sandbox import (
    INFERENCE_PORT,
    SandboxOutcome,
    SandboxPolicy,
)
from agent_runtimes.evals.adapters.task_environments import (
    EnvironmentRefused,
    environment_of,
)

__all__ = ["HarborAdapter"]

ADAPTER_VERSION = "1"
#: The one Harbor this adapter was tested against. Another is refused.
HARBOR_VERSION = "0.25.0"
ENVIRONMENT = "harbor-env"
PYTHON_VARIABLE = "DATALAYER_HARBOR_PYTHON"
#: What this deployment's runtimes provide beyond the sandbox itself: any of
#: `image`, `compose`, `separate-verifier`, `gpu`, `internet`.
ENVIRONMENTS_VARIABLE = "DATALAYER_HARBOR_ENVIRONMENTS"

_RUNNER = Path(__file__).with_name("_harbor_runner.py")
#: The paths a task names, in the sandbox's own root.
ROOT_DIRS = ("/logs", "/tests", "/solution", "/workspace", "/app")

#: Set by a deployment whose ai-inference answers Anthropic's Messages API from
#: Bedrock, on no account's key. A probe cannot say so: the route it replaced
#: answered the same paths, on the account's own key.
ANTHROPIC_ROUTE_VARIABLE = "DATALAYER_INFERENCE_ANTHROPIC_ROUTE"
#: An agent that speaks Anthropic's Messages API, through that route.
ANTHROPIC_AGENT = "claude-code"
#: Where it finds the route, from the adapter's sandbox: the relay.
ANTHROPIC_URL = f"http://127.0.0.1:{INFERENCE_PORT}/anthropic"

#: Agents that call no model.
NO_MODEL_AGENTS = frozenset({"oracle", "nop"})
#: Why an agent is refused, for the ones whose way to a model has been read in
#: the pinned source. Any agent not named here is refused for not having been.
AGENT_REASONS: dict[str, str] = {
    "codex": "speaks OpenAI's Responses API, and ai-inference has no route for it.",
    "gemini-cli": "speaks Google's API, and ai-inference has no route for it.",
    "aider": "installs itself over the network, which a sandbox does not have; it could reach ai-inference from an image that holds it.",
    "goose": "installs itself over the network, which a sandbox does not have; it could reach ai-inference from an image that holds it.",
    "opencode": "installs itself over the network, which a sandbox does not have; it could reach ai-inference from an image that holds it.",
    "mini-swe-agent": "installs itself over the network, which a sandbox does not have; it could reach ai-inference from an image that holds it.",
}


def _anthropic_route() -> bool:
    """Whether this deployment says its ai-inference has the Bedrock-backed route."""
    return os.environ.get(ANTHROPIC_ROUTE_VARIABLE, "").strip().lower() in {
        "1",
        "true",
        "yes",
    }


def _provided() -> set[str]:
    """What this deployment's runtimes provide."""
    return {
        item.strip()
        for item in os.environ.get(ENVIRONMENTS_VARIABLE, "").split(",")
        if item.strip()
    }


def _refused(component: str, kind: str, code: str, reason: str) -> Capability:
    """A component that stops a launch."""
    return Capability(
        component=component, kind=kind, status="unsupported", code=code, reason=reason
    )


def _agent_capability(agent: str) -> Capability:
    """How one agent reaches its model: not at all, or refused."""
    if agent in NO_MODEL_AGENTS or (agent == ANTHROPIC_AGENT and _anthropic_route()):
        return Capability(
            component=f"agent:{agent}", kind="agent", status="framework-run"
        )
    if agent == ANTHROPIC_AGENT:
        return _refused(
            f"agent:{agent}",
            "agent",
            "anthropic_route_absent",
            f"The agent {agent} speaks Anthropic's Messages API, and this deployment's ai-inference does not answer it from Bedrock.",
        )
    reason = AGENT_REASONS.get(
        agent,
        "has not been shown to reach ai-inference, and every model call goes through it.",
    )
    return _refused(
        f"agent:{agent}",
        "agent",
        "agent_not_on_inference",
        f"The agent {agent} {reason}",
    )


def _agent_model(model: str) -> str:
    """A catalogue model as Harbor names it: `anthropic/us.anthropic.…`, which the route takes."""
    return f"anthropic/{model.removeprefix('bedrock:')}" if model else ""


#: A sandbox is not root, and Harbor's own paths are written during a trial.
TASK_PATHS_LAYER = (
    "USER root\n"
    "RUN mkdir -p /workspace /logs/agent /logs/verifier /logs/artifacts /tests /solution "
    "&& chmod -R 1777 /workspace /logs /tests /solution\n"
)


def _task_environment(task: Mapping[str, Any]) -> dict[str, Any] | None:
    """The Environment a task's image becomes, when this deployment builds them."""
    if (
        not (task.get("docker_image") or task.get("dockerfile"))
        or "image" not in _provided()
    ):
        return None
    extra = list(task.get("build_context") or [])
    image = str(task.get("docker_image") or "")
    # A prebuilt image stands before a Dockerfile, as it does in Harbor.
    base = f"FROM {image}\n" if image else str(task.get("dockerfile_content") or "")
    return environment_of(
        dockerfile=f"{base.rstrip()}\n{TASK_PATHS_LAYER}" if base.strip() else "",
        extra_files=[] if image else extra,
    )


def _buildable(task: Mapping[str, Any]) -> dict[str, Any] | None:
    """The Environment of a task that has one and can be built.

    A refusal is its capability's to say, so a plan still answers.
    """
    try:
        return _task_environment(task)
    except EnvironmentRefused:
        return None


def _source_capabilities(configuration: Mapping[str, Any]) -> list[Capability]:
    """What the source names but does not hold. Nothing here fetches it."""
    capabilities = [
        _refused(
            f"source:{item}",
            "source",
            "remote_source_not_fetched",
            f"The job names a remote source, which a sandbox cannot fetch: inspect it with `evals adapters inspect harbor {item}`.",
        )
        for item in configuration.get("remote") or []
    ]
    for ref in dict(configuration.get("dataset") or {}).get("tasks") or []:
        name, digest = str(ref["name"]), str(ref["digest"])
        if not ref.get("path"):
            capabilities.append(
                _refused(
                    f"dataset:{name}",
                    "source",
                    "dataset_task_not_held",
                    f"The dataset names {name}, which the source does not hold: fetch it with `evals adapters inspect harbor --registry {name}@{digest}`.",
                )
            )
        elif ref.get("held_digest") != digest:
            capabilities.append(
                _refused(
                    f"dataset:{name}",
                    "source",
                    "dataset_digest_differs",
                    f"The dataset pins {name} at {digest}, and the source holds {ref.get('held_digest')}.",
                )
            )
    return capabilities


def _task_capabilities(task: Mapping[str, Any]) -> list[Capability]:
    """What one task's environment needs, against what is provided."""
    name = str(task["name"])
    provided = _provided()
    needs = [
        (
            bool(task.get("docker_image") or task.get("dockerfile")),
            "image",
            "image_unavailable",
            "It names its own image, and this deployment runs tasks on the adapter's image.",
        ),
        (
            bool(task.get("compose")),
            "compose",
            "compose_unavailable",
            "It is a Compose environment, which this deployment's runtimes do not provide.",
        ),
        (
            bool(task.get("separate_verifier")),
            "separate-verifier",
            "separate_verifier_unavailable",
            "Its verifier runs in an environment of its own, which this deployment's runtimes do not provide.",
        ),
        (
            int(task.get("gpus") or 0) > 0 or bool(task.get("tpu")),
            "gpu",
            "accelerator_unavailable",
            "It asks for a GPU or a TPU, which this deployment's runtimes do not provide.",
        ),
        (
            bool(task.get("allow_internet")),
            "internet",
            "internet_unavailable",
            "It asks for the internet, and a sandbox reaches only ai-inference.",
        ),
    ]
    capabilities = [
        _refused(f"{name}:environment:{feature}", "environment", code, reason)
        for needed, feature, code, reason in needs
        if needed and feature not in provided
    ]
    try:
        _task_environment(task)
    except EnvironmentRefused as refused:
        capabilities.append(
            _refused(
                f"{name}:environment:build",
                "environment",
                "environment_refused",
                str(refused),
            )
        )
    if str(task.get("os") or "linux") != "linux":
        capabilities.append(
            _refused(
                f"{name}:environment:{task['os']}",
                "environment",
                "os_unavailable",
                f"It runs on {task['os']}, and a runtime is Linux.",
            )
        )
    if int(task.get("mcp_servers") or 0):
        capabilities.append(
            _refused(
                f"{name}:mcp",
                "environment",
                "mcp_unavailable",
                "It brings MCP servers, which a sandbox cannot reach.",
            )
        )
    for finding in task.get("findings") or []:
        if str(finding.get("severity") or "") == "error":
            capabilities.append(
                _refused(
                    f"{name}:lint:{finding.get('rule')}",
                    "lint",
                    "lint_error",
                    str(finding.get("message") or ""),
                )
            )
    if not capabilities:
        capabilities.append(
            Capability(
                component=f"{name}:environment",
                kind="environment",
                status="framework-run",
            )
        )
    capabilities.append(
        Capability(
            component=f"{name}:verifier", kind="verifier", status="framework-run"
        )
    )
    return capabilities


class HarborAdapter(ExternalAdapter):
    """The adapter of Harbor, at its pinned version."""

    framework = "harbor"
    adapter_version = ADAPTER_VERSION
    framework_version = HARBOR_VERSION
    environment = ENVIRONMENT
    default_policy = SandboxPolicy(
        wall_seconds=1800,
        cpu_seconds=1800,
        memory_bytes=8 * 1024 * 1024 * 1024,
        max_files=20_000,
        max_bytes=1024 * 1024 * 1024,
        root_dirs=ROOT_DIRS,
    )

    def _run(
        self,
        request: dict[str, Any],
        *,
        sandbox: Sandbox,
        env: Mapping[str, str] | None = None,
    ) -> SandboxOutcome:
        """Run the runner in the sandbox, with the interpreter that holds Harbor."""
        python = os.environ.get(PYTHON_VARIABLE) or sys.executable
        return sandbox(
            [python, "-I", "-B", str(_RUNNER)],
            stdin=json.dumps(request).encode(),
            env=dict(env or {}),
        )

    def _pinned(self, version: str) -> None:
        """Refuse any Harbor but the pinned one."""
        if version != self.framework_version:
            raise ValueError(
                f"the sandbox holds Harbor {version}; this adapter is pinned to {self.framework_version}"
            )

    def inspect(
        self, source: SourceTree, *, sandbox: Sandbox, options: dict[str, Any]
    ) -> Inspection:
        """Read and lint the task packages in the sandbox; run nothing of them."""
        outcome = self._run({"op": "inspect", "source": source.root}, sandbox=sandbox)
        answer = Path(sandbox.workdir) / "answer.json"
        if outcome.returncode != 0 or not answer.exists():
            raise ValueError(
                outcome.stderr.decode("utf-8", "replace")[-2000:]
                or "Harbor left no answer"
            )
        found = json.loads(answer.read_text())
        self._pinned(str(found["version"]))
        tasks = list(found["tasks"])
        if not tasks:
            raise ValueError("the source holds no Harbor task (no task.toml)")
        dataset = dict(found.get("dataset") or {})
        named = {str(item["path"]) for item in dataset.get("tasks") or []} - {""}
        # A dataset says which of the packages it is.
        tasks = [task for task in tasks if task["path"] in named] if dataset else tasks
        job = dict(found.get("job") or {})
        agents = [
            str(item.get("name") or "")
            for item in job.get("agents") or []
            if item.get("name")
        ]
        inspection = Inspection(
            framework=self.framework,
            adapter_version=self.adapter_version,
            framework_version=self.framework_version,
            archive_digest=source.archive_digest,
            content_digest=source.content_digest,
            name=str(dataset.get("name") or "")
            or (
                str(tasks[0]["name"])
                if len(tasks) == 1
                else f"{len(tasks)} Harbor tasks"
            ),
            entry_points=[str(task["path"]) for task in tasks],
            cases=[
                InspectedCase(
                    native_id=str(task["path"]),
                    name=str(task["name"]),
                    input=str(task["instruction"]),
                    entry_point=str(task["path"]),
                    metadata=dict(task.get("metadata") or {}),
                )
                for task in tasks
            ],
            subjects=[{"agent": agent} for agent in agents],
            configuration={
                "tasks": tasks,
                "job": job,
                "agents": agents,
                "n_attempts": int(job.get("n_attempts") or 1),
                "dataset": dataset,
                "remote": list(found.get("remote") or []),
                "origin": dict(found.get("origin") or {}),
            },
        )
        return inspection.model_copy(update={"capabilities": self.validate(inspection)})

    def validate(
        self, inspection: Inspection, *, grant: LaunchGrant | None = None
    ) -> list[Capability]:
        """Every task and agent, classified."""
        configuration = inspection.configuration
        return _source_capabilities(configuration) + self._capabilities(
            configuration.get("tasks") or [],
            configuration.get("agents") or [],
            grant=grant,
        )

    def _agent_on_task(
        self, agent: str, tasks: list[dict[str, Any]]
    ) -> list[Capability]:
        """An agent that reaches its model through the relay stays in the adapter's sandbox."""
        if agent != ANTHROPIC_AGENT or not _anthropic_route():
            return []
        return [
            _refused(
                f"{task['name']}:agent:{agent}",
                "agent",
                "agent_needs_the_relay",
                f"The agent {agent} reaches ai-inference through the relay, and a task with an environment of its own runs it out of the relay's reach.",
            )
            for task in tasks
            if _buildable(task)
        ]

    def _capabilities(
        self,
        tasks: list[dict[str, Any]],
        agents: list[str],
        *,
        grant: LaunchGrant | None,
    ) -> list[Capability]:
        """What a launch would meet, under what it grants."""
        capabilities = [item for task in tasks for item in _task_capabilities(task)]
        capabilities += [_agent_capability(agent) for agent in agents]
        capabilities += [
            item for agent in agents for item in self._agent_on_task(agent, tasks)
        ]
        if grant is not None and grant.network == "boundary":
            capabilities.append(
                _refused(
                    "network:boundary",
                    "network",
                    "direct_network_refused",
                    "A framework reaches nothing but ai-inference: the pod's network would be a direct path to a provider.",
                )
            )
        for name in grant.secrets if grant is not None else []:
            if is_provider_key(name):
                capabilities.append(
                    _refused(
                        f"secret:{name}",
                        "secret",
                        "provider_key_refused",
                        f"{name} is a provider's key, and no such key reaches a sandbox: model calls go through ai-inference.",
                    )
                )
        return capabilities

    def import_definition(
        self, inspection: Inspection, *, selection: Selection, source: SourceRef
    ) -> ImportedDefinition:
        """An evalset of the chosen tasks, one experiment per agent."""
        configuration = inspection.configuration
        chosen = selection.entry_points or inspection.entry_points
        unknown = set(chosen) - set(inspection.entry_points)
        if unknown:
            raise ValueError(
                f"no such task in the source: {', '.join(sorted(unknown))}"
            )
        agents = list(configuration.get("agents") or [])
        if not agents:
            raise ValueError(
                "the source names no agent: a job configuration lists them"
            )
        for model in selection.models:
            if not is_inference_model(model):
                raise ValueError(
                    f"{model} is not one of ai-inference's models: every model call goes through it"
                )
        if ANTHROPIC_AGENT in agents and not any(
            model.startswith("bedrock:") for model in selection.models
        ):
            raise ValueError(
                f"the agent {ANTHROPIC_AGENT} needs a bedrock: model of the catalogue"
            )
        cases = [case for case in inspection.cases if case.entry_point in chosen]
        cases = cases[: selection.limit] if selection.limit else cases
        aggregation = dict(selection.aggregation)
        return ImportedDefinition(
            name=selection.name or inspection.name or "Imported benchmark",
            cases=[
                {
                    "id": stable_case_id(
                        framework=self.framework,
                        native_id=case.native_id,
                        content_digest=inspection.content_digest,
                    ),
                    "name": case.name,
                    "inputs": {"prompt": str(case.input or "")},
                    "expected_output": None,
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
                    "name": f"{agent} {model}".strip(),
                    "subject": {
                        "kind": "external",
                        "ref": self.framework,
                        "agent": agent,
                        **({"model": model} if model else {}),
                    },
                }
                for agent in agents
                for model in (
                    selection.models if agent not in NO_MODEL_AGENTS else [""]
                )
            ],
            external_definition=ExternalDefinition(
                framework=self.framework,
                adapter_version=self.adapter_version,
                framework_version=self.framework_version,
                source=source,
                entry_point=",".join(chosen),
                configuration={
                    "tasks": [
                        task
                        for task in configuration.get("tasks") or []
                        if task["path"] in chosen
                    ],
                    "agents": agents,
                    "dataset": dict(configuration.get("dataset") or {}),
                    "remote": list(configuration.get("remote") or []),
                    "origin": dict(configuration.get("origin") or {}),
                    "models": list(selection.models),
                    "n_attempts": int(configuration.get("n_attempts") or 1),
                    "aggregation": aggregation,
                },
                capabilities=inspection.capabilities,
                content_digest=inspection.content_digest,
            ),
        )

    def plan(
        self, definition: ExternalDefinition, *, grant: LaunchGrant
    ) -> AdapterPlan:
        """How a launch runs: one sandbox per attempt, no network, the reproduction."""
        configuration = definition.configuration
        agents = [str(agent) for agent in configuration.get("agents") or []]
        attempts = int(configuration.get("n_attempts") or 1)
        tasks = list(configuration.get("tasks") or [])
        environments = {
            str(task["path"]): spec for task in tasks if (spec := _buildable(task))
        }
        calls_models = ANTHROPIC_AGENT in agents
        policy = replace(
            self.default_policy,
            network="inference" if calls_models or environments else "none",
        )
        return AdapterPlan(
            framework=self.framework,
            adapter_version=self.adapter_version,
            framework_version=self.framework_version,
            environment=self.environment,
            policy=policy_to(policy),
            capabilities=_source_capabilities(configuration)
            + self._capabilities(
                list(configuration.get("tasks") or []), agents, grant=grant
            ),
            resolved_configuration={
                "attempts": attempts,
                "aggregation": dict(configuration.get("aggregation") or {}),
                "task_environments": environments,
                "environment_only": not calls_models,
                "anthropic": calls_models and _anthropic_route(),
            },
            reproduction=self._reproduction(
                definition, agents=agents, attempts=attempts
            ),
        )

    def _reproduction(
        self, definition: ExternalDefinition, *, agents: list[str], attempts: int
    ) -> str:
        """The pinned command, with no secret in it."""
        lines = [f"pip install harbor=={self.framework_version}"]
        origin = dict(definition.configuration.get("origin") or {})
        if origin.get("kind") == "git":
            lines.append(
                f"git clone {shlex.quote(str(origin['url']))} source && git -C source checkout {shlex.quote(str(origin['commit']))}"
            )
        elif origin.get("kind") == "registry":
            lines.append(f"harbor download {shlex.quote(str(origin['reference']))}")
        for entry in definition.entry_point.split(","):
            for agent in agents:
                lines.append(
                    f"harbor trial start -p {shlex.quote(entry)} --agent {shlex.quote(agent)}  # {attempts} attempt(s)"
                )
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
        """Run one attempt of one task, and keep what the verifier left."""
        subject = dict(trial.configuration.get("subject") or {})
        outcome = self._run(
            {
                "op": "execute",
                "source": source.root,
                "entry_point": trial.entry_point,
                "attempt": trial.attempt,
                "agent": str(subject.get("agent") or ""),
                "model": _agent_model(str(subject.get("model") or "")),
                "task_environment": bool(
                    (plan.resolved_configuration.get("task_environments") or {}).get(
                        trial.entry_point
                    )
                ),
                "anthropic_url": ANTHROPIC_URL
                if plan.resolved_configuration.get("anthropic")
                else "",
            },
            sandbox=sandbox,
            env=env,
        )
        workdir = Path(sandbox.workdir)
        answer = workdir / "answer.json"
        artifacts = (
            [
                ResultArtifact(
                    name=path.relative_to(workdir).as_posix().replace("/", "__"),
                    media_type="text/plain",
                    content_base64=base64.b64encode(path.read_bytes()).decode(),
                )
                for path in sorted((workdir / "trials").rglob("*"))
                if path.is_file()
                and path.name
                in {
                    "result.json",
                    "trial.log",
                    "test-stdout.txt",
                    "test-stderr.txt",
                    "reward.json",
                    "reward.txt",
                }
            ]
            if (workdir / "trials").exists()
            else []
        )
        return RawResult(
            returncode=outcome.returncode,
            stdout=outcome.stdout.decode("utf-8", "replace")[-20_000:],
            stderr=outcome.stderr.decode("utf-8", "replace")[-20_000:],
            seconds=outcome.seconds,
            payload=json.loads(answer.read_text()) if answer.exists() else None,
            artifacts=artifacts,
        )

    def normalize_result(
        self, trial: Trial, raw: RawResult, *, plan: AdapterPlan
    ) -> NormalizedResult:
        """One attempt's result, with every reward dimension on it."""
        if raw.payload is None:
            return NormalizedResult(
                status="failed",
                failure_stage="infrastructure",
                failure_mode="no_trial_result",
                explanation=(
                    raw.stderr[-500:] or raw.stdout[-500:] or "Harbor left no result."
                ),
                framework={"returncode": raw.returncode},
                artifacts=raw.artifacts,
            )
        self._pinned(str(raw.payload.get("version") or ""))
        result = dict(raw.payload.get("result") or {})
        exception = result.get("exception_info") or {}
        common: dict[str, Any] = {
            "prompt": str(trial.input or ""),
            "framework": {
                "trial_name": result.get("trial_name"),
                "task_checksum": result.get("task_checksum"),
                "attempt": trial.attempt,
                "agent": (result.get("agent_info") or {}).get("name"),
                "exception": exception or None,
            },
            "artifacts": raw.artifacts,
        }
        if exception:
            kind = str(exception.get("exception_type") or "")
            stage = "agent" if "Agent" in kind else "infrastructure"
            return NormalizedResult(
                status="failed",
                failure_stage=stage,
                failure_mode=f"harbor_{kind or 'error'}",
                explanation=str(exception.get("exception_message") or kind),
                **common,
            )
        rewards = ((result.get("verifier_result") or {}).get("rewards")) or {}
        if not rewards:
            return NormalizedResult(
                status="failed",
                failure_stage="scorer",
                failure_mode="no_reward",
                explanation="The verifier left no reward.",
                **common,
            )
        scores = [
            NormalizedScore(name=str(name), value=value)
            for name, value in rewards.items()
        ]
        return _with_headline(
            scores,
            aggregation=dict(plan.resolved_configuration.get("aggregation") or {}),
            common={
                **common,
                "scores": scores,
                "output": json.dumps(rewards, sort_keys=True),
            },
        )
