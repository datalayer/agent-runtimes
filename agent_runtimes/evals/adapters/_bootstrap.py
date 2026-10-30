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
import fcntl
import json
import os
import resource
import selectors
import signal
import socket
import struct
import sys
from typing import cast

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
SIOCGIFFLAGS = 0x8913
SIOCSIFFLAGS = 0x8914
IFF_UP = 0x1

libc = ctypes.CDLL(None, use_errno=True)


def refuse(what: str) -> None:
    """Stop here, saying what could not be isolated."""
    os.write(2, f"sandbox-refused: {what}\n".encode())
    os._exit(REFUSED)


def checked(result: int, what: str) -> None:
    """Refuse if a libc call failed."""
    if result != 0:
        refuse(f"{what}: {os.strerror(ctypes.get_errno())}")


def mount(
    source: str, target: str, kind: str | None, flags: int, data: str | None = None
) -> None:
    """One mount, or the refusal."""
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
    """Write one file of `/proc`."""
    with open(path, "w") as handle:
        handle.write(text)


def isolate(config: dict) -> None:
    """Move into new namespaces and hide what the sandbox has no business reading."""
    uid, gid = os.getuid(), os.getgid()
    flags = CLONE_NEWUSER | CLONE_NEWNS | CLONE_NEWIPC | CLONE_NEWPID
    if config["network"] in ("none", "inference"):
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
    if config["root_dirs"]:
        try:
            own_root(config)
        except OSError as error:
            refuse(f"a root of its own: {error}")


#: What a root of the sandbox's own holds of the system, read-only.
SYSTEM_DIRS = ("/usr", "/bin", "/lib", "/lib64", "/sbin", "/etc")
PIVOT_ROOT = 155


def bind(path: str, target: str, *, read_only: bool) -> None:
    """Bind `path` at `target`, read-only when asked; a link stays a link."""
    if os.path.islink(path):
        os.makedirs(os.path.dirname(target), exist_ok=True)
        os.symlink(os.readlink(path), target)
        return
    if os.path.isdir(path):
        os.makedirs(target, exist_ok=True)
    else:
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "a"):
            pass
    mount(path, target, None, MS_BIND | MS_REC)
    if read_only:
        mount(
            path, target, None, MS_BIND | MS_REMOUNT | MS_RDONLY | MS_NOSUID | MS_NODEV
        )


def own_root(config: dict) -> None:
    """A new root: the system read-only, what it was given, the paths its
    framework names (kept under the working directory, where the host reads
    them afterwards), and nothing else of the host.
    """
    workdir = config["workdir"]
    held = os.path.join(workdir, ".root")
    new = f"{workdir}.new-root"
    os.makedirs(held, exist_ok=True)
    os.makedirs(new, exist_ok=True)
    mount("tmpfs", new, "tmpfs", MS_NOSUID | MS_NODEV, "size=16m,nr_inodes=4096")
    # First: what was given may live under it.
    private_tmp = new + "/tmp"  # nosec B108 - a tmpfs of this sandbox's own, in its own root
    os.makedirs(private_tmp, exist_ok=True)
    mount("tmpfs", private_tmp, "tmpfs", MS_NOSUID | MS_NODEV, "size=256m")
    for path in SYSTEM_DIRS:
        if os.path.lexists(path):
            bind(path, new + path, read_only=True)
    for path in [*config["root_keep"], *config["read_only"]]:
        if os.path.exists(path):
            bind(path, new + path, read_only=True)
    bind(workdir, new + workdir, read_only=False)
    for path in config["root_dirs"]:
        inside = held + path
        os.makedirs(inside, exist_ok=True)
        bind(inside, new + path, read_only=False)
    bind("/dev", new + "/dev", read_only=False)
    bind("/proc", new + "/proc", read_only=False)
    os.chdir(new)
    os.makedirs("old-root", exist_ok=True)
    checked(libc.syscall(PIVOT_ROOT, b".", b"old-root"), "pivot_root")
    os.chdir("/")
    checked(libc.umount2(b"/old-root", 2), "umount old root")
    os.rmdir("/old-root")


