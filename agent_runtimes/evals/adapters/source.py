# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A definition's source: its archive, its digest, and unpacking it safely.

The archive is the original: it is kept byte for byte, by the digest of those
bytes, and nothing here writes back to it. What a run uses is an unpacked
copy, whose own digest covers every file in it.

An archive is somebody's upload. Unpacking refuses, rather than skips,
anything that is not a plain file or directory inside the destination.
"""

from __future__ import annotations

import gzip
import hashlib
import io
import os
import re
import tarfile
import zipfile
from pathlib import Path, PurePosixPath
from typing import IO

__all__ = [
    "MAX_ARCHIVE_BYTES",
    "SourceRefused",
    "archive_digest",
    "content_digest",
    "pack_source",
    "require_digest",
    "unpack_archive",
]

MAX_ARCHIVE_BYTES = 64 * 1024 * 1024
MAX_FILES = 10_000
MAX_UNPACKED_BYTES = 512 * 1024 * 1024

_DIGEST = re.compile(r"^[0-9a-f]{64}$")


class SourceRefused(ValueError):
    """The archive is not one this will unpack, and why."""


def require_digest(digest: str) -> str:
    """A digest as this package names one: 64 lower-case hex characters."""
    if not _DIGEST.fullmatch(digest or ""):
        raise SourceRefused("a source is named by its sha256, in 64 hex characters")
    return digest


def archive_digest(data: bytes) -> str:
    """The sha256 of the archive's own bytes."""
    return hashlib.sha256(data).hexdigest()


def _inside(name: str) -> PurePosixPath:
    """A name inside the archive, or the refusal."""
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts or "\\" in name:
        raise SourceRefused(f"the archive names a path outside itself: {name}")
    return path


def _write(
    destination: Path, name: str, stream: IO[bytes], *, spent: list[int]
) -> None:
    """One file, counted against the unpacked bound."""
    relative = _inside(name)
    target = destination.joinpath(*relative.parts)
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "wb") as handle:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            spent[0] += len(chunk)
            if spent[0] > MAX_UNPACKED_BYTES:
                raise SourceRefused(
                    f"the archive unpacks past {MAX_UNPACKED_BYTES} bytes"
                )
            handle.write(chunk)


def unpack_archive(data: bytes, destination: Path) -> None:
    """Unpack a tar (optionally compressed) or a zip into `destination`, and leave it read-only."""
    if len(data) > MAX_ARCHIVE_BYTES:
        raise SourceRefused(f"the archive is past {MAX_ARCHIVE_BYTES} bytes")
    destination.mkdir(parents=True, exist_ok=True)
    spent = [0]
    if zipfile.is_zipfile(io.BytesIO(data)):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_FILES:
                raise SourceRefused(f"the archive holds more than {MAX_FILES} entries")
            for entry in entries:
                mode = entry.external_attr >> 16
                if (mode & 0o170000) == 0o120000:
                    raise SourceRefused(f"the archive holds a link: {entry.filename}")
                if entry.is_dir():
                    _inside(entry.filename)
                    continue
                with archive.open(entry) as stream:
                    _write(destination, entry.filename, stream, spent=spent)
    else:
        try:
            tar = tarfile.open(fileobj=io.BytesIO(data), mode="r:*")
        except tarfile.TarError as error:
            raise SourceRefused(
                f"the archive is neither a tar nor a zip: {error}"
            ) from None
        with tar:
            members = tar.getmembers()
            if len(members) > MAX_FILES:
                raise SourceRefused(f"the archive holds more than {MAX_FILES} entries")
            for member in members:
                if member.isdir():
                    _inside(member.name)
                    continue
                if not member.isfile():
                    raise SourceRefused(
                        f"the archive holds something other than a file: {member.name}"
                    )
                extracted = tar.extractfile(member)
                if extracted is None:
                    raise SourceRefused(
                        f"the archive's entry cannot be read: {member.name}"
                    )
                _write(destination, member.name, extracted, spent=spent)
    for root, directories, names in os.walk(destination):
        for name in names:
            os.chmod(os.path.join(root, name), 0o444)
        for name in directories:
            os.chmod(os.path.join(root, name), 0o555)  # nosec B103 - read-only, and a directory needs its execute bit to be entered
    os.chmod(destination, 0o555)  # nosec B103 - read-only, and a directory needs its execute bit to be entered


def pack_source(root: Path) -> bytes:
    """A directory as an archive: the same bytes for the same files, so the
    same source has the same digest wherever it is packed from.
    """
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w") as tar:
            for path in sorted(root.rglob("*")):
                relative = path.relative_to(root)
                if (
                    not path.is_file()
                    or path.is_symlink()
                    or "__pycache__" in relative.parts
                ):
                    continue
                info = tarfile.TarInfo(relative.as_posix())
                info.size = path.stat().st_size
                info.mode = 0o644
                with open(path, "rb") as handle:
                    tar.addfile(info, handle)
    return buffer.getvalue()


def content_digest(root: Path) -> str:
    """A digest covering every file under `root`: each path with its bytes'
    sha256, in order. Independent of how the archive packed them.
    """
    digest = hashlib.sha256()
    files = sorted(path for path in root.rglob("*") if path.is_file())
    for path in files:
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).hexdigest().encode())
        digest.update(b"\n")
    return digest.hexdigest()
