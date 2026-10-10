#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate the voice catalogue (VOICE.md VO-40) in Python and TypeScript.

Read through ``agentspecs.speech``, which refuses a voice or a model whose
licence the register does not allow: what is generated has passed it.

Usage:
    python generate_voices.py \\
      --python-output agent_runtimes/specs/voices.py \\
      --typescript-output src/specs/voices.ts
"""

import argparse
import json
from pathlib import Path
from typing import Any

from agentspecs.speech import list_speech_models, list_voices, register


def _voice(voice: Any) -> dict[str, Any]:
    return {
        "id": voice.id,
        "version": voice.version,
        "name": voice.name,
        "description": " ".join(voice.description.split()),
        "engine": voice.engine,
        "model": voice.model,
        "voice": voice.voice,
        "languages": list(voice.languages),
        "where": list(voice.where),
        "licence": voice.licence.model_dump(exclude_defaults=True),
        "attribution": " ".join(voice.attribution.split()),
        "watermark": voice.watermark,
        "sample": voice.sample,
    }


def _model(model: Any) -> dict[str, Any]:
    return {
        "id": model.id,
        "version": model.version,
        "name": model.name,
        "task": model.task,
        "engine": model.engine,
        "dtype": model.dtype,
        "languages": list(model.languages),
        "where": list(model.where),
        "streaming": model.streaming,
        "licence": model.licence.model_dump(exclude_defaults=True),
        "attribution": " ".join(model.attribution.split()),
        "upstream": model.source.upstream,
        "revision": model.source.revision,
        "files": [item.model_dump() for item in model.files],
    }


def _py(value: Any) -> str:
    """A Python literal; `ruff format` lays it out."""
    return repr(value)


def generate_python_code(
    voices: list[dict[str, Any]], models: list[dict[str, Any]], allowed: list[str]
) -> str:
    return "\n".join(
        [
            "# Copyright (c) 2025-2026 Datalayer, Inc.",
            "# Distributed under the terms of the Modified BSD License.",
            '"""',
            "The voice catalogue (VOICE.md VO-40): voices and speech models.",
            "",
            "This file is AUTO-GENERATED from agentspecs (voices, speech-models).",
            "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
            '"""',
            "",
            "from typing import Any, Dict, List, Optional",
            "",
            "#: The licences the register allows anywhere, the browser included.",
            f"SPEECH_ALLOWED_LICENCES: List[str] = {_py(allowed)}",
            "",
            "#: The voices, by id.",
            "VOICE_CATALOGUE: Dict[str, Dict[str, Any]] = {",
            *[
                f'    "{voice["id"]}": {_py(voice)},'.replace("\n", "\n    ")
                for voice in voices
            ],
            "}",
            "",
            "#: The speech models, by id, each file pinned by its SHA-256.",
            "SPEECH_MODEL_CATALOGUE: Dict[str, Dict[str, Any]] = {",
            *[
                f'    "{model["id"]}": {_py(model)},'.replace("\n", "\n    ")
                for model in models
            ],
            "}",
            "",
            "",
            "def get_voice_spec(voice_id: str) -> Optional[Dict[str, Any]]:",
            '    """A voice of the catalogue, or None."""',
            "    return VOICE_CATALOGUE.get(voice_id)",
            "",
            "",
            "def get_speech_model_spec(model_id: str) -> Optional[Dict[str, Any]]:",
            '    """A speech model of the catalogue, or None."""',
            "    return SPEECH_MODEL_CATALOGUE.get(model_id)",
            "",
            "",
            "def voice_speaks(voice: Dict[str, Any], language: str) -> bool:",
            '    """Whether a voice speaks a language: `fr` and `fr-FR` are spoken by a `fr-FR` voice."""',
            "    return any(own == language or own.split('-')[0] == language for own in voice['languages'])",
            "",
            "",
            "def voice_for(language: str) -> Optional[Dict[str, Any]]:",
            '    """The first voice of the catalogue that speaks a language, or None."""',
            "    base = (language or '').strip()",
            "    exact = [v for v in VOICE_CATALOGUE.values() if base in v['languages']]",
            "    near = [v for v in VOICE_CATALOGUE.values() if voice_speaks(v, base.split('-')[0])]",
            "    return (exact or near or [None])[0]",
            "",
        ]
    )


