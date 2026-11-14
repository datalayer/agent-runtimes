# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""datalayer-social: posting to X, Bluesky and LinkedIn on the person's linked accounts, through IAM.

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

    def __call__(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
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
        if path == "/api/iam/v1/social/bluesky/blobs":
            return httpx.Response(201, json={"success": True, "blob": {"ref": "b"}})
        if path == "/api/iam/v1/social/bluesky/records":
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "uri": f"at://did:plc:ana/app.bsky.feed.post/{body['rkey']}",
                },
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
