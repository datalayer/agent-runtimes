# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``/models <id>`` completes the models the runtime lists, never the whole catalog."""

from agent_runtimes.chat.commands import models


def test_it_completes_what_the_runtime_listed() -> None:
    models._remember_listed(
        {
            "models": [
                {"id": "bedrock:us.anthropic.claude-sonnet-4-6"},
                {"id": "alibaba:qwen-max"},
            ],
            "decision_models": [{"id": "cloudflare:wrk/typesafe/jev"}],
        }
    )

    (arg,) = models.ARGS
    assert arg.resolve_choices() == (
        "bedrock:us.anthropic.claude-sonnet-4-6",
        "alibaba:qwen-max",
        "cloudflare:wrk/typesafe/jev",
    )


def test_a_new_answer_replaces_the_last() -> None:
    models._remember_listed({"models": [{"id": "a:one"}], "decision_models": []})
    models._remember_listed({"models": [{"id": "b:two"}]})

    assert models.ARGS[0].resolve_choices() == ("b:two",)
