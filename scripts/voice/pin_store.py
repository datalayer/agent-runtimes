#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The pinned-file store of the speech models (VO-03, VO-48, VO-49).

Every file of every speech model of the catalogue, laid out as
``<store>/<provider>/<model id>/<path>`` — as Datalayer's storage keeps them,
``s3://datalayer-models-speech`` behind ``https://models-speech.datalayer.tech`` — and checked against the SHA-256 and the size
the catalogue pins. The store is filled **once**, from where each model was
published, and then copied to Datalayer's storage; the browser and the speech
service read it from there and never from a third party's hub.

    python scripts/voice/pin_store.py --store ~/.cache/voice-work/store [--from DIR]
    python scripts/voice/pin_store.py --store ~/.cache/voice-work/store --verify

``--from`` takes files already downloaded (any layout) whose hash matches,
instead of downloading them again. ``--verify`` downloads no model file and
fails on a missing or changed one.

Beside each model's files the store keeps its licence notices, written from
the catalogue: ``NOTICE`` (the model, where it was published and at which
revision, the licences of its weights and code, its attribution, and its
voices with theirs, SIWIS's CC BY 4.0 among them) and ``LICENSE`` (the full
text of its weights' licence, MIT or Apache-2.0, from SPDX's licence list at a
pinned release, checked by its SHA-256). ``--verify`` fails on a missing or
changed notice too. Copy them to Datalayer's storage with the model files.
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

from agent_runtimes.specs.voices import SPEECH_MODEL_CATALOGUE, VOICE_CATALOGUE

#: Where the npm package that ships Silero VAD is published.
NPM_TARBALL = "https://registry.npmjs.org/@ricky0123/vad-web/-/vad-web-{revision}.tgz"


#: The licence texts written beside the weights: SPDX's licence list at v3.27.0, by SHA-256.
LICENCE_TEXTS: Dict[str, tuple[str, str]] = {
    "MIT": (
        "https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/MIT.txt",
        "b05785f9f18e6716bab63424b11454513b9943a222595b70411009202fc592b5",
    ),
    "Apache-2.0": (
        "https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/Apache-2.0.txt",
        "074e6e32c86a4c0ef8b3ed25b721ca23aca83df277cd88106ef7177c354615ff",
    ),
}

#: The MIT text's template line, given the model's authors.
MIT_COPYRIGHT_TEMPLATE = "Copyright (c) <year> <copyright holders>"


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


def folder_of(model: Dict[str, Any]) -> str:
    """Where a model's files are kept: `<provider>/<model id>`, as Datalayer's storage keeps them (VO-48)."""
    return f"{model['provider']}/{model['id']}"


def notice_of(model: Dict[str, Any]) -> str:
    """The model's NOTICE, from the catalogue: what it is, where from, under which licences, and its voices."""
    licence = model["licence"]
    lines = [
        f"{model['name']} ({model['id']}), as kept by Datalayer under {folder_of(model)}/",
        "",
        f"Published by: {model['provider']}, {model['upstream']}",
        f"These files: {_repository(model)} at revision {model['revision']}",
        f"Licence of the weights: {licence['weights']} (the text is in LICENSE beside this file)",
    ]
    if licence.get("code"):
        lines.append(f"Licence of the code: {licence['code']}")
    if licence.get("dataset"):
        lines.append(f"Licence of the training data: {licence['dataset']}")
    lines.append(
        f"Copyright: the authors of {model['name']}, as published at {model['upstream']}"
    )
    if model.get("attribution"):
        lines += ["", model["attribution"]]
    voices = [
        voice for voice in VOICE_CATALOGUE.values() if voice["model"] == model["id"]
    ]
    if voices:
        lines += ["", "Voices offered:"]
        for voice in sorted(voices, key=lambda item: item["id"]):
            terms = voice["licence"]["weights"]
            if voice["licence"].get("dataset"):
                terms += f"; training data {voice['licence']['dataset']}"
            lines.append(f"- {voice['name']} ({voice['id']}): {terms}")
            if voice.get("attribution"):
                lines.append(f"  {voice['attribution']}")
    lines += [
        "",
        "Every file here is pinned by its SHA-256 and size in the agentspecs speech catalogue.",
        "",
    ]
    return "\n".join(lines)


def licence_text(model: Dict[str, Any], texts: Dict[str, str]) -> str:
    """The full text of the model's weights' licence, MIT given the model's authors."""
    weights = model["licence"]["weights"]
    if weights not in LICENCE_TEXTS:
        raise SystemExit(
            f"{model['id']}: no licence text is pinned for {weights}: add it to LICENCE_TEXTS"
        )
    if weights not in texts:
        url, sha256 = LICENCE_TEXTS[weights]
        with tempfile.TemporaryDirectory() as scratch:
            target = Path(scratch) / "LICENSE"
            _download(url, target)
            if sha256_of(target) != sha256:
                raise SystemExit(f"{url} was published with another hash: refused")
            texts[weights] = target.read_text()
    text = texts[weights]
    if weights == "MIT":
        if MIT_COPYRIGHT_TEMPLATE not in text:
            raise SystemExit("the pinned MIT text has no copyright line to fill")
        text = text.replace(
            MIT_COPYRIGHT_TEMPLATE,
            f"Copyright (c) the authors of {model['name']} ({model['upstream']})",
        )
    return text


def notices() -> Iterator[tuple[Dict[str, Any], str]]:
    seen = set()
    for model in SPEECH_MODEL_CATALOGUE.values():
        if folder_of(model) not in seen:
            seen.add(folder_of(model))
            yield model, folder_of(model)


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
        target = args.store / folder_of(model) / item["path"]
        total += item["size"]
        if (
            target.is_file()
            and target.stat().st_size == item["size"]
            and sha256_of(target) == item["sha256"]
        ):
            continue
        if args.verify:
            problems.append(
                f"{folder_of(model)}/{item['path']} is missing or does not match its pin"
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
    texts: Dict[str, str] = {}
    for model, folder in notices():
        if (args.store / folder).is_symlink():
            problems.append(
                f"{folder} is a link to another folder, whose notices its own would overwrite: "
                "make it a copy, as Datalayer's storage keeps it"
            )
            continue
        for name, text in (
            ("NOTICE", notice_of(model)),
            ("LICENSE", licence_text(model, texts)),
        ):
            target = args.store / folder / name
            if target.is_file() and target.read_text() == text:
                continue
            if args.verify:
                problems.append(
                    f"{folder}/{name} is missing or not as the catalogue says"
                )
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text)
    for problem in problems:
        print(problem, file=sys.stderr)
    if not problems:
        print(
            f"{args.store}: {sum(1 for _ in files())} files, {total / 1e6:.0f} MB, every one as pinned; "
            f"a NOTICE and a LICENSE beside each of {sum(1 for _ in notices())} models"
        )
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
