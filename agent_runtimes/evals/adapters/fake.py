# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An adapter for a framework that does not exist: the substrate's own test.

Its "framework" is `_fake_runner.py`, a script that reads `fake-eval.json`
from the source, and it goes through every boundary a real adapter does: the
sandbox, the bounds, the capability decisions, the task results. A deployment
offers it only by naming it in `DATALAYER_EVALS_ADAPTERS`.
"""

from __future__ import annotations

import base64
import json
import sys
from pathlib import Path
from typing import Any, Literal, Mapping

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
    policy_to,
    stable_case_id,
)
from agent_runtimes.evals.adapters.sandbox import SandboxOutcome, SandboxPolicy

_RUNNER = Path(__file__).with_name("_fake_runner.py")


class FakeAdapter(ExternalAdapter):
    framework = "fake"
    adapter_version = "1"
    framework_version = "0"
    default_policy = SandboxPolicy(
        wall_seconds=60, cpu_seconds=30, memory_bytes=1024 * 1024 * 1024
    )

    def _ask(
        self,
        request: dict[str, Any],
        *,
        sandbox: Sandbox,
        env: Mapping[str, str] | None = None,
    ) -> SandboxOutcome:
        return sandbox(
            [sys.executable, "-I", "-S", str(_RUNNER)],
            stdin=json.dumps(request).encode(),
            env=dict(env or {}),
        )

    def inspect(
        self, source: SourceTree, *, sandbox: Sandbox, options: dict[str, Any]
    ) -> Inspection:
        outcome = self._ask({"op": "inspect", "source": source.root}, sandbox=sandbox)
        if outcome.returncode != 0:
            raise ValueError(
                f"the definition could not be read: {outcome.stderr.decode('utf-8', 'replace')[-500:]}"
            )
        loaded = json.loads(outcome.stdout)["definition"]
        inspection = Inspection(
            framework=self.framework,
            adapter_version=self.adapter_version,
            framework_version=self.framework_version,
            archive_digest=source.archive_digest,
            content_digest=source.content_digest,
            name=str(loaded.get("name") or ""),
            description=str(loaded.get("description") or ""),
            entry_points=["fake-eval.json"],
            cases=[
                InspectedCase(
                    native_id=str(case["id"]),
                    name=str(case.get("name") or case["id"]),
                    input=case.get("input"),
                    target=case.get("target"),
                    entry_point="fake-eval.json",
                )
                for case in loaded.get("cases") or []
            ],
            scorers=[{"name": "exact"}],
            secrets=[str(item) for item in loaded.get("secrets") or []],
            network=loaded.get("network") or "none",
            configuration={"components": list(loaded.get("components") or [])},
        )
        return inspection.model_copy(update={"capabilities": self.validate(inspection)})

    def validate(
        self, inspection: Inspection, *, grant: LaunchGrant | None = None
    ) -> list[Capability]:
        capabilities = [
            Capability(
                component=str(item["name"]),
                kind=str(item.get("kind") or "component"),
                status=item.get("support") or "framework-run",
                reason=str(item.get("reason") or ""),
                code=str(item.get("code") or ""),
            )
            for item in inspection.configuration.get("components") or []
        ]
        return capabilities + _grant_capabilities(
            network=inspection.network, secrets=inspection.secrets, grant=grant
        )

    def import_definition(
        self, inspection: Inspection, *, selection: Selection, source: SourceRef
    ) -> ImportedDefinition:
        cases = (
            inspection.cases[: selection.limit] if selection.limit else inspection.cases
        )
        return ImportedDefinition(
            name=selection.name or inspection.name or "Imported benchmark",
            description=inspection.description,
            cases=[
                {
                    "id": stable_case_id(
                        framework=self.framework,
                        native_id=case.native_id,
                        content_digest=inspection.content_digest,
                    ),
                    "name": case.name or case.native_id,
                    "inputs": {"prompt": str(case.input or "")},
                    "expected_output": case.target,
                    "evaluators": [],
                    "metadata": {
                        "external": {
                            "native_id": case.native_id,
                            "entry_point": case.entry_point,
                        }
                    },
                }
                for case in cases
            ],
            experiments=[
                {"name": "fake", "subject": {"kind": "external", "ref": self.framework}}
            ],
            external_definition=ExternalDefinition(
                framework=self.framework,
                adapter_version=self.adapter_version,
                framework_version=self.framework_version,
                source=source,
                entry_point="fake-eval.json",
                configuration={
                    "components": inspection.configuration.get("components") or [],
                    "secrets": inspection.secrets,
                    "network": inspection.network,
                },
                capabilities=inspection.capabilities,
                content_digest=inspection.content_digest,
            ),
        )

    def plan(
        self, definition: ExternalDefinition, *, grant: LaunchGrant
    ) -> AdapterPlan:
        configuration = definition.configuration
        secrets = [str(item) for item in configuration.get("secrets") or []]
        network: Literal["none", "boundary"] = (
            "boundary" if configuration.get("network") == "boundary" else "none"
        )
        declared = [
            item
            for item in definition.capabilities
            if item.kind not in {"network", "secret"}
        ]
        policy = SandboxPolicy(
            network=network,
            wall_seconds=self.default_policy.wall_seconds,
            cpu_seconds=self.default_policy.cpu_seconds,
            memory_bytes=self.default_policy.memory_bytes,
            secrets=tuple(secrets),
        )
        return AdapterPlan(
            framework=self.framework,
            adapter_version=self.adapter_version,
            framework_version=self.framework_version,
            environment=self.environment,
            policy=policy_to(policy),
            capabilities=declared
            + _grant_capabilities(network=network, secrets=secrets, grant=grant),
            resolved_configuration={"entry_point": definition.entry_point},
            reproduction=f"python _fake_runner.py  # {definition.entry_point}",
        )

    def execute(
        self,
        trial: Trial,
        *,
        plan: AdapterPlan,
        source: SourceTree,
        sandbox: Sandbox,
        env: Mapping[str, str],
    ) -> RawResult:
        outcome = self._ask(
            {"op": "execute", "source": source.root, "native_id": trial.native_id},
            sandbox=sandbox,
            env=env,
        )
        payload: dict[str, Any] | None = None
        if outcome.returncode == 0:
            payload = json.loads(outcome.stdout)
        log = Path(sandbox.workdir) / "framework.log"
        return RawResult(
            returncode=outcome.returncode,
            stdout=outcome.stdout.decode("utf-8", "replace"),
            stderr=outcome.stderr.decode("utf-8", "replace"),
            seconds=outcome.seconds,
            payload=payload,
            artifacts=[
                ResultArtifact(
                    name="framework.log",
                    media_type="text/plain",
                    content_base64=base64.b64encode(log.read_bytes()).decode(),
                )
            ]
            if log.exists()
            else [],
        )

    def normalize_result(
        self, trial: Trial, raw: RawResult, *, plan: AdapterPlan
    ) -> NormalizedResult:
        if raw.payload is None:
            return NormalizedResult(
                status="failed",
                explanation=raw.stderr[-500:],
                failure_stage="agent",
                failure_mode="framework_failed",
                framework={"returncode": raw.returncode, "stderr": raw.stderr[-2000:]},
                artifacts=raw.artifacts,
            )
        scores = [NormalizedScore(**item) for item in raw.payload.get("scores") or []]
        value = float(scores[0].value)
        passed = value >= 1.0
        return NormalizedResult(
            status="passed" if passed else "failed",
            score=value,
            passed=passed,
            failure_stage="" if passed else "scorer",
            failure_mode="" if passed else "wrong_answer",
            prompt=str(raw.payload.get("input") or ""),
            output=str(raw.payload.get("answer") or ""),
            trajectory=[
                {"role": "user", "text": str(raw.payload.get("input") or "")},
                {"role": "assistant", "text": str(raw.payload.get("answer") or "")},
            ],
            scores=scores,
            usage=dict(raw.payload.get("usage") or {}),
            framework={
                "sample": raw.payload.get("sample"),
                "returncode": raw.returncode,
            },
            artifacts=raw.artifacts,
        )


def _grant_capabilities(
    *, network: str, secrets: list[str], grant: LaunchGrant | None
) -> list[Capability]:
    """What a definition asks of a launch, against what the launch allows.
    Before a launch is known (`grant` None) nothing is refused on this account."""
    capabilities: list[Capability] = []
    if network != "none":
        allowed = grant is None or grant.network != "none"
        capabilities.append(
            Capability(
                component=f"network:{network}",
                kind="network",
                status="framework-run" if allowed else "unsupported",
                reason=""
                if allowed
                else "The definition needs the network and the launch grants none.",
                code="" if allowed else "network_not_granted",
            )
        )
    for name in secrets:
        allowed = grant is None or name in grant.secrets
        capabilities.append(
            Capability(
                component=f"secret:{name}",
                kind="secret",
                status="framework-run" if allowed else "unsupported",
                reason=""
                if allowed
                else f"The definition needs the secret {name} and the launch does not name it.",
                code="" if allowed else "secret_not_granted",
            )
        )
    return capabilities
