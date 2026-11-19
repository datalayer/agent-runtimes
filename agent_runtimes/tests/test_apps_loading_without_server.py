# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Loading an application, and the payload of its deployment, without the server's extras.

A service that installs ``agent-runtimes`` without its server extras (no
``ag_ui``) still asks how to launch a deployment: `load_app` and
`deployment_runtime_payload` must not import the server's routes or
transports.
"""

from __future__ import annotations

import re
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

PACKAGE = Path(__file__).resolve().parents[1]
REPO = PACKAGE.parent


def test_an_application_and_its_deployment_load_without_ag_ui() -> None:
    """A catalogue application with code, its agent a Cog, loads with `ag_ui` blocked.

    Its document is read from the installed ``agentspecs`` package.
    """
    pytest.importorskip("agentspecs.apps")
    script = textwrap.dedent(
        """
        import sys
        sys.modules["ag_ui"] = None  # any import of ag_ui fails

        from importlib.resources import files

        import yaml

        from agent_runtimes.apps.deployments import deployment_runtime_payload
        from agent_runtimes.apps.loading import load_app
        from agent_runtimes.specs.apps import APP_BUILT

        document = yaml.safe_load(
            (files("agentspecs") / "apps" / "customer-interview.yaml").read_text()
        )
        assert APP_BUILT[document["id"]] == "python", "an application with code"
        app = load_app(document)
        assert app.agent.startswith("cog-"), app.agent
        payload = deployment_runtime_payload(
            document, app_uid="app-1", deployment_uid="dep-1", version=1
        )
        assert payload["app_spec"] == document
        assert payload["agent_spec_id"] == "cog-customer-interviewer"
        assert "agent_runtimes.routes" not in sys.modules, "the routes were imported"
        assert "agent_runtimes.transports" not in sys.modules, "the transports were imported"
        print("ok")
        """
    )
    done = subprocess.run(
        [sys.executable, "-c", script],
        cwd=REPO,
        capture_output=True,
        text=True,
        timeout=300,
    )
    assert done.returncode == 0, done.stderr[-4000:]
    assert done.stdout.strip().endswith("ok")


@pytest.mark.parametrize("module", ["loading.py", "deployments.py"])
def test_loading_and_deployments_never_import_the_server(module: str) -> None:
    source = (PACKAGE / "apps" / module).read_text()
    server = re.compile(
        r"^\s*(from|import)\s+(agent_runtimes\.(routes|transports)|\.\.(routes|transports))\b",
        re.MULTILINE,
    )
    assert server.findall(source) == []
