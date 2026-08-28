# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for rendering a sandbox execution as an A2UI surface."""

from __future__ import annotations

from agent_runtimes.a2ui import A2UI_VERSION, ExecutionResult, execution_to_a2ui
from agent_runtimes.a2ui.executions import MAX_TEXT_CHARS


def _components(messages: list[dict]) -> dict[str, dict]:
    return {
        c["id"]: c
        for c in messages[1]["updateComponents"]["components"]
    }


def _text_of(messages: list[dict], component_id: str) -> str:
    return str(_components(messages).get(component_id, {}).get("text", ""))


class TestShape:
    def test_emits_the_three_v09_messages_in_order(self) -> None:
        messages = execution_to_a2ui(ExecutionResult(code="1"))

        assert [next(k for k in m if k != "version") for m in messages] == [
            "createSurface",
            "updateComponents",
            "updateDataModel",
        ]
        assert all(m["version"] == A2UI_VERSION for m in messages)

    def test_every_child_reference_resolves(self) -> None:
        messages = execution_to_a2ui(
            ExecutionResult(code="x", stdout="out", error="boom", success=False)
        )
        components = _components(messages)

        # A dangling child id renders as nothing, silently — worth a test.
        for component in components.values():
            for child in component.get("children", []):
                assert child in components, f"{component['id']} → missing {child}"
            if "child" in component:
                assert component["child"] in components

    def test_the_surface_id_is_carried_by_every_message(self) -> None:
        messages = execution_to_a2ui(ExecutionResult(code="1"), surface_id="run-7")

        ids = {
            m[next(k for k in m if k != "version")]["surfaceId"] for m in messages
        }
        assert ids == {"run-7"}


class TestContent:
    def test_an_error_is_shown_above_the_output(self) -> None:
        messages = execution_to_a2ui(
            ExecutionResult(code="1/0", success=False, error="ZeroDivisionError", stdout="before")
        )
        root = _components(messages)["root"]["children"]

        # What the reader needs first comes first.
        assert root.index("error-card") < root.index("output-card")
        assert "ZeroDivisionError" in _text_of(messages, "error")

    def test_stream_and_result_outputs_become_text(self) -> None:
        messages = execution_to_a2ui(
            ExecutionResult(
                code="x",
                outputs=[
                    {"output_type": "stream", "text": "streamed\n"},
                    {"output_type": "execute_result", "data": {"text/plain": "42"}},
                ],
            )
        )

        text = _text_of(messages, "output")
        assert "streamed" in text
        assert "42" in text

    def test_images_become_image_components(self) -> None:
        messages = execution_to_a2ui(
            ExecutionResult(
                code="plot()",
                outputs=[{"output_type": "display_data", "data": {"image/png": "AAAA"}}],
            )
        )
        image = _components(messages)["image-0"]

        assert image["component"] == "Image"
        assert image["url"].startswith("data:image/png;base64,AAAA")

    def test_an_svg_is_passed_through_rather_than_base64_wrapped(self) -> None:
        messages = execution_to_a2ui(
            ExecutionResult(
                code="p",
                outputs=[
                    {"output_type": "display_data", "data": {"image/svg+xml": "<svg/>"}}
                ],
            )
        )

        assert _components(messages)["image-0"]["url"] == "<svg/>"

    def test_a_traceback_loses_its_ansi_colouring(self) -> None:
        messages = execution_to_a2ui(
            ExecutionResult(
                code="boom",
                success=False,
                outputs=[
                    {
                        "output_type": "error",
                        "ename": "ValueError",
                        "traceback": ["\x1b[0;31mValueError\x1b[0m: nope"],
                    }
                ],
            )
        )

        text = _text_of(messages, "output")
        assert "ValueError: nope" in text
        assert "\x1b[" not in text

    def test_long_output_is_cut_and_says_so(self) -> None:
        messages = execution_to_a2ui(
            ExecutionResult(code="x", stdout="y" * (MAX_TEXT_CHARS + 500))
        )

        text = _text_of(messages, "output")
        # Silent truncation would misrepresent what the code produced.
        assert "truncated" in text
        assert len(text) < MAX_TEXT_CHARS + 100

    def test_silence_is_reported_rather_than_left_blank(self) -> None:
        messages = execution_to_a2ui(ExecutionResult(code="x = 1"))

        assert "no output" in _text_of(messages, "empty")

    def test_the_data_model_summarises_what_happened(self) -> None:
        messages = execution_to_a2ui(
            ExecutionResult(
                code="p",
                outputs=[{"output_type": "display_data", "data": {"image/png": "A"}}],
            )
        )

        assert messages[2]["updateDataModel"]["value"]["execution"] == {
            "success": True,
            "images": 1,
            "hasOutput": False,
        }


