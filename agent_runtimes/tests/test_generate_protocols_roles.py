# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The protocol generator refuses roles that are not a list of non-empty strings, or repeat one."""

import importlib.util
import shutil
import sys
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2]
SPECS = ROOT / "agentspecs" / "agentspecs" / "protocols"


def _generator():
    # The generator imports its sibling helpers (versioning), as `make specs` runs it from scripts/codegen.
    codegen = str(ROOT / "scripts" / "codegen")
    if codegen not in sys.path:
        sys.path.insert(0, codegen)
    spec = importlib.util.spec_from_file_location(
        "generate_protocols", ROOT / "scripts" / "codegen" / "generate_protocols.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.skipif(
    not (SPECS / "a2a.yaml").exists(),
    reason="the agentspecs checkout is not beside agent-runtimes",
)
@pytest.mark.parametrize(
    "roles", ["client", [], ["client", ""], ["client", 3], ["client", "client"], None]
)
def test_bad_roles_are_refused(tmp_path, roles):
    spec = yaml.safe_load((SPECS / "a2a.yaml").read_text())
    spec["roles"] = roles
    (tmp_path / "a2a.yaml").write_text(yaml.safe_dump(spec))
    with pytest.raises(ValueError, match="roles"):
        _generator().load_protocol_specs(tmp_path)


@pytest.mark.skipif(
    not (SPECS / "a2a.yaml").exists(),
    reason="the agentspecs checkout is not beside agent-runtimes",
)
def test_the_catalogue_roles_load(tmp_path):
    shutil.copy(SPECS / "a2a.yaml", tmp_path / "a2a.yaml")
    assert _generator().load_protocol_specs(tmp_path)[0]["roles"]
