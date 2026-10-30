# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The first process of a sandbox, run with `python -I -S` and the standard library.

Stands alone on purpose: it imports nothing of this package, so nothing of the
service's own environment is loaded before the limits hold. It takes one JSON
argument, sets the limits, moves into new namespaces, and execs what it was
asked to run. Any failure to isolate exits `REFUSED`: nothing is run without
its sandbox.
"""

from __future__ import annotations

import ctypes
import json
import os
import resource
import signal
import sys

REFUSED = 125

CLONE_NEWNS = 0x00020000
CLONE_NEWIPC = 0x08000000
CLONE_NEWUSER = 0x10000000
CLONE_NEWPID = 0x20000000
CLONE_NEWNET = 0x40000000
MS_RDONLY = 1
MS_NOSUID = 2
MS_NODEV = 4
MS_REMOUNT = 32
MS_BIND = 4096
MS_REC = 16384
MS_PRIVATE = 1 << 18
PR_SET_PDEATHSIG = 1
PR_SET_NO_NEW_PRIVS = 38

libc = ctypes.CDLL(None, use_errno=True)


def refuse(what: str) -> None:
    os.write(2, f"sandbox-refused: {what}\n".encode())
    os._exit(REFUSED)


def checked(result: int, what: str) -> None:
    if result != 0:
        refuse(f"{what}: {os.strerror(ctypes.get_errno())}")


def mount(source: str, target: str, kind: str | None, flags: int, data: str | None = None) -> None:
    checked(
        libc.mount(
            source.encode(),
            target.encode(),
            kind.encode() if kind else None,
            flags,
            data.encode() if data else None,
        ),
        f"mount {target}",
    )


def write(path: str, text: str) -> None:
    with open(path, "w") as handle:
        handle.write(text)


def isolate(config: dict) -> None:
    uid, gid = os.getuid(), os.getgid()
    flags = CLONE_NEWUSER | CLONE_NEWNS | CLONE_NEWIPC | CLONE_NEWPID
    if config["network"] == "none":
        flags |= CLONE_NEWNET
    if config.get("refuse"):
        refuse("isolation refused for a test")
    checked(libc.unshare(flags), "unshare")
    try:
        write("/proc/self/setgroups", "deny")
        write("/proc/self/uid_map", f"{uid} {uid} 1")
        write("/proc/self/gid_map", f"{gid} {gid} 1")
    except OSError as error:
        refuse(f"id map: {error}")
    mount("none", "/", None, MS_REC | MS_PRIVATE)
    for path in config["hidden_paths"]:
        if os.path.isdir(path):
            mount("tmpfs", path, "tmpfs", MS_NOSUID | MS_NODEV, "size=1m,nr_inodes=64")
    for path in config["read_only"]:
        mount(path, path, None, MS_BIND | MS_REC)
        mount(path, path, None, MS_BIND | MS_REMOUNT | MS_RDONLY | MS_NOSUID | MS_NODEV)


def limit(config: dict) -> None:
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    # The soft limit ends a process that lets it; the hard one ends the rest.
    resource.setrlimit(resource.RLIMIT_CPU, (config["cpu_seconds"], config["cpu_seconds"] + 2))
    resource.setrlimit(resource.RLIMIT_AS, (config["memory_bytes"], config["memory_bytes"]))
    resource.setrlimit(resource.RLIMIT_FSIZE, (config["max_bytes"], config["max_bytes"]))
    resource.setrlimit(resource.RLIMIT_NOFILE, (config["open_files"], config["open_files"]))
    # Counted per user namespace, so what else this uid runs does not spend it.
    resource.setrlimit(resource.RLIMIT_NPROC, (config["processes"], config["processes"]))


def main() -> None:
    config = json.loads(sys.argv[1])
    checked(libc.prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0), "no_new_privs")
    isolate(config)
    limit(config)
    # A new PID namespace takes effect on the next fork: that child is its
    # pid 1, and every process under it dies with it, whatever it detached.
    child = os.fork()
    if child == 0:
        checked(libc.prctl(PR_SET_PDEATHSIG, signal.SIGKILL, 0, 0, 0), "pdeathsig")
        os.chdir(config["workdir"])
        os.umask(0o077)
        os.execve(config["argv"][0], config["argv"], config["env"])
    while True:
        try:
            _, status = os.waitpid(child, 0)
        except InterruptedError:
            continue
        break
    if os.WIFSIGNALED(status):
        used = resource.getrusage(resource.RUSAGE_CHILDREN)
        if used.ru_utime + used.ru_stime >= config["cpu_seconds"]:
            os._exit(128 + signal.SIGXCPU)
        os._exit(128 + os.WTERMSIG(status))
    os._exit(os.WEXITSTATUS(status))


main()
