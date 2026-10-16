# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Voice at the terminal (VOICE.md VO-15, VO-16, VO-17): ``loop --voice`` and
``/voice``, where what is said is heard, and the refusals in a sentence. The
microphone, the speaker and the speech service are stand-ins on the real
shapes; nothing here needs sounddevice.
"""

from __future__ import annotations

import io
import wave
from pathlib import Path
from typing import Any

import pytest
from rich.console import Console

from agent_runtimes.chat.commands import voice as voice_command
from agent_runtimes.chat.tux import CliTux
from agent_runtimes.voice import cli as voice


class Answer:
    def __init__(
        self,
        status: int,
        body: Any = None,
        content: bytes = b"",
        headers: dict | None = None,
    ) -> None:
        self.status_code = status
        self._body = body
        self.content = content or (b"{}" if body is not None else b"")
        self.headers = headers or {}

    def json(self) -> Any:
        return self._body if self._body is not None else {}


class Stream:
    """A sounddevice InputStream, as `Listener` opens it: it hears one second of tone."""

    def __init__(self, callback: Any) -> None:
        self.callback = callback
        self.started = False
        self.closed = False

    def start(self) -> None:
        self.started = True
        for _ in range(10):
            self.callback(
                b"\x10\x00" * (voice.RATE // 10), voice.RATE // 10, None, None
            )

    def stop(self) -> None:
        self.started = False

    def close(self) -> None:
        self.closed = True


@pytest.fixture(autouse=True)
def _signed_out(monkeypatch):
    """No `datalayer login` token from this machine leaks into a test: a test names its token."""
    monkeypatch.setattr(voice, "_signed_in_token", lambda: None)


def devices(*names: str, inputs: int = 1) -> list[dict[str, Any]]:
    return [{"name": name, "max_input_channels": inputs} for name in names]


def tux() -> CliTux:
    made = CliTux(
        agent_url="http://runtime/api/v1/ag-ui/chat/",
        server_url="http://runtime",
        agent_id="chat",
        voice=True,
    )
    made.console = Console(file=io.StringIO(), width=200, soft_wrap=True)
    made._stderr_console = Console(file=io.StringIO(), width=200, soft_wrap=True)
    return made


def out(console: Console) -> str:
    assert isinstance(console.file, io.StringIO)
    return console.file.getvalue()


def test_a_recording_is_a_wav_the_service_reads():
    data = voice.wav_of(b"\x00\x00" * 160)
    with wave.open(io.BytesIO(data)) as sound:
        assert (
            sound.getnchannels(),
            sound.getsampwidth(),
            sound.getframerate(),
            sound.getnframes(),
        ) == (1, 2, 16000, 160)


def test_no_microphone_no_voice_is_a_sentence_naming_the_devices(monkeypatch):
    """VO-17: refused in a sentence, naming the device found or not; never a traceback."""
    assert voice.microphone_problem(lambda: devices("Built-in Microphone")) is None
    assert (
        voice.microphone_name(lambda: devices("HDMI", inputs=0) + devices("Headset"))
        == "Headset"
    )
    said = voice.microphone_problem(lambda: devices("HDMI Output", inputs=0))
    assert (
        said
        == "No microphone was found on this machine: 1 audio device (HDMI Output), none with an input. Voice is off; type instead."
    )
    assert voice.microphone_problem(lambda: []).startswith(
        "No microphone was found on this machine: 0 audio devices (none)"
    )

    def refusing():
        raise RuntimeError("PortAudio not initialized")

    assert (
        "could not be listed (PortAudio not initialized)"
        in voice.microphone_problem(refusing)
    )
    monkeypatch.setitem(__import__("sys").modules, "sounddevice", None)
    assert voice.microphone_problem() == voice.NO_SOUNDDEVICE
    assert "agent-runtimes[voice]" in voice.NO_SOUNDDEVICE


def test_heard_on_the_machine_when_the_model_is_here_else_on_the_servers(
    tmp_path: Path, monkeypatch
):
    """VO-16: faster-whisper and the pinned model here, else Datalayer's servers with the person's token."""
    monkeypatch.delenv("DATALAYER_TOKEN", raising=False)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    hearing = voice.Hearing(models_dir=tmp_path, token=None)
    assert hearing.where == "server"
    assert "needs you signed in" in (hearing.problem() or "")
    with pytest.raises(voice.VoiceRefused, match="signed in"):
        hearing.hear(b"\x00\x00" * voice.RATE)
    asked: list[dict[str, Any]] = []

    def post(url: str, **kwargs: Any) -> Answer:
        asked.append({"url": url, **kwargs})
        return Answer(200, {"text": " Open the notebook. ", "language": "en"})

    hearing = voice.Hearing(
        models_dir=tmp_path, token="t0k", ai_agents_url="https://r1.example/", post=post
    )
    heard = hearing.hear(b"\x10\x00" * voice.RATE, "en-US")
    assert heard == voice.Heard(
        text="Open the notebook.", language="en", engine="whisper", where="server"
    )
    assert (
        asked[0]["url"]
        == "https://r1.example/api/ai-agents/v1/speech/transcriptions?language=en-US"
    )
    assert asked[0]["headers"] == {
        "Authorization": "Bearer t0k",
        "Content-Type": "audio/wav",
    }
    assert asked[0]["content"][:4] == b"RIFF"
    # The service's refusal is the sentence the person reads.
    refusing = voice.Hearing(
        models_dir=tmp_path,
        token="t0k",
        post=lambda url, **k: Answer(
            429,
            {
                "detail": "You have used all the listening offered on Datalayer's servers for this hour: you are still heard in this browser."
            },
        ),
    )
    with pytest.raises(voice.VoiceRefused, match="all the listening offered"):
        refusing.hear(b"\x10\x00" * voice.RATE)
    # The model here, but no faster-whisper: still the servers.
    (tmp_path / "openai" / "whisper-small").mkdir(parents=True)
    (tmp_path / "openai" / "whisper-small" / "model.bin").write_bytes(b"x")
    monkeypatch.setitem(__import__("sys").modules, "faster_whisper", None)
    assert voice.Hearing(models_dir=tmp_path, token="t0k").where == "server"


def test_answers_are_said_a_piece_at_a_time_and_played_here():
    said: list[str] = []
    played: list[tuple[int, int]] = []

    def post(url: str, **kwargs: Any) -> Answer:
        said.append(kwargs["json"]["text"])
        return Answer(
            200, content=b"\x00\x00" * 2400, headers={"X-Speech-Rate": "24000"}
        )

    speaker = voice.Speaker(
        voice="kokoro-bf-emma",
        language="en-GB",
        token="t0k",
        post=post,
        play=lambda pcm, rate: played.append((len(pcm), rate)),
    )
    speaker.say("Hello there. " * 300)
    assert len(said) >= 2 and all(len(piece) <= 1800 for piece in said)
    assert all(piece.endswith(".") for piece in said)
    assert played == [(4800, 24000)] * len(said)
    with pytest.raises(voice.VoiceRefused, match="signed in"):
        voice.Speaker(token=None, post=post, play=lambda *a: None).say("Hi.")


@pytest.mark.asyncio
async def test_the_key_toggles_listening_and_the_words_go_on_the_prompt_line(
    monkeypatch,
):
    """VO-15: Ctrl+T (the /voice shortcut) listens, then hears; the transcript waits for the prompt line."""
    assert voice_command.SHORTCUT == "c-t"
    heard_here: list[bytes] = []

    def post(url: str, **kwargs: Any) -> Answer:
        heard_here.append(kwargs["content"])
        return Answer(
            200, {"text": "What is the weather like in Paris today?", "language": "en"}
        )

    session = voice.VoiceSession(
        hearing=voice.Hearing(models_dir=Path("/nowhere"), token="t0k", post=post),
        listener=voice.Listener(open_stream=Stream),
    )
    monkeypatch.setattr(voice, "microphone_problem", lambda query_devices=None: None)
    made = tux()
    made._voice_session = session
    assert await made.run_line("/voice") is True
    assert voice_command.LISTENING in out(made.console)
    assert session.listening
    assert await made.run_line("/voice") is True
    assert not session.listening
    assert "Heard on Datalayer's servers: it is on the prompt line" in out(made.console)
    assert len(heard_here) == 1 and heard_here[0][:4] == b"RIFF"
    assert session.metadata == {
        "input": "voice",
        "language": "en",
        "engine": "whisper",
        "where": "server",
    }
    assert session.take_prefill() == "What is the weather like in Paris today?"
    assert session.take_prefill() is None


@pytest.mark.asyncio
async def test_without_a_microphone_voice_refuses_in_a_sentence(monkeypatch):
    monkeypatch.setattr(
        voice,
        "microphone_problem",
        lambda query_devices=None: (
            "No microphone was found on this machine: 0 audio devices (none), none with an input. Voice is off; type instead."
        ),
    )
    made = tux()
    made._voice_session = voice.VoiceSession(
        hearing=voice.Hearing(models_dir=Path("/nowhere"), token="t0k")
    )
    assert await made.run_line("/voice") is False
    assert "No microphone was found" in out(made._stderr_console) + out(made.console)
    assert "Traceback" not in out(made._stderr_console) + out(made.console)


def test_loop_voice_and_speak_reach_the_chat(monkeypatch):
    """`loop --voice --speak` forwards both to the chat CLI, which offers them."""
    import re

    from typer.testing import CliRunner

    from agent_runtimes import __main__ as main
    from agent_runtimes.chat import cli as chat_cli
    from agent_runtimes.loop import entrypoint

    help_text = re.sub(
        r"\x1b\[[0-9;]*m", "", CliRunner().invoke(chat_cli.app, ["--help"]).output
    )
    assert "--voice" in help_text and "--speak" in help_text
    forwarded: list[list[str]] = []
    monkeypatch.setattr(entrypoint, "opens_workspace", lambda: True)
    monkeypatch.setattr(chat_cli, "app", lambda args: forwarded.append(list(args)))
    result = CliRunner().invoke(main.app, ["--cloud", "--voice", "--speak"])
    assert result.exit_code == 0, result.output
    assert forwarded and "--voice" in forwarded[0] and "--speak" in forwarded[0]


class Prompted:
    """Stand in for prompt_toolkit's session, as `show_prompt` uses it: the line given back as typed."""

    def __init__(self, typed: Any = None) -> None:
        self.typed = typed

    async def prompt_async(self, *args: Any, default: str = "", **kwargs: Any) -> str:
        return default if self.typed is None else self.typed


