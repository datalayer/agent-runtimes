# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an external adapter is, and the records that cross its boundaries.

An adapter maps a framework's definition into the canonical evals model; it
is never a second store. It has six boundaries:

- `inspect` discovers what a source defines, in a sandbox, executing no sample;
- `validate` classifies every component as `native`, `framework-run` or
  `unsupported`, naming what is unsupported and why;
- `import_definition` makes a versioned evalset and its experiments out of an
  inspection, leaving the source untouched;
- `plan` decides how a launch runs under what it was granted;
- `execute` runs one case or trial in a sandbox;
- `normalize_result` turns what the framework left into one task result.

`inspect` and `execute` run framework code and only ever do so through the
`Sandbox` they are handed. The others are this package's own code over data,
and treat that data as untrusted: everything is parsed into the models here.

Every adapter carries its own `adapter_version`, moved when its mapping
changes, and pins the `framework_version` it was tested against.
"""

from __future__ import annotations

import base64
import hashlib
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Literal, Mapping, Protocol, Sequence

from pydantic import BaseModel, ConfigDict, Field

from agent_runtimes.evals.adapters.sandbox import SandboxOutcome, SandboxPolicy

__all__ = [
    "AdapterPlan",
    "Capability",
    "CapabilityStatus",
    "ExternalAdapter",
    "ExternalDefinition",
    "ImportedDefinition",
    "InspectedCase",
    "Inspection",
    "LaunchGrant",
    "NormalizedResult",
    "NormalizedScore",
    "RawResult",
    "ResultArtifact",
    "Sandbox",
    "Selection",
    "SourceRef",
    "SourceTree",
    "Trial",
    "blocking",
    "policy_from",
    "policy_to",
    "stable_case_id",
]

CapabilityStatus = Literal["native", "framework-run", "unsupported"]


class Sandbox(Protocol):
    """Runs one command of an adapter: its argv, what it reads on stdin, the
    environment beyond the sandbox's own. The source and the bounds are bound."""

    workdir: Path

    def __call__(
        self,
        argv: Sequence[str],
        *,
        stdin: bytes = b"",
        env: Mapping[str, str] | None = None,
    ) -> SandboxOutcome: ...


