# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The runtime's side of an adapter: where its sandboxes are started.

Holds sources by digest, unpacked once and read-only, gives each operation a
fresh working directory, runs the adapter against a sandbox bound to both, and
keeps what is running by its key so that a cancel reaches it. Whatever comes
back has every secret value of that execution taken out, wherever the
framework wrote it. Nothing is kept here beyond the sources: a service decides
what a result means and where it goes.
"""

from __future__ import annotations

import base64
import json
import shutil
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Any, Mapping, Sequence

from agent_runtimes.evals.adapters.base import (
    AdapterPlan,
    Inspection,
    NormalizedResult,
    ResultArtifact,
    SourceTree,
    Trial,
    policy_from,
)
from agent_runtimes.evals.adapters.registry import adapter
from agent_runtimes.evals.adapters.sandbox import (
    SandboxCancelled,
    SandboxExceeded,
    SandboxOutcome,
    SandboxPolicy,
    SandboxUnavailable,
    run_sandboxed,
)
from agent_runtimes.evals.adapters.source import (
    archive_digest,
    content_digest,
    require_digest,
    unpack_archive,
)

__all__ = ["AdapterHost", "SourceMissing", "redact"]


class SourceMissing(LookupError):
    """No source of that digest was handed to this runtime."""


def redact(text: str, secrets: Mapping[str, str]) -> str:
    """`text` with each secret's value replaced by its name."""
    for name, value in secrets.items():
        if value:
            text = text.replace(value, f"[secret:{name}]")
    return text


def _redacted(result: NormalizedResult, secrets: Mapping[str, str]) -> NormalizedResult:
    if not any(secrets.values()):
        return result
    artifacts = [
        ResultArtifact(
            name=item.name,
            media_type=item.media_type,
            content_base64=base64.b64encode(
                _redact_bytes(item.content, secrets)
            ).decode(),
        )
        for item in result.artifacts
    ]
    scrubbed = NormalizedResult.model_validate_json(
        redact(
            result.model_copy(update={"artifacts": []}).model_dump_json(),
            {name: json.dumps(value)[1:-1] for name, value in secrets.items()},
        )
    )
    return scrubbed.model_copy(update={"artifacts": artifacts})


def _redact_bytes(data: bytes, secrets: Mapping[str, str]) -> bytes:
    for name, value in secrets.items():
        if value:
            data = data.replace(value.encode(), f"[secret:{name}]".encode())
    return data


class _BoundSandbox:
    """`run_sandboxed`, with one operation's source, bounds and working directory."""

    def __init__(
        self,
        *,
        source: SourceTree,
        policy: SandboxPolicy,
        workdir: Path,
        cancel: threading.Event | None = None,
    ) -> None:
        self.source = source
        self.policy = policy
        self.workdir = workdir
        self.cancel = cancel

    def __call__(
        self,
        argv: Sequence[str],
        *,
        stdin: bytes = b"",
        env: Mapping[str, str] | None = None,
    ) -> SandboxOutcome:
        return run_sandboxed(
            argv,
            workdir=self.workdir,
            policy=self.policy,
            stdin=stdin,
            env=env,
            read_only=[Path(self.source.root)],
            cancel=self.cancel,
        )


class AdapterHost:
    """One runtime's adapter work, under `root`."""

    def __init__(self, root: Path | None = None) -> None:
        self.root = Path(root or tempfile.mkdtemp(prefix="evals-adapters-"))
        self._running: dict[str, threading.Event] = {}
        self._lock = threading.Lock()

    def _source_dir(self, digest: str) -> Path:
        return self.root / "sources" / digest

    def put_source(self, digest: str, data: bytes) -> SourceTree:
        """Keep an archive under its digest; the bytes must be that digest's."""
        require_digest(digest)
        if archive_digest(data) != digest:
            raise ValueError("the bytes are not those of that digest")
        place = self._source_dir(digest)
        with self._lock:
            if not (place / "tree").exists():
                staging = self.root / "staging" / uuid.uuid4().hex
                staging.mkdir(parents=True)
                unpack_archive(data, staging / "tree")
                (staging / "archive").write_bytes(data)
                place.parent.mkdir(parents=True, exist_ok=True)
                staging.rename(place)
        return self.source(digest)

    def source(self, digest: str) -> SourceTree:
        require_digest(digest)
        tree = self._source_dir(digest) / "tree"
        if not tree.exists():
            raise SourceMissing(f"the source {digest} was not handed to this runtime")
        return SourceTree(
            archive_digest=digest, content_digest=content_digest(tree), root=str(tree)
        )

    def _workdir(self) -> Path:
        place = self.root / "work" / uuid.uuid4().hex
        place.mkdir(parents=True)
        return place

    def inspect(
        self, framework: str, digest: str, *, options: dict[str, Any] | None = None
    ) -> Inspection:
        """Discover what a source defines, in a sandbox with no network."""
        chosen = adapter(framework)
        source = self.source(digest)
        workdir = self._workdir()
        try:
            return chosen.inspect(
                source,
                sandbox=_BoundSandbox(
                    source=source, policy=chosen.default_policy, workdir=workdir
                ),
                options=dict(options or {}),
            )
        except (SandboxUnavailable, SandboxCancelled):
            raise
        except Exception as error:  # noqa: BLE001 - whatever a source does to its reader is a refusal of that source
            raise ValueError(f"the definition could not be read: {error}") from error
        finally:
            shutil.rmtree(workdir, ignore_errors=True)

    def execute(
        self,
        framework: str,
        digest: str,
        *,
        plan: AdapterPlan,
        trial: Trial,
        secrets: Mapping[str, str],
        key: str = "",
    ) -> NormalizedResult:
        """Run one trial and normalize what it left. A bound overrun is the
        trial's own failure, in a sentence, with nothing of it kept."""
        chosen = adapter(framework)
        source = self.source(digest)
        policy = policy_from(plan.policy)
        unnamed = set(secrets) - set(policy.secrets)
        if unnamed:
            raise ValueError(
                f"secrets the plan does not name: {', '.join(sorted(unnamed))}"
            )
        cancel = threading.Event()
        key = key or uuid.uuid4().hex
        with self._lock:
            self._running[key] = cancel
        workdir = self._workdir()
        try:
            sandbox = _BoundSandbox(
                source=source, policy=policy, workdir=workdir, cancel=cancel
            )
            try:
                raw = chosen.execute(
                    trial, plan=plan, source=source, sandbox=sandbox, env=secrets
                )
            except SandboxExceeded as exceeded:
                return NormalizedResult(
                    status="failed",
                    explanation=str(exceeded),
                    failure_stage="infrastructure",
                    failure_mode=f"sandbox_{exceeded.bound}_exceeded",
                )
            try:
                return _redacted(
                    chosen.normalize_result(trial, raw, plan=plan), secrets
                )
            except Exception as error:  # noqa: BLE001 - what a framework left is data; it may be anything
                return NormalizedResult(
                    status="failed",
                    explanation=redact(
                        f"What the framework left could not be read: {error}", secrets
                    ),
                    failure_stage="infrastructure",
                    failure_mode="result_unreadable",
                )
        finally:
            with self._lock:
                self._running.pop(key, None)
            shutil.rmtree(workdir, ignore_errors=True)

    def cancel(self, key: str) -> bool:
        """Stop what runs under `key`; whether anything did."""
        with self._lock:
            running = self._running.get(key)
        if running is None:
            return False
        running.set()
        return True
