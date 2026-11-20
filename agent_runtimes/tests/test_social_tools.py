# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The datalayer-social tools: posting to X, Bluesky and LinkedIn on the person's linked accounts, through IAM.

The runtime holds a social token the companion gives it (decided 14 November
2026), renews it with itself ahead of its expiry, and calls IAM's social routes
with it; IAM posts with the accounts' tokens, which never reach the runtime.
The posting tools are ``publish`` and wait for approval; they need no pasted
secret; an optional posting tool counts in the Marketer's group of networks
when its account is linked, and an application follows its agent's groups
through its own connections.
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
from pathlib import Path
from typing import Any

import agentspecs
import httpx
import pytest

from agent_runtimes.guardrails.declared_secrets import declared_secrets
from agent_runtimes.specs.agents import get_agent_spec
from agent_runtimes.specs.backend_tools import BACKEND_TOOL_CATALOG
from agent_runtimes.tools import social

IAM = "https://iam.test"


def _token(exp: float, jti: str = "1") -> str:
    def part(value: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

    return f"{part({'alg': 'RS256'})}.{part({'exp': exp, 'jti': jti, 'aud': 'datalayer:social'})}.sig"


class FakeIam:
    """IAM's social routes, as they answer a runtime's social token."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str, Any, str]] = []
        self.accounts = {
            "x": {"linked": True, "username": "ana_x"},
            "bluesky": {"linked": False},
            "linkedin": {
                "linked": True,
                "name": "Ana Example",
                "expires_at": "2027-01-13T00:00:00Z",
            },
        }
        self.renewed = _token(time.time() + 900, "2")
        self.renew_status = 200
        self.reads: list[tuple[str, dict]] = []
        self.read_status = 200
        self.x_reads: list[tuple[str, dict]] = []
        self.x_read_status = 200

    def read_answer(self, what: str) -> dict:
        if self.read_status != 200:
            return {
                "detail": "Bluesky was connected for posting only. Connect it again in Settings › Bluesky so Datalayer can read it too."
            }
        bob = {
            "did": "did:plc:bob",
            "handle": "bob.bsky.social",
            "displayName": "Bob",
            "avatar": "https://cdn/x",
        }
        post = {
            "uri": "at://did:plc:bob/app.bsky.feed.post/3lbqz2xk4fc2b",
            "cid": "bafybob",
            "author": bob,
            "record": {
                "text": "Hello Ana",
                "createdAt": "2026-11-15T08:00:00Z",
                "reply": {
                    "root": {
                        "uri": "at://did:plc:ana/app.bsky.feed.post/3root",
                        "cid": "bafyroot",
                    },
                    "parent": {
                        "uri": "at://did:plc:ana/app.bsky.feed.post/3root",
                        "cid": "bafyroot",
                    },
                },
            },
            "replyCount": 1,
            "repostCount": 2,
            "likeCount": 3,
            "quoteCount": 0,
            "labels": [],
            "viewer": {},
        }
        if what in ("timeline", "author-feed"):
            return {
                "feed": [
                    {
                        "post": post,
                        "reason": {
                            "$type": "app.bsky.feed.defs#reasonRepost",
                            "by": bob,
                        },
                    }
                ],
                "cursor": "c2",
            }
        if what == "thread":
            return {
                "thread": {
                    "$type": "app.bsky.feed.defs#threadViewPost",
                    "post": post,
                    "replies": [
                        {
                            "post": {
                                **post,
                                "uri": "at://did:plc:bob/app.bsky.feed.post/3r",
                            }
                        }
                    ],
                }
            }
        if what == "profile":
            return {
                **bob,
                "description": "Bob's",
                "followersCount": 10,
                "followsCount": 5,
                "postsCount": 7,
            }
        if what == "notifications":
            return {
                "notifications": [
                    {
                        "reason": "reply",
                        "author": bob,
                        "uri": post["uri"],
                        "reasonSubject": "at://did:plc:ana/app.bsky.feed.post/3root",
                        "isRead": False,
                        "indexedAt": "2026-11-15T08:00:01Z",
                        "record": {"text": "Hello Ana"},
                    }
                ]
            }
        if what == "likes":
            return {"likes": [{"actor": bob}]}
        return {}

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body: Any = json.loads(request.content) if request.content else None
        self.calls.append(
            (
                request.method,
                request.url.path,
                body,
                request.headers.get("authorization", ""),
            )
        )
        path = request.url.path
        if path == "/api/iam/v1/social/runtime-token/renew":
            if self.renew_status != 200:
                return httpx.Response(
                    self.renew_status, json={"detail": "The runtime has ended."}
                )
            return httpx.Response(
                200, json={"access_token": self.renewed, "expires_in": 900}
            )
        if path == "/api/iam/v1/social/accounts":
            return httpx.Response(200, json={"success": True, **self.accounts})
        if path == "/api/iam/v1/social/x/media":
            return httpx.Response(201, json={"success": True, "media_id": "7"})
        if path == "/api/iam/v1/social/x/posts":
            return httpx.Response(
                201,
                json={
                    "success": True,
                    "post_id": "1",
                    "post_url": "https://x.com/ana_x/status/1",
                },
            )
        if path.startswith("/api/iam/v1/social/x/read/"):
            what = path.rsplit("/", 1)[1]
            self.x_reads.append((what, dict(request.url.params)))
            if self.x_read_status != 200:
                return httpx.Response(
                    self.x_read_status,
                    json={
                        "detail": "X was linked for posting only. Link X again in Settings › X so Datalayer can read it too."
                    },
                )
            post = {
                "id": "7",
                "text": "Hello Ana",
                "author_id": "9",
                "created_at": "2026-11-15T08:00:00Z",
                "public_metrics": {
                    "reply_count": 1,
                    "retweet_count": 2,
                    "like_count": 3,
                    "quote_count": 0,
                    "impression_count": 40,
                },
                "referenced_tweets": [{"type": "replied_to", "id": "6"}],
            }
            if what in ("me", "user"):
                data = {
                    "id": "42",
                    "username": "ana_x",
                    "name": "Ana",
                    "description": "Ana's",
                    "public_metrics": {
                        "followers_count": 10,
                        "following_count": 5,
                        "tweet_count": 7,
                    },
                }
                return httpx.Response(
                    200,
                    json={"success": True, "data": data, "meta": {}, "resources": 1},
                )
            if what == "post":
                return httpx.Response(
                    200,
                    json={"success": True, "data": post, "meta": {}, "resources": 1},
                )
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": [post, {**post, "id": "8"}],
                    "meta": {"result_count": 2, "next_token": "n2"},
                    "resources": 2,
                },
            )
        if path == "/api/iam/v1/social/mail":
            if body["to"] not in ("support", "me"):
                return httpx.Response(422, json={"detail": "to is support or me"})
            if getattr(self, "mail_status", 202) != 202:
                return httpx.Response(
                    self.mail_status,
                    json={
                        "detail": "No more mail today: Datalayer sends at most 10 a day for one person's agents. Try again tomorrow."
                    },
                )
            return httpx.Response(202, json={"success": True, "to": body["to"]})
        if path in ("/api/iam/v1/social/x/likes", "/api/iam/v1/social/x/reposts"):
            done = "liked" if path.endswith("likes") else "retweeted"
            return httpx.Response(
                201, json={"success": True, "post_id": body["post_id"], done: True}
            )
        if path == "/api/iam/v1/social/bluesky/blobs":
            return httpx.Response(201, json={"success": True, "blob": {"ref": "b"}})
        if path == "/api/iam/v1/social/bluesky/records":
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "uri": f"at://did:plc:ana/{body['collection']}/{body['rkey']}",
                },
            )
        if path.startswith("/api/iam/v1/social/bluesky/read/"):
            self.reads.append((path.rsplit("/", 1)[1], dict(request.url.params)))
            return httpx.Response(
                self.read_status,
                json={"success": True, **self.read_answer(path.rsplit("/", 1)[1])},
            )
        if path == "/api/iam/v1/social/linkedin/images":
            return httpx.Response(
                201, json={"success": True, "image_urn": "urn:li:image:ana-1"}
            )
        if path == "/api/iam/v1/social/linkedin/posts":
            return httpx.Response(
                201,
                json={
                    "success": True,
                    "post_urn": "urn:li:share:42",
                    "post_url": "https://www.linkedin.com/feed/update/urn:li:share:42/",
                },
            )
        if path == "/api/iam/v1/social/linkedin/comments":
            return httpx.Response(
                201,
                json={
                    "success": True,
                    "comment_urn": f"urn:li:comment:({body['post_urn']},7)",
                },
            )
        return httpx.Response(404)


@pytest.fixture
def iam(monkeypatch):
    fake = FakeIam()
    monkeypatch.setenv("DATALAYER_IAM_URL", IAM)
    monkeypatch.setattr(
        social,
        "_client",
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake)),
    )
    social.give_social_token(_token(time.time() + 900))
    yield fake
    social.give_social_token(None)


PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG fake").decode()


def test_it_posts_to_x_through_iam_with_its_social_token(iam):
    answer = asyncio.run(social.post_to_x("Hello", images=[PNG]))

    assert answer == {"post_id": "1", "post_url": "https://x.com/ana_x/status/1"}
    (media, post) = iam.calls
    assert media[1] == "/api/iam/v1/social/x/media" and media[2]["data_url"].startswith(
        "data:image/png;base64,"
    )
    assert post[1:3] == (
        "/api/iam/v1/social/x/posts",
        {"text": "Hello", "media_ids": ["7"]},
    )
    assert all(call[3] == f"Bearer {social._state['token']}" for call in iam.calls)


def test_it_posts_to_bluesky_as_a_post_record_under_a_tid_with_link_facets(iam):
    answer = asyncio.run(
        social.post_to_bluesky(
            "Read https://datalayer.ai now", images=[PNG], alt=["A cup"]
        )
    )

    (blob, record) = iam.calls
    assert (
        blob[1] == "/api/iam/v1/social/bluesky/blobs"
        and blob[2]["content_type"] == "image/png"
    )
    assert record[0] == "PUT" and record[2]["collection"] == "app.bsky.feed.post"
    rkey = record[2]["rkey"]
    assert len(rkey) == 13 and set(rkey) <= set(social._TID_ALPHABET)
    written = record[2]["record"]
    assert written["text"] == "Read https://datalayer.ai now"
    assert written["embed"]["images"] == [{"image": {"ref": "b"}, "alt": "A cup"}]
    assert written["facets"][0]["index"] == {"byteStart": 5, "byteEnd": 25}
    assert answer["post_url"] == f"https://bsky.app/profile/did:plc:ana/post/{rkey}"


def test_it_posts_to_linkedin_with_one_image_and_its_alt_text(iam):
    answer = asyncio.run(
        social.post_to_linkedin("Read https://datalayer.ai", image=PNG, alt="A cup")
    )

    assert answer == {
        "post_urn": "urn:li:share:42",
        "post_url": "https://www.linkedin.com/feed/update/urn:li:share:42/",
    }
    (image, post) = iam.calls
    assert image[1] == "/api/iam/v1/social/linkedin/images"
    assert image[2]["data_url"].startswith("data:image/png;base64,")
    assert post[1:3] == (
        "/api/iam/v1/social/linkedin/posts",
        {
            "commentary": "Read https://datalayer.ai",
            "image_urn": "urn:li:image:ana-1",
            "image_alt_text": "A cup",
        },
    )
    assert all(call[3] == f"Bearer {social._state['token']}" for call in iam.calls)


def test_a_linkedin_post_over_its_length_calls_nothing(iam):
    assert "3000" in asyncio.run(social.post_to_linkedin("x" * 3001))
    assert iam.calls == []


@pytest.mark.parametrize(
    "post, urn",
    [
        (
            "https://www.linkedin.com/feed/update/urn:li:share:7527/",
            "urn:li:share:7527",
        ),
        (
            "https://www.linkedin.com/feed/update/urn%3Ali%3Aactivity%3A7527",
            "urn:li:activity:7527",
        ),
        (
            "https://www.linkedin.com/posts/ana_launch-activity-7527-AbCd",
            "urn:li:activity:7527",
        ),
        ("urn:li:ugcPost:7527", "urn:li:ugcPost:7527"),
        ("https://attacker.example/urn-li-share-1", None),
        ("urn:li:person:ana", None),
    ],
)
def test_a_linkedin_post_is_named_by_its_address_or_its_urn(post, urn):
    assert social.linkedin_post_urn(post) == urn


def test_it_comments_under_the_linkedin_post_the_person_names(iam):
    answer = asyncio.run(
        social.comment_on_linkedin(
            "https://www.linkedin.com/posts/ana_launch-activity-7527-AbCd", "Thanks!"
        )
    )
    assert answer == {"comment_urn": "urn:li:comment:(urn:li:activity:7527,7)"}
    assert iam.calls[0][1:3] == (
        "/api/iam/v1/social/linkedin/comments",
        {"post_urn": "urn:li:activity:7527", "text": "Thanks!"},
    )
    assert "Name the LinkedIn post" in asyncio.run(
        social.comment_on_linkedin("a post", "Hi")
    )
    assert len(iam.calls) == 1


def test_no_tool_reads_linkedin_posts():
    """LinkedIn grants Datalayer's application no reading scope (14 November 2026): nothing pretends to."""
    tools = {spec.id: spec for spec in BACKEND_TOOL_CATALOG.values()}
    linkedin = {
        tool_id: spec
        for tool_id, spec in tools.items()
        if "linkedin" in (spec.linked_accounts or [])
    }
    assert sorted(linkedin) == ["social-comment-linkedin", "social-post-linkedin"]
    assert all(spec.approval == "manual" for spec in linkedin.values())
    assert not hasattr(social, "read_linkedin_posts")


def test_it_renews_its_token_with_itself_before_it_expires(iam):
    social.give_social_token(_token(time.time() + 60))
    asyncio.run(social.social_accounts())

    assert iam.calls[0][1] == "/api/iam/v1/social/runtime-token/renew"
    assert iam.calls[1][3] == f"Bearer {iam.renewed}"
    assert social._state["token"] == iam.renewed


def test_once_the_runtime_ended_it_posts_nowhere_and_says_why(iam):
    social.give_social_token(_token(time.time() + 60))
    iam.renew_status = 401

    answer = asyncio.run(social.post_to_x("Hello"))

    assert "no longer renews" in answer and "401" in answer
    assert [call[1] for call in iam.calls] == ["/api/iam/v1/social/runtime-token/renew"]


def test_without_a_social_token_it_says_so_and_calls_nothing(iam):
    social.give_social_token(None)
    assert asyncio.run(social.post_to_bluesky("Hello")) == social.NO_TOKEN
    assert iam.calls == []


def test_the_linked_accounts_are_read_and_kept_for_the_groups(iam):
    assert asyncio.run(social.social_accounts()) == iam.accounts
    assert social.is_linked("x") is True and social.is_linked("bluesky") is False
    assert social.is_linked("linkedin") is True


def test_the_posting_tools_publish_and_wait_for_approval_with_no_secret():
    tools = {spec.id: spec for spec in BACKEND_TOOL_CATALOG.values()}
    for tool_id, account in (
        ("social-post-x", "x"),
        ("social-post-bluesky", "bluesky"),
        ("social-post-linkedin", "linkedin"),
        ("social-comment-linkedin", "linkedin"),
    ):
        spec = tools[tool_id]
        assert spec.approval == "manual"
        assert spec.linked_accounts == [account]
        assert spec.runtime.package == "agent_runtimes.tools.social"
    assert (
        tools["social-accounts"].approval == "auto"
        and tools["social-accounts"].linked_accounts == []
    )


def _linked(monkeypatch, *accounts: str) -> None:
    monkeypatch.setattr(
        social,
        "_state",
        {**social._state, "accounts": {name: {"linked": True} for name in accounts}},
    )


class TestTheMarketersNetworks:
    marketer = get_agent_spec("worker-marketer")

    def test_a_linked_account_counts_for_one_network(self, monkeypatch):
        declared = declared_secrets(self.marketer)
        _linked(monkeypatch)
        assert declared.missing(lambda name: False, "The Marketer")
        _linked(monkeypatch, "bluesky")
        assert declared.missing(lambda name: False, "The Marketer") == []
        _linked(monkeypatch, "linkedin")
        assert declared.missing(lambda name: False, "The Marketer") == []

    def test_a_posting_tool_whose_account_is_not_linked_is_left_out_and_said(
        self, monkeypatch
    ):
        _linked(monkeypatch, "x")
        left_out = declared_secrets(self.marketer).left_out(lambda name: False)
        assert left_out.tools == {
            "social-post-bluesky": ["a linked Bluesky account"],
            "social-read-bluesky": ["a linked Bluesky account"],
            "social-reply-bluesky": ["a linked Bluesky account"],
            "social-like-bluesky": ["a linked Bluesky account"],
            "social-repost-bluesky": ["a linked Bluesky account"],
            "social-follow-bluesky": ["a linked Bluesky account"],
            "social-post-linkedin": ["a linked LinkedIn account"],
            "social-comment-linkedin": ["a linked LinkedIn account"],
        }
        assert (
            "the backend tool social-post-bluesky (no a linked Bluesky account)"
            in left_out.sentence()
        )

    def test_the_marketer_application_needs_one_network_or_a_linked_account(
        self, monkeypatch
    ):
        import yaml

        APPS_DIR = Path(agentspecs.__file__).parent / "apps"

        app = yaml.safe_load((APPS_DIR / "marketer.yaml").read_text())
        _linked(monkeypatch)
        declared = declared_secrets(self.marketer, app_spec=app)
        assert declared.missing(lambda name: False, "Marketer")
        _linked(monkeypatch, "x")
        assert declared.missing(lambda name: False, "Marketer") == []
        _linked(monkeypatch, "linkedin")
        assert declared.missing(lambda name: False, "Marketer") == []
        assert (
            declared.missing(lambda name: name == "DISCORD_BOT_TOKEN", "Marketer") == []
        )

    def test_its_demo_connects_to_no_network_and_needs_none(self, monkeypatch):
        import yaml

        APPS_DIR = Path(agentspecs.__file__).parent / "apps"

        _linked(monkeypatch)
        demo = yaml.safe_load((APPS_DIR / "demo-marketer.yaml").read_text())
        declared = declared_secrets(
            self.marketer, app_spec=demo, app_instance={"deployment_uid": "dep-1"}
        )
        assert declared.at_least_one == ()
        assert declared.missing(lambda name: False, "Marketer") == []
        # Configured from the agent alone, merged with the application launched: the application's groups win.
        assert (
            declared_secrets(self.marketer)
            .merged(declared)
            .missing(lambda name: False, "Marketer")
            == []
        )


def test_its_social_token_is_the_pod_s_to_give(iam, monkeypatch):
    """Only the companion, over the pod's own secret, gives it; the linked accounts are read at once."""
    from types import SimpleNamespace

    from fastapi import HTTPException

    from agent_runtimes.apps import callers
    from agent_runtimes.routes.configure import (
        SocialTokenRequest,
        give_social_token_endpoint,
    )

    monkeypatch.setattr(callers, "is_the_pod", lambda host, secret: secret == "the-pod")

    async def give(secret: str | None, token: str):
        request = SimpleNamespace(
            client=SimpleNamespace(host="127.0.0.1"),
            headers={callers.POD_SECRET_HEADER: secret} if secret else {},
        )
        try:
            return await give_social_token_endpoint(
                request, SocialTokenRequest(token=token)
            )
        except HTTPException as refused:
            return refused.status_code

    assert asyncio.run(give(None, _token(time.time() + 900))) == 403
    assert asyncio.run(give("the-pod", " ")) == 422
    answer = asyncio.run(give("the-pod", _token(time.time() + 900, "3")))
    assert (
        answer["linked"] == ["linkedin", "x"]
        and answer["note"] == "Linked: linkedin, x."
    )
    assert social.is_linked("x")


class TestBlueskyEverything:
    """15 November 2026: Bluesky read and acted on as the person, through IAM's read routes and records."""

    def test_the_timeline_is_read_through_iam_and_made_short(self, iam):
        answer = asyncio.run(social.read_bluesky("timeline", limit=5))

        assert iam.reads == [("timeline", {"limit": "5"})]
        assert answer["cursor"] == "c2"
        (post,) = answer["posts"]
        assert (
            post["text"] == "Hello Ana" and post["likes"] == 3 and post["reposts"] == 2
        )
        assert (
            post["url"] == "https://bsky.app/profile/bob.bsky.social/post/3lbqz2xk4fc2b"
        )
        assert post["reposted_by"]["handle"] == "bob.bsky.social"
        assert "avatar" not in json.dumps(answer) and "viewer" not in post
        assert all(call[3] == f"Bearer {social._state['token']}" for call in iam.calls)

    def test_a_post_is_named_by_its_address_or_its_uri(self, iam):
        asyncio.run(
            social.read_bluesky(
                "thread",
                post="https://bsky.app/profile/bob.bsky.social/post/3lbqz2xk4fc2b",
                depth=2,
            )
        )
        asyncio.run(
            social.read_bluesky(
                "likes", post="at://did:plc:bob/app.bsky.feed.post/3lbqz2xk4fc2b"
            )
        )
        assert iam.reads == [
            (
                "thread",
                {
                    "uri": "at://bob.bsky.social/app.bsky.feed.post/3lbqz2xk4fc2b",
                    "depth": "2",
                },
            ),
            ("likes", {"uri": "at://did:plc:bob/app.bsky.feed.post/3lbqz2xk4fc2b"}),
        ]
        assert social.bluesky_post_uri("https://evil.example/profile/a/post/1") is None

    def test_profile_notifications_and_search_take_what_they_name(self, iam):
        profile = asyncio.run(social.read_bluesky("profile"))
        notes = asyncio.run(social.read_bluesky("notifications"))
        asyncio.run(
            social.read_bluesky(
                "search-posts",
                query="datalayer",
                actor="ana.bsky.social",
                sort="latest",
            )
        )

        assert (
            profile["profile"]["followers"] == 10
            and profile["profile"]["handle"] == "bob.bsky.social"
        )
        assert (
            notes["notifications"][0]["reason"] == "reply"
            and notes["notifications"][0]["text"] == "Hello Ana"
        )
        assert iam.reads[-1] == (
            "search-posts",
            {"q": "datalayer", "author": "ana.bsky.social", "sort": "latest"},
        )

    @pytest.mark.parametrize(
        "kwargs, said",
        [
            ({"what": "everything"}, "Read one of"),
            ({"what": "timeline", "query": "x"}, "not query"),
            ({"what": "thread"}, "needs the post"),
            ({"what": "thread", "post": "a post"}, "Name the Bluesky post"),
            ({"what": "search-actors"}, "needs the words"),
        ],
    )
    def test_a_read_it_cannot_make_calls_nothing(self, iam, kwargs, said):
        assert said in asyncio.run(social.read_bluesky(**kwargs))
        assert iam.calls == []

    def test_a_session_connected_for_posting_only_says_connect_again(self, iam):
        iam.read_status = 403
        answer = asyncio.run(social.read_bluesky("timeline"))
        assert "403" in answer and "Connect it again" in answer

    def test_a_reply_names_the_thread_s_root_and_its_parent(self, iam):
        answer = asyncio.run(
            social.reply_on_bluesky(
                "https://bsky.app/profile/bob.bsky.social/post/3lbqz2xk4fc2b",
                "Thanks Bob",
            )
        )

        record = iam.calls[-1]
        assert record[0] == "PUT" and record[2]["collection"] == "app.bsky.feed.post"
        reply = record[2]["record"]["reply"]
        assert reply["parent"] == {
            "uri": "at://did:plc:bob/app.bsky.feed.post/3lbqz2xk4fc2b",
            "cid": "bafybob",
        }
        assert reply["root"] == {
            "uri": "at://did:plc:ana/app.bsky.feed.post/3root",
            "cid": "bafyroot",
        }
        assert answer["post_url"].startswith(
            "https://bsky.app/profile/did:plc:ana/post/"
        )

    def test_like_repost_and_follow_write_their_records(self, iam):
        post = "at://did:plc:bob/app.bsky.feed.post/3lbqz2xk4fc2b"
        liked = asyncio.run(social.like_on_bluesky(post))
        reposted = asyncio.run(social.repost_on_bluesky(post))
        followed = asyncio.run(social.follow_on_bluesky("@bob.bsky.social"))

        writes = [
            call[2]
            for call in iam.calls
            if call[1] == "/api/iam/v1/social/bluesky/records"
        ]
        assert [w["collection"] for w in writes] == [
            "app.bsky.feed.like",
            "app.bsky.feed.repost",
            "app.bsky.graph.follow",
        ]
        assert writes[0]["record"]["subject"] == {"uri": post, "cid": "bafybob"}
        assert writes[2]["record"]["subject"] == "did:plc:bob"
        assert all(len(w["rkey"]) == 13 for w in writes)
        assert (
            liked["liked"] == post
            and reposted["reposted"] == post
            and followed["followed"] == "bob.bsky.social"
        )

    def test_the_acting_tools_wait_for_approval_and_the_read_does_not(self):
        tools = {spec.id: spec for spec in BACKEND_TOOL_CATALOG.values()}
        assert tools["social-read-bluesky"].approval == "auto"
        for tool_id in (
            "social-reply-bluesky",
            "social-like-bluesky",
            "social-repost-bluesky",
            "social-follow-bluesky",
        ):
            assert tools[tool_id].approval == "manual" and tools[
                tool_id
            ].linked_accounts == ["bluesky"]
            assert callable(getattr(social, tools[tool_id].runtime.method))

    def test_the_marketer_reads_bluesky_without_its_server(self):
        marketer = get_agent_spec("worker-marketer")
        assert "bluesky" not in [server.id for server in marketer.mcp_servers]


class TestXEverything:
    """15 November 2026: X read and acted on as the person through IAM ("move X read/write to iam"), every call held to the X budget."""

    def test_the_timeline_is_read_through_iam_made_short_with_what_x_returned(
        self, iam
    ):
        answer = asyncio.run(social.read_x("timeline", limit=5))
        assert iam.x_reads == [("timeline", {"max_results": "5"})]
        assert answer["resources"] == 2 and answer["cursor"] == "n2"
        assert answer["posts"][0] == {
            "id": "7",
            "url": "https://x.com/i/status/7",
            "author_id": "9",
            "text": "Hello Ana",
            "created_at": "2026-11-15T08:00:00Z",
            "replies": 1,
            "reposts": 2,
            "likes": 3,
            "quotes": 0,
            "impressions": 40,
            "in_reply_to": "6",
        }

    def test_the_person_s_profile_someone_s_a_post_its_replies_and_a_search(self, iam):
        me = asyncio.run(social.read_x("me"))
        asyncio.run(social.read_x("user", username="@bob_x"))
        asyncio.run(social.read_x("post", post="https://x.com/bob_x/status/7"))
        asyncio.run(social.read_x("replies", post="7", cursor="n2"))
        asyncio.run(social.read_x("search", query="datalayer"))
        assert me["profile"]["username"] == "ana_x" and me["resources"] == 1
        assert iam.x_reads == [
            ("me", {}),
            ("user", {"username": "bob_x"}),
            ("post", {"post_id": "7"}),
            ("replies", {"post_id": "7", "pagination_token": "n2"}),
            ("search", {"query": "datalayer"}),
        ]

    @pytest.mark.parametrize(
        "kwargs, said",
        [
            ({"what": "everything"}, "Read one of"),
            ({"what": "post"}, "x.com address or its id"),
            ({"what": "search"}, "words to search"),
            ({"what": "user"}, "username"),
            ({"what": "me", "query": "x"}, "takes nothing more"),
        ],
    )
    def test_a_read_it_cannot_make_calls_nothing(self, iam, kwargs, said):
        assert said in asyncio.run(social.read_x(**kwargs))
        assert iam.x_reads == []

    def test_a_grant_made_for_posting_only_says_link_again(self, iam):
        iam.x_read_status = 403
        assert "Link X again" in asyncio.run(social.read_x("mentions"))

    def test_a_reply_a_like_and_a_repost_through_iam(self, iam):
        replied = asyncio.run(
            social.reply_on_x("https://x.com/bob_x/status/7", "Thanks!")
        )
        liked = asyncio.run(social.like_on_x("7"))
        reposted = asyncio.run(social.repost_on_x("https://twitter.com/bob_x/status/7"))
        assert replied == {
            "post_id": "1",
            "post_url": "https://x.com/ana_x/status/1",
            "in_reply_to": "7",
        }
        assert liked == {"post_id": "7", "liked": True} and reposted == {
            "post_id": "7",
            "retweeted": True,
        }
        assert [(c[1], c[2]) for c in iam.calls] == [
            ("/api/iam/v1/social/x/posts", {"text": "Thanks!", "in_reply_to": "7"}),
            ("/api/iam/v1/social/x/likes", {"post_id": "7"}),
            ("/api/iam/v1/social/x/reposts", {"post_id": "7"}),
        ]
        assert "x.com address" in asyncio.run(social.like_on_x("not a post"))

    def test_the_acting_tools_wait_for_approval_and_the_read_does_not(self):
        tools = {spec.id: spec for spec in BACKEND_TOOL_CATALOG.values()}
        assert tools["social-read-x"].approval == "auto" and tools[
            "social-read-x"
        ].linked_accounts == ["x"]
        for tool_id in ("social-reply-x", "social-like-x", "social-repost-x"):
            assert tools[tool_id].approval == "manual" and tools[
                tool_id
            ].linked_accounts == ["x"]
            assert callable(getattr(social, tools[tool_id].runtime.method))

    def test_the_marketer_reads_x_without_its_server_or_a_pasted_key(self):
        marketer = get_agent_spec("worker-marketer")
        assert "x" not in [server.id for server in marketer.mcp_servers]
        assert "X_BEARER_TOKEN" not in json.dumps(marketer.model_dump(), default=str)


class TestAMail:
    """15 November 2026: a mail through Datalayer's mailer (IAM's /social/mail), to support or the person alone."""

    def test_to_the_person_and_to_support_through_iam(self, iam):
        assert asyncio.run(
            social.send_mail("me", "Your week on X", "Three posts.")
        ) == {"sent": True, "to": "me"}
        assert asyncio.run(social.send_mail("support", "X budget", "80%")) == {
            "sent": True,
            "to": "support",
        }
        assert [(c[1], c[2]) for c in iam.calls] == [
            (
                "/api/iam/v1/social/mail",
                {"to": "me", "subject": "Your week on X", "text": "Three posts."},
            ),
            (
                "/api/iam/v1/social/mail",
                {"to": "support", "subject": "X budget", "text": "80%"},
            ),
        ]

    @pytest.mark.parametrize(
        "to, subject, text, said",
        [
            ("bob@example.com", "s", "t", "never to another address"),
            ("me", "", "t", "a subject and some text"),
            ("me", "s" * 151, "t", "at most 150"),
        ],
    )
    def test_what_it_cannot_send_calls_nothing(self, iam, to, subject, text, said):
        assert said in asyncio.run(social.send_mail(to, subject, text))
        assert iam.calls == []

    def test_a_refusal_is_said(self, iam):
        iam.mail_status = 429
        assert "No more mail today" in asyncio.run(social.send_mail("me", "s", "t"))

    def test_without_a_social_token_it_sends_nothing(self, iam):
        social.give_social_token(None)
        said = asyncio.run(social.send_mail("me", "s", "t"))
        assert isinstance(said, str) and "social token" in said and iam.calls == []

    def test_the_skill_s_route_mails_the_person_alone(self, iam):
        from fastapi import HTTPException

        from agent_runtimes.routes.configure import MailToMeRequest, mail_me_endpoint

        assert asyncio.run(
            mail_me_endpoint(MailToMeRequest(subject="Summary", text="Hi"))
        ) == {"sent": True, "to": "me"}
        assert iam.calls[-1][2]["to"] == "me"
        iam.mail_status = 429
        try:
            asyncio.run(mail_me_endpoint(MailToMeRequest(subject="Summary", text="Hi")))
        except HTTPException as refused:
            assert refused.status_code == 409 and "No more mail today" in refused.detail
        else:
            raise AssertionError("refused")
