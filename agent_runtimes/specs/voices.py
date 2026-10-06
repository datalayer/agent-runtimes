# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
The voice catalogue (VOICE.md VO-40): voices and speech models.

This file is AUTO-GENERATED from agentspecs (voices, speech-models).
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Any, Dict, List, Optional

#: The licences the register allows anywhere, the browser included.
SPEECH_ALLOWED_LICENCES: List[str] = [
    "MIT",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "0BSD",
    "ISC",
    "CC0-1.0",
    "CC-BY-4.0",
]

#: The voices, by id.
VOICE_CATALOGUE: Dict[str, Dict[str, Any]] = {
    "kokoro-af-heart": {
        "id": "kokoro-af-heart",
        "version": "0.0.1",
        "name": "Heart",
        "description": "A warm American English voice, Kokoro's best graded (A).",
        "engine": "kokoro",
        "model": "kokoro-82m",
        "voice": "af_heart",
        "languages": ["en-US"],
        "where": ["server"],
        "licence": {"weights": "Apache-2.0"},
        "attribution": "",
        "watermark": False,
        "sample": "Hello. I read the answers aloud, sentence by sentence, as they are written.",
    },
    "kokoro-bf-emma": {
        "id": "kokoro-bf-emma",
        "version": "0.0.1",
        "name": "Emma",
        "description": "A clear British English voice.",
        "engine": "kokoro",
        "model": "kokoro-82m",
        "voice": "bf_emma",
        "languages": ["en-GB"],
        "where": ["server"],
        "licence": {"weights": "Apache-2.0"},
        "attribution": "",
        "watermark": False,
        "sample": "Hello. I read the answers aloud, sentence by sentence, as they are written.",
    },
    "kokoro-ff-siwis": {
        "id": "kokoro-ff-siwis",
        "version": "0.0.1",
        "name": "Siwis",
        "description": "A French voice, Kokoro's only one, trained on the SIWIS French Speech Synthesis Database, whose licence asks for its attribution.",
        "engine": "kokoro",
        "model": "kokoro-82m",
        "voice": "ff_siwis",
        "languages": ["fr-FR"],
        "where": ["server"],
        "licence": {"weights": "Apache-2.0", "dataset": "CC-BY-4.0"},
        "attribution": "Trained on the SIWIS French Speech Synthesis Database, by Pierre-Edouard Honnet, Alexandros Lazaridis, Philip N. Garner and Junichi Yamagishi (Idiap Research Institute), under CC BY 4.0.",
        "watermark": False,
        "sample": "Bonjour. Je lis les réponses à voix haute, phrase par phrase, à mesure qu'elles s'écrivent.",
    },
}

