# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A voice assistant — Chainlit's cookbook ``openai-whisper``, rebuilt with
LOOP's API as far as LOOP goes (LOOP P-27).

Chainlit streams the microphone to the application (``on_audio_start``,
``on_audio_chunk``: 16-bit PCM, a turn ended by 1.3 s of silence), writes the
turn as a WAV, transcribes it with Whisper in a ``tool`` step, shows it as the
user's message with its audio, answers with a model, speaks the answer with
ElevenLabs, and plays it.

**The gap.** LOOP has no live microphone: the composer takes no audio stream,
and no handler hears one (voice is set aside, plans/VOICE.md). What LOOP does
take is a **voice note** — an audio file sent with a message (``@app.file``,
``audio/*`` in the Appspec's uploads, P-21) — and that is what this rebuild
answers: transcribed with Whisper in a ``tool`` step as Chainlit does,
answered by the application's agent, spoken with OpenAI's speech (Chainlit's
example uses ElevenLabs), and played in the answer with the catalog's
AudioPlayer. Needs ``OPENAI_API_KEY``.
"""

import base64
from typing import List

from agent_runtimes.loop.apps import Application, Session, UploadedFile

AGENT = "example-a2a-writer:0.0.1"

app = Application.from_spec(
    {
        "schema": "loop.app/v1",
        "id": "voice-assistant",
        "name": "Voice Assistant",
        "kind": "chat",
        "agent": AGENT,
        "description": "Send a voice note: it is transcribed, answered, and the answer spoken back.",
        "instructions": "You are a voice assistant: answer in two short spoken sentences, no markdown.",
        "interface": {"uploads": {"kinds": [{"type": "audio/*", "max_mb": 10}]}},
    }
)


def openai_client():
    """The OpenAI client the transcription and the speech are asked of."""
    from openai import AsyncOpenAI

    return AsyncOpenAI()


@app.start
async def start(session: Session) -> None:
    await session.send("Welcome to the voice example! Send a voice note to talk.")


@app.file
async def voice_note(session: Session, files: List[UploadedFile], text: str) -> None:
    client = openai_client()
    for file in files:
        async with session.step("speech_to_text", kind="tool", input=file.name) as step:
            heard = await client.audio.transcriptions.create(
                model="whisper-1", file=(file.name, file.content, file.media_type)
            )
            step.output = heard.text
        await session.send(heard.text, author="You")
        answer = await session.agent.run(heard.text)
        async with session.step(
            "text_to_speech", kind="tool", input=answer.text
        ) as step:
            spoken = await client.audio.speech.create(
                model="gpt-4o-mini-tts",
                voice="alloy",
                input=answer.text,
                response_format="wav",
            )
            audio = spoken.content
            step.output = f"{len(audio)} bytes of audio/wav"
        await session.send(
            answer.text,
            show=[
                session.ui.audio_player(
                    "answer-audio",
                    url="data:audio/wav;base64," + base64.b64encode(audio).decode(),
                    description="The answer, spoken",
                )
            ],
        )


@app.message
async def on_message(session: Session, text: str) -> None:
    await session.send("This is a voice demo: send a voice note to start!")
