# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""datalayer-social: post to X and Bluesky on the person's linked accounts, through IAM.

The person links X and Bluesky in Datalayer's Settings; IAM keeps the accounts'
tokens — X's grant, which it refreshes, and the Bluesky session bound to a key
only IAM holds — and hands them to nobody. This runtime holds a **social
token** instead (decided 14 November 2026): the person's own token, narrowed by
IAM to its social routes and to this runtime while it runs, given by the
companion as the runtime is assigned (``PUT /api/v1/configure/social/token``).
It lasts fifteen minutes; the runtime renews it with itself ahead of its expiry
(``POST /api/iam/v1/social/runtime-token/renew``), and IAM refuses it the moment
the runtime ends.

Three tools, no secret pasted for any:

- ``social_accounts`` reads which accounts are linked, and as whom (``read``);
- ``post_to_x`` and ``post_to_bluesky`` publish one post, with images
  (``publish``, ``approval: manual``: each waits for the person's word).

The token is never logged, and an account's token never reaches this process.
"""

from __future__ import annotations

import base64
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

__all__ = [
    "MAX_IMAGES",
    "give_social_token",
    "is_linked",
    "linked_accounts",
    "post_to_bluesky",
    "post_to_x",
    "refresh_linked_accounts",
    "social_accounts",
    "social_token_refusal",
]

#: How many images a post carries, on X and on Bluesky.
MAX_IMAGES = 4

#: How long before its expiry the token is renewed.
RENEW_BEFORE_SECONDS = 180

#: The largest image each network takes, in bytes.
_MAX_IMAGE_BYTES = {"x": 5 * 1024 * 1024, "bluesky": 1_000_000}

_IMAGE_TYPES = {"image/png", "image/jpeg"}

#: The sentence a tool answers when the runtime holds no social token.
NO_TOKEN = (
    "This runtime was given no social token, so it posts nowhere: it is given one "
    "when the person launches it on Datalayer, and the person links X or Bluesky "
    "in Settings."
)

_lock = threading.Lock()
_state: Dict[str, Any] = {
    "token": None,
    "expires_at": None,
    "accounts": None,
    "refused": None,
}


def _iam_url() -> str:
    return (os.environ.get("DATALAYER_IAM_URL") or "").strip().rstrip("/")


def _expiry_of(token: str) -> Optional[float]:
    try:
        payload = token.split(".")[1]
        import json

        claims = json.loads(
            base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))
        )
    except Exception:  # noqa: BLE001 - not a JWT
        return None
    exp = claims.get("exp") if isinstance(claims, dict) else None
    return float(exp) if isinstance(exp, (int, float)) else None


def give_social_token(token: Optional[str]) -> Optional[float]:
    """Keep the runtime's social token; ``None`` forgets it. Answers when it expires."""
    value = (token or "").strip() or None
    with _lock:
        _state["token"] = value
        _state["expires_at"] = _expiry_of(value) if value else None
        _state["accounts"] = None
        _state["refused"] = None
    return _state["expires_at"]


def social_token_refusal() -> Optional[str]:
    """Why this runtime posts nowhere now, in a sentence, or ``None``."""
    if _state.get("refused"):
        return str(_state["refused"])
    if not _state.get("token"):
        return NO_TOKEN
    return None


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=30.0)


