# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Audio sent by a protocol client, heard through the speech service (VOICE.md VO-28).

On the web the page transcribes and the runtime sees text (§5). A protocol
client may send the sound itself — AG-UI's ``AudioInputContent`` in a user
message (``{"type": "audio", "source": {"type": "data", "value": <base64>,
"mime_type": "audio/wav"}}``), or an A2A file part of an audio type
(``{"kind": "file", "file": {"bytes": <base64>, "mimeType": "audio/wav"}}``,
heard by ``HearA2AAudio`` before the task is made), or ACP's
``AudioContentBlock`` (``{"type": "audio", "data": <base64>, "mimeType"}``,
heard by ``hear_acp_prompt`` before the turn). The runtime does not hear it: it asks ai-agents'
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
import json
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


def _a2a_sound_of(part: Dict[str, Any]) -> Optional[Tuple[bytes, str]]:
    """An A2A file part's sound and type when it is audio; ``None`` for any other file or part."""
    if part.get("kind") != "file" or not isinstance(part.get("file"), dict):
        return None
    file = part["file"]
    kind = str(file.get("mimeType") or file.get("mime_type") or "")
    base = kind.split(";")[0].strip().lower()
    if not base.startswith("audio/"):
        return None
    if "bytes" not in file:
        raise AudioNotHeard(
            "Audio is heard when it is sent in the message (a file part's bytes), "
            "not by an address: the runtime fetches no address a client names."
        )
    if base not in HEARD_TYPES:
        raise AudioNotHeard(f"Audio is heard as {', '.join(HEARD_TYPES)}, not {kind}.")
    try:
        sound = base64.b64decode(str(file.get("bytes") or ""), validate=True)
    except (binascii.Error, ValueError):
        raise AudioNotHeard("The audio's bytes are not base64.") from None
    if not sound:
        raise AudioNotHeard("The audio part is empty.")
    return sound, kind