class _Record(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Capability(_Record):
    """One component, as the adapter classified it."""

    component: str
    kind: str
    status: CapabilityStatus
    #: Why it cannot run, for an `unsupported` one: the sentence a person reads.
    reason: str = ""
    #: A stable code to count validation failures by.
    code: str = ""


class SourceRef(_Record):
    """The immutable thing a definition was read from."""

    kind: Literal["archive", "git", "library", "registry"]
    reference: str
    filename: str = ""


class SourceTree(_Record):
    """A source, unpacked read-only on the runtime."""

    archive_digest: str
    content_digest: str
    root: str


class InspectedCase(_Record):
    native_id: str
    name: str = ""
    input: Any = None
    target: Any = None
    entry_point: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class Inspection(_Record):
    """What a source defines, before anything of it was run."""

    framework: str
    adapter_version: str
    framework_version: str
    archive_digest: str
    content_digest: str
    name: str = ""
    description: str = ""
    entry_points: list[str] = Field(default_factory=list)
    cases: list[InspectedCase] = Field(default_factory=list)
    subjects: list[dict[str, Any]] = Field(default_factory=list)
    scorers: list[dict[str, Any]] = Field(default_factory=list)
    models: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    secrets: list[str] = Field(default_factory=list)
    network: Literal["none", "boundary"] = "none"
    environment: dict[str, Any] = Field(default_factory=dict)
    capabilities: list[Capability] = Field(default_factory=list)
    configuration: dict[str, Any] = Field(default_factory=dict)


class Selection(_Record):
    """What a person chose from the preview."""

    entry_points: list[str] = Field(default_factory=list)
    limit: int | None = Field(default=None, ge=1)
    arguments: dict[str, Any] = Field(default_factory=dict)
    models: list[str] = Field(default_factory=list)
    #: The explicit headline score: `{"scorer": name}` or `{"kind": "mean"}`.
    #: Without one a task keeps every score and has no headline.
    aggregation: dict[str, Any] = Field(default_factory=dict)
    name: str = ""


class ExternalDefinition(_Record):
    """What an evalset version and a launch keep of where they came from."""

    framework: str
    adapter_version: str
    framework_version: str
    source: SourceRef
    entry_point: str
    configuration: dict[str, Any] = Field(default_factory=dict)
    capabilities: list[Capability] = Field(default_factory=list)
    content_digest: str


class ImportedDefinition(_Record):
    """An evalset and experiments, in the shape the evals API creates them."""

    name: str
    description: str = ""
    cases: list[dict[str, Any]]
    experiments: list[dict[str, Any]]
    external_definition: ExternalDefinition


class LaunchGrant(_Record):
    """What a launch allows. A framework may ask for less, never for more."""

    network: Literal["none", "boundary"] = "none"
    secrets: list[str] = Field(default_factory=list)
    #: The tools the launch approves, by name. Any other a framework calls is refused.
    tools: list[str] = Field(default_factory=list)


class Trial(_Record):
    """One execution: a case, and which attempt of it."""

    case_id: str
    native_id: str
    attempt: int = 1
    entry_point: str = ""
    input: Any = None
    target: Any = None
    configuration: dict[str, Any] = Field(default_factory=dict)


class AdapterPlan(_Record):
    """How a launch runs, decided before anything of it does."""

    framework: str
    adapter_version: str
    framework_version: str
    environment: str
    policy: dict[str, Any]
    capabilities: list[Capability]
    resolved_configuration: dict[str, Any] = Field(default_factory=dict)
    #: The pinned framework command, secrets as placeholders.
    reproduction: str = ""


class ResultArtifact(_Record):
    """One file of raw evidence, on its way to being kept by digest."""

    name: str
    media_type: str = "application/octet-stream"
    content_base64: str

    @property
    def content(self) -> bytes:
        return base64.b64decode(self.content_base64)


class RawResult(_Record):
    """What an execution left, untouched by interpretation."""

    returncode: int
    stdout: str = ""
    stderr: str = ""
    seconds: float = 0.0
    payload: dict[str, Any] | None = None
    artifacts: list[ResultArtifact] = Field(default_factory=list)


class NormalizedScore(_Record):
    """One scorer's verdict on one task, as the framework gave it."""

    name: str
    value: Any = None
    answer: str = ""
    explanation: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class NormalizedResult(_Record):
    """One task result, in the fields the case-result writer takes."""

    status: Literal["passed", "failed", "review"]
    score: float | None = None
    passed: bool | None = None
    explanation: str = ""
    failure_stage: str = ""
    failure_mode: str = ""
    prompt: str = ""
    output: str = ""
    trajectory: list[dict[str, Any]] = Field(default_factory=list)
    scores: list[NormalizedScore] = Field(default_factory=list)
    usage: dict[str, Any] = Field(default_factory=dict)
    framework: dict[str, Any] = Field(default_factory=dict)
    artifacts: list[ResultArtifact] = Field(default_factory=list)


def stable_case_id(*, framework: str, native_id: str, content_digest: str) -> str:
    """A case's id: its native id under its source. A retried attempt keeps it,
    and the same native id in another source is another case."""
    digest = hashlib.sha256(
        f"{framework}\0{content_digest}\0{native_id}".encode()
    ).hexdigest()
    return f"x{digest[:31]}"


def blocking(capabilities: Sequence[Capability]) -> list[Capability]:
    """The components that stop a launch."""
    return [item for item in capabilities if item.status == "unsupported"]


def policy_to(policy: SandboxPolicy) -> dict[str, Any]:
    """A policy as a plan carries it. Secrets as names; never a value."""
    return {
        "network": policy.network,
        "wall_seconds": policy.wall_seconds,
        "cpu_seconds": policy.cpu_seconds,
        "memory_bytes": policy.memory_bytes,
        "max_files": policy.max_files,
        "max_bytes": policy.max_bytes,
        "secrets": list(policy.secrets),
    }


def policy_from(values: Mapping[str, Any]) -> SandboxPolicy:
    """A plan's policy back. A key this does not know is refused, not ignored."""
    known = {
        "network",
        "wall_seconds",
        "cpu_seconds",
        "memory_bytes",
        "max_files",
        "max_bytes",
        "secrets",
    }
    extra = set(values) - known
    if extra:
        raise ValueError(f"unknown sandbox policy keys: {', '.join(sorted(extra))}")
    return SandboxPolicy(**{**values, "secrets": tuple(values.get("secrets") or ())})


class ExternalAdapter(ABC):
    """One framework's mapping. Holds no state; versioned on its own."""

    framework: str
    adapter_version: str
    framework_version: str
    #: The Runtimes environment its sandboxes launch on: its image holds the
    #: pinned framework.
    environment: str = "ai-agents-env"
    default_policy: SandboxPolicy = SandboxPolicy()

    @abstractmethod
    def inspect(
        self, source: SourceTree, *, sandbox: Sandbox, options: dict[str, Any]
    ) -> Inspection:
        """Discover what `source` defines. Executes no sample."""

    @abstractmethod
    def validate(
        self, inspection: Inspection, *, grant: LaunchGrant | None = None
    ) -> list[Capability]:
        """Classify every component, under what a launch grants."""

    @abstractmethod
    def import_definition(
        self, inspection: Inspection, *, selection: Selection, source: SourceRef
    ) -> ImportedDefinition:
        """The evalset and its experiments. Never touches the source."""

    @abstractmethod
    def plan(
        self, definition: ExternalDefinition, *, grant: LaunchGrant
    ) -> AdapterPlan:
        """How a launch of `definition` runs under `grant`."""

    @abstractmethod
    def execute(
        self,
        trial: Trial,
        *,
        plan: AdapterPlan,
        source: SourceTree,
        sandbox: Sandbox,
        env: Mapping[str, str],
    ) -> RawResult:
        """Run one trial, in `sandbox`."""

    @abstractmethod
    def normalize_result(
        self, trial: Trial, raw: RawResult, *, plan: AdapterPlan
    ) -> NormalizedResult:
        """One task result, keeping every score. No invented aggregate."""

    def describe(self) -> dict[str, Any]:
        """What `GET /evals/adapters` says of it."""
        return {
            "framework": self.framework,
            "adapter_version": self.adapter_version,
            "framework_version": self.framework_version,
            "environment": self.environment,
        }