class TestFromPayload:
    def test_reads_the_loose_dict_the_routes_return(self) -> None:
        result = ExecutionResult.from_payload(
            {"stdout": "hi", "error": "", "outputs": [{"output_type": "stream"}]}
        )

        assert result.stdout == "hi"
        assert result.success is True
        assert len(result.outputs) == 1

    def test_an_error_makes_it_a_failure_without_being_told(self) -> None:
        assert ExecutionResult.from_payload({"error": "boom"}).success is False

    def test_survives_outputs_that_are_not_a_list(self) -> None:
        assert ExecutionResult.from_payload({"outputs": "nope"}).outputs == []


class TestTerminalRendering:
    """The degraded view: a terminal cannot draw a surface, and says so."""

    def _render(self, result: ExecutionResult) -> str:
        import asyncio
        from types import SimpleNamespace

        from agent_runtimes.chat.commands import surface as surface_cmd

        lines: list[str] = []

        class Console:
            def print(self, *args, **kwargs) -> None:
                lines.append(" ".join(str(a) for a in args))

        class Response:
            def raise_for_status(self) -> None:
                pass

            def json(self) -> dict:
                return {"messages": execution_to_a2ui(result)}

        class Client:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return None

            async def post(self, url: str, json: dict, timeout: float = 0):
                return Response()

        import httpx

        original = httpx.AsyncClient
        httpx.AsyncClient = Client  # type: ignore[assignment]
        try:
            tux = SimpleNamespace(console=Console(), server_url="http://server")
            asyncio.run(surface_cmd.execute(tux, "print('hi')"))
        finally:
            httpx.AsyncClient = original  # type: ignore[assignment]
        return "\n".join(lines)

    def test_text_survives_the_terminal(self) -> None:
        output = self._render(ExecutionResult(code="print('hi')", stdout="hi"))

        assert "Execution" in output
        assert "hi" in output

    def test_an_image_is_named_rather_than_pretended(self) -> None:
        output = self._render(
            ExecutionResult(
                code="plot()",
                outputs=[{"output_type": "display_data", "data": {"image/png": "A"}}],
            )
        )

        assert "[image" in output
        assert "/browser a2ui" in output

    def test_usage_is_shown_without_code(self) -> None:
        import asyncio
        from types import SimpleNamespace

        from agent_runtimes.chat.commands import surface as surface_cmd

        lines: list[str] = []

        class Console:
            def print(self, *args, **kwargs) -> None:
                lines.append(" ".join(str(a) for a in args))

        asyncio.run(
            surface_cmd.execute(
                SimpleNamespace(console=Console(), server_url="http://server"), ""
            )
        )
        assert any("/surface <code>" in line for line in lines)