async def hear_a2a_message(
    message: Dict[str, Any],
    *,
    token: str,
    ai_agents_url: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> Tuple[Dict[str, Any], Optional[SpokenInput]]:
    """An A2A message whose file parts carry audio, with that audio heard (VO-28).

    Returns the message with each audio file part replaced by its transcript,
    as a text part, and ``metadata.voice`` saying it was spoken — or the
    message unchanged and ``None`` when it carries no audio.
    """
    parts = message.get("parts")
    if not isinstance(parts, list):
        return message, None
    sounds = [_a2a_sound_of(part) if isinstance(part, dict) else None for part in parts]
    if not any(sounds):
        return message, None
    url = (
        ai_agents_url if ai_agents_url is not None else os.getenv(AI_AGENTS_URL_ENV, "")
    )
    heard_message = copy.deepcopy(message)
    heard_parts: List[Any] = []
    language = ""
    for part, sound in zip(parts, sounds):
        if sound is None:
            heard_parts.append(copy.deepcopy(part))
            continue
        heard = await hear_audio(
            sound[0], sound[1], token=token, ai_agents_url=url, client=client
        )
        if not heard.text:
            raise AudioNotHeard(
                "Nothing was heard in the audio: say it again, or type."
            )
        language = language or heard.language
        heard_parts.append({"kind": "text", "text": heard.text})
    del sounds
    heard_message["parts"] = heard_parts
    spoken = SpokenInput(language=language, engine=SERVER_ENGINE, where="server")
    metadata = heard_message.get("metadata")
    metadata = dict(metadata) if isinstance(metadata, dict) else {}
    metadata["voice"] = spoken.as_payload()
    heard_message["metadata"] = metadata
    return heard_message, spoken


async def hear_acp_prompt(
    content: List[Any],
    *,
    token: str,
    ai_agents_url: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> Tuple[List[Any], Optional[SpokenInput]]:
    """An ACP prompt whose ``AudioContentBlock``s are heard (VO-28).

    ``{"type": "audio", "data": <base64>, "mimeType": "audio/wav"}`` becomes
    the text block of its transcript. Returns the prompt's blocks and the
    spoken input it was — or the blocks unchanged and ``None`` when it holds
    no audio.
    """
    if not any(isinstance(b, dict) and b.get("type") == "audio" for b in content):
        return content, None
    url = (
        ai_agents_url if ai_agents_url is not None else os.getenv(AI_AGENTS_URL_ENV, "")
    )
    heard_blocks: List[Any] = []
    language = ""
    for block in content:
        if not (isinstance(block, dict) and block.get("type") == "audio"):
            heard_blocks.append(block)
            continue
        sound, kind = _sound_of(
            {
                "source": {
                    "type": "data",
                    "value": block.get("data"),
                    "mime_type": block.get("mimeType") or block.get("mime_type"),
                }
            }
        )
        heard = await hear_audio(
            sound, kind, token=token, ai_agents_url=url, client=client
        )
        del sound
        if not heard.text:
            raise AudioNotHeard(
                "Nothing was heard in the audio: say it again, or type."
            )
        language = language or heard.language
        heard_blocks.append({"type": "text", "text": heard.text})
    return heard_blocks, SpokenInput(
        language=language, engine=SERVER_ENGINE, where="server"
    )


#: The JSON-RPC methods of A2A that carry a message to the agent.
A2A_MESSAGE_METHODS = ("message/send", "message/stream")

#: What A2A says of an argument it cannot take (JSON-RPC's invalid params).
A2A_INVALID_PARAMS = -32602


class HearA2AAudio:
    """ASGI middleware: an A2A message's audio heard before the agent sees it (VO-28).

    A ``message/send`` or ``message/stream`` whose message holds audio file
    parts is heard by the speech service with the request's own bearer
    token, and the agent is given the transcript, marked spoken. What cannot
    be heard is answered as a JSON-RPC error, in a sentence, and nothing
    runs. Every other request passes untouched.
    """

    def __init__(
        self,
        app: Any,
        *,
        ai_agents_url: Optional[str] = None,
        client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self.app = app
        self.ai_agents_url = ai_agents_url
        self.client = client

    async def __call__(self, scope: Dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http" or scope.get("method") != "POST":
            await self.app(scope, receive, send)
            return
        chunks: List[bytes] = []
        more = True
        while more:
            event = await receive()
            if event["type"] == "http.disconnect":
                return
            chunks.append(event.get("body", b""))
            more = event.get("more_body", False)
        body = b"".join(chunks)
        replay = body
        try:
            request = json.loads(body) if body else None
        except ValueError:
            request = None
        if (
            isinstance(request, dict)
            and request.get("method") in A2A_MESSAGE_METHODS
            and isinstance(request.get("params"), dict)
            and isinstance(request["params"].get("message"), dict)
        ):
            header = ""
            for name, value in scope.get("headers") or []:
                if name.lower() == b"authorization":
                    header = value.decode("latin-1")
            token = header[7:].strip() if header.lower().startswith("bearer ") else ""
            try:
                heard, spoken = await hear_a2a_message(
                    request["params"]["message"],
                    token=token,
                    ai_agents_url=self.ai_agents_url,
                    client=self.client,
                )
            except AudioNotHeard as refused:
                await _json_rpc_error(send, request.get("id"), str(refused))
                return
            except httpx.HTTPError as error:
                await _json_rpc_error(
                    send,
                    request.get("id"),
                    "The audio could not be heard: Datalayer's speech service "
                    f"did not answer ({type(error).__name__}).",
                )
                return
            if spoken is not None:
                request["params"]["message"] = heard
                replay = json.dumps(request).encode("utf-8")
        headers = [
            (name, value)
            for name, value in scope.get("headers") or []
            if name.lower() != b"content-length"
        ]
        headers.append((b"content-length", str(len(replay)).encode()))
        sent = False

        async def replayed() -> Dict[str, Any]:
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": replay, "more_body": False}
            return await receive()

        await self.app({**scope, "headers": headers}, replayed, send)


async def _json_rpc_error(send: Any, request_id: Any, sentence: str) -> None:
    body = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": A2A_INVALID_PARAMS, "message": sentence},
        }
    ).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": 200,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


__all__ = [
    "A2A_MESSAGE_METHODS",
    "AI_AGENTS_URL_ENV",
    "AudioNotHeard",
    "HEARD_TYPES",
    "HearA2AAudio",
    "HeardAudio",
    "SERVER_ENGINE",
    "hear_a2a_message",
    "hear_acp_prompt",
    "hear_agui_messages",
    "hear_audio",
]