class RunRecorder:
    """The AG-UI client, as `send_message` runs it: what each run was sent with."""

    def __init__(self) -> None:
        self.runs: list[dict[str, Any]] = []

    async def run(self, message: str, **kwargs: Any):
        self.runs.append({"message": message, **kwargs})
        return
        yield  # an async generator that streams nothing


@pytest.mark.asyncio
async def test_a_line_said_is_sent_with_how_it_was_heard_not_just_its_words():
    """VO-15, VO-27: the prompt line's message carries input voice, the language, the engine and where."""
    session = voice.VoiceSession(
        hearing=voice.Hearing(models_dir=Path("/nowhere"), token="t0k")
    )
    session.prefill = "What is the weather like in Paris today?"
    session.metadata = {
        "input": "voice",
        "language": "en",
        "engine": "whisper",
        "where": "server",
    }
    made = tux()
    made._voice_session = session
    made.prompt_session = Prompted()
    recorder = RunRecorder()
    made._agui_client = recorder
    line = await made.show_prompt()
    assert line == "What is the weather like in Paris today?"
    await made.send_message(line)
    assert recorder.runs[-1]["forwarded_props"] == {"voice": session.metadata}
    # The next line was typed: sent as typed, nothing said about voice.
    made.prompt_session = Prompted("and tomorrow?")
    await made.send_message(await made.show_prompt())
    assert recorder.runs[-1]["forwarded_props"] is None


