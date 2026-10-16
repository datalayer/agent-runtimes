# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The speech models on this machine, for ``loop --voice`` (VO-16).

The machine's store is laid out as the speech service's,
``<store>/<provider>/<model id>/<path>`` (``DATALAYER_SPEECH_MODELS_DIR``,
``~/.cache/voice-work/store`` by default). It is filled from Datalayer's
CDN, ``https://models-speech.datalayer.tech`` (``DATALAYER_SPEECH_MODELS_URL``),
each file checked against the SHA-256 and the size the catalogue pins; a
file that does not match is refused and removed. Nothing is asked of a
third party's hub. ::

    python -m agent_runtimes.voice.store             # whisper-small and kokoro-82m
    python -m agent_runtimes.voice.store kokoro-82m  # one model

With the ``voice`` extra and these two models here, ``loop --voice --speak``
hears and says on the machine; without them, on Datalayer's servers.
"""

from __future__ import annotations

import hashlib
import os
import sys
import urllib.request
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional

from agent_runtimes.specs.voices import SPEECH_MODEL_CATALOGUE

#: Where the pinned speech models are on this machine, laid out as the store.
MODELS_DIR_ENV = "DATALAYER_SPEECH_MODELS_DIR"
DEFAULT_MODELS_DIR = "~/.cache/voice-work/store"

#: Where the store is filled from: Datalayer's CDN of the pinned models.
MODELS_URL_ENV = "DATALAYER_SPEECH_MODELS_URL"
DEFAULT_MODELS_URL = "https://models-speech.datalayer.tech"

#: What the machine hears and says with (VO-16).
HEARING_MODEL = "whisper-small"
SPEAKING_MODEL = "kokoro-82m"
MACHINE_MODELS = (HEARING_MODEL, SPEAKING_MODEL)


class StoreRefused(RuntimeError):
    """A model that cannot be put in the store as pinned, said in a sentence."""


def models_dir() -> Path:
    """The machine's store."""
    return Path(os.path.expanduser(os.getenv(MODELS_DIR_ENV) or DEFAULT_MODELS_DIR))


def models_url() -> str:
    """Where the store is filled from."""
    return (os.getenv(MODELS_URL_ENV) or DEFAULT_MODELS_URL).rstrip("/")


def model_spec(model_id: str) -> Dict[str, Any]:
    """A model of the catalogue, or a refusal naming the ones it has."""
    model = SPEECH_MODEL_CATALOGUE.get(model_id)
    if model is None:
        raise StoreRefused(
            f"The catalogue has no speech model {model_id}: "
            f"{', '.join(sorted(SPEECH_MODEL_CATALOGUE))}."
        )
    return model


def runs_on_the_machine(model_id: str) -> bool:
    """Whether the catalogue says a model runs on the person's machine (``where: machine``, VO-16)."""
    return "machine" in model_spec(model_id)["where"]


def folder_of(model: Dict[str, Any], directory: Path) -> Path:
    """Where a model's files are in a store: ``<provider>/<id>``."""
    return directory / model["provider"] / model["id"]


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def present(model_id: str, directory: Optional[Path] = None) -> Optional[Path]:
    """The model's folder when each of its files is there at its pinned size; else ``None``.

    Sizes only: the hashes were checked when the store was filled.
    """
    model = model_spec(model_id)
    folder = folder_of(model, directory or models_dir())
    for item in model["files"]:
        path = folder / item["path"]
        if not path.is_file() or path.stat().st_size != item["size"]:
            return None
    return folder


def _download(url: str, target: Path) -> None:
    urllib.request.urlretrieve(url, target)  # nosec B310 - Datalayer's own CDN, https


def fill(
    model_ids: Iterable[str],
    directory: Optional[Path] = None,
    base_url: Optional[str] = None,
    download: Optional[Callable[[str, Path], None]] = None,
    say: Optional[Callable[[str], None]] = None,
) -> List[Path]:
    """Copy models from the CDN into the store, each file checked; what is there and right stays.

    Returns each model's folder. A file whose hash is not the pinned one is
    removed and refused in a sentence.
    """
    directory = directory or models_dir()
    base = (base_url or models_url()).rstrip("/")
    fetch = download or _download
    folders = []
    for model_id in model_ids:
        model = model_spec(model_id)
        folder = folder_of(model, directory)
        for item in model["files"]:
            path = folder / item["path"]
            if (
                path.is_file()
                and path.stat().st_size == item["size"]
                and sha256_of(path) == item["sha256"]
            ):
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            partial = path.with_name(path.name + ".partial")
            url = f"{base}/{model['provider']}/{model['id']}/{item['path']}"
            if say is not None:
                say(f"{model['id']}/{item['path']} ({item['size'] / 1e6:.0f} MB)")
            fetch(url, partial)
            if (
                partial.stat().st_size != item["size"]
                or sha256_of(partial) != item["sha256"]
            ):
                partial.unlink()
                raise StoreRefused(
                    f"{model['id']}/{item['path']} at {base} is not the file the catalogue pins: refused."
                )
            partial.replace(path)
        folders.append(folder)
    return folders


def main(argv: List[str]) -> int:
    """Fill the machine's store: the models named, or whisper-small and kokoro-82m."""
    wanted = argv[1:] or list(MACHINE_MODELS)
    try:
        folders = fill(wanted, say=lambda line: print(f"  {line}", flush=True))
    except StoreRefused as refused:
        print(refused, file=sys.stderr)
        return 1
    for folder in folders:
        print(f"{folder}: as pinned")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
