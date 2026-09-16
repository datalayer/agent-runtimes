# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The prompt history an agent keeps for the arrow keys: the hook that
records it on every run, and how it reaches the frontend."""

from types import SimpleNamespace

import pytest
from pydantic_ai import Agent
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.capabilities.factory import build_capabilities_from_agent_spec
from agent_runtimes.context.prompt_history import (
    MAX_PROMPTS,
    PromptHistoryCapability,
    PromptHistoryStore,
    clear_prompt_history,
    get_prompt_history,
    last_user_prompt,
    prompt_text,
    record_prompt,
)
from agent_runtimes.types import FrontendConfig


class TestTheStore:
    def test_keeps_prompts_oldest_first(self) -> None:
        store = PromptHistoryStore()
        store.record("a", "one")
        store.record("a", "two")
        assert store.get("a") == ["one", "two"]

    def test_keeps_agents_apart(self) -> None:
        store = PromptHistoryStore()
        store.record("a", "one")
        store.record("b", "two")
        assert store.get("a") == ["one"]
        assert store.get("b") == ["two"]
        assert store.get("nobody") == []

    def test_drops_blanks_and_immediate_repeats(self) -> None:
        store = PromptHistoryStore()
        store.record("a", "   ")
        store.record("a", "one ")
        store.record("a", "one")
        store.record("a", "two")
        store.record("a", "one")
        assert store.get("a") == ["one", "two", "one"]

    def test_caps_at_the_newest(self) -> None:
        store = PromptHistoryStore(max_prompts=3)
        for index in range(5):
            store.record("a", f"prompt {index}")
        assert store.get("a") == ["prompt 2", "prompt 3", "prompt 4"]
        assert MAX_PROMPTS >= 3

    def test_can_be_cleared(self) -> None:
        store = PromptHistoryStore()
        store.record("a", "one")
        store.clear("a")
        assert store.get("a") == []


class TestTheProcessStore:
    def test_records_and_reads_by_agent(self) -> None:
        clear_prompt_history("test-prompt-history")
        record_prompt("test-prompt-history", "hello")
        record_prompt("test-prompt-history", "again")
        assert get_prompt_history("test-prompt-history") == ["hello", "again"]
        clear_prompt_history("test-prompt-history")
        assert get_prompt_history("test-prompt-history") == []

    def test_ignores_a_missing_agent_or_prompt(self) -> None:
        record_prompt(None, "hello")
        record_prompt("", "hello")
        record_prompt("test-prompt-history-empty", None)
        assert get_prompt_history(None) == []
        assert get_prompt_history("test-prompt-history-empty") == []


class TestTheRunsPrompt:
    """What pydantic-ai hands the hook, read as words."""

    def test_a_string_is_the_words(self) -> None:
        assert prompt_text("plot it") == "plot it"

    def test_a_sequence_keeps_its_strings_and_drops_the_rest(self) -> None:
        image = SimpleNamespace(url="https://x/y.png")
        assert prompt_text(["describe", image, "this"]) == "describe\nthis"

    def test_nothing_is_nothing(self) -> None:
        # A run resumed with a deferred tool's result carries no prompt.
        assert prompt_text(None) == ""
        assert prompt_text([]) == ""
        assert prompt_text(42) == ""


class TestTheHook:
    """The capability, given a run's context as pydantic-ai gives it."""

    @pytest.mark.asyncio
    async def test_records_the_prompt_before_the_run(self) -> None:
        agent_id = "test-prompt-history-hook"
        clear_prompt_history(agent_id)
        hook = PromptHistoryCapability(agent_id=agent_id)
        await hook.before_run(SimpleNamespace(prompt="describe the dataset"))
        await hook.before_run(SimpleNamespace(prompt=["plot", "it"]))
        await hook.before_run(SimpleNamespace(prompt=None))
        assert get_prompt_history(agent_id) == ["describe the dataset", "plot\nit"]
        clear_prompt_history(agent_id)

    @pytest.mark.asyncio
    async def test_does_nothing_when_off(self) -> None:
        agent_id = "test-prompt-history-off"
        clear_prompt_history(agent_id)
        hook = PromptHistoryCapability(agent_id=agent_id, enabled=False)
        await hook.before_run(SimpleNamespace(prompt="describe the dataset"))
        assert get_prompt_history(agent_id) == []

    @pytest.mark.asyncio
    async def test_fires_on_a_real_run_whoever_starts_it(self) -> None:
        # The proof the design rests on: a pydantic-ai run calls the hook
        # with the prompt, so a route that runs the agent records without
        # knowing the history exists.
        agent_id = "test-prompt-history-run"
        clear_prompt_history(agent_id)

        def answer(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
            return ModelResponse(parts=[TextPart(content="ok")])

        agent = Agent(
            FunctionModel(answer),
            capabilities=[PromptHistoryCapability(agent_id=agent_id)],
        )
        await agent.run("first question")
        await agent.run("second question")
        assert get_prompt_history(agent_id) == ["first question", "second question"]
        clear_prompt_history(agent_id)


class TestTheFactory:
    """Every agent the factory builds carries the hook."""

    def test_installs_the_hook_for_the_agent(self) -> None:
        class Spec:
            model = "test"

        capabilities = build_capabilities_from_agent_spec(
            Spec(), agent_id="test-prompt-history-factory"
        )
        hooks = [c for c in capabilities if isinstance(c, PromptHistoryCapability)]
        assert len(hooks) == 1
        assert hooks[0].agent_id == "test-prompt-history-factory"

    def test_has_nothing_to_record_under_without_an_agent_id(self) -> None:
        class Spec:
            model = "test"

        capabilities = build_capabilities_from_agent_spec(Spec(), agent_id=None)
        assert not any(isinstance(c, PromptHistoryCapability) for c in capabilities)


class TestTheRequestPrompt:
    """The transport's reading of a chat request, for the OTEL span."""

    def test_reads_a_bare_prompt(self) -> None:
        assert last_user_prompt({"prompt": "hello"}) == "hello"

    def test_reads_the_last_user_message_content(self) -> None:
        body = {
            "messages": [
                {"role": "user", "content": "first"},
                {"role": "assistant", "content": "answer"},
                {"role": "user", "content": "second"},
            ]
        }
        assert last_user_prompt(body) == "second"

    def test_reads_text_parts(self) -> None:
        # The Vercel AI SDK's newer messages carry parts, not content.
        body = {
            "messages": [
                {
                    "role": "user",
                    "parts": [
                        {"type": "text", "text": "plot"},
                        {"type": "file", "url": "x"},
                        {"type": "text", "text": "the data"},
                    ],
                }
            ]
        }
        assert last_user_prompt(body) == "plot\nthe data"

    def test_is_empty_for_anything_else(self) -> None:
        assert last_user_prompt(None) == ""
        assert last_user_prompt({"messages": "nope"}) == ""
        assert (
            last_user_prompt({"messages": [{"role": "assistant", "content": "x"}]})
            == ""
        )


class TestTheFrontendConfig:
    def test_carries_the_history_under_its_frontend_name(self) -> None:
        config = FrontendConfig(prompt_history=["one", "two"])
        payload = config.model_dump(by_alias=True)
        assert payload["promptHistory"] == ["one", "two"]

    def test_is_empty_by_default(self) -> None:
        assert FrontendConfig().prompt_history == []


@pytest.mark.asyncio
async def test_the_configuration_returns_the_agents_history() -> None:
    from agent_runtimes.routes.configure import get_configuration

    agent_id = "test-prompt-history-config"
    clear_prompt_history(agent_id)
    record_prompt(agent_id, "describe the dataset")
    record_prompt(agent_id, "plot it")
    try:
        config = await get_configuration(agent_id=agent_id)
        assert config.prompt_history == ["describe the dataset", "plot it"]
        other = await get_configuration(agent_id="test-prompt-history-other")
        assert other.prompt_history == []
    finally:
        clear_prompt_history(agent_id)
