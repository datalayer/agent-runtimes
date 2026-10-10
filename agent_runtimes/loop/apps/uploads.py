# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a person sends an application (LOOP P-21): images, files, audio.

A file reaches an application three ways, and each is limited by what asked
for it:

- **asked by its code** — ``session.ask(FileQuestion(...))`` — and limited by
  the question's ``accept`` and ``max_bytes``;
- **asked by its page** — a File upload block, its ``accept`` and ``max_mb``
  — and sent with the block's action;
- **sent without being asked** — attached in the composer to a message —
  and limited by the Appspec's ``interface.uploads``: the kinds it takes, each
  with its largest size, and how many at once. Without ``uploads`` a file
  sent with a message is refused.

The page refuses what these do not take before it is sent; the runtime
refuses it again here, in the same sentences, when it was sent all the same.

The rules are agentspecs' (``AppUploads.kind_of``, ``refusal``, ``too_many``,
``upload_kind_takes``), said again here on the runtime's types.
"""

from __future__ import annotations

from typing import Any, List, Mapping, Optional, Sequence, Tuple

from agent_runtimes.types import AppSpec, AppUploadKindSpec

#: The component of a page that asks for a file.
FILE_UPLOAD = "FileUpload"

#: What a File upload block takes when it does not say, in megabytes.
FILE_UPLOAD_MAX_MB = 25.0


def kind_takes(kind: str, name: str, media_type: str) -> bool:
    """Whether a kind of file takes a file: an extension (``.csv``) by its
    name, a media type (``application/pdf``) or a family (``image/*``) by its
    type.
    """
    kind = kind.strip().lower()
    if kind.startswith("."):
        return name.lower().endswith(kind)
    wanted = (media_type or "").split(";", 1)[0].strip().lower()
    if kind.endswith("/*"):
        return wanted.startswith(kind[:-1])
    return wanted == kind


def accepts(kinds: Sequence[str], name: str, media_type: str) -> bool:
    """Whether any of ``kinds`` takes a file; any file when there are none."""
    return not kinds or any(kind_takes(kind, name, media_type) for kind in kinds)


def _megabytes(size: int) -> str:
    return f"{size / (1024 * 1024):.1f} MB"


def kind_of(app: AppSpec, name: str, media_type: str) -> Optional[AppUploadKindSpec]:
    """The first kind of ``interface.uploads`` that takes a file, or None."""
    uploads = app.interface.uploads
    if uploads is None:
        return None
    return next(
        (kind for kind in uploads.kinds if kind_takes(kind.type, name, media_type)),
        None,
    )


def page_asks(app: AppSpec) -> List[Tuple[Tuple[str, ...], float]]:
    """What the File upload blocks of its page take: each one's kinds and largest size."""
    surface = app.interface.surface
    asked: List[Tuple[Tuple[str, ...], float]] = []
    for component in surface.components if surface else []:
        if component.get("component") != FILE_UPLOAD:
            continue
        accept = component.get("accept") or []
        kinds = tuple(str(kind) for kind in accept) if isinstance(accept, list) else ()
        largest = component.get("max_mb")
        asked.append(
            (
                kinds,
                float(largest)
                if isinstance(largest, (int, float)) and not isinstance(largest, bool)
                else FILE_UPLOAD_MAX_MB,
            )
        )
    return asked


def unasked_refused(app: AppSpec, files: Sequence[Any]) -> Optional[str]:
    """Why files sent without being asked are refused, in a sentence; None
    when ``interface.uploads`` takes every one of them.

    ``files`` are `UploadedFile` s: a ``name``, a ``media_type`` and a
    ``content``.
    """
    if not files:
        return None
    uploads = app.interface.uploads
    if uploads is None:
        return (
            f"{app.name} takes no file sent with a message: its Appspec names "
            "none it takes (interface.uploads)."
        )
    if len(files) > uploads.max_files:
        return (
            f"{len(files)} files were sent at once: {app.name} takes at most "
            f"{uploads.max_files}."
        )
    for file in files:
        kind = kind_of(app, file.name, file.media_type)
        if kind is None:
            taken = ", ".join(kind.type for kind in uploads.kinds)
            return (
                f"{file.name} is not a kind of file {app.name} takes: it takes {taken}."
            )
        if len(file.content) > kind.max_mb * 1024 * 1024:
            return (
                f"{file.name} is {_megabytes(len(file.content))}: {app.name} takes "
                f"{kind.type} of at most {kind.max_mb:g} MB."
            )
    return None


def page_refused(app: AppSpec, files: Sequence[Any]) -> Optional[str]:
    """Why files sent with a block's action are refused, in a sentence; None
    when a File upload block of its page takes each of them.

    An application whose page has no File upload asks for no file there:
    what is sent with an action is then held to ``interface.uploads``, as a
    file sent without being asked.
    """
    if not files:
        return None
    asked = page_asks(app)
    if not asked:
        return unasked_refused(app, files)
    for file in files:
        fits = [
            largest
            for kinds, largest in asked
            if accepts(kinds, file.name, file.media_type)
        ]
        if not fits:
            taken = ", ".join(
                sorted({kind for kinds, _ in asked for kind in kinds}) or ["any file"]
            )
            return f"{file.name} is not a kind of file {app.name}'s page asks for: it asks for {taken}."
        largest = max(fits)
        if len(file.content) > largest * 1024 * 1024:
            return (
                f"{file.name} is {_megabytes(len(file.content))}: {app.name}'s page "
                f"takes files of at most {largest:g} MB."
            )
    return None


#: What a model is given whole, when the application has no computer to read it in.
SEEN_KINDS: Tuple[str, ...] = ("image/*", "audio/*", "application/pdf")


def seen_whole(media_type: str) -> bool:
    """Whether a file goes to the model as it is — an image, a recording, a PDF."""
    return any(kind_takes(kind, "", media_type) for kind in SEEN_KINDS)


def media_part(media_type: str, data: str) -> Mapping[str, Any]:
    """A file as AG-UI's user message carries it whole (``data`` in base64).

    An image, a recording or a video is its own kind of part, anything else a
    document, its bytes inline: the typed parts of ag-ui-protocol 0.1.15 and
    later. Its 1.0 refuses the older ``binary`` part, and pydantic-ai then
    drops it, so the model would never see the file.
    """
    kind = media_type.split("/", 1)[0]
    return {
        "type": kind if kind in ("image", "audio", "video") else "document",
        "source": {"type": "data", "value": data, "mimeType": media_type},
    }
