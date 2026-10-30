# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A framework's task environment, on the runtime's side.

One provider serves every framework. A task that names an image or a Dockerfile
becomes a Datalayer Environment, built by the Environments pipeline, and each
trial gets a sandbox launched from it. The framework reaches that sandbox the
same way whichever framework it is: a client in the adapter's sandbox
(`_providers/_environment_client.py`), through the relay, to a backend held
here, so the framework holds no address and no credential.

Three things live here: `environment_of`, which maps what a task declares onto
an Environment or says why it cannot; `TaskEnvironmentRef`, how a service names
the sandbox of one trial; and `RuntimeBackend`, the backend for a Datalayer
sandbox, which runs commands through the runtime's own execute route.
"""

from __future__ import annotations

import base64
import hashlib
import json
from typing import Any, Mapping, Protocol, Sequence

import httpx
from pydantic import BaseModel, ConfigDict

__all__ = [
    "EnvironmentRefused",
    "RuntimeBackend",
    "TaskEnvironmentBackend",
    "TaskEnvironmentRef",
    "environment_of",
    "environment_name_of",
]

#: What every Environment here is built on, until a task says otherwise.
PYTHON_VERSION = "3.12"
BASE_REF = "python:3.12"
BASE_CHANNEL = "stable"
#: Where the sandbox's answer starts in what the kernel printed.
ANSWER_MARK = "<<datalayer-task-environment>>"
EXECUTE_PATH = "/api/v1/sandbox/execute"
#: What an operation may take past its own timeout, to come back.
GRACE_SECONDS = 30.0


class EnvironmentRefused(ValueError):
    """What a task declares cannot be built here, and why."""


class TaskEnvironmentRef(BaseModel):
    """The sandbox of one trial, as a service names it to the runtime."""

    model_config = ConfigDict(extra="forbid")

    ingress: str
    token: str
    #: The agent the sandbox's execute route answers for, when it has one.
    agent_id: str = ""


class TaskEnvironmentBackend(Protocol):
    """What the relay asks of a task's environment."""

    def exec(
        self,
        argv: Sequence[str],
        *,
        stdin: bytes = b"",
        cwd: str | None = None,
        env: Mapping[str, str] | None = None,
        timeout: float | None = None,
        user: str | None = None,
    ) -> dict[str, Any]:
        """Run one command; `{returncode, stdout, stderr}`."""
        ...

    def write(self, path: str, content: bytes) -> None:
        """Write one file."""
        ...

    def read(self, path: str) -> bytes:
        """Read one file; `FileNotFoundError` when it is not there."""
        ...


def environment_name_of(document: Mapping[str, Any]) -> str:
    """A name from what is built, so the same task builds once."""
    canonical = json.dumps(document, sort_keys=True, separators=(",", ":"))
    return f"benchmark-task-{hashlib.sha256(canonical.encode()).hexdigest()[:16]}"


def environment_of(
    *, image: str = "", dockerfile: str = "", extra_files: Sequence[str] = ()
) -> dict[str, Any]:
    """The Environment a task needs, as `POST /environments` takes it.

    A prebuilt image is imported; a Dockerfile is built. A Dockerfile that
    copies files in needs a build context, which this does not upload yet, so
    such a task is refused here rather than failing halfway through a build.
    """
    if image and dockerfile:
        raise EnvironmentRefused("It names both an image and a Dockerfile.")
    if not image and not dockerfile:
        raise EnvironmentRefused("It names neither an image nor a Dockerfile.")
    if extra_files:
        raise EnvironmentRefused(
            f"Its Dockerfile has a build context ({', '.join(sorted(extra_files))}), which is not uploaded yet."
        )
    build: dict[str, Any] = (
        {"source": "image", "image": {"reference": image}}
        if image
        else {"source": "dockerfile", "dockerfile": {"content": dockerfile}}
    )
    spec = {
        "language": {"name": "python", "version": PYTHON_VERSION},
        "base": {"ref": BASE_REF, "channel": BASE_CHANNEL},
        "build": build,
    }
    return {
        "apiVersion": "environments.datalayer.io/v1alpha1",
        "kind": "Environment",
        "metadata": {
            "name": environment_name_of(spec),
            "labels": {"purpose": "benchmark-task"},
        },
        "spec": spec,
    }


