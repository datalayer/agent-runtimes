# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What the speech models heard of the recorded fixtures, against their baselines (VOICE.md VO-50, VO-51).

`scripts/voice/measure.py` runs the models — the browser's speech-to-text
on the fixtures, the server's voices said and heard back — and writes what
they heard under ``tests/voice/measured``; this checks it: no model and no
voice more than two points of WER above the baseline measured once.
"""

import json
from pathlib import Path

import pytest

from agent_runtimes.specs.voices import SPEECH_MODEL_CATALOGUE, VOICE_CATALOGUE
from agent_runtimes.voice.wer import TOLERANCE, normalize, word_error_rate

VOICE_TESTS = Path(__file__).resolve().parents[2] / "tests" / "voice"
FIXTURES = {
    clip["id"]: clip
    for clip in json.loads((VOICE_TESTS / "fixtures.json").read_text())["clips"]
}
BASELINES = json.loads((VOICE_TESTS / "baselines.json").read_text())


def measured(name: str) -> dict:
    return json.loads((VOICE_TESTS / "measured" / name).read_text())


def test_words_are_compared_not_their_writing():
    assert (
        normalize("Dit-elle, à ma sœur : « L'équipe ! »")
        == "dit elle à ma soeur l équipe"
    )
    assert word_error_rate([("THE CAT SAT", "The cat sat.")]) == 0.0
    assert word_error_rate([("the cat sat", "the hat sat")]) == pytest.approx(1 / 3)


def test_every_fixture_is_there_and_licensed():
    about = json.loads((VOICE_TESTS / "fixtures.json").read_text())
    for clip in about["clips"]:
        assert (VOICE_TESTS / "fixtures" / clip["file"]).is_file(), clip["id"]
        assert clip["source"] in about["sources"], clip["id"]
        assert clip["text"].strip(), clip["id"]
    assert {clip["language"] for clip in about["clips"]} == {"en", "fr"}


@pytest.mark.parametrize(
    "model,language",
    [
        (model["id"], language)
        for model in SPEECH_MODEL_CATALOGUE.values()
        if model["task"] == "stt" and "device" in model["where"]
        for language in model["languages"]
    ],
)
def test_each_device_model_hears_within_two_points_of_its_baseline(model, language):
    heard = measured(f"stt-{model}.json")["languages"][language]["clips"]
    assert {clip["id"] for clip in heard} == {
        i for i, c in FIXTURES.items() if c["language"] == language
    }
    rate = word_error_rate(
        (FIXTURES[clip["id"]]["text"], clip["heard"]) for clip in heard
    )
    assert rate <= BASELINES["stt"][model][language] + TOLERANCE, (
        f"{model} {language}: WER {rate:.3f}"
    )


@pytest.mark.parametrize("voice", sorted(VOICE_CATALOGUE))
def test_each_voice_is_understood_within_two_points_of_its_baseline(voice):
    """A round trip: said by the voice, heard by the device model of its language."""
    spoken = [
        item
        for item in measured("tts-kokoro-82m.json")["spoken"]
        if item["voice"] == voice
    ]
    assert spoken, voice
    rate = word_error_rate((item["text"], item["heard"]) for item in spoken)
    assert rate <= BASELINES["round_trip"][voice] + TOLERANCE, (
        f"{voice}: WER {rate:.3f}"
    )
