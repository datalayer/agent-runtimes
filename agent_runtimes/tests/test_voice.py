# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Voice on the runtime's side (VOICE.md VO-27, VO-29, VO-44, VO-45)."""

from typing import Any

from pydantic_ai import Agent
from pydantic_ai.models.test import TestModel

from agent_runtimes.loop.apps.agent import app_capabilities
from agent_runtimes.loop.apps.record import AppRecordCapability, AppRecorder
from agent_runtimes.specs.voices import SPEECH_MODEL_CATALOGUE, VOICE_CATALOGUE
from agent_runtimes.types import AppSpec
from agent_runtimes.voice import (
    VOICE_INSTRUCTIONS,
    SpokenInput,
    VoiceCapability,
    hear,
    spoken_of,
    spoken_of_vercel_body,
    voice_capability,
    voice_settings,
)


def app(
    voice: dict[str, Any] | None = None, include: list[str] | None = None
) -> AppSpec:
    return AppSpec.model_validate(
        {
            "id": "desk",
            "name": "Desk",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "interface": {"voice": voice} if voice is not None else {},
            "record": {"keep_for": "90_days", "include": include or ["conversations"]},
        }
    )


def test_the_catalogue_is_generated_from_agentspecs():
    assert {"kokoro-af-heart", "kokoro-bf-emma", "kokoro-ff-siwis"} <= set(
        VOICE_CATALOGUE
    )
    for model in SPEECH_MODEL_CATALOGUE.values():
        assert model["files"] and all(
            len(item["sha256"]) == 64 for item in model["files"]
        )


def test_an_application_without_a_voice_says_so():
    assert voice_settings(app()) == {"enabled": False}
    assert voice_capability(app()) is None


def test_its_voice_is_resolved_against_the_catalogue():
    settings = voice_settings(
        app({"enabled": True, "output": "always", "voice": "kokoro-af-heart"})
    )
    assert settings == {
        "enabled": True,
        "input": "push_to_talk",
        "output": "always",
        "voice": "kokoro-af-heart",
        "language": "en-US",
        "where": "auto",
    }


def test_a_voice_that_does_not_speak_the_language_gives_way_to_one_that_does():
    settings = voice_settings(
        app(
            {
                "enabled": True,
                "output": "always",
                "voice": "kokoro-af-heart",
                "language": "fr-FR",
            }
        )
    )
    assert (settings["voice"], settings["language"]) == ("kokoro-ff-siwis", "fr-FR")
    # Its licence asks for attribution: the page shows it beside the voice.
    assert "SIWIS" in settings["attribution"]


def test_the_language_alone_chooses_the_voice():
    settings = voice_settings(
        app({"enabled": True, "output": "on_request", "language": "en-GB"})
    )
    assert settings["voice"] == "kokoro-bf-emma"


def test_answers_heard_are_written_for_the_ear():
    capability = voice_capability(
        app({"enabled": True, "output": "always", "language": "fr-FR"})
    )
    assert isinstance(capability, VoiceCapability)
    assert capability.get_instructions().startswith(VOICE_INSTRUCTIONS)
    assert "fr-FR" in capability.get_instructions()
    # Listening only: nothing is heard, nothing to say about it.
    assert voice_capability(app({"enabled": True, "output": "off"})) is None


def test_the_capability_joins_an_application_whose_answers_are_heard():
    recorder = AppRecorder(app=app())
    assert not any(
        isinstance(c, VoiceCapability)
        for c in app_capabilities(app(), recorder=recorder)
    )
    voiced = app({"enabled": True, "output": "always"})
    assert any(
        isinstance(c, VoiceCapability)
        for c in app_capabilities(voiced, recorder=AppRecorder(app=voiced))
    )


def test_a_message_is_spoken_only_when_its_metadata_says_so():
    assert spoken_of(None) is None
    assert spoken_of({"input": "text"}) is None
    assert spoken_of(
        {
            "input": "voice",
            "language": "en-US",
            "engine": "moonshine-tiny-en",
            "where": "device",
        }
    ) == (SpokenInput(language="en-US", engine="moonshine-tiny-en", where="device"))
    body = {
        "messages": [
            {"role": "user", "metadata": {"input": "voice"}, "parts": []},
            {"role": "assistant", "parts": []},
            {"role": "user", "parts": [{"type": "text", "text": "typed"}]},
        ]
    }
    # The newest message is what this run answers: typed.
    assert spoken_of_vercel_body(body) is None
    body["messages"][-1]["metadata"] = {"input": "voice", "where": "device"}
    assert spoken_of_vercel_body(body) == SpokenInput(where="device")


async def test_the_record_keeps_a_spoken_turn_as_its_transcript_marked_spoken():
    from agent_runtimes.tests.test_apps_record import kept_by_session

    sent: list = []
    send = kept_by_session(sent)

    spec = app(include=["conversations"])
    recorder = AppRecorder(app=spec, app_uid="app-1", send=send)
    agent: Agent = Agent(
        TestModel(custom_output_text="It is sunny."),
        capabilities=[AppRecordCapability(recorder=recorder)],
    )
    hear(SpokenInput(language="en-US", engine="moonshine-tiny-en", where="device"))
    await agent.run("what is the weather")
    turn = next(entry for entry in sent[0]["entries"] if entry["kind"] == "turn")
    assert turn["payload"]["asked"] == "what is the weather"
    assert turn["payload"]["spoken"] == {
        "input": "voice",
        "language": "en-US",
        "engine": "moonshine-tiny-en",
        "where": "device",
    }
    # Nothing of the sound: only the words and how they were heard.
    assert set(turn["payload"]) == {"asked", "answered", "suggest_tests", "spoken"}

    sent.clear()
    hear(None)
    await agent.run("and tomorrow")
    turn = next(entry for entry in sent[0]["entries"] if entry["kind"] == "turn")
    assert "spoken" not in turn["payload"]
