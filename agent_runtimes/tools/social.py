# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""datalayer-social: post to X, Bluesky and LinkedIn on the person's linked accounts, through IAM.

The person links X, Bluesky and LinkedIn in Datalayer's Settings; IAM keeps the
accounts' tokens — X's grant, which it refreshes, the Bluesky session bound to a
key only IAM holds, LinkedIn's posting grant — and hands them to nobody. This runtime holds a **social
token** instead (decided 14 November 2026): the person's own token, narrowed by
IAM to its social routes and to this runtime while it runs, given by the
companion as the runtime is assigned (``PUT /api/v1/configure/social/token``).
It lasts fifteen minutes; the runtime renews it with itself ahead of its expiry
(``POST /api/iam/v1/social/runtime-token/renew``), and IAM refuses it the moment
the runtime ends.

The tools, no secret pasted for any:

- ``social_accounts`` reads which accounts are linked, and as whom (``read``);
- ``post_to_x``, ``post_to_bluesky`` and ``post_to_linkedin`` publish one post,
  with images (``publish``, ``approval: manual``: each waits for the person's
  word);
- ``comment_on_linkedin`` comments as the person under a LinkedIn post they
  name (``send``, ``approval: manual``);
- ``read_bluesky`` reads Bluesky as the person (15 November 2026): their
  timeline, a person's posts, a thread and its replies, who liked or reposted a
  post, a profile, search of posts and people, their notifications, follows and
  followers (``read``);
- ``reply_on_bluesky``, ``like_on_bluesky``, ``repost_on_bluesky`` and
  ``follow_on_bluesky`` act as the person on Bluesky, each asked first
  (``approval: manual``);
- ``read_x`` reads X as the person (the user, 15 November 2026: "move X
  read/write to iam"): their own profile, someone's, a post, their timeline,
  their posts, their mentions, the replies to a post, a search of recent posts
  (``read``); ``reply_on_x``, ``like_on_x`` and ``repost_on_x`` act as the
  person on X, each asked first (``approval: manual``).

X bills Datalayer for every call made with a person's grant
(docs.x.com/x-api/getting-started/pricing): each post read, each user read,
each post created, and a post carrying a link most of all. The agent's
``api_budget`` guardrail (``x-api-budget``, declared on the Marketer) prices
each X tool call from that table, bounds how many posts a read asks for, and
refuses a call past the person's budget for the day or the month, or the
platform's for the month; ``read_x`` answers how many resources X returned
(``resources``), which is what X bills.

Bluesky is read with the person's own session, which IAM holds: no app
password is pasted. A session connected before 15 November 2026 only posts;
the tools say to connect Bluesky again in Settings to read.

LinkedIn lets Datalayer's application post and comment as the member and read
the member's profile, nothing more (14 November 2026): reading the member's
posts, the comments and reactions on them, or an organization page needs
LinkedIn's Community Management API, which Datalayer has not been granted. So
there is no tool that reads LinkedIn posts, and the agent says so.

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
    "BLUESKY_READS",
    "MAX_IMAGES",
    "bluesky_post_uri",
    "comment_on_linkedin",
    "follow_on_bluesky",
    "give_social_token",
    "is_linked",
    "like_on_bluesky",
    "linked_accounts",
    "post_to_bluesky",
    "post_to_linkedin",
    "post_to_x",
    "read_bluesky",
    "read_x",
    "reply_on_x",
    "like_on_x",
    "repost_on_x",
    "x_post_id",
    "send_mail",
    "refresh_linked_accounts",
    "reply_on_bluesky",
    "repost_on_bluesky",
    "social_accounts",
    "social_token_refusal",
]

#: How many images a post carries, on X and on Bluesky.
MAX_IMAGES = 4

#: How long before its expiry the token is renewed.
RENEW_BEFORE_SECONDS = 180

#: The largest image each network takes, in bytes.
_MAX_IMAGE_BYTES = {
    "x": 5 * 1024 * 1024,
    "bluesky": 1_000_000,
    "linkedin": 8 * 1024 * 1024,
}

#: The accounts IAM says are linked, as ``GET /social/accounts`` names them.
ACCOUNTS = ("x", "bluesky", "linkedin")

_IMAGE_TYPES = {"image/png", "image/jpeg"}