@pytest.mark.asyncio
async def test_words_said_then_edited_are_still_said_but_a_command_is_not():
    session = voice.VoiceSession(
        hearing=voice.Hearing(models_dir=Path("/nowhere"), token="t0k")
    )
    session.metadata = {
        "input": "voice",
        "language": "fr",
        "engine": "whisper-small",
        "where": "local",
    }
    made = tux()
    made._voice_session = session
    session.prefill = "quel temps fait il"
    made.prompt_session = Prompted("Quel temps fait-il à Paris ?")
    assert await made.show_prompt() == "Quel temps fait-il à Paris ?"
    assert made._spoken_line == session.metadata
    session.prefill = "slash help"
    made.prompt_session = Prompted("/help")
    await made.show_prompt()
    assert made._spoken_line is None


def test_the_runtime_marks_a_run_spoken_from_its_forwarded_voice():
    """The AG-UI endpoint `loop` talks to: forwardedProps.voice is the run's spoken input (VO-27)."""
    from agent_runtimes.transports.agui import mark_spoken
    from agent_runtimes.voice import heard

    mark_spoken(
        {
            "messages": [{"role": "user", "content": "Weather?"}],
            "forwardedProps": {
                "voice": {
                    "input": "voice",
                    "language": "en",
                    "engine": "whisper",
                    "where": "server",
                }
            },
        }
    )
    spoken = heard()
    assert spoken is not None
    assert (spoken.language, spoken.engine, spoken.where) == ("en", "whisper", "server")
    mark_spoken({"messages": [], "forwardedProps": {}})
    assert heard() is None
    mark_spoken({"forwardedProps": {"voice": {"input": "typed"}}})
    assert heard() is None


