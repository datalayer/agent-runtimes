# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Keep a file a skill made in the runtime owner's Space.

``POST /api/v1/spaces/files`` takes the file as the request's body and keeps
it in one of the owner's Spaces, where the Space page lists it under
*Contents*: in a Dataset of that Space (``Videos`` for the video skill; the
``collection`` query names it), created on its first file, each file saved
making a new revision that holds the files already there and this one.

- **No secret crosses.** The skill names no token: the runtime saves with the
  identity it already holds for its owner — the user token the companion gave
  it as the runtime was assigned (``DATALAYER_USER_TOKEN``), else the key it
  was started with (``DATALAYER_API_KEY``). The caller can only name which of
  the owner's Spaces, never whose.
- **The pod's loopback only.** A skill's script runs in the pod's sandbox and
  reaches the runtime on ``127.0.0.1``; any other caller is refused (403).
- **A Space that cannot be reached is said.** No identity, no default Space,
  a Space not found, Contents refusing: a 409 or 502 in a sentence, the
  caller's file untouched where it was.

Query parameters: ``name`` (the file's name, required), ``folder`` (a folder
inside the Dataset, ``""`` for its root), ``space`` (a Space's uid or handle;
the owner's default Space when unsaid), ``collection`` (the Dataset's name,
:data:`DEFAULT_COLLECTION` when unsaid) and ``media_type`` (else the
request's ``Content-Type``).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import APIRouter, HTTPException, Query, Request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/spaces", tags=["spaces"])

#: The Dataset a file is kept in when the caller names none.
DEFAULT_COLLECTION = "Agent files"

#: The largest file kept through this route, in bytes.
MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024

#: The variant Spacer gives a person's default Space.
DEFAULT_SPACE_VARIANT = "default"

#: What a file's name and a folder's parts may hold.
_SAFE_PART = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._()+-]{0,199}$")


class SpaceRefused(Exception):
    """Why the file cannot be kept in the Space, in a sentence."""

    def __init__(self, message: str, status_code: int = 409) -> None:
        super().__init__(message)
        self.status_code = status_code


def owner_token() -> str:
    """The token the runtime holds for its owner, ``""`` when it holds none."""
    for name in ("DATALAYER_USER_TOKEN", "DATALAYER_API_KEY"):
        value = (os.environ.get(name) or "").strip()
        if value:
            return value
    return ""


def _client(token: str) -> Any:
    from datalayer_core.client.client import DatalayerClient
    from datalayer_core.utils.urls import DatalayerURLs

    return DatalayerClient(urls=DatalayerURLs.from_environment(), api_key=token)


#: How the Datalayer client is made from a token; replaced by the tests.
client_factory: Callable[[str], Any] = _client


def checked_name(name: str) -> str:
    """The file's name, refused when it is a path or empty."""
    value = (name or "").strip()
    if not _SAFE_PART.fullmatch(value) or value in {".", ".."}:
        raise SpaceRefused(
            f"{name!r} is not a file name: letters, digits, spaces and ._()+- only, "
            "starting with a letter or a digit.",
            422,
        )
    return value


def checked_folder(folder: str) -> str:
    """The folder inside the Dataset, its parts checked, ``""`` for its root."""
    parts = [part.strip() for part in (folder or "").strip().strip("/").split("/")]
    parts = [part for part in parts if part]
    for part in parts:
        if not _SAFE_PART.fullmatch(part) or part in {".", ".."}:
            raise SpaceRefused(
                f"{folder!r} is not a folder: {part!r} cannot be in it.", 422
            )
    return "/".join(parts)


def _field(document: dict[str, Any], *names: str) -> str:
    for name in names:
        value = document.get(name)
        if value:
            return str(value)
    return ""


def resolve_space(client: Any, space: str = "") -> dict[str, str]:
    """The owner's Space named by uid or handle, else their default Space."""
    answer = client._list_spaces()
    if answer.get("success") is False:
        raise SpaceRefused(
            f"The Spaces cannot be listed: {answer.get('message') or 'Spacer refused'}.",
            502,
        )
    spaces = [s for s in (answer.get("spaces") or []) if isinstance(s, dict)]
    wanted = (space or "").strip()
    if wanted:
        found = [
            s
            for s in spaces
            if wanted in {_field(s, "uid"), _field(s, "handle_s", "handle")}
        ]
        if not found:
            raise SpaceRefused(f"No Space of yours is {wanted}.", 404)
    else:
        found = [
            s
            for s in spaces
            if _field(s, "variant_s", "variant") == DEFAULT_SPACE_VARIANT
        ]
        if not found:
            raise SpaceRefused(
                "You have no default Space to keep it in: name one with its uid or handle."
            )
    chosen = found[0]
    return {
        "uid": _field(chosen, "uid"),
        "handle": _field(chosen, "handle_s", "handle"),
        "name": _field(chosen, "name_t", "name"),
    }


