# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's page side packaged as a Reactor extension (LOOP P-29).

`loop apps package` writes the distribution of an app.py whose component is a
file of its folder and builds its wheel; installed, the wheel is found by the
application's name and its page side is served beside the application's
plugin state, as Reactor's routes serve an extension's.
"""

from __future__ import annotations

import json
import shutil
import sys
import zipfile
from pathlib import Path
from typing import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps.packaging import (
    NotPackageable,
    folder_files,
    is_folder_file,
    module_name_of,
    package,
    page_side_module,
    page_side_plugin_name,
    write_project,
)
from agent_runtimes.routes.app_plugins import router

pytest.importorskip("agentspecs.apps")

APP_PY = """
from agent_runtimes.loop.apps import Application

app = Application(id="dial-desk", name="Dial desk", kind="chat", agent="example-simple")
app.custom_component(
    "Dial",
    description="A dial, from nothing to its most.",
    source="components/dial.js",
    props={"type": "object", "properties": {"label": {"type": "string"}}},
    shows=["value"],
)
"""

DIAL_JS = "export default function (root, { props }) { root.textContent = 'dial'; }\n"


@pytest.fixture
def folder(tmp_path: Path) -> Path:
    here = tmp_path / "dial"
    (here / "components").mkdir(parents=True)
    (here / "app.py").write_text(APP_PY)
    (here / "components" / "dial.js").write_text(DIAL_JS)
    return here


def test_a_file_of_the_folder_is_told_from_an_address() -> None:
    assert is_folder_file("gauge.js") and is_folder_file("./components/gauge.mjs")
    for source in ("https://e.example.com/g.js", "../g.js", "/srv/g.js", "g.css"):
        assert not is_folder_file(source)
    assert module_name_of("dial-desk") == "loop_app_dial_desk"
    assert page_side_plugin_name("dial-desk") == "loop-app-dial-desk/page"


def test_the_page_side_module_says_where_its_files_are_and_nothing_else() -> None:
    text = page_side_module("dial-desk")
    assert "import " not in text.replace("import.meta.url", "")
    assert "new URL('./', import.meta.url)" in text
    assert '"loop.app.files"' in text and '"loop-app-dial-desk/page"' in text


def test_its_project_carries_the_application_and_the_files_it_names(
    folder: Path, tmp_path: Path
) -> None:
    packaged = write_project(folder / "app.py", tmp_path / "out")
    assert packaged.name == "loop-app-dial-desk"
    assert packaged.files == ["components/dial.js"]
    project = packaged.project
    pyproject = (project / "pyproject.toml").read_text()
    assert '[project.entry-points."datalayer.reactor.extensions"]' in pyproject
    assert '"loop-app-dial-desk" = "loop_app_dial_desk:extension"' in pyproject
    share = project / "share/datalayer/reactor/extensions/loop-app-dial-desk"
    assert (share / "components/dial.js").read_text() == DIAL_JS
    assert (share / "index.js").is_file()
    said = json.loads((project / "loop_app_dial_desk/application.json").read_text())
    assert said["manifest"]["name"] == "loop-app-dial-desk"
    assert said["manifest"]["frontend_dependencies"] == ["loop-app-dial-desk"]
    assert (project / "loop_app_dial_desk/app.py").read_text() == APP_PY
    with pytest.raises(NotPackageable, match="is there already; --force"):
        write_project(folder / "app.py", tmp_path / "out")
    assert write_project(folder / "app.py", tmp_path / "out", force=True).files


def test_a_file_it_names_that_is_not_there_is_refused(
    folder: Path, tmp_path: Path
) -> None:
    (folder / "components" / "dial.js").unlink()
    with pytest.raises(
        NotPackageable, match="names components/dial.js, which is not a file of"
    ):
        write_project(folder / "app.py", tmp_path / "out")


@pytest.fixture
def installed(folder: Path, tmp_path: Path, monkeypatch) -> Iterator[Path]:
    """The wheel built and laid out as pip installs one, on ``sys.path``."""
    packaged = package(folder / "app.py", tmp_path / "dist")
    assert packaged.wheel is not None and packaged.wheel.suffix == ".whl"
    prefix = tmp_path / "prefix"
    site = prefix / "site"
    with zipfile.ZipFile(packaged.wheel) as wheel:
        names = wheel.namelist()
        wheel.extractall(site)
    data = next(site.glob("*.data"))
    shutil.move(str(data / "data" / "share"), str(prefix / "share"))
    assert "loop_app_dial_desk/app.py" in names
    monkeypatch.syspath_prepend(str(site))
    yield site
    for module in [m for m in sys.modules if m.startswith("loop_app_dial_desk")]:
        del sys.modules[module]


def _client() -> TestClient:
    api = FastAPI()
    api.include_router(router, prefix="/api/v1")
    return TestClient(api)


def test_the_installed_page_side_is_served_beside_its_plugin_state(
    installed: Path,
) -> None:
    client = _client()
    records = client.get("/api/v1/apps/dial-desk/plugins/frontend-extensions").json()
    assert [record["name"] for record in records] == ["loop-app-dial-desk"]
    record = records[0]
    # Reactor's address for it, its version in the query.
    assert record["entry"].startswith("/reactor-extensions/loop-app-dial-desk/index.js")
    assert record["backendPlugins"] == ["loop-app-dial-desk"]
    (plugin,) = record["plugins"]
    assert plugin["name"] == "loop-app-dial-desk/page"
    assert plugin["requiredBackendPlugins"] == ["loop-app-dial-desk"]
    base = "/api/v1/apps/dial-desk/reactor-extensions/loop-app-dial-desk"
    dial = client.get(f"{base}/components/dial.js")
    assert dial.status_code == 200 and dial.text == DIAL_JS
    assert dial.headers["content-type"].startswith("text/javascript")
    assert "loop.app.files" in client.get(f"{base}/index.js").text
    # Nothing outside its directory, and nothing of another application.
    assert (
        client.get(f"{base}/../../../site/loop_app_dial_desk/app.py").status_code == 404
    )
    assert client.get(f"{base}/missing.js").status_code == 404
    other = "/api/v1/apps/other/reactor-extensions/loop-app-dial-desk/index.js"
    assert client.get(other).status_code == 404


def test_an_application_with_no_package_installed_has_no_page_side() -> None:
    client = _client()
    assert client.get("/api/v1/apps/dial-desk/plugins/frontend-extensions").json() == []
    assert (
        client.get(
            "/api/v1/apps/dial-desk/reactor-extensions/loop-app-dial-desk/index.js"
        ).status_code
        == 404
    )


def test_folder_files_are_read_from_the_spec(folder: Path) -> None:
    from agent_runtimes.loop.apps.build import build

    assert folder_files(build(folder / "app.py").application.spec) == [
        "components/dial.js"
    ]