def loopback_up() -> None:
    """A new network namespace's loopback is down; this is all it will ever have."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as handle:
        request = struct.pack("16sH14x", b"lo", 0)
        flags = struct.unpack("16sH14x", fcntl.ioctl(handle, SIOCGIFFLAGS, request))[1]
        fcntl.ioctl(handle, SIOCSIFFLAGS, struct.pack("16sH14x", b"lo", flags | IFF_UP))


def relay_listener(port: int) -> socket.socket:
    """The one way out of an `inference` sandbox, bound before the limits hold."""
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", port))
    listener.listen(64)
    return listener


def relay_until_exit(listener: socket.socket, path: str, child: int) -> int:
    """Carry the sandbox's loopback to the relay's socket on the host until the
    child ends; its wait status. In this process's main thread: after
    `unshare(CLONE_NEWPID)` no thread can be made, and this process stands
    outside that namespace, so nothing the sandbox runs can signal it.
    """
    selector = selectors.DefaultSelector()
    selector.register(listener, selectors.EVENT_READ, None)

    def drop(one: socket.socket, other: socket.socket) -> None:
        """Close both ends of one connection."""
        for side in (one, other):
            try:
                selector.unregister(side)
            except (KeyError, ValueError):
                pass
            side.close()

    while True:
        ended, status = os.waitpid(child, os.WNOHANG)
        if ended:
            return status
        for key, _ in selector.select(timeout=0.05):
            if key.data is None:
                inner, _address = listener.accept()
                outer = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                try:
                    outer.connect(path)
                except OSError:
                    inner.close()
                    outer.close()
                    continue
                selector.register(inner, selectors.EVENT_READ, outer)
                selector.register(outer, selectors.EVENT_READ, inner)
                continue
            source, target = cast(socket.socket, key.fileobj), key.data
            try:
                chunk = source.recv(65536)
                if chunk:
                    target.sendall(chunk)
                else:
                    drop(source, target)
            except OSError:
                drop(source, target)


def limit(config: dict) -> None:
    """Set the bounds the kernel holds."""
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    # The soft limit ends a process that lets it; the hard one ends the rest.
    resource.setrlimit(
        resource.RLIMIT_CPU, (config["cpu_seconds"], config["cpu_seconds"] + 2)
    )
    resource.setrlimit(
        resource.RLIMIT_AS, (config["memory_bytes"], config["memory_bytes"])
    )
    resource.setrlimit(
        resource.RLIMIT_FSIZE, (config["max_bytes"], config["max_bytes"])
    )
    resource.setrlimit(
        resource.RLIMIT_NOFILE, (config["open_files"], config["open_files"])
    )
    # Counted per user namespace, so what else this uid runs does not spend it.
    resource.setrlimit(
        resource.RLIMIT_NPROC, (config["processes"], config["processes"])
    )


def main() -> None:
    """Isolate, limit, and exec what was asked for."""
    config = json.loads(sys.argv[1])
    checked(libc.prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0), "no_new_privs")
    isolate(config)
    listener = None
    if config["network"] == "inference":
        try:
            loopback_up()
            listener = relay_listener(config["inference_port"])
        except OSError as error:
            refuse(f"the inference loopback: {error}")
    limit(config)
    # A new PID namespace takes effect on the next fork: that child is its
    # pid 1, and every process under it dies with it, whatever it detached.
    child = os.fork()
    if child == 0:
        checked(libc.prctl(PR_SET_PDEATHSIG, signal.SIGKILL, 0, 0, 0), "pdeathsig")
        os.chdir(config["workdir"])
        os.umask(0o077)
        os.execve(config["argv"][0], config["argv"], config["env"])
    if listener is not None:
        status = relay_until_exit(listener, config["relay"], child)
    else:
        _, status = os.waitpid(child, 0)
    if os.WIFSIGNALED(status):
        used = resource.getrusage(resource.RUSAGE_CHILDREN)
        if used.ru_utime + used.ru_stime >= config["cpu_seconds"]:
            os._exit(128 + signal.SIGXCPU)
        os._exit(128 + os.WTERMSIG(status))
    os._exit(os.WEXITSTATUS(status))


main()