# ---------------------------------------------------------------------------
# VO-16: Kokoro on the machine, and the store filled from the CDN
# ---------------------------------------------------------------------------


def _pinned_store(tmp_path: Path, model_id: str, contents: dict[str, bytes]) -> Any:
    """A catalogue entry pinning `contents`, swapped in for `model_id` (the real files are 300 MB)."""
    import hashlib

    from agent_runtimes.voice import store

    real = store.model_spec(model_id)
    files = [
        {
            "path": path,
            "sha256": hashlib.sha256(data).hexdigest(),
            "size": len(data),
        }
        for path, data in contents.items()
    ]
    return {**real, "files": files}


def test_the_store_is_filled_from_the_cdn_hash_checked_and_a_wrong_file_refused(
    tmp_path, monkeypatch
):
    from agent_runtimes.voice import store

    contents = {"kokoro-v1.0.onnx": b"onnx" * 10, "voices-v1.0.bin": b"voices"}
    monkeypatch.setitem(
        store.SPEECH_MODEL_CATALOGUE,
        "kokoro-82m",
        _pinned_store(tmp_path, "kokoro-82m", contents),
    )
    asked: list[str] = []

    def download(url: str, target: Path) -> None:
        asked.append(url)
        target.write_bytes(contents[url.rsplit("/", 1)[1]])

    assert store.present("kokoro-82m", tmp_path) is None
    [folder] = store.fill(
        ["kokoro-82m"], tmp_path, "https://models-speech.example/", download
    )
    assert folder == tmp_path / "hexgrad" / "kokoro-82m"
    assert asked == [
        "https://models-speech.example/hexgrad/kokoro-82m/kokoro-v1.0.onnx",
        "https://models-speech.example/hexgrad/kokoro-82m/voices-v1.0.bin",
    ]
    assert store.present("kokoro-82m", tmp_path) == folder
    # What is there and right stays: nothing asked again.
    store.fill(["kokoro-82m"], tmp_path, "https://models-speech.example", download)
    assert len(asked) == 2
    # A file that is not the one pinned is refused and removed.
    (folder / "voices-v1.0.bin").unlink()

    def tampered(url: str, target: Path) -> None:
        target.write_bytes(b"VOICES")

    with pytest.raises(store.StoreRefused, match="not the file the catalogue pins"):
        store.fill(["kokoro-82m"], tmp_path, "https://cdn", tampered)
    assert not (folder / "voices-v1.0.bin").exists()
    assert not (folder / "voices-v1.0.bin.partial").exists()
    with pytest.raises(store.StoreRefused, match="no speech model nope"):
        store.fill(["nope"], tmp_path, "https://cdn", download)


def test_the_store_s_defaults_are_datalayer_s_cdn_and_the_two_machine_models(
    monkeypatch,
):
    from agent_runtimes.voice import store

    monkeypatch.delenv(store.MODELS_URL_ENV, raising=False)
    assert store.models_url() == "https://models-speech.datalayer.tech"
    assert store.MACHINE_MODELS == ("whisper-small", "kokoro-82m")
    for model_id in store.MACHINE_MODELS:
        assert all(
            len(item["sha256"]) == 64 for item in store.model_spec(model_id)["files"]
        )


class StandInKokoro:
    """Stand in for kokoro-onnx's `Kokoro`, as the speaker calls it: a short tone per sentence."""

    made: list[tuple[str, str]] = []

    def __init__(self, onnx: str, voices: str) -> None:
        StandInKokoro.made.append((Path(onnx).name, Path(voices).name))
        self.said: list[tuple[str, str, str]] = []

    def create(self, text: str, voice: str, lang: str):
        import numpy as np

        self.said.append((text, voice, lang))
        return np.full(2400, 0.5, dtype=np.float32), 24000


