# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Voice at the terminal, for ``loop --voice`` (VO-15, VO-16, VO-17).

The microphone and the speaker are this machine's, through ``sounddevice``
(MIT, PortAudio), installed with the ``voice`` extra —
``pip install 'agent-runtimes[voice]'`` — never a default dependency
(VO-16). Nothing here imports it at module load: a machine without it is
told so in a sentence when voice is asked for (VO-17), never a traceback.

What is said is heard **on this machine** when ``faster-whisper`` is
installed and the pinned store holds ``openai/whisper-small``
(``DATALAYER_SPEECH_MODELS_DIR``, the layout of the speech service's store),
else **on Datalayer's servers** with the person's token
(``POST /api/ai-agents/v1/speech/transcriptions``). Answers are said **on
this machine** by Kokoro when ``kokoro-onnx`` (the ``voice`` extra) is
installed and the store holds ``hexgrad/kokoro-82m``, else by the speech
service (``POST /speech/syntheses``, 16-bit PCM), and played here. The store
is filled from Datalayer's CDN, hash-checked: ``python -m
agent_runtimes.voice.store`` (VO-16).

When ``loop`` runs its agent **on Datalayer** (``--cloud``), what
is said is heard and answers are said **on Datalayer's servers** with the
person's token, whatever this machine has. Only what the catalogue says runs
on the machine (``where: machine``) is run here, and Kokoro is first asked to
say one word in a process of its own: an engine that cannot speak here (eSpeak
NG's data not found, a crash inside it) is said in a sentence and the answers
go to the speech service, never a dead terminal (VO-16).

A key toggles listening (``Ctrl``+``T``, the ``/voice`` command's shortcut):
a terminal sees no key release, so there is no holding. The transcript is
put on the prompt line, to edit or send.
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
import threading
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from agent_runtimes.voice import store

#: The rate recordings are made and heard at.
RATE = 16_000

#: Where the token is looked for, in order (the ``/datalayer`` command's).
TOKEN_ENV_VARS = ("DATALAYER_TOKEN", "DATALAYER_API_KEY")

#: Where the speech service is: ai-agents' address.
AI_AGENTS_URL_ENV = "DATALAYER_AI_AGENTS_URL"
DEFAULT_AI_AGENTS_URL = "https://r1.datalayer.run"

#: Where the pinned speech models are on this machine, laid out as the store.
MODELS_DIR_ENV = store.MODELS_DIR_ENV
DEFAULT_MODELS_DIR = store.DEFAULT_MODELS_DIR

#: How the store is filled, said where a model is missing (VO-16).
FILL_STORE = "python -m agent_runtimes.voice.store"

#: The model heard with on this machine, when it is there.
LOCAL_MODEL = "whisper-small"
LOCAL_MODEL_FOLDER = f"openai/{LOCAL_MODEL}"

#: What Kokoro is asked to do in a process of its own before it is relied on:
#: eSpeak NG, under it, can end the process it runs in (VO-16).
KOKORO_CHECK = (
    "import sys; from kokoro_onnx import Kokoro; "
    "Kokoro(sys.argv[1], sys.argv[2]).create('Ready.', voice=sys.argv[3], lang=sys.argv[4])"
)

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
        on_datalayer: bool = False,
    ) -> None:
        #: ``loop`` runs its agent on Datalayer: heard there, whatever is here (VO-16).
        self.on_datalayer = on_datalayer
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
        if self.on_datalayer or not store.runs_on_the_machine(LOCAL_MODEL):
            return None
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
            if self.on_datalayer:
                return (
                    "Your agent runs on Datalayer, where what you say is heard: that needs you "
                    "signed in — datalayer login, or set DATALAYER_API_KEY."
                )
            return (
                "Heard on Datalayer's servers, which needs you signed in: set DATALAYER_TOKEN "
                f"or DATALAYER_API_KEY — or install faster-whisper and fill {self.models_dir} "
                f"with {LOCAL_MODEL_FOLDER} ({FILL_STORE})."
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
    """Answers said and played here (``--speak``): by Kokoro on this machine when it is here, else by the speech service (VO-16)."""

    def __init__(
        self,
        *,
        voice: str = DEFAULT_VOICE,
        language: str = "",
        token: Optional[str] = None,
        ai_agents_url: Optional[str] = None,
        post: Optional[Callable[..., Any]] = None,
        play: Optional[Callable[[bytes, int], None]] = None,
        models_dir: Optional[Path] = None,
        kokoro: Optional[Callable[[str, str], Any]] = None,
        kokoro_check: Optional[Callable[[Path, str, str], Optional[str]]] = None,
        on_datalayer: bool = False,
    ) -> None:
        self.voice = voice
        #: ``loop`` runs its agent on Datalayer: said there, whatever is here (VO-16).
        self.on_datalayer = on_datalayer
        self.language = language
        self.token = token if token is not None else _token()
        self.ai_agents_url = (
            ai_agents_url or os.getenv(AI_AGENTS_URL_ENV) or DEFAULT_AI_AGENTS_URL
        ).rstrip("/")
        self.models_dir = models_dir or store.models_dir()
        self._post = post
        self._play = play
        # Kokoro(onnx path, voices path), kokoro-onnx's or a stand-in in a test.
        self._kokoro_factory = kokoro
        self._kokoro: Any = None
        # Asks Kokoro to say a word in a process of its own; kokoro-onnx's own
        # is checked, a stand-in is not unless a test says how (VO-16).
        self._kokoro_check = kokoro_check or (
            kokoro_problem if kokoro is None else (lambda *_: None)
        )
        self._checked: Optional[Path] = None
        #: Why answers are not said here although Kokoro is installed, in a sentence.
        self.not_here: Optional[str] = None

    @property
    def where(self) -> str:
        """``local`` when kokoro-onnx and the pinned kokoro-82m are here, else ``server``."""
        return "local" if self._local_folder() else "server"

    def _local_folder(self) -> Optional[Path]:
        if self.on_datalayer or self.not_here is not None:
            return None
        if not store.runs_on_the_machine(store.SPEAKING_MODEL):
            return None
        folder = store.present(store.SPEAKING_MODEL, self.models_dir)
        if folder is None:
            return None
        if self._kokoro_factory is None:
            try:
                import kokoro_onnx  # noqa: F401, PLC0415 - the voice extra's
            except ImportError:
                return None
        if self._checked != folder:
            voice, language = self._voice_and_language()
            problem = self._kokoro_check(folder, voice, language)
            if problem:
                self.not_here = (
                    f"Kokoro could not speak on this machine ({problem}): "
                    "answers are said by Datalayer's speech service."
                )
                return None
            self._checked = folder
        return folder

    def _voice_and_language(self) -> tuple[str, str]:
        """Return Kokoro's own name for the voice, and the language it says it in."""
        from agentspecs.speech import get_voice  # noqa: PLC0415

        from agent_runtimes.specs.voices import VOICE_CATALOGUE  # noqa: PLC0415

        spec = VOICE_CATALOGUE.get(self.voice)
        if spec is None or spec.get("engine") != "kokoro":
            raise VoiceRefused(
                f"{self.voice} is not a Kokoro voice of the catalogue: "
                f"{', '.join(sorted(VOICE_CATALOGUE))}."
            )
        # The voice's own tag (`fr` is `fr-FR`): eSpeak NG knows `fr-fr`, not `fr`.
        wanted = self.language or spec["languages"][0]
        language = get_voice(self.voice).spoken_as(wanted)
        if not language:
            raise VoiceRefused(
                f"The voice {self.voice} does not speak {wanted}: it speaks "
                f"{', '.join(spec['languages'])}."
            )
        return str(spec["voice"]), language.lower()

    def say(self, text: str) -> None:
        """Say an answer: here, whole sentences at a time; else by the service, 2,000 characters a call."""
        text = " ".join(text.split())
        if not text:
            return
        folder = self._local_folder()
        if folder is not None:
            self._say_here(folder, text)
            return
        if not self.token:
            if self.not_here:
                raise VoiceRefused(
                    f"{self.not_here} That needs you signed in: datalayer login, "
                    "or set DATALAYER_API_KEY."
                )
            raise VoiceRefused(
                "Answers are said by Datalayer's speech service, which needs you signed in: "
                "set DATALAYER_TOKEN or DATALAYER_API_KEY — or install agent-runtimes[voice] "
                f"and fill {self.models_dir} with hexgrad/{store.SPEAKING_MODEL} ({FILL_STORE})."
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

    def _say_here(self, folder: Path, text: str) -> None:
        import numpy as np  # noqa: PLC0415

        voice, language = self._voice_and_language()
        if self._kokoro is None:
            files = [
                item["path"] for item in store.model_spec(store.SPEAKING_MODEL)["files"]
            ]
            onnx = next(name for name in files if name.endswith(".onnx"))
            voices = next(name for name in files if name.endswith(".bin"))
            factory = self._kokoro_factory
            if factory is None:
                from kokoro_onnx import Kokoro  # noqa: PLC0415

                factory = Kokoro
            self._kokoro = factory(str(folder / onnx), str(folder / voices))
        for piece in _pieces(text):
            samples, rate = self._kokoro.create(piece, voice=voice, lang=language)
            pcm = (np.clip(np.asarray(samples), -1.0, 1.0) * 32767.0).astype("<i2")
            (self._play or _play)(pcm.tobytes(), int(rate))


def kokoro_problem(
    folder: Path, voice: str, language: str, *, python: str = sys.executable
) -> Optional[str]:
    """Why Kokoro cannot say a word here, from a process of its own; ``None`` when it can (VO-16).

    eSpeak NG, under kokoro-onnx, can end the process it runs in (its data not
    found): asked in a child, that is a sentence instead of a dead terminal.
    """
    from_catalogue = [
        item["path"] for item in store.model_spec(store.SPEAKING_MODEL)["files"]
    ]
    onnx = next(name for name in from_catalogue if name.endswith(".onnx"))
    voices = next(name for name in from_catalogue if name.endswith(".bin"))
    try:
        done = subprocess.run(  # noqa: S603 - this interpreter, a fixed program
            [
                python,
                "-c",
                KOKORO_CHECK,
                str(folder / onnx),
                str(folder / voices),
                voice,
                language,
            ],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return "it did not say a word in 2 minutes"
    if done.returncode == 0:
        return None
    lines = [line.strip() for line in (done.stderr or "").splitlines() if line.strip()]
    return lines[-1] if lines else f"it ended with code {done.returncode}"


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
    return _signed_in_token()


def _signed_in_token() -> Optional[str]:
    """The token ``datalayer login`` keeps, read as ``loop --cloud`` reads it (L-04); ``None`` when signed out."""
    from agent_runtimes.loop.launch import NotSignedIn, make_client  # noqa: PLC0415

    try:
        return make_client()[1]
    except NotSignedIn:
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
