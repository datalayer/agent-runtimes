# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``/notebook`` and ``/document``: the page each opens, locally and on Datalayer.

Locally the page is the local server's, with the local Jupyter server. On
Datalayer — launched, attached with ``--runtime``, or gone back to with
``loop connect`` — it is opened through the relay on this machine, which adds
the person's token, with the runtime's Jupyter server at its ingress and the
runtime's own token: never the person's token, never the pod's own address.

The cloud cases run the real commands in the real session (``loop --prompt``)
against the fake Datalayer API and runtime of ``test_loop_cloud``.
"""

from __future__ import annotations

import asyncio
import importlib.util
import re
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any, List
from urllib.parse import parse_qs, quote, urlparse

import pytest
import typer
from rich.console import Console

from agent_runtimes.chat import cli
from agent_runtimes.chat.commands import browser_document, browser_notebook
from agent_runtimes.loop import launch

from .test_loop_cloud import (  # noqa: F401
    FakeDatalayer,
    Running,
    cloud_runtime,
    datalayer,
)
from .test_loop_prompt import on_datalayer  # noqa: F401

#: What `FakeDatalayer` answers for a runtime: its ingress and Jupyter token.
INGRESS = Running("x", "ai-agents-env").ingress
JUPYTER_TOKEN = "the-jupyter-token"
#: The person's Datalayer token, which the relay carries.
PERSON_TOKEN = "the-token"


@pytest.fixture
def opened(monkeypatch: pytest.MonkeyPatch) -> List[str]:
    """The URLs the commands open in the browser."""
    urls: List[str] = []
    monkeypatch.setattr("webbrowser.open", urls.append)
    monkeypatch.delenv("AGENT_RUNTIMES_DEV_UI", raising=False)
    return urls


def _query(url: str) -> dict[str, str]:
    return {key: values[0] for key, values in parse_qs(urlparse(url).query).items()}


def _is_the_runtimes_page(url: str, page: str) -> None:
    """Through the relay, with the runtime's Jupyter server and token."""
    assert re.match(rf"^http://127\.0\.0\.1:\d+/static/{page}\?", url), url
    assert _query(url) == {
        "agentId": "default",
        "jupyterBaseUrl": INGRESS,
        "jupyterToken": JUPYTER_TOKEN,
    }
    assert PERSON_TOKEN not in url
    assert "2300" not in url


def test_on_this_machine_the_page_is_the_local_servers(opened: List[str]) -> None:
    tux: Any = SimpleNamespace(
        server_url="http://127.0.0.1:19391",
        agent_id="chat",
        jupyter_url="http://127.0.0.1:43355?token=local-token",
        console=Console(file=None, quiet=True),
    )
    asyncio.run(browser_notebook.execute(tux))
    asyncio.run(browser_document.execute(tux))
    base = quote("http://127.0.0.1:43355", safe="")
    assert opened == [
        "http://127.0.0.1:19391/static/agent-notebook.html?agentId=chat"
        f"&jupyterBaseUrl={base}&jupyterToken=local-token",
        "http://127.0.0.1:19391/static/agent-document.html?agentId=chat"
        f"&jupyterBaseUrl={base}&jupyterToken=local-token",
    ]


def test_a_launched_runtimes_page_goes_through_the_relay(
    on_datalayer: FakeDatalayer,  # noqa: F811
    opened: List[str],
) -> None:
    code = cli.run_prompts(
        ["/notebook", "/document"], agent_id=None, cloud=True, minutes=5
    )
    assert code == 0 and on_datalayer.created["time_reservation"] == 5
    assert len(opened) == 2
    _is_the_runtimes_page(opened[0], "agent-notebook.html")
    _is_the_runtimes_page(opened[1], "agent-document.html")


def test_an_attached_runtimes_page_goes_through_the_relay(
    on_datalayer: FakeDatalayer,  # noqa: F811
    opened: List[str],
) -> None:
    on_datalayer.running = [Running("runtime-9", "ai-agents-env")]
    code = cli.run_prompts(
        ["/notebook", "/document"], agent_id=None, runtime="runtime-9"
    )
    assert code == 0 and on_datalayer.created == {}
    _is_the_runtimes_page(opened[0], "agent-notebook.html")
    _is_the_runtimes_page(opened[1], "agent-document.html")


