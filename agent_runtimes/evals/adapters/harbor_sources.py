# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Fetch a Harbor source from Git or Harbor's registry, on the person's machine.

A sandbox has no network and a service fetches no address it was handed, so a
remote source becomes what every source is: an archive, kept by its digest and
read in a sandbox. Fetching happens where the person's own network and
credentials are, pinned to what cannot move, and what it came from is written
beside it as `harbor-origin.json`, which a reproduction reads.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess  # nosec B404 - git and harbor, with arguments built here
from pathlib import Path
from typing import Any, Callable

__all__ = ["ORIGIN_FILE", "SourceNotFetched", "fetch_git", "fetch_registry"]

ORIGIN_FILE = "harbor-origin.json"
_COMMIT = re.compile(r"^[0-9a-f]{40}$")
_GIT_SCHEMES = ("https://", "ssh://", "git@", "file://")
_REGISTRY_REFERENCE = re.compile(r"^[\w.-]+/[\w.-]+@(sha256:[0-9a-f]{64}|\d+)$")
_LEGACY_REFERENCE = re.compile(r"^[\w.-]+@[\w.-]+$")
Runner = Callable[..., "subprocess.CompletedProcess[str]"]


class SourceNotFetched(ValueError):
    """A remote source could not be fetched, or is not pinned."""


def _run(run: Runner, command: list[str], *, cwd: Path, what: str) -> None:
    """Run one command, and say what failed."""
    try:
        done = run(command, cwd=str(cwd), capture_output=True, text=True, check=False)
    except FileNotFoundError:
        raise SourceNotFetched(
            f"{what} needs `{command[0]}` on this machine."
        ) from None
    if done.returncode != 0:
        raise SourceNotFetched(f"{what} failed: {(done.stderr or done.stdout)[-500:]}")


def _inside(root: Path, path: str) -> Path:
    """A folder of the fetched tree, which stays inside it."""
    chosen = (root / path).resolve() if path else root.resolve()
    if not chosen.is_relative_to(root.resolve()):
        raise SourceNotFetched(f"{path} is outside the source.")
    if not chosen.is_dir():
        raise SourceNotFetched(f"{path} is not a folder of the source.")
    return chosen


def _with_origin(root: Path, origin: dict[str, Any]) -> Path:
    (root / ORIGIN_FILE).write_text(json.dumps(origin, indent=2, sort_keys=True) + "\n")
    return root


def fetch_git(
    url: str,
    commit: str,
    into: Path,
    *,
    path: str = "",
    run: Runner = subprocess.run,
) -> Path:
    """One commit of a repository, without its history: the folder to pack.

    A commit, not a branch or a tag, because what is kept must say what ran.
    """
    if not _COMMIT.match(commit):
        raise SourceNotFetched(
            f"{commit} is not a full commit id: a branch or a tag can move."
        )
    if not url.startswith(_GIT_SCHEMES):
        raise SourceNotFetched(f"{url} is not an https, ssh or file repository.")
    git = ["git", "-c", "protocol.ext.allow=never"]
    into.mkdir(parents=True, exist_ok=True)
    _run(run, [*git, "init", "-q"], cwd=into, what="Preparing the clone")
    _run(
        run,
        [*git, "fetch", "-q", "--depth", "1", "--", url, commit],
        cwd=into,
        what=f"Fetching {commit}",
    )
    _run(
        run,
        [*git, "checkout", "-q", "--detach", "FETCH_HEAD"],
        cwd=into,
        what=f"Checking out {commit}",
    )
    shutil.rmtree(into / ".git")
    return _with_origin(
        _inside(into, path), {"kind": "git", "url": url, "commit": commit, "path": path}
    )


def fetch_registry(reference: str, into: Path, *, run: Runner = subprocess.run) -> Path:
    """A task or dataset of Harbor's registry: the folder to pack.

    By its digest or its version number: `latest` can move, so it is refused.
    """
    if not (
        _REGISTRY_REFERENCE.match(reference)
        or (_LEGACY_REFERENCE.match(reference) and not reference.endswith("@latest"))
    ):
        raise SourceNotFetched(
            f"{reference} is not pinned: name it as org/name@sha256:… or org/name@<version>."
        )
    into.mkdir(parents=True, exist_ok=True)
    _run(
        run,
        ["harbor", "download", reference, "--output-dir", str(into), "--export"],
        cwd=into,
        what=f"Downloading {reference}",
    )
    return _with_origin(into, {"kind": "registry", "reference": reference})
