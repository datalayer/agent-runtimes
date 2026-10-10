# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Backend tools: the tools that run on the runtime, named apart from the page's.

`tools` was the name of the catalogue and of the field that names its entries;
it is `backend_tools` now, beside `frontend_tools`, and the old name is refused
rather than read.
"""

import pytest
from pydantic import ValidationError

from agent_runtimes.routes.agents import CreateAgentRequest
from agent_runtimes.specs.backend_tools import (
    BACKEND_TOOL_CATALOG,
    get_backend_tool_spec,
)
from agent_runtimes.types import Agentspec


def test_the_catalogue_is_the_backend_tools_and_every_one_runs_on_the_runtime() -> None:
    assert "decide" in BACKEND_TOOL_CATALOG
    for spec in BACKEND_TOOL_CATALOG.values():
        assert spec.runtime.language == "python"
        assert spec.icon and spec.icon.startswith("@primer/octicons-react:")
    assert get_backend_tool_spec("runtime-echo:0.0.1") is not None


def test_a_request_names_backend_tools_and_refuses_tools() -> None:
    request = CreateAgentRequest(name="a", backendTools=["runtime-echo:0.0.1"])
    assert request.backend_tools == ["runtime-echo:0.0.1"]
    with pytest.raises(ValidationError, match="backend_tools"):
        CreateAgentRequest(name="a", tools=["runtime-echo:0.0.1"])


def test_an_agent_spec_refuses_tools() -> None:
    with pytest.raises(ValidationError, match="backend_tools"):
        Agentspec(id="old", name="Old", tools=["runtime-echo:0.0.1"])