def test_answers_are_said_on_the_machine_by_kokoro_when_it_is_here(
    tmp_path, monkeypatch
):
    """VO-16: the extra's Kokoro and the pinned model here: nothing asked of the service, no token needed."""
    from agent_runtimes.voice import store

    contents = {"kokoro-v1.0.onnx": b"onnx", "voices-v1.0.bin": b"voices"}
    monkeypatch.setitem(
        store.SPEECH_MODEL_CATALOGUE,
        "kokoro-82m",
        _pinned_store(tmp_path, "kokoro-82m", contents),
    )
    played: list[tuple[int, int]] = []

    def post(url: str, **kwargs: Any) -> Answer:
        raise AssertionError("the speech service was asked")

    StandInKokoro.made = []
    speaker = voice.Speaker(
        token=None,
        post=post,
        play=lambda pcm, rate: played.append((len(pcm), rate)),
        models_dir=tmp_path,
        kokoro=StandInKokoro,
    )
    assert speaker.where == "server"  # the model is not here yet
    store.fill(
        ["kokoro-82m"],
        tmp_path,
        "https://cdn",
        lambda url, target: target.write_bytes(contents[url.rsplit("/", 1)[1]]),
    )
    assert speaker.where == "local"
    speaker.say("The report is ready.   I sent it to the team.")
    assert StandInKokoro.made == [("kokoro-v1.0.onnx", "voices-v1.0.bin")]
    assert speaker._kokoro.said == [
        ("The report is ready. I sent it to the team.", "af_heart", "en-us")
    ]
    assert played == [(4800, 24000)]
    # A French voice says French.
    french = voice.Speaker(
        voice="kokoro-ff-siwis",
        token=None,
        play=lambda pcm, rate: None,
        models_dir=tmp_path,
        kokoro=StandInKokoro,
    )
    french.say("Le rapport est prêt.")
    assert french._kokoro.said[-1][1:] == ("ff_siwis", "fr-fr")


def test_without_kokoro_here_answers_go_to_the_service_or_say_how_to_have_them(
    tmp_path,
):
    speaker = voice.Speaker(token=None, models_dir=tmp_path, play=lambda *a: None)
    assert speaker.where == "server"
    with pytest.raises(
        voice.VoiceRefused, match="python -m agent_runtimes.voice.store"
    ):
        speaker.say("Hello there.")


def test_a_voice_that_is_not_kokoro_s_is_refused_in_a_sentence(tmp_path, monkeypatch):
    from agent_runtimes.voice import store

    contents = {"kokoro-v1.0.onnx": b"o", "voices-v1.0.bin": b"v"}
    monkeypatch.setitem(
        store.SPEECH_MODEL_CATALOGUE,
        "kokoro-82m",
        _pinned_store(tmp_path, "kokoro-82m", contents),
    )
    store.fill(
        ["kokoro-82m"],
        tmp_path,
        "https://cdn",
        lambda url, target: target.write_bytes(contents[url.rsplit("/", 1)[1]]),
    )
    speaker = voice.Speaker(
        voice="piper-nobody", token=None, models_dir=tmp_path, kokoro=StandInKokoro
    )
    with pytest.raises(voice.VoiceRefused, match="not a Kokoro voice"):
        speaker.say("Hello there.")


def _kokoro_here(tmp_path: Path, monkeypatch) -> None:
    from agent_runtimes.voice import store

    contents = {"kokoro-v1.0.onnx": b"o", "voices-v1.0.bin": b"v"}
    monkeypatch.setitem(
        store.SPEECH_MODEL_CATALOGUE,
        "kokoro-82m",
        _pinned_store(tmp_path, "kokoro-82m", contents),
    )
    store.fill(
        ["kokoro-82m"],
        tmp_path,
        "https://cdn",
        lambda url, target: target.write_bytes(contents[url.rsplit("/", 1)[1]]),
    )


def _whisper_here(tmp_path: Path, monkeypatch) -> None:
    import types

    (tmp_path / "openai" / "whisper-small").mkdir(parents=True)
    (tmp_path / "openai" / "whisper-small" / "model.bin").write_bytes(b"x")
    monkeypatch.setitem(
        __import__("sys").modules, "faster_whisper", types.ModuleType("faster_whisper")
    )