async def _token() -> Optional[str]:
    """The social token, renewed when it is about to expire; ``None`` when there is none."""
    token = _state.get("token")
    if not token:
        return None
    expires_at = _state.get("expires_at")
    if expires_at is None or expires_at - time.time() > RENEW_BEFORE_SECONDS:
        return str(token)
    try:
        async with _client() as http:
            response = await http.post(
                f"{_iam_url()}/api/iam/v1/social/runtime-token/renew",
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError as error:
        logger.warning(
            "The social token could not be renewed: %s", type(error).__name__
        )
        return str(token) if expires_at > time.time() else None
    if response.status_code != 200:
        with _lock:
            _state["token"] = None
            _state["refused"] = (
                "IAM no longer renews this runtime's social token "
                f"({response.status_code}): the runtime ended, or the person signed out."
            )
        logger.info("The social token was not renewed (%s).", response.status_code)
        return None
    fresh = str(response.json().get("access_token") or "")
    with _lock:
        _state["token"] = fresh or None
        _state["expires_at"] = _expiry_of(fresh) if fresh else None
    return fresh or None


async def _iam(method: str, path: str, **kwargs: Any) -> httpx.Response | str:
    """A call to IAM with the social token, or the sentence saying why there is none."""
    token = await _token()
    if not token:
        return social_token_refusal() or NO_TOKEN
    if not _iam_url():
        return "This runtime does not know where IAM is (DATALAYER_IAM_URL), so it posts nowhere."
    try:
        async with _client() as http:
            return await http.request(
                method,
                f"{_iam_url()}{path}",
                headers={"Authorization": f"Bearer {token}"},
                **kwargs,
            )
    except httpx.HTTPError as error:
        return f"IAM could not be reached ({type(error).__name__}); nothing was posted."


def _said(response: httpx.Response) -> str:
    try:
        detail = response.json().get("detail")
    except ValueError:
        detail = None
    return str(detail or response.reason_phrase or response.status_code)


async def refresh_linked_accounts() -> Optional[Dict[str, Any]]:
    """Read which accounts the person linked, and keep it for the groups' check."""
    answer = await _iam("GET", "/api/iam/v1/social/accounts")
    if isinstance(answer, str) or answer.status_code != 200:
        return None
    accounts = {
        key: value for key, value in answer.json().items() if key in ("x", "bluesky")
    }
    with _lock:
        _state["accounts"] = accounts
    return accounts


def linked_accounts() -> Optional[Dict[str, Any]]:
    """Which accounts the person linked, as last read; ``None`` before any read."""
    return _state.get("accounts")


def is_linked(account: str) -> bool:
    """Whether the person linked this account (``x``, ``bluesky``), as last read."""
    accounts = _state.get("accounts") or {}
    return bool((accounts.get(account) or {}).get("linked"))


async def social_accounts() -> Any:
    """Read which of X and Bluesky the person linked in Settings, and as whom.

    Returns:
        ``{"x": {"linked", "username", "url"}, "bluesky": {"linked", "handle", "did"}}``,
        or a sentence when this runtime cannot ask.
    """
    answer = await _iam("GET", "/api/iam/v1/social/accounts")
    if isinstance(answer, str):
        return answer
    if answer.status_code != 200:
        return f"IAM did not say which accounts are linked ({answer.status_code}): {_said(answer)}"
    accounts = {
        key: value for key, value in answer.json().items() if key in ("x", "bluesky")
    }
    with _lock:
        _state["accounts"] = accounts
    return accounts


async def _image(source: str, network: str) -> tuple[str, bytes] | str:
    """An image as (content type, bytes) from a data URL or an https URL, or a sentence."""
    value = str(source or "").strip()
    if value.startswith("data:"):
        head, _, data = value.partition(",")
        content_type = head[5:].split(";")[0]
        try:
            content = base64.b64decode(data, validate=True)
        except ValueError:
            return "An image is not valid base64."
    elif value.startswith("https://"):
        try:
            async with _client() as http:
                response = await http.get(value, follow_redirects=True)
        except httpx.HTTPError as error:
            return (
                f"The image at {value} could not be fetched ({type(error).__name__})."
            )
        if response.status_code != 200:
            return f"The image at {value} answered {response.status_code}."
        content_type = response.headers.get("content-type", "").split(";")[0].strip()
        content = response.content
    else:
        return "An image is a data: URL or an https:// URL."
    if content_type not in _IMAGE_TYPES:
        return f"An image is PNG or JPEG, not {content_type or 'unknown'}."
    if len(content) > _MAX_IMAGE_BYTES[network]:
        return f"An image for {network} is at most {_MAX_IMAGE_BYTES[network]} bytes."
    return content_type, content


async def post_to_x(text: str, images: Optional[List[str]] = None) -> Any:
    """Publish one post on the person's own X account, linked in Settings.

    It waits for the person's approval every time.

    Args:
        text: The post, at most 280 characters (a link counts 23).
        images: Up to four PNG or JPEG images, each a ``data:`` URL or an
            ``https://`` URL.

    Returns:
        ``{"post_id", "post_url"}``, or a sentence saying why nothing was posted.
    """
    images = list(images or [])
    if len(images) > MAX_IMAGES:
        return f"An X post carries at most {MAX_IMAGES} images."
    media_ids: List[str] = []
    for source in images:
        image = await _image(source, "x")
        if isinstance(image, str):
            return image
        content_type, content = image
        data_url = f"data:{content_type};base64,{base64.b64encode(content).decode()}"
        uploaded = await _iam(
            "POST", "/api/iam/v1/social/x/media", json={"data_url": data_url}
        )
        if isinstance(uploaded, str):
            return uploaded
        if uploaded.status_code != 201:
            return (
                f"X did not take an image ({uploaded.status_code}): {_said(uploaded)}"
            )
        media_ids.append(str(uploaded.json().get("media_id") or ""))
    posted = await _iam(
        "POST",
        "/api/iam/v1/social/x/posts",
        json={"text": text, "media_ids": media_ids},
    )
    if isinstance(posted, str):
        return posted
    if posted.status_code != 201:
        return f"Nothing was posted to X ({posted.status_code}): {_said(posted)}"
    body = posted.json()
    return {"post_id": body.get("post_id"), "post_url": body.get("post_url")}


_TID_ALPHABET = "234567abcdefghijklmnopqrstuvwxyz"
_tid_last = {"value": 0}


def _tid() -> str:
    """A record key of the TID form: microseconds since the epoch and a clock id, base32-sortable."""
    with _lock:
        micros = max(int(time.time() * 1_000_000), _tid_last["value"] + 1)
        _tid_last["value"] = micros
    value = (micros << 10) | (os.getpid() & 0x3FF)
    chars = []
    for _ in range(13):
        chars.append(_TID_ALPHABET[value & 31])
        value >>= 5
    return "".join(reversed(chars))


_LINK = re.compile(r"https?://[^\s<>\"']+")


def _link_facets(text: str) -> List[Dict[str, Any]]:
    """Bluesky's facets for each link of a post, by byte offsets, so they are links."""
    facets = []
    for match in _LINK.finditer(text):
        url = match.group(0).rstrip(".,;:!?)")
        start = len(text[: match.start()].encode("utf-8"))
        facets.append(
            {
                "index": {
                    "byteStart": start,
                    "byteEnd": start + len(url.encode("utf-8")),
                },
                "features": [{"$type": "app.bsky.richtext.facet#link", "uri": url}],
            }
        )
    return facets


async def post_to_bluesky(
    text: str, images: Optional[List[str]] = None, alt: Optional[List[str]] = None
) -> Any:
    """Publish one post on the person's own Bluesky account, linked in Settings.

    It waits for the person's approval every time.

    Args:
        text: The post, at most 300 characters.
        images: Up to four PNG or JPEG images, each a ``data:`` URL or an
            ``https://`` URL, at most 1 MB each.
        alt: The alt text of each image, in the same order.

    Returns:
        ``{"uri", "post_url"}``, or a sentence saying why nothing was posted.
    """
    text = str(text or "").strip()
    if not text:
        return "A Bluesky post needs some text."
    if len(text) > 300:
        return "A Bluesky post holds at most 300 characters."
    images = list(images or [])
    if len(images) > MAX_IMAGES:
        return f"A Bluesky post carries at most {MAX_IMAGES} images."
    alt = list(alt or [])
    embedded: List[Dict[str, Any]] = []
    for index, source in enumerate(images):
        image = await _image(source, "bluesky")
        if isinstance(image, str):
            return image
        content_type, content = image
        uploaded = await _iam(
            "POST",
            "/api/iam/v1/social/bluesky/blobs",
            json={
                "data": base64.b64encode(content).decode(),
                "content_type": content_type,
            },
        )
        if isinstance(uploaded, str):
            return uploaded
        if uploaded.status_code != 201:
            return f"Bluesky did not take an image ({uploaded.status_code}): {_said(uploaded)}"
        embedded.append(
            {
                "image": uploaded.json().get("blob"),
                "alt": alt[index] if index < len(alt) else "",
            }
        )
    record: Dict[str, Any] = {
        "$type": "app.bsky.feed.post",
        "text": text,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    facets = _link_facets(text)
    if facets:
        record["facets"] = facets
    if embedded:
        record["embed"] = {"$type": "app.bsky.embed.images", "images": embedded}
    rkey = _tid()
    written = await _iam(
        "PUT",
        "/api/iam/v1/social/bluesky/records",
        json={"collection": "app.bsky.feed.post", "rkey": rkey, "record": record},
    )
    if isinstance(written, str):
        return written
    if written.status_code != 200:
        return (
            f"Nothing was posted to Bluesky ({written.status_code}): {_said(written)}"
        )
    uri = str(written.json().get("uri") or "")
    did = uri.split("/")[2] if uri.startswith("at://") else ""
    return {
        "uri": uri,
        "post_url": f"https://bsky.app/profile/{did}/post/{rkey}" if did else "",
    }