def generate_typescript_code(
    voices: list[dict[str, Any]], models: list[dict[str, Any]], allowed: list[str]
) -> str:
    def ts(value: Any) -> str:
        return json.dumps(value, indent=2, ensure_ascii=False)

    return "\n".join(
        [
            "/*",
            " * Copyright (c) 2025-2026 Datalayer, Inc.",
            " * Distributed under the terms of the Modified BSD License.",
            " */",
            "",
            "/**",
            " * The voice catalogue (VOICE.md VO-40): voices and speech models.",
            " *",
            " * This file is AUTO-GENERATED from agentspecs (voices, speech-models).",
            " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
            " *",
            " * @module specs/voices",
            " */",
            "",
            "/** Where a step of speech runs: the person's browser, or Datalayer's servers. */",
            "export type SpeechWhere = 'device' | 'server';",
            "",
            "/** The licences a voice or a model is admitted by. */",
            "export interface SpeechLicence {",
            "  weights: string;",
            "  code?: string;",
            "  dataset?: string;",
            "}",
            "",
            "/** A voice an application may speak with. */",
            "export interface VoiceSpec {",
            "  id: string;",
            "  version: string;",
            "  name: string;",
            "  description: string;",
            "  engine: string;",
            "  /** The speech model it is a voice of. */",
            "  model: string;",
            "  /** The engine's own name for it. */",
            "  voice: string;",
            "  /** BCP 47. */",
            "  languages: string[];",
            "  where: SpeechWhere[];",
            "  licence: SpeechLicence;",
            "  /** What a page listing the voices shows, when the licence asks. */",
            "  attribution: string;",
            "  watermark: boolean;",
            "  sample: string;",
            "}",
            "",
            "/** One file of a model, pinned by its hash and its size. */",
            "export interface PinnedFile {",
            "  path: string;",
            "  sha256: string;",
            "  size: number;",
            "}",
            "",
            "/** A model of speech: to text, to speech, or voice activity. */",
            "export interface SpeechModelSpec {",
            "  id: string;",
            "  version: string;",
            "  name: string;",
            "  task: 'stt' | 'tts' | 'vad';",
            "  engine: string;",
            "  dtype: string;",
            "  languages: string[];",
            "  where: SpeechWhere[];",
            "  streaming: boolean;",
            "  licence: SpeechLicence;",
            "  attribution: string;",
            "  upstream: string;",
            "  revision: string;",
            "  files: PinnedFile[];",
            "}",
            "",
            "/** The licences the register allows anywhere, the browser included. */",
            f"export const SPEECH_ALLOWED_LICENCES: readonly string[] = {ts(allowed)};",
            "",
            "export const VOICE_CATALOGUE: Record<string, VoiceSpec> = {",
            *[
                f"  {json.dumps(voice['id'])}: {ts(voice)},".replace("\n", "\n  ")
                for voice in voices
            ],
            "};",
            "",
            "export const SPEECH_MODEL_CATALOGUE: Record<string, SpeechModelSpec> = {",
            *[
                f"  {json.dumps(model['id'])}: {ts(model)},".replace("\n", "\n  ")
                for model in models
            ],
            "};",
            "",
            "/** Whether a voice speaks a language: `fr` and `fr-FR` are spoken by a `fr-FR` voice. */",
            "export function voiceSpeaks(voice: VoiceSpec, language: string): boolean {",
            "  return voice.languages.some(",
            "    own => own === language || own.split('-')[0] === language,",
            "  );",
            "}",
            "",
            "/** The voice a language is spoken with when none is said: the first that speaks it. */",
            "export function voiceFor(language: string): VoiceSpec | undefined {",
            "  const voices = Object.values(VOICE_CATALOGUE);",
            "  return (",
            "    voices.find(voice => voice.languages.includes(language)) ??",
            "    voices.find(voice => voiceSpeaks(voice, language.split('-')[0]))",
            "  );",
            "}",
            "",
            "/**",
            " * The speech-to-text model for a language, on the device: Moonshine where it",
            " * hears it, Whisper otherwise (VOICE.md decision 3).",
            " */",
            "export function transcriberFor(language: string): SpeechModelSpec | undefined {",
            "  const base = language.split('-')[0];",
            "  const hearing = Object.values(SPEECH_MODEL_CATALOGUE).filter(",
            "    model =>",
            "      model.task === 'stt' &&",
            "      model.where.includes('device') &&",
            "      model.languages.includes(base),",
            "  );",
            "  return (",
            "    hearing.find(model => model.id === 'moonshine-tiny-en') ??",
            "    hearing.find(model => model.id.startsWith('moonshine-')) ??",
            "    hearing[0]",
            "  );",
            "}",
            "",
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate the voice catalogue from agentspecs"
    )
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()
    voices = [_voice(voice) for voice in list_voices()]
    models = [_model(model) for model in list_speech_models()]
    allowed = list(register().allowed)
    args.python_output.write_text(generate_python_code(voices, models, allowed))
    args.typescript_output.write_text(generate_typescript_code(voices, models, allowed))
    print(f"✓ Generated {len(voices)} voices and {len(models)} speech models")


if __name__ == "__main__":
    main()
