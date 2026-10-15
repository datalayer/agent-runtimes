# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Voice at the terminal, for ``loop --voice`` (VOICE.md VO-15, VO-16, VO-17).

The microphone and the speaker are this machine's, through ``sounddevice``
(MIT, PortAudio), installed with the ``voice`` extra —
``pip install 'agent-runtimes[voice]'`` — never a default dependency
(VO-16). Nothing here imports it at module load: a machine without it is
told so in a sentence when voice is asked for (VO-17), never a traceback.

What is said is heard **on this machine** when ``faster-whisper`` is
installed and the pinned store holds ``openai/whisper-small``
(``DATALAYER_SPEECH_MODELS_DIR``, the layout of the speech service's store),
else **on Datalayer's servers** with the person's token
(``POST /api/ai-agents/v1/speech/transcriptions``). Answers are said by the
speech service (``POST /speech/syntheses``, 16-bit PCM) and played here.

A key toggles listening (``Ctrl``+``T``, the ``/voice`` command's shortcut):
a terminal sees no key release, so there is no holding. The transcript is
put on the prompt line, to edit or send.
"""

from __future__ import annotations

import io
import os
import threading
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

#: The rate recordings are made and heard at.
RATE = 16_000

#: Where the token is looked for, in order (the ``/datalayer`` command's).
TOKEN_ENV_VARS = ("DATALAYER_TOKEN", "DATALAYER_API_KEY")

#: Where the speech service is: ai-agents' address.
AI_AGENTS_URL_ENV = "DATALAYER_AI_AGENTS_URL"
DEFAULT_AI_AGENTS_URL = "https://r1.datalayer.run"

#: Where the pinned speech models are on this machine, laid out as the store.
MODELS_DIR_ENV = "DATALAYER_SPEECH_MODELS_DIR"
DEFAULT_MODELS_DIR = "~/.cache/voice-work/store"

#: The model heard with on this machine, when it is there.
LOCAL_MODEL = "whisper-small"
LOCAL_MODEL_FOLDER = f"openai/{LOCAL_MODEL}"

#: The voice answers are said with when the spec says none.
DEFAULT_VOICE = "kokoro-af-heart"

#: The longest one press listens, in seconds: then it stops by itself.
LONGEST_SECONDS = 60

#: Said when the ``voice`` extra is not installed (VO-16, VO-17).
NO_SOUNDDEVICE = (
    "Voice at the terminal needs this machine's microphone and speaker: "
    "pip install 'agent-runtimes[voice]' (sounddevice), then run loop --voice again."
)


class VoiceRefused(Exception):
    """Voice cannot run here, said in a sentence (VO-17)."""


def wav_of(pcm16: bytes, rate: int = RATE) -> bytes:
    """Mono 16-bit samples as a WAV file: what the speech service reads."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as sound:
        sound.setnchannels(1)
        sound.setsampwidth(2)
        sound.setframerate(rate)
        sound.writeframes(pcm16)
    return buffer.getvalue()


def microphone_problem(
    query_devices: Optional[Callable[[], Any]] = None,
) -> Optional[str]:
    """Why voice cannot listen here, in a sentence naming the device found or not (VO-17); ``None`` when it can.

    ``query_devices`` stands in for ``sounddevice.query_devices`` in a test.
    """
    if query_devices is None:
        try:
            import sounddevice as sd  # noqa: PLC0415 - optional, never at import
        except ImportError:
            return NO_SOUNDDEVICE
        query_devices = sd.query_devices
    try:
        devices = list(query_devices())
    except Exception as error:  # noqa: BLE001 - PortAudio's own words
        return f"The audio devices of this machine could not be listed ({error}): voice is off."
    inputs = [d for d in devices if _as_int(d.get("max_input_channels")) > 0]
    if not inputs:
        names = ", ".join(str(d.get("name", "?")) for d in devices) or "none"
        return (
            f"No microphone was found on this machine: {len(devices)} audio "
            f"device{'s' if len(devices) != 1 else ''} ({names}), none with an input. Voice is off; type instead."
        )
    return None


def microphone_name(query_devices: Optional[Callable[[], Any]] = None) -> str:
    """The microphone that will listen: the first with an input."""
    if query_devices is None:
        import sounddevice as sd  # noqa: PLC0415

        query_devices = sd.query_devices
    for device in query_devices():
        if _as_int(device.get("max_input_channels")) > 0:
            return str(device.get("name", "microphone"))
    return "microphone"


def _as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


class Listener:
    """One press of the key: the microphone open until the next, or the longest."""

    def __init__(self, open_stream: Optional[Callable[..., Any]] = None) -> None:
        self._open = open_stream
        self._frames: List[bytes] = []
        self._stream: Any = None
        self._lock = threading.Lock()

    def start(self) -> None:
        if self._open is None:
            import sounddevice as sd  # noqa: PLC0415

            self._open = lambda callback: sd.InputStream(
                samplerate=RATE,
                channels=1,
                dtype="int16",
                blocksize=RATE // 10,
                callback=callback,
            )

        def take(indata: Any, frames: int, time: Any, status: Any) -> None:
            with self._lock:
                if len(self._frames) * (RATE // 10) < RATE * LONGEST_SECONDS:
                    self._frames.append(bytes(indata))

        self._frames = []
        self._stream = self._open(take)
        self._stream.start()

    @property
    def listening(self) -> bool:
        return self._stream is not None

    def stop(self) -> bytes:
        """Close the microphone: what it heard, mono 16-bit at 16 kHz."""
        stream, self._stream = self._stream, None
        if stream is not None:
            stream.stop()
            stream.close()
        with self._lock:
            heard = b"".join(self._frames)
            self._frames = []
        return heard


@dataclass
class Heard:
    """What a press said, and how it was heard (VO-27's metadata)."""

    text: str
    language: str
    engine: str
    where: str  # local, server


class Hearing:
    """Where what was said is written: this machine, or Datalayer's servers (VO-16)."""

    def __init__(
        self,
        *,
        models_dir: Optional[Path] = None,
        token: Optional[str] = None,
        ai_agents_url: Optional[str] = None,
        post: Optional[Callable[..., Any]] = None,
    ) -> None:
        self.models_dir = models_dir or Path(
            os.path.expanduser(os.getenv(MODELS_DIR_ENV) or DEFAULT_MODELS_DIR)
        )
        self.token = token if token is not None else _token()
        self.ai_agents_url = (
            ai_agents_url or os.getenv(AI_AGENTS_URL_ENV) or DEFAULT_AI_AGENTS_URL
        ).rstrip("/")
        self._post = post
        self._local: Any = None

    @property
    def where(self) -> str:
        """``local`` when faster-whisper and the pinned model are here, else ``server``."""
        return "local" if self._local_model_dir() else "server"

    def _local_model_dir(self) -> Optional[Path]:
        folder = self.models_dir / LOCAL_MODEL_FOLDER
        if not (folder / "model.bin").is_file():
            return None
        try:
            import faster_whisper  # noqa: F401, PLC0415
        except ImportError:
            return None
        return folder

    def problem(self) -> Optional[str]:
        """Why nothing could hear, in a sentence; ``None`` when something can."""
        if self.where == "local":
            return None
        if not self.token:
            return (
                "Heard on Datalayer's servers, which needs you signed in: set DATALAYER_TOKEN "
                f"or DATALAYER_API_KEY — or install faster-whisper and put {LOCAL_MODEL_FOLDER} in {self.models_dir}."
            )
        return None

    def hear(self, pcm16: bytes, language: str = "") -> Heard:
        """What was said: on this machine, else on Datalayer's servers."""
        folder = self._local_model_dir()
        if folder is not None:
            return self._hear_here(folder, pcm16, language)
        return self._hear_there(pcm16, language)

    def _hear_here(self, folder: Path, pcm16: bytes, language: str) -> Heard:
        import numpy as np  # noqa: PLC0415
        from faster_whisper import WhisperModel  # noqa: PLC0415

        if self._local is None:
            self._local = WhisperModel(str(folder), device="cpu", compute_type="int8")
        samples = np.frombuffer(pcm16, dtype="<i2").astype(np.float32) / 32768.0
        parts, info = self._local.transcribe(
            samples, language=(language.split("-")[0] or None), vad_filter=True
        )
        text = " ".join(part.text.strip() for part in parts).strip()
        return Heard(
            text=text,
            language=language or info.language,
            engine=LOCAL_MODEL,
            where="local",
        )

    def _hear_there(self, pcm16: bytes, language: str) -> Heard:
        problem = self.problem()
        if problem:
            raise VoiceRefused(problem)
        post = self._post or _post
        answered = post(
            f"{self.ai_agents_url}/api/ai-agents/v1/speech/transcriptions"
            + (f"?language={language}" if language else ""),
            content=wav_of(pcm16),
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "audio/wav",
            },
        )
        body = answered.json() if answered.content else {}
        if answered.status_code != 200:
            raise VoiceRefused(
                str(
                    body.get("detail")
                    or f"What you said could not be heard on Datalayer's servers ({answered.status_code})."
                )
            )
        return Heard(
            text=str(body.get("text") or "").strip(),
            language=str(body.get("language") or language),
            engine="whisper",
            where="server",
        )


class Speaker:
    """Answers said by the speech service and played here (``--speak``)."""

    def __init__(
        self,
        *,
        voice: str = DEFAULT_VOICE,
        language: str = "",
        token: Optional[str] = None,
        ai_agents_url: Optional[str] = None,
        post: Optional[Callable[..., Any]] = None,
        play: Optional[Callable[[bytes, int], None]] = None,
    ) -> None:
        self.voice = voice
        self.language = language
        self.token = token if token is not None else _token()
        self.ai_agents_url = (
            ai_agents_url or os.getenv(AI_AGENTS_URL_ENV) or DEFAULT_AI_AGENTS_URL
        ).rstrip("/")
        self._post = post
        self._play = play

    def say(self, text: str) -> None:
        """Say an answer, a sentence or a few at a time (the service takes 2,000 characters a call)."""
        text = " ".join(text.split())
        if not text:
            return
        if not self.token:
            raise VoiceRefused(
                "Answers are said by Datalayer's speech service, which needs you signed in: set DATALAYER_TOKEN or DATALAYER_API_KEY."
            )
        post = self._post or _post
        for piece in _pieces(text):
            answered = post(
                f"{self.ai_agents_url}/api/ai-agents/v1/speech/syntheses",
                json={
                    "text": piece,
                    "voice": self.voice,
                    "language": self.language,
                    "format": "pcm",
                },
                headers={"Authorization": f"Bearer {self.token}"},
            )
            if answered.status_code != 200:
                body = answered.json() if answered.content else {}
                raise VoiceRefused(
                    str(
                        body.get("detail")
                        or f"The answer could not be said ({answered.status_code})."
                    )
                )
            rate = _as_int(answered.headers.get("X-Speech-Rate")) or 24_000
            (self._play or _play)(answered.content, rate)


def _pieces(text: str, most: int = 1_800) -> List[str]:
    """The text in pieces the service takes, cut at sentence ends where it can."""
    pieces: List[str] = []
    rest = text
    while len(rest) > most:
        cut = max(
            rest.rfind(". ", 0, most),
            rest.rfind("? ", 0, most),
            rest.rfind("! ", 0, most),
        )
        if cut < most // 2:
            cut = rest.rfind(" ", 0, most)
        if cut <= 0:
            cut = most
        pieces.append(rest[: cut + 1].strip())
        rest = rest[cut + 1 :].strip()
    if rest:
        pieces.append(rest)
    return pieces


def _token() -> Optional[str]:
    for name in TOKEN_ENV_VARS:
        value = (os.environ.get(name) or "").strip()
        if value:
            return value
    return None


def _post(url: str, **kwargs: Any) -> Any:
    import httpx  # noqa: PLC0415

    return httpx.post(url, timeout=180.0, **kwargs)


def _play(pcm16: bytes, rate: int) -> None:
    import numpy as np  # noqa: PLC0415
    import sounddevice as sd  # noqa: PLC0415

    sd.play(np.frombuffer(pcm16, dtype="<i2"), rate)
    sd.wait()


@dataclass
class VoiceSession:
    """Voice for one ``loop`` session: the listener, where it is heard, and the speaker."""

    hearing: Hearing = field(default_factory=Hearing)
    listener: Listener = field(default_factory=Listener)
    speaker: Optional[Speaker] = None
    language: str = ""
    #: What the last press said, waiting for the prompt line.
    prefill: Optional[str] = None
    metadata: Dict[str, str] = field(default_factory=dict)

    def problem(
        self, query_devices: Optional[Callable[[], Any]] = None
    ) -> Optional[str]:
        """Why voice cannot run here (VO-17): no microphone, or nothing to hear with."""
        return microphone_problem(query_devices) or self.hearing.problem()

    @property
    def listening(self) -> bool:
        return self.listener.listening

    def toggle(self) -> Optional[Heard]:
        """The key: start listening, or stop and hear what was said."""
        if not self.listener.listening:
            self.listener.start()
            return None
        pcm16 = self.listener.stop()
        if len(pcm16) < RATE * 2 // 5:  # a fifth of a second: nothing was said
            return Heard(
                text="", language=self.language, engine="", where=self.hearing.where
            )
        heard = self.hearing.hear(pcm16, self.language)
        if heard.text:
            self.prefill = heard.text
            self.metadata = {
                "input": "voice",
                "language": heard.language,
                "engine": heard.engine,
                "where": heard.where,
            }
        return heard

    def take_prefill(self) -> Optional[str]:
        text, self.prefill = self.prefill, None
        return text