def test_on_datalayer_what_is_said_is_heard_and_said_there_whatever_is_here(
    tmp_path, monkeypatch
):
    """VO-16, LOOP §10.2: `loop --cloud` hears and speaks on Datalayer, even with the extra and the store here."""
    _kokoro_here(tmp_path, monkeypatch)
    _whisper_here(tmp_path, monkeypatch)
    assert voice.Hearing(models_dir=tmp_path, token="t0k").where == "local"
    assert (
        voice.Speaker(models_dir=tmp_path, token="t0k", kokoro=StandInKokoro).where
        == "local"
    )
    asked: list[str] = []

    def post(url: str, **kwargs: Any) -> Answer:
        asked.append(url)
        if url.endswith("/transcriptions"):
            return Answer(200, {"text": "Hello.", "language": "en"})
        return Answer(
            200, content=b"\x00\x00" * 240, headers={"X-Speech-Rate": "24000"}
        )

    hearing = voice.Hearing(
        models_dir=tmp_path,
        token="t0k",
        ai_agents_url="https://r1.example",
        post=post,
        on_datalayer=True,
    )
    speaker = voice.Speaker(
        models_dir=tmp_path,
        token="t0k",
        ai_agents_url="https://r1.example",
        post=post,
        play=lambda pcm, rate: None,
        kokoro=StandInKokoro,
        on_datalayer=True,
    )
    assert hearing.where == "server" and speaker.where == "server"
    assert hearing.hear(b"\x10\x00" * voice.RATE).where == "server"
    speaker.say("Hello there.")
    assert asked == [
        "https://r1.example/api/ai-agents/v1/speech/transcriptions",
        "https://r1.example/api/ai-agents/v1/speech/syntheses",
    ]
    # Signed out, on Datalayer: one sentence that says why and how.
    signed_out = voice.Hearing(models_dir=tmp_path, token="", on_datalayer=True)
    assert "runs on Datalayer" in (signed_out.problem() or "")
    assert "datalayer login" in (signed_out.problem() or "")


def test_the_terminal_on_datalayer_hears_and_speaks_there(monkeypatch):
    """VO-16: the session's voice follows where its agent runs."""
    here = tux()
    here.speak = True
    assert here.voice_session().hearing.on_datalayer is False
    assert here.voice_session().speaker.on_datalayer is False
    there = tux()
    there.speak = True
    there.where = "01m40 on Datalayer (ai-agents-env)"
    assert there.voice_session().hearing.on_datalayer is True
    assert there.voice_session().speaker.on_datalayer is True


def test_a_kokoro_that_cannot_speak_here_is_a_sentence_and_the_service_says_the_answers(
    tmp_path, monkeypatch
):
    """VO-16: eSpeak NG ending the process (its data not found) is found in a child, said, and routed round."""
    _kokoro_here(tmp_path, monkeypatch)
    checked: list[tuple[str, str]] = []

    def check(folder: Path, voice_name: str, language: str) -> str:
        checked.append((voice_name, language))
        return "phontab: No such file or directory"

    played: list[int] = []
    speaker = voice.Speaker(
        models_dir=tmp_path,
        token="t0k",
        post=lambda url, **k: Answer(
            200, content=b"\x00\x00" * 240, headers={"X-Speech-Rate": "24000"}
        ),
        play=lambda pcm, rate: played.append(rate),
        kokoro=StandInKokoro,
        kokoro_check=check,
    )
    assert speaker.where == "server"
    assert speaker.not_here == (
        "Kokoro could not speak on this machine (phontab: No such file or directory): "
        "answers are said by Datalayer's speech service."
    )
    speaker.say("Hello there.")
    assert played == [24000] and checked == [("af_heart", "en-us")]
    # Signed out too: the sentence says both.
    signed_out = voice.Speaker(
        models_dir=tmp_path, token="", kokoro=StandInKokoro, kokoro_check=check
    )
    with pytest.raises(
        voice.VoiceRefused, match="could not speak on this machine.*signed in"
    ):
        signed_out.say("Hello there.")


