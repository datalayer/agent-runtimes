#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The pinned-file store of the speech models (VOICE.md VO-03, VO-48, VO-49).

Every file of every speech model of the catalogue, laid out as
``<store>/<model id>/<path>`` and checked against the SHA-256 and the size
the catalogue pins. The store is filled **once**, from where each model was
published, and then copied to Datalayer's storage; the browser and the speech
service read it from there and never from a third party's hub.

    python scripts/voice/pin_store.py --store ~/.cache/speech-store [--from DIR]
    python scripts/voice/pin_store.py --store ~/.cache/speech-store --verify

``--from`` takes files already downloaded (any layout) whose hash matches,
instead of downloading them again. ``--verify`` downloads nothing and fails
on a missing or changed file.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import sys
import tarfile
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterator, Optional

import httpx

from agent_runtimes.specs.voices import SPEECH_MODEL_CATALOGUE

#: Where the npm package that ships Silero VAD is published.
NPM_TARBALL = "https://registry.npmjs.org/@ricky0123/vad-web/-/vad-web-{revision}.tgz"


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def upstream_url(model: Dict[str, Any], path: str) -> Optional[str]:
    """Where a file was published: a Hugging Face revision or a GitHub release; None for npm."""
    repository = _repository(model)
    if repository.startswith("https://huggingface.co/"):
        return f"{repository}/resolve/{model['revision']}/{path}"
    if "/releases/tag/" in repository:
        return f"{repository.replace('/releases/tag/', '/releases/download/')}/{path}"
    return None


def _repository(model: Dict[str, Any]) -> str:
    from agentspecs.speech import get_speech_model

    spec = get_speech_model(model["id"])
    if spec is None:
        raise SystemExit(
            f"{model['id']} is in the generated catalogue and not in agentspecs: run make specs"
        )
    return spec.source.repository


def _found(local: Optional[Path], sha256: str, size: int) -> Optional[Path]:
    if local is None:
        return None
    for candidate in local.rglob("*"):
        if (
            candidate.is_file()
            and candidate.stat().st_size == size
            and sha256_of(candidate) == sha256
        ):
            return candidate
    return None


def _npm_file(model: Dict[str, Any], path: str, into: Path) -> None:
    with tempfile.TemporaryDirectory() as scratch:
        tarball = Path(scratch) / "package.tgz"
        _download(NPM_TARBALL.format(revision=model["revision"]), tarball)
        with tarfile.open(tarball) as archive:
            member = archive.getmember(f"package/dist/{path}")
            extracted = archive.extractfile(member)
            if extracted is None:
                raise SystemExit(f"{path} is not a file of the vad-web package")
            into.write_bytes(extracted.read())


def _download(url: str, target: Path) -> None:
    """Copy a published file, once, from where it was published (HTTPS only)."""
    if not url.startswith("https://"):
        raise SystemExit(f"{url} is not an HTTPS address: refused.")
    with httpx.stream("GET", url, follow_redirects=True, timeout=120.0) as answered:
        answered.raise_for_status()
        with target.open("wb") as stream:
            for block in answered.iter_bytes(1 << 20):
                stream.write(block)


def files() -> Iterator[tuple[Dict[str, Any], Dict[str, Any]]]:
    for model in SPEECH_MODEL_CATALOGUE.values():
        for item in model["files"]:
            yield model, item


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--store", type=Path, required=True)
    parser.add_argument("--from", dest="local", type=Path, default=None)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    problems = []
    total = 0
    for model, item in files():
        target = args.store / model["id"] / item["path"]
        total += item["size"]
        if (
            target.is_file()
            and target.stat().st_size == item["size"]
            and sha256_of(target) == item["sha256"]
        ):
            continue
        if args.verify:
            problems.append(
                f"{model['id']}/{item['path']} is missing or does not match its pin"
            )
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        local = _found(args.local, item["sha256"], item["size"])
        if local is not None:
            shutil.copyfile(local, target)
        else:
            url = upstream_url(model, item["path"])
            print(f"downloading {model['id']}/{item['path']}", flush=True)
            if url is None:
                _npm_file(model, item["path"], target)
            else:
                _download(url, target)
        if sha256_of(target) != item["sha256"]:
            target.unlink()
            problems.append(
                f"{model['id']}/{item['path']} was published with another hash: refused"
            )
    for problem in problems:
        print(problem, file=sys.stderr)
    if not problems:
        print(
            f"{args.store}: {sum(1 for _ in files())} files, {total / 1e6:.0f} MB, every one as pinned"
        )
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
