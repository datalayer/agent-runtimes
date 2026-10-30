# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The sandbox framework code runs in: `run_sandboxed`.

An external definition is somebody's code. It runs here, on a runtime's own
pod, and never on a service: one process tree in new user, mount, PID and IPC
namespaces, with no network namespace of the pod's unless the policy grants
it, an environment of exactly what was handed in, no capability, the source
read-only, the person's folders hidden, and bounds on files, CPU, memory and
time. The kernel holds the bounds; a watchdog here holds the two it has no
limit for (the number of files, and the bytes across them) and the wall clock.

Failing closed: a kernel that refuses the namespaces refuses the run
(`SandboxUnavailable`). A definition that overruns a bound raises
`SandboxExceeded`, naming it, so a failure of the framework and a failure of
the sandbox are not the same answer.
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Mapping, Sequence

__all__ = [
    "INFERENCE_PORT",
    "SandboxCancelled",
    "SandboxExceeded",
    "SandboxOutcome",
    "SandboxPolicy",
    "SandboxUnavailable",
    "isolation_available",
    "run_sandboxed",
]

_BOOTSTRAP = Path(__file__).with_name("_bootstrap.py")
#: What the first process exits with when it could not isolate itself.
_REFUSED = 125
_WATCH_SECONDS = 0.1
#: How often the files are counted, in ticks of the watch.
_COUNT_EVERY = 5
#: What is kept of stdout and of stderr; the files themselves are bounded too.
_MAX_CAPTURE_BYTES = 64 * 1024 * 1024
#: Where an `inference` sandbox finds the relay, on its own loopback.
INFERENCE_PORT = 8317
#: Set by a test to make the first process refuse, as a kernel would.
_BOOTSTRAP_FLAGS_FOR_TEST = ""

#: Where a runtime pod holds what the sandbox has no business reading: the
#: person's folders, and the pod's own service credentials.
DEFAULT_HIDDEN_PATHS: tuple[str, ...] = (
    "/home/datalayer",
    "/mnt",
    "/datalayer-shared",
    "/var/run/secrets",
    "/run/secrets",
)


class SandboxUnavailable(RuntimeError):
    """This kernel will not isolate the process, so nothing was run."""


class SandboxCancelled(RuntimeError):
    """The run was cancelled and the process tree is gone."""


class SandboxExceeded(RuntimeError):
    """A bound was overrun and the process tree is gone."""

    def __init__(self, bound: str, message: str) -> None:
        super().__init__(message)
        self.bound = bound


@dataclass(frozen=True)
class SandboxPolicy:
    """What a sandbox may do. The defaults are the policy a launch starts from.

    `network`: `none`; `inference`, nothing but the relay to ai-inference, on
    the sandbox's own loopback; or `boundary`, the runtime pod's egress boundary.
    `secrets` holds names only; their values are resolved for one execution
    and are never part of a policy.
    """

    network: Literal["none", "inference", "boundary"] = "none"
    wall_seconds: float = 300.0
    cpu_seconds: int = 300
    memory_bytes: int = 4 * 1024 * 1024 * 1024
    max_files: int = 4096
    max_bytes: int = 256 * 1024 * 1024
    open_files: int = 1024
    processes: int = 256
    secrets: tuple[str, ...] = ()
    hidden_paths: tuple[str, ...] = DEFAULT_HIDDEN_PATHS

    def __post_init__(self) -> None:
        if self.network not in ("none", "inference", "boundary"):
            raise ValueError(f"no such network policy: {self.network}")
        for name in (
            "wall_seconds",
            "cpu_seconds",
            "memory_bytes",
            "max_files",
            "max_bytes",
            "open_files",
            "processes",
        ):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name} must be a positive bound")


@dataclass(frozen=True)
class SandboxOutcome:
    """What one sandboxed process left behind."""

    returncode: int
    stdout: bytes
    stderr: bytes
    seconds: float = 0.0
    bytes_written: int = 0
    files_written: int = 0
    argv: tuple[str, ...] = field(default_factory=tuple)


def isolation_available() -> bool:
    """Whether this kernel gives an unprivileged process the namespaces."""
    with tempfile.TemporaryDirectory(prefix="adapter-probe-") as scratch:
        try:
            run_sandboxed(
                [sys.executable, "-I", "-S", "-c", "pass"],
                workdir=Path(scratch) / "work",
                policy=SandboxPolicy(wall_seconds=10, cpu_seconds=10),
            )
        except SandboxUnavailable:
            return False
    return True


def _count(workdir: Path) -> tuple[int, int]:
    files, size = 0, 0
    for root, _, names in os.walk(workdir):
        files += len(names)
        for name in names:
            try:
                size += os.lstat(os.path.join(root, name)).st_size
            except OSError:
                continue
    return files, size


