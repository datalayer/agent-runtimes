# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An AG-UI agent recreated under its id is the one that answers.

`configure-from-spec` recreates `default` — with an application's rules,
checks and record. A mount that held the first app kept answering with the
agent the runtime started with; the mount now finds the agent registered
when the request comes.
"""

from typing import Any

from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Mount, Route
from starlette.testclient import TestClient

from agent_runtimes.routes import agui


class Adapter:
    def __init__(self, says: str) -> None:
        self.says = says

    def get_app(self) -> Any:
        async def answer(request: Any) -> PlainTextResponse:
            return PlainTextResponse(self.says)

        return Starlette(routes=[Route("/", answer, methods=["POST"])])


def test_the_agent_registered_now_answers() -> None:
    agui.register_agui_agent("probe-agent", Adapter("first"))  # type: ignore[arg-type]
    app = Starlette(
        routes=[Mount("/ag-ui/probe-agent", app=agui.AGUIDispatch("probe-agent"))]
    )
    client = TestClient(app)
    assert client.post("/ag-ui/probe-agent/").text == "first"
    agui.unregister_agui_agent("probe-agent")
    assert client.post("/ag-ui/probe-agent/").status_code == 404
    agui.register_agui_agent("probe-agent", Adapter("recreated"))  # type: ignore[arg-type]
    assert client.post("/ag-ui/probe-agent/").text == "recreated"
    assert agui.is_agui_mounted(app.routes, "/ag-ui/probe-agent")
    agui.unregister_agui_agent("probe-agent")