def test_kokoro_is_asked_to_speak_in_a_process_of_its_own(tmp_path, monkeypatch):
    """VO-16: the check runs a child; its crash is the sentence's reason, its success is nothing."""
    _kokoro_here(tmp_path, monkeypatch)
    folder = tmp_path / "hexgrad" / "kokoro-82m"
    dying = tmp_path / "dying-python"
    dying.write_text(
        "#!/bin/sh\necho 'Error processing file' >&2\n"
        "echo '/home/runner/work/espeak-ng-data/phontab: No such file or directory.' >&2\nkill -ABRT $$\n"
    )
    dying.chmod(0o755)
    assert voice.kokoro_problem(folder, "af_heart", "en-us", python=str(dying)) == (
        "/home/runner/work/espeak-ng-data/phontab: No such file or directory."
    )
    speaking = tmp_path / "speaking-python"
    speaking.write_text(
        '#!/bin/sh\ntest "$2" = "$KOKORO_CHECK_EXPECTED" && exit 0; exit 3\n'
    )
    speaking.chmod(0o755)
    monkeypatch.setenv("KOKORO_CHECK_EXPECTED", voice.KOKORO_CHECK)
    assert (
        voice.kokoro_problem(folder, "af_heart", "en-us", python=str(speaking)) is None
    )
    silent = tmp_path / "silent-python"
    silent.write_text("#!/bin/sh\nexit 9\n")
    silent.chmod(0o755)
    assert (
        voice.kokoro_problem(folder, "af_heart", "en-us", python=str(silent))
        == "it ended with code 9"
    )


def test_a_voice_is_given_its_own_language_tag_not_the_person_s(tmp_path, monkeypatch):
    """VO-16: `fr` is said as `fr-fr` (eSpeak NG refuses `fr`); a language the voice does not speak is a sentence."""
    _kokoro_here(tmp_path, monkeypatch)
    french = voice.Speaker(
        voice="kokoro-ff-siwis",
        language="fr",
        token=None,
        play=lambda *a: None,
        models_dir=tmp_path,
        kokoro=StandInKokoro,
    )
    french.say("Le rapport est prêt.")
    assert french._kokoro.said[-1][1:] == ("ff_siwis", "fr-fr")
    english = voice.Speaker(
        voice="kokoro-ff-siwis",
        language="en",
        token=None,
        play=lambda *a: None,
        models_dir=tmp_path,
        kokoro=StandInKokoro,
    )
    with pytest.raises(voice.VoiceRefused, match="does not speak en: it speaks fr-FR"):
        english.say("The report is ready.")


def test_only_what_the_catalogue_says_runs_on_the_machine_runs_here(
    tmp_path, monkeypatch
):
    """VO-16: `where: machine` in the catalogue, or the servers."""
    from agent_runtimes.voice import store

    assert store.runs_on_the_machine("whisper-small") and store.runs_on_the_machine(
        "kokoro-82m"
    )
    assert not store.runs_on_the_machine("whisper-large-v3-turbo")
    _whisper_here(tmp_path, monkeypatch)
    assert voice.Hearing(models_dir=tmp_path, token="t0k").where == "local"
    monkeypatch.setitem(
        store.SPEECH_MODEL_CATALOGUE,
        "whisper-small",
        {**store.model_spec("whisper-small"), "where": ["server"]},
    )
    assert voice.Hearing(models_dir=tmp_path, token="t0k").where == "server"


def test_the_signed_in_token_is_used_when_no_variable_names_one(monkeypatch):
    """VO-16: `datalayer login`'s token, as `loop --cloud` reads it, hears and says on Datalayer."""
    monkeypatch.delenv("DATALAYER_TOKEN", raising=False)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    monkeypatch.setattr(voice, "_signed_in_token", lambda: "from-login")
    assert voice.Hearing().token == "from-login"
    monkeypatch.setenv("DATALAYER_API_KEY", "from-env")
    assert voice.Hearing().token == "from-env"
    from agent_runtimes.loop import launch

    def signed_out() -> Any:
        raise launch.NotSignedIn("No Datalayer credentials were found.")

    monkeypatch.undo()
    monkeypatch.delenv("DATALAYER_TOKEN", raising=False)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    monkeypatch.setattr(launch, "make_client", signed_out)
    assert voice._signed_in_token() is None
    monkeypatch.setattr(launch, "make_client", lambda: (object(), "kept-token"))
    assert voice._signed_in_token() == "kept-token"
