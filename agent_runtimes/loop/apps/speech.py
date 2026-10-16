# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application hears (LOOP P-22, VOICE.md VO-46): ``@app.audio``.

A turn's sound comes in chunks and is heard by the engines a page's and
``loop --voice``'s are: a WAV recording on this machine when the pinned
Whisper and faster-whisper are here (``voice.cli.Hearing``), else by
Datalayer's speech service with the person's token (``POST
/speech/transcriptions``, as protocol clients' audio is heard,
``voice.protocol_audio``). The sound is held in memory for the call only.
"""

from __future__ import annotations

import asyncio
import io
import wave
from dataclasses import dataclass
from typing import Any, AsyncIterable, Iterable, Optional, Union

from ...voice import SpokenInput


@dataclass(frozen=True)
class HeardSpeech:
    """What the person said: the words, their language, the model and where it ran."""

    text: str
    language: str
    engine: str
    where: str

    def spoken(self) -> SpokenInput:
        """The message's spoken metadata, for the run and the record (VO-27)."""
        return SpokenInput(language=self.language, engine=self.engine, where=self.where)


async def _joined(chunks: Union[bytes, Iterable[bytes], AsyncIterable[bytes]]) -> bytes:
    if isinstance(chunks, (bytes, bytearray)):
        return bytes(chunks)
    if hasattr(chunks, "__aiter__"):
        return b"".join([bytes(chunk) async for chunk in chunks])  # type: ignore[union-attr]
    return b"".join(bytes(chunk) for chunk in chunks)  # type: ignore[union-attr]


def _pcm16_of_wav(sound: bytes) -> bytes:
    """A WAV's 16-bit mono samples at 16 kHz, or a refusal saying what it is."""
    from ...voice.protocol_audio import AudioNotHeard  # noqa: PLC0415

    try:
        with wave.open(io.BytesIO(sound)) as recording:
            shape = (
                recording.getnchannels(),
                recording.getsampwidth(),
                recording.getframerate(),
            )
            frames = recording.readframes(recording.getnframes())
    except (wave.Error, EOFError) as error:
        raise AudioNotHeard(
            f"The recording could not be read as WAV: {error}"
        ) from None
    if shape != (1, 2, 16_000):
        raise AudioNotHeard(
            "On this machine a turn is heard as 16-bit mono WAV at 16 kHz, not "
            f"{shape[0]} channel(s) of {shape[1] * 8}-bit at {shape[2]} Hz."
        )
    return frames


async def hear_speech(
    chunks: Union[bytes, Iterable[bytes], AsyncIterable[bytes]],
    *,
    content_type: str = "audio/wav",
    language: str = "",
    token: Optional[str] = None,
    hearing: Optional[Any] = None,
) -> HeardSpeech:
    """Hear a turn's sound, given in chunks: here, else on Datalayer's servers.

    Parameters
    ----------
    chunks : bytes or an iterable of bytes
        The turn's sound, as it came.
    content_type : str
        What the chunks make together: WAV, FLAC, Ogg or WebM.
    language : str
        The language it is said in; the one heard when unsaid.
    token : str, optional
        The person's token, for the speech service.
    hearing : optional
        A ``voice.cli.Hearing``; one over this machine's store and the token
        when unsaid. A WAV goes to it; another type to the service.

    Returns
    -------
    HeardSpeech
        What was heard.

    Raises
    ------
    AudioNotHeard
        Said in a sentence: an empty turn, a type not heard, no token for the
        service, its refusal, or nothing heard.
    """
    from ...voice.cli import Hearing  # noqa: PLC0415
    from ...voice.protocol_audio import (  # noqa: PLC0415
        AI_AGENTS_URL_ENV,
        SERVER_ENGINE,
        AudioNotHeard,
        hear_audio,
    )

    sound = await _joined(chunks)
    if not sound:
        raise AudioNotHeard("The turn holds no sound.")
    kind = content_type.split(";")[0].strip().lower()
    if kind in ("audio/wav", "audio/x-wav", "audio/wave"):
        hears = hearing or Hearing(token=token)
        problem = hears.problem()
        if problem:
            raise AudioNotHeard(problem)
        pcm16 = _pcm16_of_wav(sound)
        del sound
        heard = await asyncio.to_thread(hears.hear, pcm16, language)
        result = HeardSpeech(
            text=heard.text.strip(),
            language=heard.language,
            engine=heard.engine,
            where="device" if heard.where == "local" else "server",
        )
    else:
        import os  # noqa: PLC0415

        answered = await hear_audio(
            sound,
            kind,
            token=token or "",
            ai_agents_url=os.getenv(AI_AGENTS_URL_ENV, ""),
            language=language,
        )
        del sound
        result = HeardSpeech(
            text=answered.text,
            language=answered.language,
            engine=SERVER_ENGINE,
            where="server",
        )
    if not result.text:
        raise AudioNotHeard("Nothing was heard: say it again, or type.")
    return result


__all__ = ["HeardSpeech", "hear_speech"]
