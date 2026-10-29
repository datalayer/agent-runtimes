# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The UI plugins an application is drawn with (R8), one mapping in two languages.

agentspecs' ``ui_for`` and agent-runtimes' ``uiFor`` (``src/apps/apps/appspec.ts``)
are held to the same cases, the fixture ``fixtures/app_ui.json``, which the
TypeScript test (``src/apps/__tests__/app-ui.test.ts``) reads too. A new blank
application starts with its kind's: ``loop apps init`` writes them.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

import pytest
import yaml

from agent_runtimes.apps.scaffold import init

apps = pytest.importorskip("agentspecs.apps")

FIXTURE = Path(__file__).parent / "fixtures" / "app_ui.json"


def _cases() -> list:
    return json.loads(FIXTURE.read_text())["cases"]


@pytest.mark.parametrize("case", _cases(), ids=lambda case: case["name"])
def test_ui_for_is_the_fixture(case: Dict[str, Any]) -> None:
    assert (
        apps.ui_for(
            case["kind"],
            case.get("layout"),
            case["outputs"],
            signs_in=case["signs_in"],
            own_components=case["own_components"],
        )
        == case["ui"]
    )


@pytest.mark.parametrize("python", [False, True])
@pytest.mark.parametrize("kind", ["chat", "widget"])
def test_a_blank_application_starts_with_its_kinds_ui(
    tmp_path: Path, kind: str, python: bool
) -> None:
    """What it writes, in YAML or in Python (its ``app.yaml`` built from its ``app.py``)."""
    scaffold = init("blank", tmp_path, kind=kind, python=python)
    written = yaml.safe_load((scaffold.folder / "app.yaml").read_text())
    assert written["ui"] == apps.ui_for(kind)