def _hidden(policy: SandboxPolicy, keep: Sequence[Path]) -> list[str]:
    """The hidden paths that do not hold what the process needs: its
    interpreter's prefix or a directory it was given."""
    needed = [Path(sys.prefix).resolve(), *(Path(path).resolve() for path in keep)]
    hidden = []
    for path in policy.hidden_paths:
        target = Path(path)
        if not any(item == target or target in item.parents for item in needed):
            hidden.append(path)
    return hidden


def _kill(process: subprocess.Popen) -> None:
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait()


def run_sandboxed(
    argv: Sequence[str],
    *,
    workdir: Path,
    policy: SandboxPolicy,
    stdin: bytes = b"",
    env: Mapping[str, str] | None = None,
    read_only: Sequence[Path] = (),
    cancel: threading.Event | None = None,
    relay: Path | None = None,
) -> SandboxOutcome:
    """Run one command in a new sandbox, to its end or to a bound.

    `workdir` is created and is the one place it may write. `env` is the
    whole environment. `cancel`, set from any thread, ends it within a tick.
    `relay` is the unix socket an `inference` sandbox's loopback reaches.
    """
    if policy.network == "inference" and relay is None:
        raise ValueError("an inference sandbox needs its relay")
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    workdir.chmod(0o700)
    environment = {
        "HOME": str(workdir),
        "PATH": "/usr/bin:/bin",
        "TMPDIR": str(workdir),
        **(env or {}),
    }
    config = {
        "network": policy.network,
        "relay": str(relay) if relay else "",
        "inference_port": INFERENCE_PORT,
        "cpu_seconds": int(policy.cpu_seconds),
        "memory_bytes": int(policy.memory_bytes),
        "max_bytes": int(policy.max_bytes),
        "open_files": int(policy.open_files),
        "processes": int(policy.processes),
        "hidden_paths": _hidden(policy, [workdir, *read_only]),
        "read_only": [str(path) for path in read_only],
        "workdir": str(workdir),
        "argv": list(argv),
        "env": environment,
        "refuse": _BOOTSTRAP_FLAGS_FOR_TEST == "refuse",
    }
    started = time.monotonic()
    with (
        tempfile.TemporaryFile() as out,
        tempfile.TemporaryFile() as err,
        tempfile.TemporaryFile() as given,
    ):
        given.write(stdin)
        given.seek(0)
        process = subprocess.Popen(
            [sys.executable, "-I", "-S", str(_BOOTSTRAP), json.dumps(config)],
            stdin=given,
            stdout=out,
            stderr=err,
            env={},
            cwd=str(workdir),
            start_new_session=True,
        )
        ticks = 0
        try:
            while process.poll() is None:
                time.sleep(_WATCH_SECONDS)
                ticks += 1
                if cancel is not None and cancel.is_set():
                    _kill(process)
                    raise SandboxCancelled(
                        "the run was cancelled and its sandbox stopped"
                    )
                if time.monotonic() - started >= policy.wall_seconds:
                    _kill(process)
                    raise SandboxExceeded(
                        "time",
                        f"the sandbox ran past its {policy.wall_seconds:g} seconds",
                    )
                if ticks % _COUNT_EVERY == 0:
                    files, size = _count(workdir)
                    if files > policy.max_files or size >= policy.max_bytes:
                        _kill(process)
                        raise SandboxExceeded(
                            "files",
                            f"the sandbox wrote {files} files and {size} bytes; it may write {policy.max_files} and {policy.max_bytes}",
                        )
        except BaseException:
            if process.poll() is None:
                _kill(process)
            raise
        files, size = _count(workdir)
        out.seek(0)
        err.seek(0)
        stdout, stderr = out.read(_MAX_CAPTURE_BYTES), err.read(_MAX_CAPTURE_BYTES)
    returncode = int(process.returncode)
    seconds = time.monotonic() - started
    if returncode == _REFUSED and stderr.startswith(b"sandbox-refused:"):
        raise SandboxUnavailable(stderr.decode("utf-8", "replace").strip())
    if returncode == 128 + signal.SIGXCPU:
        raise SandboxExceeded(
            "cpu", f"the sandbox spent its {policy.cpu_seconds} seconds of CPU"
        )
    # A file stopped at the limit is the limit reached, whatever the process
    # made of the error it got.
    if (
        returncode == 128 + signal.SIGXFSZ
        or files > policy.max_files
        or size >= policy.max_bytes
    ):
        raise SandboxExceeded(
            "files",
            f"the sandbox wrote {files} files and {size} bytes; it may write {policy.max_files} and {policy.max_bytes}",
        )
    return SandboxOutcome(
        returncode=returncode,
        stdout=stdout,
        stderr=stderr,
        seconds=seconds,
        bytes_written=size,
        files_written=files,
        argv=tuple(str(item) for item in argv),
    )
