#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Measure the speech models on the recorded fixtures (VOICE.md VO-05, VO-51, VO-52).

    python scripts/voice/measure.py --store ~/.cache/speech-store

Writes ``tests/voice/measured/*.json``, which ``test_voice_wer.py`` checks
against ``tests/voice/baselines.json``:

- **speech to text**, each device model of the catalogue on the fixtures of
  each language it hears, run as the browser runs it (transformers.js, the
  same pinned files; in Node, so the timings are the CPU's, not the
  browser's): what it heard, and how long it took;
- **text to speech**, each voice saying its sample and a few of the
  product's sentences (Kokoro on the CPU, as ai-agents-speech runs it): how
  long the synthesis took against the length of the speech (the real-time
  factor), and what the device model of its language hears of it — the
  intelligibility of the voice, a round trip.

Needs ``kokoro-onnx`` and ``soundfile`` (the speech service's own), and
``@huggingface/transformers`` where ``node`` resolves it (``--node-modules``
when it is not this checkout's). One heavy process at a time: the models run
one after the other.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
VOICE_TESTS = ROOT / "tests" / "voice"

#: Sentences the product says, spoken by each voice of their language.
PHRASES = {
    "en": [
        "Open the notebook and run the first cell.",
        "Datalayer saved the report at three forty five.",
        "Ask the agent to compare the two suppliers.",
    ],
    "fr": [
        "Ouvre le notebook et lance la première cellule.",
        "Le rapport est prêt, je l'envoie à l'équipe.",
        "Demande à l'agent de comparer les deux fournisseurs.",
    ],
}


def catalogue() -> Any:
    """The generated catalogue, read without importing agent_runtimes."""
    spec = importlib.util.spec_from_file_location(
        "voices", ROOT / "agent_runtimes" / "specs" / "voices.py"
    )
    module = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def resample(samples: np.ndarray, rate: int, to: int = 16000) -> np.ndarray:
    if rate == to:
        return samples.astype(np.float32)
    count = int(round(len(samples) * to / rate))
    return np.interp(
        np.linspace(0, len(samples) - 1, count), np.arange(len(samples)), samples
    ).astype(np.float32)


def transcribe(
    store: Path, model: str, language: str, wavs: List[Path], env: Dict[str, str]
) -> Dict[str, Any]:
    script = ROOT / "scripts" / "voice" / "transcribe.mjs"
    done = subprocess.run(
        ["node", str(script), str(store), model, language, *map(str, wavs)],
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    return json.loads(done.stdout.strip().splitlines()[-1])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--store", type=Path, required=True)
    parser.add_argument(
        "--node-modules",
        type=Path,
        default=None,
        help="Where @huggingface/transformers is installed, when not in this checkout",
    )
    args = parser.parse_args()
    voices = catalogue()
    env = dict(os.environ)
    script_dir = ROOT / "scripts" / "voice"
    linked = None
    if args.node_modules is not None:
        # Node resolves a package from the script's folders up: lend it one.
        linked = script_dir / "node_modules"
        if not linked.exists():
            linked.symlink_to(args.node_modules)
    fixtures = json.loads((VOICE_TESTS / "fixtures.json").read_text())["clips"]
    measured = VOICE_TESTS / "measured"
    measured.mkdir(exist_ok=True)
    try:
        with tempfile.TemporaryDirectory() as scratch:
            wavs: Dict[str, Path] = {}
            for clip in fixtures:
                samples, rate = sf.read(
                    VOICE_TESTS / "fixtures" / clip["file"], dtype="float32"
                )
                wav = Path(scratch) / f"{clip['id']}.wav"
                sf.write(wav, resample(samples, rate), 16000, subtype="PCM_16")
                wavs[clip["id"]] = wav
            # --- speech to text, on the device's models ---------------------------------
            for model in voices.SPEECH_MODEL_CATALOGUE.values():
                if model["task"] != "stt" or "device" not in model["where"]:
                    continue
                by_language = {}
                for language in model["languages"]:
                    clips = [clip for clip in fixtures if clip["language"] == language]
                    if not clips:
                        continue
                    print(f"{model['id']} on {len(clips)} {language} clips", flush=True)
                    heard = transcribe(
                        args.store,
                        model["id"],
                        language,
                        [wavs[c["id"]] for c in clips],
                        env,
                    )
                    by_language[language] = {
                        "load_ms": heard["load_ms"],
                        "clips": [
                            {
                                "id": clip["id"],
                                "heard": result["text"],
                                "ms": result["ms"],
                                "audio_s": result["audio_s"],
                            }
                            for clip, result in zip(clips, heard["results"])
                        ],
                    }
                (measured / f"stt-{model['id']}.json").write_text(
                    json.dumps(
                        {
                            "model": model["id"],
                            "runtime": "transformers.js 4.3.0 on onnxruntime-node, CPU",
                            "languages": by_language,
                        },
                        indent=2,
                        ensure_ascii=False,
                    )
                    + "\n"
                )
            # --- text to speech, and what the device hears of it -----------------------
            from kokoro_onnx import Kokoro

            kokoro_dir = args.store / "kokoro-82m"
            files = {
                item["path"]
                for item in voices.SPEECH_MODEL_CATALOGUE["kokoro-82m"]["files"]
            }
            onnx = next(name for name in files if name.endswith(".onnx"))
            started = time.monotonic()
            kokoro = Kokoro(str(kokoro_dir / onnx), str(kokoro_dir / "voices-v1.0.bin"))
            load_ms = round((time.monotonic() - started) * 1000)
            spoken: List[Dict[str, Any]] = []
            for voice in voices.VOICE_CATALOGUE.values():
                language = voice["languages"][0]
                base = language.split("-")[0]
                for index, text in enumerate([voice["sample"], *PHRASES.get(base, [])]):
                    started = time.monotonic()
                    samples, rate = kokoro.create(
                        text, voice=voice["voice"], lang=language.lower()
                    )
                    took = time.monotonic() - started
                    wav = Path(scratch) / f"{voice['id']}-{index}.wav"
                    sf.write(wav, resample(samples, rate), 16000, subtype="PCM_16")
                    spoken.append(
                        {
                            "voice": voice["id"],
                            "language": base,
                            "text": text,
                            "wav": wav,
                            "synthesis_ms": round(took * 1000),
                            "audio_s": round(len(samples) / rate, 2),
                        }
                    )
            round_trips = []
            for base in sorted({item["language"] for item in spoken}):
                model = voices.SPEECH_MODEL_CATALOGUE[
                    "moonshine-tiny-en" if base == "en" else "whisper-base"
                ]
                items = [item for item in spoken if item["language"] == base]
                heard = transcribe(
                    args.store, model["id"], base, [item["wav"] for item in items], env
                )
                for item, result in zip(items, heard["results"]):
                    round_trips.append(
                        {
                            **{
                                key: value
                                for key, value in item.items()
                                if key != "wav"
                            },
                            "heard_by": model["id"],
                            "heard": result["text"],
                        }
                    )
            (measured / "tts-kokoro-82m.json").write_text(
                json.dumps(
                    {
                        "model": "kokoro-82m",
                        "runtime": "kokoro-onnx 0.6.1, onnxruntime CPU",
                        "load_ms": load_ms,
                        "spoken": round_trips,
                    },
                    indent=2,
                    ensure_ascii=False,
                )
                + "\n"
            )
    finally:
        if linked is not None and linked.is_symlink():
            linked.unlink()
    print(f"wrote {measured}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
