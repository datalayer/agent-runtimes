# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The sandbox an adapter's framework code runs in, measured on the real kernel.

Nothing here is doubled: each test starts a real process through the runner
and reads what the kernel let it do.
"""

from __future__ import annotations

import json
import socket
import sys
import threading
import time
from pathlib import Path

import pytest

from agent_runtimes.evals.adapters.sandbox import (
    SandboxCancelled,
    SandboxExceeded,
    SandboxPolicy,
    SandboxUnavailable,
    isolation_available,
    run_sandboxed,
)

pytestmark = pytest.mark.skipif(
    not isolation_available(),
    reason="this kernel refuses unprivileged user namespaces",
)

PYTHON = sys.executable


def _run(tmp_path: Path, code: str, *, policy: SandboxPolicy | None = None, **kwargs):
    workdir = tmp_path / "work"
    return run_sandboxed(
        [PYTHON, "-I", "-S", "-c", code],
        workdir=workdir,
        policy=policy or SandboxPolicy(wall_seconds=30, cpu_seconds=30),
        **kwargs,
    )


def test_a_process_runs_and_answers_on_stdout(tmp_path):
    outcome = _run(
        tmp_path, "import sys; print(sys.stdin.read().upper())", stdin=b"asked"
    )
    assert outcome.returncode == 0
    assert outcome.stdout.strip() == b"ASKED"


def test_no_network_is_the_default(tmp_path):
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    port = listener.getsockname()[1]
    code = (
        "import socket\n"
        "s = socket.socket()\n"
        "s.settimeout(3)\n"
        f"print(s.connect_ex(('127.0.0.1', {port})))\n"
    )
    try:
        outcome = _run(tmp_path, code)
    finally:
        listener.close()
    assert outcome.returncode == 0, outcome.stderr
    # The namespace has a loopback that is down and no route anywhere.
    assert outcome.stdout.strip() != b"0"


def test_the_boundary_network_is_only_what_a_policy_grants(tmp_path):
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    port = listener.getsockname()[1]
    code = (
        "import socket\n"
        "s = socket.socket()\n"
        "s.settimeout(3)\n"
        f"print(s.connect_ex(('127.0.0.1', {port})))\n"
    )
    try:
        outcome = _run(
            tmp_path,
            code,
            policy=SandboxPolicy(network="boundary", wall_seconds=30, cpu_seconds=30),
        )
    finally:
        listener.close()
    assert outcome.stdout.strip() == b"0", outcome.stderr


def test_the_environment_is_only_what_was_handed_in(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "must-not-be-seen")
    code = "import json, os; print(json.dumps(dict(os.environ)))"
    outcome = _run(tmp_path, code, env={"NAMED": "value"})
    seen = json.loads(outcome.stdout)
    assert seen["NAMED"] == "value"
    assert "ANTHROPIC_API_KEY" not in seen


def test_wall_time_is_bounded(tmp_path):
    started = time.monotonic()
    with pytest.raises(SandboxExceeded) as refused:
        _run(
            tmp_path,
            "import time; time.sleep(60)",
            policy=SandboxPolicy(wall_seconds=1, cpu_seconds=30),
        )
    assert refused.value.bound == "time"
    assert time.monotonic() - started < 10


def test_cpu_is_bounded(tmp_path):
    with pytest.raises(SandboxExceeded) as refused:
        _run(
            tmp_path,
            "while True:\n    pass",
            policy=SandboxPolicy(wall_seconds=30, cpu_seconds=1),
        )
    assert refused.value.bound == "cpu"


def test_memory_is_bounded(tmp_path):
    outcome = _run(
        tmp_path,
        "try:\n    x = bytearray(1024 * 1024 * 1024)\n    print('allocated')\nexcept MemoryError:\n    print('refused')",
        policy=SandboxPolicy(
            wall_seconds=30, cpu_seconds=30, memory_bytes=256 * 1024 * 1024
        ),
    )
    assert outcome.stdout.strip() == b"refused"


def test_one_file_is_bounded(tmp_path):
    with pytest.raises(SandboxExceeded) as refused:
        _run(
            tmp_path,
            "open('big', 'wb').write(b'x' * (64 * 1024 * 1024))",
            policy=SandboxPolicy(
                wall_seconds=30, cpu_seconds=30, max_bytes=1024 * 1024
            ),
        )
    assert refused.value.bound == "files"


def test_the_number_of_files_is_bounded(tmp_path):
    code = "import os\nfor i in range(200):\n    open(f'f{i}', 'w').close()\nimport time; time.sleep(5)"
    with pytest.raises(SandboxExceeded) as refused:
        _run(
            tmp_path,
            code,
            policy=SandboxPolicy(wall_seconds=30, cpu_seconds=30, max_files=20),
        )
    assert refused.value.bound == "files"


def test_a_process_tree_dies_with_the_sandbox(tmp_path):
    marker = tmp_path / "survived"
    code = (
        "import os, time\n"
        "if os.fork() == 0:\n"
        "    os.setsid()\n"
        "    time.sleep(3)\n"
        f"    open({str(marker)!r}, 'w').close()\n"
        "    os._exit(0)\n"
        "time.sleep(60)\n"
    )
    with pytest.raises(SandboxExceeded):
        _run(tmp_path, code, policy=SandboxPolicy(wall_seconds=1, cpu_seconds=30))
    time.sleep(3.5)
    assert not marker.exists()


def test_a_cancel_stops_it_within_a_tick(tmp_path):
    cancel = threading.Event()
    threading.Timer(0.5, cancel.set).start()
    started = time.monotonic()
    with pytest.raises(SandboxCancelled):
        _run(tmp_path, "import time; time.sleep(60)", cancel=cancel)
    assert time.monotonic() - started < 5


def test_the_source_is_read_only_inside(tmp_path):
    source = tmp_path / "source"
    source.mkdir()
    (source / "task.py").write_text("original")
    code = (
        "import os\n"
        f"p = {str(source / 'task.py')!r}\n"
        "try:\n"
        "    open(p, 'a').write('changed')\n"
        "    print('written')\n"
        "except OSError as e:\n"
        "    print('refused')\n"
    )
    outcome = _run(tmp_path, code, read_only=[source])
    assert outcome.stdout.strip() == b"refused"
    assert (source / "task.py").read_text() == "original"


def test_a_hidden_path_is_empty_inside(tmp_path):
    hidden = tmp_path / "shared-folder"
    hidden.mkdir()
    (hidden / "private.txt").write_text("the person's")
    code = f"import os; print(os.listdir({str(hidden)!r}))"
    outcome = _run(
        tmp_path,
        code,
        policy=SandboxPolicy(
            wall_seconds=30, cpu_seconds=30, hidden_paths=(str(hidden),)
        ),
    )
    assert outcome.stdout.strip() == b"[]", outcome.stderr


def test_it_runs_with_no_capability_left(tmp_path):
    code = (
        "for line in open('/proc/self/status'):\n"
        "    if line.startswith('CapEff'):\n"
        "        print(line.split()[1])\n"
    )
    outcome = _run(tmp_path, code)
    assert int(outcome.stdout.strip(), 16) == 0


def test_a_kernel_that_refuses_isolation_refuses_the_run(tmp_path, monkeypatch):
    # Fail closed: no sandbox is no run, never a run without one.
    from agent_runtimes.evals.adapters import sandbox

    monkeypatch.setattr(sandbox, "_BOOTSTRAP_FLAGS_FOR_TEST", "refuse", raising=False)
    with pytest.raises(SandboxUnavailable):
        _run(tmp_path, "print('ran')")


def test_a_policy_refuses_values_that_are_no_bound():
    with pytest.raises(ValueError):
        SandboxPolicy(wall_seconds=0)
    with pytest.raises(ValueError):
        SandboxPolicy(network="everywhere")