#: The speech models, by id, each file pinned by its SHA-256.
SPEECH_MODEL_CATALOGUE: Dict[str, Dict[str, Any]] = {
    "kokoro-82m": {
        "id": "kokoro-82m",
        "version": "0.0.1",
        "name": "Kokoro 82M",
        "task": "tts",
        "engine": "kokoro-onnx",
        "dtype": "fp32",
        "languages": ["en", "fr", "es", "it", "pt", "hi", "ja", "zh"],
        "where": ["server"],
        "streaming": False,
        "licence": {"weights": "Apache-2.0", "code": "MIT"},
        "attribution": "",
        "upstream": "https://huggingface.co/hexgrad/Kokoro-82M",
        "revision": "model-files-v1.0",
        "files": [
            {
                "path": "kokoro-v1.0.onnx",
                "sha256": "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5",
                "size": 325532387,
            },
            {
                "path": "voices-v1.0.bin",
                "sha256": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
                "size": 28214398,
            },
        ],
    },
    "moonshine-base-en": {
        "id": "moonshine-base-en",
        "version": "0.0.1",
        "name": "Moonshine Base (English)",
        "task": "stt",
        "engine": "transformers.js",
        "dtype": "q8",
        "languages": ["en"],
        "where": ["device"],
        "streaming": False,
        "licence": {"weights": "MIT", "code": "MIT"},
        "attribution": "",
        "upstream": "https://huggingface.co/UsefulSensors/moonshine-base",
        "revision": "b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad",
        "files": [
            {
                "path": "config.json",
                "sha256": "fab7241d1e9fc6c2370c4c6dfb5da79bb54d67ed9ab6b507ac51d29d2abe01d1",
                "size": 922,
            },
            {
                "path": "generation_config.json",
                "sha256": "f9b3f711b57be7def2e50a8942f64f36ee0a55fad5b84ff93a687b6c5bcc1d44",
                "size": 147,
            },
            {
                "path": "preprocessor_config.json",
                "sha256": "fa43a7017ef85cd1d0fba0d9aae77c8adb16990ae6f11115631f41ec5d8aa679",
                "size": 128,
            },
            {
                "path": "special_tokens_map.json",
                "sha256": "ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356",
                "size": 3,
            },
            {
                "path": "tokenizer.json",
                "sha256": "7b913404bdd039af4756783218af4440bc07fb7d6d8258d677e34f95b3ec416f",
                "size": 3761754,
            },
            {
                "path": "tokenizer_config.json",
                "sha256": "edaee394565d428ea98a663ae7209cdcfeefc5585c42d7a570ff7c986df2cd15",
                "size": 135735,
            },
            {
                "path": "onnx/encoder_model_quantized.onnx",
                "sha256": "1dd9ab0a7f987113d30affcba5a068d11c8f90fa0223caa3e491ade431ad9751",
                "size": 20513063,
            },
            {
                "path": "onnx/decoder_model_merged_quantized.onnx",
                "sha256": "cc9f3cd6698a369c6008b41aa60aa3fb3322e7f03c9bdf19d8e6b7200afca4f3",
                "size": 42498870,
            },
        ],
    },
    "moonshine-tiny-en": {
        "id": "moonshine-tiny-en",
        "version": "0.0.1",
        "name": "Moonshine Tiny (English)",
        "task": "stt",
        "engine": "transformers.js",
        "dtype": "q8",
        "languages": ["en"],
        "where": ["device"],
        "streaming": False,
        "licence": {"weights": "MIT", "code": "MIT"},
        "attribution": "",
        "upstream": "https://huggingface.co/UsefulSensors/moonshine-tiny",
        "revision": "a6da1241cd305dcd64eab1edbd615f2bb9aabb95",
        "files": [
            {
                "path": "config.json",
                "sha256": "558e1e02069137c796ace1e50c48d8fe451f04a295929138e6bea885517f0edb",
                "size": 921,
            },
            {
                "path": "generation_config.json",
                "sha256": "f9b3f711b57be7def2e50a8942f64f36ee0a55fad5b84ff93a687b6c5bcc1d44",
                "size": 147,
            },
            {
                "path": "preprocessor_config.json",
                "sha256": "fa43a7017ef85cd1d0fba0d9aae77c8adb16990ae6f11115631f41ec5d8aa679",
                "size": 128,
            },
            {
                "path": "special_tokens_map.json",
                "sha256": "ca3d163bab055381827226140568f3bef7eaac187cebd76878e0b63e9e442356",
                "size": 3,
            },
            {
                "path": "tokenizer.json",
                "sha256": "7b913404bdd039af4756783218af4440bc07fb7d6d8258d677e34f95b3ec416f",
                "size": 3761754,
            },
            {
                "path": "tokenizer_config.json",
                "sha256": "edaee394565d428ea98a663ae7209cdcfeefc5585c42d7a570ff7c986df2cd15",
                "size": 135735,
            },
            {
                "path": "onnx/encoder_model_quantized.onnx",
                "sha256": "c6fc4b7bc5af75c0591fd157a1f3829b533d18e9769a888fd95a62e470dd4f4a",
                "size": 7937661,
            },
            {
                "path": "onnx/decoder_model_merged_quantized.onnx",
                "sha256": "eed87831c3a6103534aae7d47a5d485025c659a1323901513961c39fe8a1a367",
                "size": 20243286,
            },
        ],
    },
    "silero-vad": {
        "id": "silero-vad",
        "version": "0.0.1",
        "name": "Silero VAD",
        "task": "vad",
        "engine": "vad-web",
        "dtype": "fp32",
        "languages": [],
        "where": ["device"],
        "streaming": True,
        "licence": {"weights": "MIT", "code": "ISC"},
        "attribution": "",
        "upstream": "https://github.com/snakers4/silero-vad",
        "revision": "0.0.31",
        "files": [
            {
                "path": "silero_vad_legacy.onnx",
                "sha256": "a35ebf52fd3ce5f1469b2a36158dba761bc47b973ea3382b3186ca15b1f5af28",
                "size": 1807522,
            }
        ],
    },
    "whisper-base": {
        "id": "whisper-base",
        "version": "0.0.1",
        "name": "Whisper Base",
        "task": "stt",
        "engine": "transformers.js",
        "dtype": "q8",
        "languages": ["en", "fr"],
        "where": ["device"],
        "streaming": False,
        "licence": {"weights": "MIT", "code": "MIT"},
        "attribution": "",
        "upstream": "https://huggingface.co/openai/whisper-base",
        "revision": "1846881b6b3a3024392c1eea3ad983695bc23925",
        "files": [
            {
                "path": "config.json",
                "sha256": "f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b",
                "size": 2243,
            },
            {
                "path": "generation_config.json",
                "sha256": "61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0",
                "size": 3832,
            },
            {
                "path": "preprocessor_config.json",
                "sha256": "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d",
                "size": 339,
            },
            {
                "path": "special_tokens_map.json",
                "sha256": "e67ae3a0aaa99abcd9f187138e12db1f65c16a14761c50ef10eef2c174a7a691",
                "size": 2194,
            },
            {
                "path": "tokenizer.json",
                "sha256": "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566",
                "size": 2480466,
            },
            {
                "path": "tokenizer_config.json",
                "sha256": "2e036e4dbacfdeb7242c7d4ec4149f4a16e86026048f94d1637e3a8ee9c6a573",
                "size": 282682,
            },
            {
                "path": "added_tokens.json",
                "sha256": "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1",
                "size": 34604,
            },
            {
                "path": "normalizer.json",
                "sha256": "bf1c507dc8724ca9cf9903640dacfb69dae2f00edee4f21ceba106a7392f26dd",
                "size": 52666,
            },
            {
                "path": "vocab.json",
                "sha256": "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a",
                "size": 1036584,
            },
            {
                "path": "onnx/encoder_model_quantized.onnx",
                "sha256": "5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46",
                "size": 23201314,
            },
            {
                "path": "onnx/decoder_model_merged_quantized.onnx",
                "sha256": "fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b",
                "size": 53693315,
            },
        ],
    },
}


def get_voice_spec(voice_id: str) -> Optional[Dict[str, Any]]:
    """A voice of the catalogue, or None."""
    return VOICE_CATALOGUE.get(voice_id)


def get_speech_model_spec(model_id: str) -> Optional[Dict[str, Any]]:
    """A speech model of the catalogue, or None."""
    return SPEECH_MODEL_CATALOGUE.get(model_id)


def voice_speaks(voice: Dict[str, Any], language: str) -> bool:
    """Whether a voice speaks a language: `fr` and `fr-FR` are spoken by a `fr-FR` voice."""
    return any(
        own == language or own.split("-")[0] == language for own in voice["languages"]
    )


def voice_for(language: str) -> Optional[Dict[str, Any]]:
    """The first voice of the catalogue that speaks a language, or None."""
    base = (language or "").strip()
    exact = [v for v in VOICE_CATALOGUE.values() if base in v["languages"]]
    near = [v for v in VOICE_CATALOGUE.values() if voice_speaks(v, base.split("-")[0])]
    return next(iter(exact or near), None)