class TestInteractionRoundTrip:
    """What the reader did goes back to the code that drew the surface."""

    def test_no_action_leaves_the_code_alone(self) -> None:
        from agent_runtimes.routes.sandbox import _bind_action

        assert _bind_action("print(1)", None) == "print(1)"
        assert _bind_action("print(1)", {}) == "print(1)"

    def test_an_action_arrives_as_data_not_as_source(self) -> None:
        from agent_runtimes.routes.sandbox import _bind_action

        action = {"name": "filter", "context": {"region": "EU"}}
        bound = _bind_action("print(a2ui_action)", action)

        # The reader's selections reach the code as a value; nothing they chose
        # is spliced into the source.
        assert "a2ui_action = _json.loads(" in bound
        assert bound.endswith("print(a2ui_action)")

    def test_a_hostile_selection_cannot_become_code(self) -> None:
        from agent_runtimes.routes.sandbox import _bind_action

        action = {"context": {"region": "'; import os; os.system('rm -rf /') #"}}
        bound = _bind_action("pass", action)

        # It is inside a JSON string inside a Python string literal — two layers
        # from being executed.
        assert "os.system" in bound  # it is carried…
        assert "\n'; import os" not in bound  # …but never as a statement

        namespace: dict = {}
        exec(bound, namespace)  # noqa: S102 - the point of the test
        assert namespace["a2ui_action"]["context"]["region"].startswith("'; import os")

    def test_the_surface_shows_what_the_reader_wrote(self) -> None:
        # Not the plumbing that carried their click into it.
        from agent_runtimes.routes.sandbox import _bind_action

        original = "render(df)"
        bound = _bind_action(original, {"name": "click"})
        assert bound != original
        # The endpoint puts `request.code` back on the payload before rendering,
        # so the surface's Code card is the reader's line.
        result = ExecutionResult.from_payload({"code": original, "stdout": ""})
        assert result.code == original


class TestTheOutputsReachTheConverter:
    """The route has to carry what the converter knows how to read.

    `execution_to_a2ui` could always draw an image; nothing ever handed it one.
    `SandboxExecuteResponse` reported `results` — the `text/plain` of each rich
    result and nothing else — so a figure arrived as the string
    `<Figure size 640x480>` and the Image branch was unreachable code.
    """

    def test_the_response_model_carries_jupyter_outputs(self) -> None:
        from agent_runtimes.routes.sandbox import SandboxExecuteResponse

        response = SandboxExecuteResponse(
            success=True,
            execution_ok=True,
            outputs=[
                {
                    "output_type": "display_data",
                    "data": {"image/png": "iVBORw0KGgo="},
                    "metadata": {},
                }
            ],
        )

        assert response.outputs[0]["data"]["image/png"] == "iVBORw0KGgo="

    def test_a_figure_becomes_an_image_the_whole_way_through(self) -> None:
        from agent_runtimes.routes.sandbox import SandboxExecuteResponse

        # What the route now returns for a plot…
        payload = SandboxExecuteResponse(
            success=True,
            execution_ok=True,
            stdout="",
            results=["<Figure size 640x480 with 1 Axes>"],
            outputs=[
                {
                    "output_type": "display_data",
                    "data": {
                        "image/png": "iVBORw0KGgo=",
                        "text/plain": "<Figure size 640x480 with 1 Axes>",
                    },
                    "metadata": {},
                }
            ],
        ).model_dump()
        payload["code"] = "figure"

        # …reaches the surface as a picture rather than as its repr.
        messages = execution_to_a2ui(ExecutionResult.from_payload(payload))
        images = [
            c
            for c in messages[1]["updateComponents"]["components"]
            if c.get("component") == "Image"
        ]
        assert len(images) == 1
        assert images[0]["url"] == "data:image/png;base64,iVBORw0KGgo="
        assert messages[2]["updateDataModel"]["value"]["execution"]["images"] == 1

    def test_a_response_without_outputs_still_renders(self) -> None:
        from agent_runtimes.routes.sandbox import SandboxExecuteResponse

        # The plain case must not depend on the new field being populated.
        payload = SandboxExecuteResponse(
            success=True, execution_ok=True, stdout="hello"
        ).model_dump()
        payload["code"] = "print('hello')"

        messages = execution_to_a2ui(ExecutionResult.from_payload(payload))
        assert "hello" in _text_of(messages, "output")
