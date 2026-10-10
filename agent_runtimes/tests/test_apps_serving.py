# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop apps run --web` (LOOP P-08): an application served on this machine in
the embed's page, and built again when its file changes — the page told to
reload, or why the change was refused while the application runs on as it was.
"""

import asyncio
import json
import re
import textwrap
from pathlib import Path
from typing import Any, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import mounting, serving
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    Runtime,
    answer_of,
    events_of,
    runtime,
)

pytest.importorskip("agentspecs.apps")


def app_py(name: str = "Echo Desk", answer: str = "Echo") -> str:
    """An app.py whose code answers every message."""
    return textwrap.dedent(
        f"""
        from agent_runtimes.loop.apps import Application, Session

        app = Application(
            id="echo-desk",
            name={name!r},
            kind="chat",
            agent="cog-crawler:0.0.1",
        )


        @app.message
        async def reply(session: Session, text: str) -> None:
            await session.send({answer!r} + ": " + text)
        """
    )


def build_of(path: Path) -> Any:
    """The application an app.py builds."""
    from agent_runtimes.loop.apps.build import build

    return build(path).application


@pytest.fixture()
def served(
    runtime: Runtime,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> Iterator[Dict[str, Any]]:
    """An app.py served as `loop apps run --web --watch` serves it, the embed from a folder."""
    made: List[Dict[str, Any]] = []

    async def create(app: Any, payload: Dict[str, Any], api_prefix: str) -> None:
        """Make the agent as the runtime makes it, on the tests' model."""
        made.append(payload)
        runtime.make(payload["name"], payload["app_spec"], {})

    monkeypatch.setattr(mounting, "create_agent", create)
    folder = tmp_path / "echo-desk"
    folder.mkdir()
    path = folder / "app.py"
    path.write_text(app_py())
    embed = tmp_path / "dist-embed"
    embed.mkdir()
    (embed / "datalayer-app.js").write_text("/* the embed */")
    told: List[str] = []
    hot_reload = serving.HotReload(path, build_of(path), build_of, say=told.append)
    api = serving.local_server(build_of(path), hot_reload=hot_reload, embed_dir=embed)
    with TestClient(api, client=("127.0.0.1", 50000)) as client:
        yield {
            "client": client,
            "made": made,
            "path": path,
            "hot_reload": hot_reload,
            "told": told,
        }


def spec_in(page: str) -> Dict[str, Any]:
    """The Appspec the page writes in its element."""
    [spec] = re.findall(r'<script type="application/json">(.*?)</script>', page, re.S)
    return json.loads(spec)


def test_the_page_is_the_embed_served_here_with_its_reload(
    served: Dict[str, Any],
) -> None:
    """The page is the embed, served here, with its reload."""
    client: TestClient = served["client"]
    # `/` leads to the application.
    home = client.get("/", follow_redirects=False)
    assert (home.status_code, home.headers["location"]) == (307, "/app")
    page = client.get("/app").text
    # The embed's script from this server, its build served at /embed/.
    assert (
        '<script src="http://testserver/embed/datalayer-app.js" async></script>' in page
    )
    assert client.get("/embed/datalayer-app.js").text == "/* the embed */"
    # Its agent on this server; a new conversation at each reload.
    assert '<datalayer-app server="http://testserver/app" resume="false">' in page
    assert 'new EventSource("/app/_loop/reload")' in page
    assert spec_in(page)["name"] == "Echo Desk"
    # Its code answers its sessions, as on a runtime.
    started = events_of(
        client.post(
            "/app/api/v1/apps/sessions",
            json={"agent": "echo-desk", "session": "session-w-001", "opener": "Hi"},
        )
    )
    assert answer_of(started) == "Echo: Hi"


def test_a_change_builds_it_again_and_the_page_reads_the_new_one(
    served: Dict[str, Any],
) -> None:
    """A change is built again; the page and the sessions read it."""
    client: TestClient = served["client"]
    hot_reload: serving.HotReload = served["hot_reload"]
    path: Path = served["path"]
    assert hot_reload.changed() is False
    path.write_text(app_py(name="Echo Desk, again", answer="Again"))
    assert hot_reload.changed() is True
    told = client.portal.call(hot_reload.reload)
    assert told["kind"] == "reloaded"
    assert told["says"].startswith("Echo Desk, again was built again from app.py in ")
    # The page reads the application as it is now…
    assert spec_in(client.get("/app").text)["name"] == "Echo Desk, again"
    # …its agent made again with the spec it builds…
    assert [payload["app_spec"]["name"] for payload in served["made"]] == [
        "Echo Desk",
        "Echo Desk, again",
    ]
    # …and its next session runs the new code.
    started = events_of(
        client.post(
            "/app/api/v1/apps/sessions",
            json={"agent": "echo-desk", "session": "session-w-002", "opener": "Hi"},
        )
    )
    assert answer_of(started) == "Again: Hi"


def test_a_change_that_does_not_build_is_refused_and_it_runs_on_as_it_was(
    served: Dict[str, Any],
) -> None:
    """A change that does not build is refused; it runs on as it was."""
    client: TestClient = served["client"]
    hot_reload: serving.HotReload = served["hot_reload"]
    path: Path = served["path"]
    path.write_text(app_py() + "\ndef broken(:\n")
    told = client.portal.call(hot_reload.reload)
    assert told["kind"] == "refused"
    assert told["says"] == "app.py was not taken: Echo Desk runs as it was."
    assert told["problems"][0].startswith("app.py does not load: SyntaxError: ")
    # Another id is another application.
    path.write_text(app_py().replace('id="echo-desk"', 'id="other-desk"'))
    told = client.portal.call(hot_reload.reload)
    assert told["problems"] == [
        "Its id changed from 'echo-desk' to 'other-desk': that is another application — "
        "stop this one and run it."
    ]
    # Nothing was made again; the page and the sessions are as they were.
    assert len(served["made"]) == 1
    assert spec_in(client.get("/app").text)["name"] == "Echo Desk"
    started = events_of(
        client.post(
            "/app/api/v1/apps/sessions",
            json={"agent": "echo-desk", "session": "session-w-003", "opener": "Hi"},
        )
    )
    assert answer_of(started) == "Echo: Hi"
    # The terminal said each, with why.
    assert served["told"][0] == "app.py was not taken: Echo Desk runs as it was."


async def test_the_page_hears_each_reload_as_an_event(tmp_path: Path) -> None:
    """The page hears each reload as an event."""
    path = tmp_path / "app.py"
    path.write_text(app_py())
    hot_reload = serving.HotReload(path, build_of(path), build_of)
    response = await hot_reload.events()
    stream = response.body_iterator
    assert await stream.__anext__() == ": listening\n\n"
    path.write_text(app_py() + "\ndef broken(:\n")
    heard = asyncio.ensure_future(stream.__anext__())
    await asyncio.sleep(0)
    await hot_reload.reload()
    event = await asyncio.wait_for(heard, 5)
    kind, data = event.strip().split("\n")
    assert kind == "event: refused"
    assert json.loads(data.removeprefix("data: "))["says"] == (
        "app.py was not taken: Echo Desk runs as it was."
    )
    await stream.aclose()


def test_the_embed_is_said_once(tmp_path: Path) -> None:
    """Where the embed comes from is said once, and must be there."""
    path = tmp_path / "app.py"
    path.write_text(app_py())
    application = build_of(path)
    with pytest.raises(ValueError, match="holds no build of the embed"):
        serving.local_server(application, embed_dir=tmp_path)
    with pytest.raises(ValueError, match="an origin, or a folder"):
        serving.local_server(application)