def dataset_in(client: Any, space_uid: str, collection: str) -> Any:
    """The Dataset of that name in the Space, created when there is none."""
    from datalayer_core.models.contents import ContentSourceCreate

    cursor: Optional[str] = None
    while True:
        page = client.list_content_sources(
            kind="dataset", space_uid=space_uid, cursor=cursor, limit=200
        )
        for item in page.items:
            if item.source.name == collection and item.source.status != "disabled":
                return item.source
        cursor = page.next_cursor
        if not cursor:
            break
    digest = hashlib.sha256(f"{space_uid}:{collection}".encode()).hexdigest()[:40]
    created = client.create_content_source(
        ContentSourceCreate.model_validate(
            {
                "name": collection,
                "description": "Files the agents made, kept from their runtime.",
                "space_uid": space_uid,
                "kind": "dataset",
                "capabilities": ["browse", "transfer", "materialize"],
                "configuration": {
                    "kind": "dataset",
                    "current_revision_uid": None,
                    "publication_eligible": False,
                    "tags": ["agent-runtimes"],
                },
            }
        ),
        idempotency_key=f"agent-runtimes-space-dataset:{digest}",
    )
    return created.value.source


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(8 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _link(source_uid: str) -> str:
    base = (
        os.environ.get("DATALAYER_UI_URL") or os.environ.get("DATALAYER_RUN_URL") or ""
    )
    path = f"/contents/{source_uid}"
    return f"{base.rstrip('/')}{path}" if base.strip() else path


def save_file(
    client: Any,
    local_path: Path,
    *,
    name: str,
    folder: str = "",
    space: str = "",
    collection: str = DEFAULT_COLLECTION,
    media_type: str = "application/octet-stream",
) -> dict[str, Any]:
    """Keep the file in the Space's Dataset and pin it in a new revision."""
    from datalayer_core.models.contents import DatasetRevisionCreate

    target = resolve_space(client, space)
    dataset = dataset_in(client, target["uid"], collection)
    path = f"{folder}/{name}" if folder else name
    checksum = _sha256(local_path)
    key = hashlib.sha256(f"{dataset.uid}:{path}:{checksum}".encode()).hexdigest()[:48]
    transfer = client.upload_dataset_file(
        local_path,
        dataset.uid,
        path,
        idempotency_key=f"agent-runtimes-space-file:{key}",
        media_type=media_type,
        overwrite="new-version",
    )
    if (
        transfer.status != "succeeded"
        or not transfer.object_uid
        or not transfer.version_uid
    ):
        raise SpaceRefused(
            f"Contents did not complete the upload ({transfer.status}"
            f"{': ' + transfer.error_message if transfer.error_message else ''}).",
            502,
        )
    # The files the Dataset holds now, this path replaced by the new version.
    files: list[dict[str, Any]] = []
    current = getattr(dataset.configuration, "current_revision_uid", None)
    if current:
        revision = client.get_dataset_revision(dataset.uid, current)
        files = [
            {"object_uid": f.object_uid, "version_uid": f.version_uid, "path": f.path}
            for f in revision.files or []
            if f.path != path
        ]
    files.append(
        {
            "object_uid": transfer.object_uid,
            "version_uid": transfer.version_uid,
            "path": path,
        }
    )
    revision = client.create_dataset_revision(
        dataset.uid,
        DatasetRevisionCreate.model_validate(
            {"origin_kind": "sandbox-result", "files": files}
        ),
        idempotency_key=f"agent-runtimes-space-revision:{key}",
    )
    return {
        "space": target,
        "dataset": {"uid": dataset.uid, "name": dataset.name},
        "path": path,
        "object_uid": transfer.object_uid,
        "version_uid": transfer.version_uid,
        "revision_uid": revision.uid,
        "bytes": transfer.expected_size,
        "media_type": media_type,
        "url": _link(dataset.uid),
    }


def _caller_is_local(request: Request) -> bool:
    from agent_runtimes.apps.callers import is_loopback

    return is_loopback(request.client.host if request.client else None)


@router.post("/files")
async def save_file_to_space(
    request: Request,
    name: str = Query(..., description="The file's name in the Space."),
    folder: str = Query(
        "", description="A folder inside the Dataset; its root when unsaid."
    ),
    space: str = Query(
        "", description="A Space's uid or handle; the default Space when unsaid."
    ),
    collection: str = Query(DEFAULT_COLLECTION, description="The Dataset's name."),
    media_type: str = Query(
        "", description="The file's type; the Content-Type when unsaid."
    ),
) -> dict[str, Any]:
    """Keep the request's body as a file in the runtime owner's Space."""
    if not _caller_is_local(request):
        raise HTTPException(
            status_code=403,
            detail="Only the runtime's own pod keeps files in its owner's Space.",
        )
    try:
        file_name = checked_name(name)
        file_folder = checked_folder(folder)
        dataset_name = " ".join((collection or "").split()) or DEFAULT_COLLECTION
        token = owner_token()
        if not token:
            raise SpaceRefused(
                "This runtime holds no identity of its owner to keep files with: "
                "no Space can be reached from it."
            )
        kind = (
            media_type.strip()
            or (request.headers.get("content-type") or "").split(";")[0].strip()
            or "application/octet-stream"
        )
    except SpaceRefused as refused:
        raise HTTPException(
            status_code=refused.status_code, detail=str(refused)
        ) from refused

    with tempfile.TemporaryDirectory(prefix="agent-runtimes-space-") as folder_path:
        local = Path(folder_path) / file_name
        size = 0
        with local.open("wb") as stream:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"A file kept in a Space is at most {MAX_FILE_BYTES} bytes.",
                    )
                stream.write(chunk)
        if size == 0:
            raise HTTPException(
                status_code=422, detail="The file is empty: nothing to keep."
            )
        try:
            # The client is synchronous (requests): off the event loop.
            return await asyncio.to_thread(
                save_file,
                client_factory(token),
                local,
                name=file_name,
                folder=file_folder,
                space=space,
                collection=dataset_name,
                media_type=kind,
            )
        except SpaceRefused as refused:
            raise HTTPException(
                status_code=refused.status_code, detail=str(refused)
            ) from refused
        except Exception as error:  # noqa: BLE001 - Contents' or Spacer's refusal, said
            logger.warning("A file could not be kept in the Space: %s", error)
            raise HTTPException(
                status_code=502,
                detail=f"The Space could not keep the file: {error}",
            ) from error