#: The sentence a tool answers when the runtime holds no social token.
NO_TOKEN = (
    "This runtime was given no social token, so it posts nowhere: it is given one "
    "when the person launches it on Datalayer, and the person links X, Bluesky or "
    "LinkedIn in Settings."
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
    accounts = {key: value for key, value in answer.json().items() if key in ACCOUNTS}
    with _lock:
        _state["accounts"] = accounts
    return accounts


def linked_accounts() -> Optional[Dict[str, Any]]:
    """Which accounts the person linked, as last read; ``None`` before any read."""
    return _state.get("accounts")


def is_linked(account: str) -> bool:
    """Whether the person linked this account (``x``, ``bluesky``, ``linkedin``), as last read."""
    accounts = _state.get("accounts") or {}
    return bool((accounts.get(account) or {}).get("linked"))


async def social_accounts() -> Any:
    """Read which of X, Bluesky and LinkedIn the person linked in Settings, and as whom.

    Returns:
        ``{"x": {"linked", "username", "url"}, "bluesky": {"linked", "handle", "did"},
        "linkedin": {"linked", "name", "expires_at"}}`` — LinkedIn says
        ``reconnect`` when its posting grant lapsed — or a sentence when this
        runtime cannot ask.
    """
    answer = await _iam("GET", "/api/iam/v1/social/accounts")
    if isinstance(answer, str):
        return answer
    if answer.status_code != 200:
        return f"IAM did not say which accounts are linked ({answer.status_code}): {_said(answer)}"
    accounts = {key: value for key, value in answer.json().items() if key in ACCOUNTS}
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

    It waits for the person's approval every time. X bills Datalayer USD 0.015
    for a post, and USD 0.20 for one carrying a link: say which before asking.

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


async def post_to_linkedin(
    text: str, image: Optional[str] = None, alt: Optional[str] = None
) -> Any:
    """Publish one post on the person's own LinkedIn profile, linked in Settings.

    It waits for the person's approval every time. Links in the text are
    shown as links; LinkedIn makes no card from them.

    Args:
        text: The post, at most 3000 characters.
        image: One PNG or JPEG image, a ``data:`` URL or an ``https://`` URL, at
            most 8 MB.
        alt: The image's alt text.

    Returns:
        ``{"post_urn", "post_url"}``, or a sentence saying why nothing was posted.
    """
    text = str(text or "").strip()
    if not text:
        return "A LinkedIn post needs some text."
    if len(text) > 3000:
        return "A LinkedIn post holds at most 3000 characters."
    body: Dict[str, Any] = {"commentary": text}
    if image:
        picture = await _image(image, "linkedin")
        if isinstance(picture, str):
            return picture
        content_type, content = picture
        uploaded = await _iam(
            "POST",
            "/api/iam/v1/social/linkedin/images",
            json={
                "data_url": f"data:{content_type};base64,{base64.b64encode(content).decode()}"
            },
        )
        if isinstance(uploaded, str):
            return uploaded
        if uploaded.status_code != 201:
            return f"LinkedIn did not take the image ({uploaded.status_code}): {_said(uploaded)}"
        body["image_urn"] = str(uploaded.json().get("image_urn") or "")
        if alt:
            body["image_alt_text"] = str(alt)[:4086]
    posted = await _iam("POST", "/api/iam/v1/social/linkedin/posts", json=body)
    if isinstance(posted, str):
        return posted
    if posted.status_code != 201:
        return f"Nothing was posted to LinkedIn ({posted.status_code}): {_said(posted)}"
    answer = posted.json()
    return {"post_urn": answer.get("post_urn"), "post_url": answer.get("post_url")}


_LINKEDIN_URN = re.compile(r"urn:li:(share|ugcPost|activity):([0-9]{1,30})")
_LINKEDIN_ACTIVITY = re.compile(r"-activity-([0-9]{1,30})")


def linkedin_post_urn(post: str) -> Optional[str]:
    """The post a URN or a LinkedIn address names, as ``urn:li:<kind>:<id>``; ``None`` for anything else."""
    value = str(post or "").strip()
    match = _LINKEDIN_URN.search(value.replace("%3A", ":").replace("%3a", ":"))
    if match:
        return f"urn:li:{match.group(1)}:{match.group(2)}"
    if value.startswith("https://www.linkedin.com/posts/"):
        activity = _LINKEDIN_ACTIVITY.search(value)
        if activity:
            return f"urn:li:activity:{activity.group(1)}"
    return None


async def comment_on_linkedin(post: str, text: str) -> Any:
    """Comment as the person under one LinkedIn post they point at.

    It waits for the person's approval every time. LinkedIn does not let this
    agent read a post's comments, so it comments under the post the person
    names, never in reply to a comment it read.

    Args:
        post: The post's address on LinkedIn (``https://www.linkedin.com/feed/update/urn:li:…``
            or ``https://www.linkedin.com/posts/…-activity-…``) or its URN.
        text: The comment, at most 1250 characters.

    Returns:
        ``{"comment_urn"}``, or a sentence saying why nothing was posted.
    """
    urn = linkedin_post_urn(post)
    if not urn:
        return "Name the LinkedIn post by its address or its urn:li:share, ugcPost or activity URN."
    text = str(text or "").strip()
    if not text:
        return "A LinkedIn comment needs some text."
    if len(text) > 1250:
        return "A LinkedIn comment holds at most 1250 characters."
    written = await _iam(
        "POST",
        "/api/iam/v1/social/linkedin/comments",
        json={"post_urn": urn, "text": text},
    )
    if isinstance(written, str):
        return written
    if written.status_code != 201:
        return f"Nothing was commented on LinkedIn ({written.status_code}): {_said(written)}"
    return {"comment_urn": written.json().get("comment_urn")}


# Bluesky, read and acted on as the person (the user, 15 November 2026: "for
# Bluesky, make it clear we can do everything"). IAM's read routes, one per
# AppView method, with the person's own session; the answers are made short
# here, so a timeline fits in a turn.

#: Each read IAM serves, and the arguments of ``read_bluesky`` it takes, as IAM names them.
BLUESKY_READS: Dict[str, Dict[str, str]] = {
    "timeline": {"limit": "limit", "cursor": "cursor"},
    "author-feed": {
        "actor": "actor",
        "limit": "limit",
        "cursor": "cursor",
        "filter": "filter",
    },
    "thread": {"post": "uri", "depth": "depth"},
    "likes": {"post": "uri", "limit": "limit", "cursor": "cursor"},
    "reposted-by": {"post": "uri", "limit": "limit", "cursor": "cursor"},
    "profile": {"actor": "actor"},
    "search-posts": {
        "query": "q",
        "actor": "author",
        "limit": "limit",
        "cursor": "cursor",
        "sort": "sort",
    },
    "search-actors": {"query": "q", "limit": "limit", "cursor": "cursor"},
    "notifications": {"limit": "limit", "cursor": "cursor"},
    "follows": {"actor": "actor", "limit": "limit", "cursor": "cursor"},
    "followers": {"actor": "actor", "limit": "limit", "cursor": "cursor"},
}

_BSKY_POST_URL = re.compile(
    r"^https://bsky\.app/profile/([^/\s]+)/post/([A-Za-z0-9]+)/?$"
)
_AT_POST = re.compile(r"^at://([^/\s]+)/app\.bsky\.feed\.post/([A-Za-z0-9]+)$")


def bluesky_post_uri(post: str) -> Optional[str]:
    """The post an ``at://`` URI or a bsky.app address names, as ``at://<actor>/app.bsky.feed.post/<key>``; ``None`` otherwise."""
    value = str(post or "").strip()
    match = _AT_POST.match(value) or _BSKY_POST_URL.match(value)
    if not match:
        return None
    return f"at://{match.group(1)}/app.bsky.feed.post/{match.group(2)}"


def _post_url(uri: str, handle: str = "") -> str:
    match = _AT_POST.match(str(uri or ""))
    if not match:
        return ""
    return f"https://bsky.app/profile/{handle or match.group(1)}/post/{match.group(2)}"


def _person(actor: Any) -> Dict[str, Any]:
    actor = actor if isinstance(actor, dict) else {}
    person = {"handle": actor.get("handle"), "did": actor.get("did")}
    if actor.get("displayName"):
        person["name"] = actor["displayName"]
    return person


def _post(view: Any) -> Dict[str, Any]:
    """A post as the agent reads it: who, what, when, its numbers and its address."""
    view = view if isinstance(view, dict) else {}
    record = view.get("record") if isinstance(view.get("record"), dict) else {}
    author = _person(view.get("author"))
    post: Dict[str, Any] = {
        "uri": view.get("uri"),
        "cid": view.get("cid"),
        "url": _post_url(str(view.get("uri") or ""), str(author.get("handle") or "")),
        "author": author,
        "text": record.get("text", ""),
        "created_at": record.get("createdAt"),
        "replies": view.get("replyCount", 0),
        "reposts": view.get("repostCount", 0),
        "likes": view.get("likeCount", 0),
        "quotes": view.get("quoteCount", 0),
    }
    reply = record.get("reply") if isinstance(record.get("reply"), dict) else None
    if reply:
        post["in_reply_to"] = (reply.get("parent") or {}).get("uri")
    images = (
        ((view.get("embed") or {}).get("images"))
        if isinstance(view.get("embed"), dict)
        else None
    )
    if images:
        post["images"] = [
            image.get("alt", "") for image in images if isinstance(image, dict)
        ]
    return post


def _thread(node: Any, depth: int = 0) -> Dict[str, Any]:
    node = node if isinstance(node, dict) else {}
    if "post" not in node:
        return {"unavailable": node.get("$type", "")}
    thread = _post(node["post"])
    replies = [
        reply for reply in (node.get("replies") or []) if isinstance(reply, dict)
    ]
    if replies and depth < 10:
        thread["thread_replies"] = [_thread(reply, depth + 1) for reply in replies]
    parent = node.get("parent")
    if depth == 0 and isinstance(parent, dict) and "post" in parent:
        thread["parent"] = _post(parent["post"])
    return thread


def _profile(view: Any) -> Dict[str, Any]:
    view = view if isinstance(view, dict) else {}
    return {
        **_person(view),
        "description": view.get("description", ""),
        "followers": view.get("followersCount"),
        "follows": view.get("followsCount"),
        "posts": view.get("postsCount"),
        "url": f"https://bsky.app/profile/{view.get('handle') or view.get('did')}",
    }


def _shorten(what: str, answer: Dict[str, Any]) -> Dict[str, Any]:
    """Bluesky's answer, kept to what the agent reads."""
    cursor = {"cursor": answer["cursor"]} if answer.get("cursor") else {}
    if what in {"timeline", "author-feed"}:
        items = []
        for item in answer.get("feed") or []:
            post = _post(item.get("post"))
            reason = item.get("reason") or {}
            if str(reason.get("$type", "")).endswith("reasonRepost"):
                post["reposted_by"] = _person(reason.get("by"))
            items.append(post)
        return {"posts": items, **cursor}
    if what == "search-posts":
        return {"posts": [_post(view) for view in answer.get("posts") or []], **cursor}
    if what == "thread":
        return {"thread": _thread(answer.get("thread"))}
    if what == "likes":
        return {
            "liked_by": [
                _person(like.get("actor")) for like in answer.get("likes") or []
            ],
            **cursor,
        }
    if what == "reposted-by":
        return {
            "reposted_by": [_person(actor) for actor in answer.get("repostedBy") or []],
            **cursor,
        }
    if what == "profile":
        return {"profile": _profile(answer)}
    if what == "search-actors":
        return {
            "people": [_profile(actor) for actor in answer.get("actors") or []],
            **cursor,
        }
    if what in {"follows", "followers"}:
        return {what: [_profile(actor) for actor in answer.get(what) or []], **cursor}
    if what == "notifications":
        notes = []
        for note in answer.get("notifications") or []:
            record = note.get("record") if isinstance(note.get("record"), dict) else {}
            entry = {
                "reason": note.get("reason"),
                "by": _person(note.get("author")),
                "uri": note.get("uri"),
                "about": note.get("reasonSubject"),
                "read": note.get("isRead"),
                "at": note.get("indexedAt"),
            }
            if record.get("text"):
                entry["text"] = record["text"]
            notes.append(entry)
        return {"notifications": notes, **cursor}
    return answer


async def _bluesky_read(what: str, params: Dict[str, Any]) -> Dict[str, Any] | str:
    answer = await _iam(
        "GET",
        f"/api/iam/v1/social/bluesky/read/{what}",
        params={key: value for key, value in params.items() if value not in (None, "")},
    )
    if isinstance(answer, str):
        return answer
    if answer.status_code != 200:
        return f"Bluesky was not read ({answer.status_code}): {_said(answer)}"
    body = answer.json()
    body.pop("success", None)
    return body


async def read_bluesky(
    what: str,
    actor: Optional[str] = None,
    post: Optional[str] = None,
    query: Optional[str] = None,
    limit: Optional[int] = None,
    cursor: Optional[str] = None,
    sort: Optional[str] = None,
    filter: Optional[str] = None,
    depth: Optional[int] = None,
) -> Any:
    """Read Bluesky as the person, with their account linked in Settings.

    Args:
        what: What to read: ``timeline`` (the person's home feed),
            ``author-feed`` (someone's posts; the person's own without
            ``actor``), ``thread`` (a post and its replies), ``likes`` and
            ``reposted-by`` (who liked or reposted a post), ``profile`` (the
            person's own without ``actor``), ``search-posts``,
            ``search-actors``, ``notifications`` (replies, mentions, likes,
            reposts, follows of the person), ``follows`` and ``followers``.
        actor: A handle (``ana.bsky.social``) or a DID, for ``author-feed``,
            ``profile``, ``follows``, ``followers``; the author to search in
            for ``search-posts``.
        post: The post, by its bsky.app address or its ``at://`` URI, for
            ``thread``, ``likes`` and ``reposted-by``.
        query: The words to search, for ``search-posts`` and ``search-actors``.
        limit: How many, 1 to 100 (Bluesky's default otherwise).
        cursor: The ``cursor`` of a previous answer, for the next page.
        sort: ``top`` or ``latest``, for ``search-posts``.
        filter: For ``author-feed``: ``posts_with_replies``,
            ``posts_no_replies``, ``posts_with_media`` or
            ``posts_and_author_threads``.
        depth: How deep the replies of a ``thread`` go, 0 to 10.

    Returns:
        The posts, people or notifications read, each post with its address,
        text, date and numbers, and a ``cursor`` when there is more; or a
        sentence saying why nothing was read.
    """
    what = str(what or "").strip()
    takes = BLUESKY_READS.get(what)
    if takes is None:
        return f"Read one of: {', '.join(BLUESKY_READS)}."
    given = {
        "actor": actor,
        "post": post,
        "query": query,
        "limit": limit,
        "cursor": cursor,
        "sort": sort,
        "filter": filter,
        "depth": depth,
    }
    unused = [
        name
        for name, value in given.items()
        if value not in (None, "") and name not in takes
    ]
    if unused:
        return f"Reading {what} takes {', '.join(takes) or 'nothing more'}, not {', '.join(unused)}."
    params: Dict[str, Any] = {}
    for name, param in takes.items():
        value = given.get(name)
        if value in (None, ""):
            continue
        if name == "post":
            uri = bluesky_post_uri(str(value))
            if not uri:
                return "Name the Bluesky post by its bsky.app address or its at:// URI."
            value = uri
        params[param] = value
    if what in {"thread", "likes", "reposted-by"} and "uri" not in params:
        return (
            f"Reading {what} needs the post, by its bsky.app address or its at:// URI."
        )
    if what in {"search-posts", "search-actors"} and "q" not in params:
        return f"Reading {what} needs the words to search (query)."
    answer = await _bluesky_read(what, params)
    if isinstance(answer, str):
        return answer
    return _shorten(what, answer)


async def _subject(post: str) -> Dict[str, Any] | str:
    """The post a tool acts on: its URI and CID, and the root of its thread."""
    uri = bluesky_post_uri(post)
    if not uri:
        return "Name the Bluesky post by its bsky.app address or its at:// URI."
    answer = await _bluesky_read("thread", {"uri": uri, "depth": 0, "parentHeight": 0})
    if isinstance(answer, str):
        return answer
    view = (
        (answer.get("thread") or {}).get("post")
        if isinstance(answer.get("thread"), dict)
        else None
    )
    if not isinstance(view, dict) or not view.get("uri") or not view.get("cid"):
        return "That Bluesky post could not be found."
    subject = {"uri": view["uri"], "cid": view["cid"]}
    record = view.get("record") if isinstance(view.get("record"), dict) else {}
    root = (
        ((record.get("reply") or {}).get("root"))
        if isinstance(record.get("reply"), dict)
        else None
    )
    return {
        "subject": subject,
        "root": root
        if isinstance(root, dict) and root.get("uri") and root.get("cid")
        else subject,
        "handle": str((view.get("author") or {}).get("handle") or ""),
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def _write(
    collection: str, record: Dict[str, Any], what: str
) -> Dict[str, Any] | str:
    rkey = _tid()
    written = await _iam(
        "PUT",
        "/api/iam/v1/social/bluesky/records",
        json={"collection": collection, "rkey": rkey, "record": record},
    )
    if isinstance(written, str):
        return written
    if written.status_code != 200:
        return (
            f"Nothing was {what} on Bluesky ({written.status_code}): {_said(written)}"
        )
    return {"uri": str(written.json().get("uri") or ""), "rkey": rkey}


async def reply_on_bluesky(post: str, text: str) -> Any:
    """Reply as the person under one Bluesky post.

    It waits for the person's approval every time.

    Args:
        post: The post replied to, by its bsky.app address or its ``at://`` URI.
        text: The reply, at most 300 characters.

    Returns:
        ``{"uri", "post_url"}`` of the reply, or a sentence saying why nothing was posted.
    """
    text = str(text or "").strip()
    if not text:
        return "A Bluesky reply needs some text."
    if len(text) > 300:
        return "A Bluesky reply holds at most 300 characters."
    target = await _subject(post)
    if isinstance(target, str):
        return target
    record: Dict[str, Any] = {
        "$type": "app.bsky.feed.post",
        "text": text,
        "createdAt": _now(),
        "reply": {"root": target["root"], "parent": target["subject"]},
    }
    facets = _link_facets(text)
    if facets:
        record["facets"] = facets
    written = await _write("app.bsky.feed.post", record, "replied")
    if isinstance(written, str):
        return written
    return {"uri": written["uri"], "post_url": _post_url(written["uri"])}


async def like_on_bluesky(post: str) -> Any:
    """Like one Bluesky post as the person. It waits for the person's approval every time.

    Args:
        post: The post, by its bsky.app address or its ``at://`` URI.

    Returns:
        ``{"uri"}`` of the like, or a sentence saying why nothing was liked.
    """
    target = await _subject(post)
    if isinstance(target, str):
        return target
    written = await _write(
        "app.bsky.feed.like",
        {
            "$type": "app.bsky.feed.like",
            "subject": target["subject"],
            "createdAt": _now(),
        },
        "liked",
    )
    return (
        written
        if isinstance(written, str)
        else {"uri": written["uri"], "liked": target["subject"]["uri"]}
    )


async def repost_on_bluesky(post: str) -> Any:
    """Repost one Bluesky post on the person's profile. It waits for the person's approval every time.

    Args:
        post: The post, by its bsky.app address or its ``at://`` URI.

    Returns:
        ``{"uri"}`` of the repost, or a sentence saying why nothing was reposted.
    """
    target = await _subject(post)
    if isinstance(target, str):
        return target
    written = await _write(
        "app.bsky.feed.repost",
        {
            "$type": "app.bsky.feed.repost",
            "subject": target["subject"],
            "createdAt": _now(),
        },
        "reposted",
    )
    return (
        written
        if isinstance(written, str)
        else {"uri": written["uri"], "reposted": target["subject"]["uri"]}
    )


async def follow_on_bluesky(actor: str) -> Any:
    """Follow one Bluesky account as the person. It waits for the person's approval every time.

    Args:
        actor: The account's handle (``ana.bsky.social``) or DID.

    Returns:
        ``{"uri", "followed"}``, or a sentence saying why nobody was followed.
    """
    actor = str(actor or "").strip().lstrip("@")
    if not actor:
        return "Name the Bluesky account to follow by its handle or DID."
    answer = await _bluesky_read("profile", {"actor": actor})
    if isinstance(answer, str):
        return answer
    did = str(answer.get("did") or "")
    if not did.startswith("did:"):
        return "That Bluesky account could not be found."
    written = await _write(
        "app.bsky.graph.follow",
        {"$type": "app.bsky.graph.follow", "subject": did, "createdAt": _now()},
        "followed",
    )
    return (
        written
        if isinstance(written, str)
        else {"uri": written["uri"], "followed": answer.get("handle") or did}
    )


# -- X, read and acted on as the person (15 November 2026) -----------------------

#: What ``read_x`` reads, and the arguments each takes.
X_READS: Dict[str, tuple[str, ...]] = {
    "me": (),
    "user": ("username",),
    "post": ("post",),
    "timeline": ("limit", "cursor"),
    "posts": ("limit", "cursor"),
    "mentions": ("limit", "cursor"),
    "replies": ("post", "limit", "cursor"),
    "search": ("query", "limit", "cursor"),
}

_X_POST_URL = re.compile(
    r"^https://(?:www\.)?(?:x|twitter)\.com/[A-Za-z0-9_]{1,15}/status/([0-9]{1,19})(?:[/?].*)?$"
)


def x_post_id(post: str) -> Optional[str]:
    """The post an x.com address or a bare id names, as its numeric id; ``None`` otherwise."""
    value = str(post or "").strip()
    if re.fullmatch(r"[0-9]{1,19}", value):
        return value
    match = _X_POST_URL.match(value)
    return match.group(1) if match else None


def _x_post(post: Any, username: str = "") -> Dict[str, Any]:
    post = post if isinstance(post, dict) else {}
    metrics = (
        post.get("public_metrics")
        if isinstance(post.get("public_metrics"), dict)
        else {}
    )
    shown: Dict[str, Any] = {
        "id": post.get("id"),
        "url": f"https://x.com/{username or 'i'}/status/{post.get('id')}",
        "author_id": post.get("author_id"),
        "text": post.get("text", ""),
        "created_at": post.get("created_at"),
        "replies": metrics.get("reply_count", 0),
        "reposts": metrics.get("retweet_count", 0),
        "likes": metrics.get("like_count", 0),
        "quotes": metrics.get("quote_count", 0),
    }
    if metrics.get("impression_count") is not None:
        shown["impressions"] = metrics["impression_count"]
    references = post.get("referenced_tweets") or []
    replied = [
        ref.get("id")
        for ref in references
        if isinstance(ref, dict) and ref.get("type") == "replied_to"
    ]
    if replied:
        shown["in_reply_to"] = replied[0]
    return shown


def _x_user(user: Any) -> Dict[str, Any]:
    user = user if isinstance(user, dict) else {}
    metrics = (
        user.get("public_metrics")
        if isinstance(user.get("public_metrics"), dict)
        else {}
    )
    return {
        "id": user.get("id"),
        "username": user.get("username"),
        "name": user.get("name"),
        "description": user.get("description", ""),
        "followers": metrics.get("followers_count"),
        "following": metrics.get("following_count"),
        "posts": metrics.get("tweet_count"),
        "url": f"https://x.com/{user.get('username')}",
    }


async def read_x(
    what: str,
    username: Optional[str] = None,
    post: Optional[str] = None,
    query: Optional[str] = None,
    limit: Optional[int] = None,
    cursor: Optional[str] = None,
) -> Any:
    """Read X as the person, with their account linked in Settings.

    Each read costs Datalayer at X: USD 0.001 for the person's own profile,
    USD 0.010 for someone's, USD 0.005 per post returned; the X budget
    guardrail asks for 20 posts at most.

    Args:
        what: What to read: ``me`` (the person's own profile), ``user``
            (someone's profile, by ``username``), ``post`` (one post),
            ``timeline`` (the person's home timeline), ``posts`` (the person's
            own posts), ``mentions`` (posts mentioning the person), ``replies``
            (the replies to a post, of the last seven days) or ``search``
            (recent posts matching ``query``, of the last seven days).
        username: An X username, without the @, for ``user``.
        post: The post, by its x.com address or its id, for ``post`` and ``replies``.
        query: The words to search, X's search syntax, for ``search``.
        limit: How many posts, at most 20 (10 otherwise).
        cursor: The ``cursor`` of a previous answer, for the next page.

    Returns:
        The posts or the profile read — each post with its address, text,
        date and numbers — ``resources``, how many X returned, and a
        ``cursor`` when there is more; or a sentence saying why nothing was read.
    """
    what = str(what or "").strip()
    takes = X_READS.get(what)
    if takes is None:
        return f"Read one of: {', '.join(X_READS)}."
    given = {
        "username": username,
        "post": post,
        "query": query,
        "limit": limit,
        "cursor": cursor,
    }
    unused = [
        name
        for name, value in given.items()
        if value not in (None, "") and name not in takes
    ]
    if unused:
        return f"Reading {what} on X takes {', '.join(takes) or 'nothing more'}, not {', '.join(unused)}."
    params: Dict[str, Any] = {}
    if "username" in takes:
        name = str(username or "").strip().lstrip("@")
        if not name:
            return "Reading a user on X needs their username."
        params["username"] = name
    if "post" in takes:
        post_id = x_post_id(str(post or ""))
        if not post_id:
            return "Name the X post by its x.com address or its id."
        params["post_id"] = post_id
    if "query" in takes:
        words = str(query or "").strip()
        if not words:
            return "Searching X needs the words to search (query)."
        params["query"] = words
    if "limit" in takes and limit not in (None, ""):
        params["max_results"] = int(limit)
    if "cursor" in takes and cursor:
        params["pagination_token"] = str(cursor)
    answer = await _iam("GET", f"/api/iam/v1/social/x/read/{what}", params=params)
    if isinstance(answer, str):
        return answer
    if answer.status_code != 200:
        return f"X was not read ({answer.status_code}): {_said(answer)}"
    body = answer.json()
    data = body.get("data")
    meta = body.get("meta") or {}
    resources = int(body.get("resources") or 0)
    accounts = _state.get("accounts") or {}
    own = str((accounts.get("x") or {}).get("username") or "")
    if what in {"me", "user"}:
        shown: Dict[str, Any] = {"profile": _x_user(data)}
    elif what == "post":
        shown = {"post": _x_post(data)}
    else:
        author = own if what == "posts" else ""
        shown = {"posts": [_x_post(item, author) for item in (data or [])]}
        next_token = meta.get("next_token")
        if next_token:
            shown["cursor"] = next_token
    shown["resources"] = resources
    return shown


async def reply_on_x(post: str, text: str) -> Any:
    """Reply as the person under one X post.

    It waits for the person's approval every time. X bills Datalayer USD 0.015
    for a reply, and USD 0.20 for one carrying a link: say which before asking.

    Args:
        post: The post replied to, by its x.com address or its id.
        text: The reply, at most 280 characters (a link counts 23).

    Returns:
        ``{"post_id", "post_url"}`` of the reply, or a sentence saying why nothing was posted.
    """
    post_id = x_post_id(post)
    if not post_id:
        return "Name the X post by its x.com address or its id."
    text = str(text or "").strip()
    if not text:
        return "An X reply needs some text."
    posted = await _iam(
        "POST",
        "/api/iam/v1/social/x/posts",
        json={"text": text, "in_reply_to": post_id},
    )
    if isinstance(posted, str):
        return posted
    if posted.status_code != 201:
        return f"Nothing was replied on X ({posted.status_code}): {_said(posted)}"
    body = posted.json()
    return {
        "post_id": body.get("post_id"),
        "post_url": body.get("post_url"),
        "in_reply_to": post_id,
    }


async def _x_interact(path: str, post: str, what: str) -> Any:
    post_id = x_post_id(post)
    if not post_id:
        return "Name the X post by its x.com address or its id."
    done = await _iam("POST", f"/api/iam/v1/social/x/{path}", json={"post_id": post_id})
    if isinstance(done, str):
        return done
    if done.status_code != 201:
        return f"Nothing was {what} on X ({done.status_code}): {_said(done)}"
    body = done.json()
    body.pop("success", None)
    return body


async def like_on_x(post: str) -> Any:
    """Like one X post as the person. It waits for the person's approval every time.

    Args:
        post: The post, by its x.com address or its id.

    Returns:
        ``{"post_id", "liked"}``, or a sentence saying why nothing was liked.
    """
    return await _x_interact("likes", post, "liked")


async def repost_on_x(post: str) -> Any:
    """Repost one X post on the person's profile. It waits for the person's approval every time.

    Args:
        post: The post, by its x.com address or its id.

    Returns:
        ``{"post_id", "retweeted"}``, or a sentence saying why nothing was reposted.
    """
    return await _x_interact("reposts", post, "reposted")


# -- A mail through Datalayer's mailer (15 November 2026) ---------------------------

#: Whom a runtime mails: Datalayer's support, or the person it runs for. Never an address.
MAIL_RECIPIENTS = ("support", "me")


async def send_mail(to: str, subject: str, text: str) -> Dict[str, Any] | str:
    """Send one mail through Datalayer's mailer (IAM's ``/social/mail``), with the social token.

    ``to`` is ``support`` (Datalayer's support address) or ``me`` (the person
    this runtime runs for); IAM refuses any other, and sends a few a day per
    person. No mail credential is in the runtime.

    Returns:
        ``{"sent": True, "to": …}``, or a sentence saying why it was not sent.
    """
    if to not in MAIL_RECIPIENTS:
        return "A mail goes to Datalayer's support or to you, never to another address."
    subject = " ".join(str(subject or "").split())
    text = str(text or "").strip()
    if not subject or not text:
        return "A mail needs a subject and some text."
    if len(subject) > 150:
        return "A mail's subject is at most 150 characters."
    if len(text) > 20000:
        return "A mail's text is at most 20 000 characters."
    answer = await _iam(
        "POST",
        "/api/iam/v1/social/mail",
        json={"to": to, "subject": subject, "text": text},
    )
    if isinstance(answer, str):
        return answer.replace("nothing was posted", "nothing was sent").replace(
            "it posts nowhere", "it sends no mail"
        )
    if answer.status_code != 202:
        return f"The mail was not sent ({answer.status_code}): {_said(answer)}"
    return {"sent": True, "to": to}