def test_loop_connect_to_a_datalayer_runtime_goes_back_as_runtime_does(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    uid = "01k6xyzexampleruntimeuid0000"
    kept = launch.CloudLaunch(
        uid,
        "ai-agents-env",
        10,
        f"https://r1.datalayer.run/jupyter/server/ai-agents-pool/{uid}",
        launch.Relay(target="http://127.0.0.1:1", token=PERSON_TOKEN),
        FakeDatalayer(),
        JUPYTER_TOKEN,
    )
    # What `loop` prints for a kept runtime names it.
    printed = launch.build_url(kept)
    assert printed == (
        f"https://r1.datalayer.run/agent-runtimes/ai-agents-pool/{uid}"
        "/api/v1/ag-ui/default/"
    )
    assert launch.runtime_of_url(printed) == uid
    assert launch.runtime_of_url("http://localhost:8000/api/v1/ag-ui/chat/") is None

    # `loop connect <that address>` is `loop --runtime <uid>`: the relay, the
    # slash commands and the pages of the attached case above.
    invoked: List[Any] = []
    monkeypatch.setattr(cli, "app", lambda args: invoked.append(args))
    cli.connect(printed, transport=cli.Transport.ag_ui, splash=False)
    assert invoked == [["--runtime", uid]]

    with pytest.raises(typer.BadParameter, match="over AG-UI"):
        cli.connect(printed, transport=cli.Transport.acp, splash=False)

    # The runtime's Jupyter server, as the browser reaches it.
    assert kept.jupyter_url == (
        f"https://r1.datalayer.run/jupyter/server/ai-agents-pool/{uid}"
        f"?token={JUPYTER_TOKEN}"
    )


# --- the pages in the package ----------------------------------------------------


def _hook_module() -> Any:
    path = Path(__file__).resolve().parents[2] / "hatch_build.py"
    spec = importlib.util.spec_from_file_location("agent_runtimes_hatch_build", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _page(dist: Path, page: str) -> None:
    """A built page that loads its script and the shared stylesheet."""
    (dist / "assets").mkdir(parents=True, exist_ok=True)
    (dist / page).write_text(
        f'<script type="module" src="/static/assets/{page}.js"></script>'
        '<link rel="stylesheet" href="/static/assets/stream.css">'
    )
    (dist / "assets" / f"{page}.js").write_text("")
    (dist / "assets" / "stream.css").write_text("")


def test_a_package_without_its_pages_is_refused(tmp_path: Path) -> None:
    hook = _hook_module()
    build = SimpleNamespace(root=str(tmp_path))
    initialize = hook.AgentRuntimesBuildHook.initialize
    dist = tmp_path / "dist"
    packaged = tmp_path / "agent_runtimes" / "static" / "dist"

    # A git checkout: no frontend built.
    with pytest.raises(RuntimeError, match="No frontend build"):
        initialize(build, "standard", {})
    # An editable install serves the repository's own build: nothing checked.
    initialize(build, "editable", {})

    # A build that lacks the document page, or a file a page loads.
    for page in hook.PAGES:
        if page != "agent-document.html":
            _page(dist, page)
    with pytest.raises(RuntimeError, match="lacks agent-document.html"):
        initialize(build, "standard", {})
    _page(dist, "agent-document.html")
    (dist / "assets" / "stream.css").unlink()
    with pytest.raises(RuntimeError, match="lacks assets/stream.css"):
        initialize(build, "standard", {})
    assert not packaged.exists()

    # Complete: copied into the package, then kept for the wheel the sdist builds.
    (dist / "assets" / "stream.css").write_text("")
    initialize(build, "standard", {})
    assert (packaged / "agent-notebook.html").is_file()
    assert (packaged / "agent-document.html").is_file()
    shutil.rmtree(dist)
    initialize(build, "standard", {})
    assert hook.missing_from(packaged) == []
