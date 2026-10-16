# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Audio sent by a protocol client, heard through the speech service (VOICE.md VO-28).

On the web the page transcribes and the runtime sees text (§5). A protocol
client may send the sound itself — AG-UI's ``AudioInputContent`` in a user
message (``{"type": "audio", "source": {"type": "data", "value": <base64>,
"mime_type": "audio/wav"}}``). The runtime does not hear it: it asks ai-agents'
speech service (``POST /api/ai-agents/v1/speech/transcriptions``, VO-34) with
the caller's own token, and the message enters the conversation as the
transcript, marked spoken (``input: "voice"``, ``where: "server"``, VO-27) so
the record keeps the words and never the sound (VO-29).

What cannot be heard is refused in a sentence, never passed on as sound the
model would not read: a source given by URL (the runtime fetches no address a
client names), a type the service does not read, no token, the service's own
refusal. The sound is held in memory for the call only (VO-60).
"""

from __future__ import annotations

import base64
import binascii
import copy
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import httpx

from . import SpokenInput

#: Where the speech service is: ai-agents' address.
AI_AGENTS_URL_ENV = "DATALAYER_AI_AGENTS_URL"

TRANSCRIPTIONS_PATH = "/api/ai-agents/v1/speech/transcriptions"

#: What the speech service reads (its `AUDIO_TYPES`).
HEARD_TYPES = (
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/flac",
    "audio/ogg",
    "audio/webm",
)

#: The engine a transcript says it was heard by.
SERVER_ENGINE = "datalayer-speech"


class AudioNotHeard(ValueError):
    """Audio a client sent that could not be heard, said in a sentence."""


@dataclass(frozen=True)
class HeardAudio:
    text: str
    language: str


def _audio_parts(content: Any) -> List[Dict[str, Any]]:
    if not isinstance(content, list):
        return []
    return [
        part
        for part in content
        if isinstance(part, dict) and part.get("type") == "audio"
    ]


def _sound_of(part: Dict[str, Any]) -> Tuple[bytes, str]:
    source = part.get("source")
    if not isinstance(source, dict):
        raise AudioNotHeard("An audio part says where its sound is: a source.")
    if source.get("type") != "data":
        raise AudioNotHeard(
            "Audio is heard when it is sent in the message (a data source), "
            "not by an address: the runtime fetches no address a client names."
        )
    kind = str(source.get("mime_type") or source.get("mimeType") or "")
    if kind.split(";")[0].strip().lower() not in HEARD_TYPES:
        raise AudioNotHeard(
            f"Audio is heard as {', '.join(HEARD_TYPES)}, not {kind or 'no type'}."
        )
    try:
        sound = base64.b64decode(str(source.get("value") or ""), validate=True)
    except (binascii.Error, ValueError):
        raise AudioNotHeard("The audio's data is not base64.") from None
    if not sound:
        raise AudioNotHeard("The audio part is empty.")
    return sound, kind


async def hear_audio(
    sound: bytes,
    content_type: str,
    *,
    token: str,
    ai_agents_url: str,
    language: str = "",
    client: Optional[httpx.AsyncClient] = None,
) -> HeardAudio:
    """What the sound says, heard by the speech service with the caller's token."""
    if not token:
        raise AudioNotHeard(
            "Audio is heard on Datalayer's servers, which need the caller's token: send text, or sign in."
        )
    if not ai_agents_url:
        raise AudioNotHeard(
            f"Audio cannot be heard here: {AI_AGENTS_URL_ENV} names no speech service."
        )
    url = f"{ai_agents_url.rstrip('/')}{TRANSCRIPTIONS_PATH}"
    params = {"language": language} if language else None
    owned = client is None
    http = client or httpx.AsyncClient(timeout=120)
    try:
        answered = await http.post(
            url,
            params=params,
            content=sound,
            headers={"Authorization": f"Bearer {token}", "Content-Type": content_type},
        )
    finally:
        if owned:
            await http.aclose()
    try:
        body = answered.json()
    except ValueError:
        body = {}
    if answered.status_code != 200:
        detail = body.get("detail") if isinstance(body, dict) else None
        raise AudioNotHeard(
            str(detail)
            if detail
            else f"The audio could not be heard on Datalayer's servers ({answered.status_code})."
        )
    return HeardAudio(
        text=str(body.get("text") or "").strip(),
        language=str(body.get("language") or language),
    )


async def hear_agui_messages(
    body: Dict[str, Any],
    *,
    token: str,
    ai_agents_url: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> Tuple[Dict[str, Any], Optional[SpokenInput]]:
    """An AG-UI run whose newest user message carries audio, with that audio heard (VO-28).

    Returns the body with the audio parts replaced by their transcript, as
    text parts, and the spoken input it was — or the body unchanged and
    ``None`` when its newest user message has no audio. Earlier messages
    were heard when they were sent.
    """
    messages = body.get("messages")
    if not isinstance(messages, list):
        return body, None
    at = next(
        (
            index
            for index in range(len(messages) - 1, -1, -1)
            if isinstance(messages[index], dict)
            and messages[index].get("role") == "user"
        ),
        None,
    )
    if at is None or not _audio_parts(messages[at].get("content")):
        return body, None
    url = (
        ai_agents_url if ai_agents_url is not None else os.getenv(AI_AGENTS_URL_ENV, "")
    )
    heard_body = copy.deepcopy(body)
    message = heard_body["messages"][at]
    content: List[Any] = []
    language = ""
    for part in message["content"]:
        if isinstance(part, dict) and part.get("type") == "audio":
            sound, kind = _sound_of(part)
            heard = await hear_audio(
                sound, kind, token=token, ai_agents_url=url, client=client
            )
            del sound
            if not heard.text:
                raise AudioNotHeard(
                    "Nothing was heard in the audio: say it again, or type."
                )
            language = language or heard.language
            content.append({"type": "text", "text": heard.text})
        else:
            content.append(part)
    message["content"] = content
    spoken = SpokenInput(language=language, engine=SERVER_ENGINE, where="server")
    forwarded = heard_body.get("forwardedProps")
    forwarded = dict(forwarded) if isinstance(forwarded, dict) else {}
    forwarded["voice"] = spoken.as_payload()
    heard_body["forwardedProps"] = forwarded
    return heard_body, spoken


__all__ = [
    "AI_AGENTS_URL_ENV",
    "AudioNotHeard",
    "HEARD_TYPES",
    "HeardAudio",
    "SERVER_ENGINE",
    "hear_agui_messages",
    "hear_audio",
]