#: Runs in the sandbox's kernel. One operation, its answer printed after a mark.
_REMOTE = """
import base64, json, os, subprocess
_request = json.loads(base64.b64decode({request!r}))
_answer = {{}}
try:
    if _request["op"] == "exec":
        _done = subprocess.run(
            _request["argv"], input=base64.b64decode(_request["stdin"]), cwd=_request["cwd"], capture_output=True,
            env={{**os.environ, **_request["env"]}}, timeout=_request["timeout"],
        )
        _answer = {{"returncode": _done.returncode, "stdout": _done.stdout.decode("utf-8", "replace"), "stderr": _done.stderr.decode("utf-8", "replace")}}
    elif _request["op"] == "write":
        os.makedirs(os.path.dirname(_request["path"]) or ".", exist_ok=True)
        with open(_request["path"], "wb") as _file:
            _file.write(base64.b64decode(_request["content"]))
    else:
        with open(_request["path"], "rb") as _file:
            _answer = {{"content": base64.b64encode(_file.read()).decode()}}
except FileNotFoundError as _error:
    _answer = {{"missing": str(_error)}}
except PermissionError as _error:
    _answer = {{"forbidden": str(_error)}}
except subprocess.TimeoutExpired:
    _answer = {{"returncode": 124, "stdout": "", "stderr": "timed out"}}
print({mark!r} + json.dumps(_answer))
"""


class RuntimeBackend:
    """A Datalayer sandbox: commands through the runtime's own execute route."""

    def __init__(self, reference: TaskEnvironmentRef) -> None:
        """Bind one sandbox."""
        self.reference = reference

    def _call(
        self, request: dict[str, Any], *, timeout: float | None
    ) -> dict[str, Any]:
        """Run one operation in the sandbox's kernel; its answer."""
        from agent_runtimes.client.agent_client import build_agent_runtimes_base_url

        code = _REMOTE.format(
            request=base64.b64encode(json.dumps(request).encode()).decode(),
            mark=ANSWER_MARK,
        )
        body = {
            "code": code,
            "timeout": timeout,
            **(
                {"agent_id": self.reference.agent_id} if self.reference.agent_id else {}
            ),
        }
        url = f"{build_agent_runtimes_base_url(self.reference.ingress).rstrip('/')}{EXECUTE_PATH}"
        response = httpx.post(
            url,
            json=body,
            headers={"Authorization": f"Bearer {self.reference.token}"},
            timeout=(timeout or 300.0) + GRACE_SECONDS,
        )
        response.raise_for_status()
        said = response.json()
        stdout = str(said.get("stdout") or "")
        if ANSWER_MARK not in stdout:
            raise RuntimeError(
                str(
                    said.get("error")
                    or said.get("stderr")
                    or "the sandbox left no answer"
                )
            )
        answer = json.loads(stdout.rsplit(ANSWER_MARK, 1)[1])
        if "missing" in answer:
            raise FileNotFoundError(answer["missing"])
        if "forbidden" in answer:
            raise PermissionError(answer["forbidden"])
        return answer

    def exec(
        self,
        argv: Sequence[str],
        *,
        stdin: bytes = b"",
        cwd: str | None = None,
        env: Mapping[str, str] | None = None,
        timeout: float | None = None,
        user: str | None = None,
    ) -> dict[str, Any]:
        """Run one command in the sandbox, as its own user."""
        if user not in (None, "", "root"):
            raise PermissionError(
                f"A Datalayer sandbox runs as its own user, not {user}."
            )
        return self._call(
            {
                "op": "exec",
                "argv": list(argv),
                "stdin": base64.b64encode(stdin).decode(),
                "cwd": cwd,
                "env": dict(env or {}),
                "timeout": timeout,
            },
            timeout=timeout,
        )

    def write(self, path: str, content: bytes) -> None:
        """Write one file in the sandbox."""
        self._call(
            {
                "op": "write",
                "path": path,
                "content": base64.b64encode(content).decode(),
            },
            timeout=60.0,
        )

    def read(self, path: str) -> bytes:
        """Read one file of the sandbox."""
        return base64.b64decode(
            self._call({"op": "read", "path": path}, timeout=60.0)["content"]
        )
