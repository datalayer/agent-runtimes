# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Credentials are never shown to the model (LOOP R-19).

A connection uses a stored secret through the tool: the runtime holds the
secret (an environment variable, a value a configure gave it, the header an
MCP server is started with) and the tool sends it where it goes. What the
model reads — its instructions, the prompt, a tool's description, a tool's
result, a tool's error — never holds it, nor does what is kept of a run (the
record, the transcript, the spans) or a sentence an error is said in.

Two things are withheld, each as :data:`WITHHELD`:

- **a secret this runtime holds**, by its value: every environment variable
  whose name says it is one (:func:`is_secret_name`: ``*_KEY``, ``*_TOKEN``,
  ``*_SECRET``, ``*_PASSWORD``, ``*_SECRET_<UID>``…), and every value given to
  it as one (:func:`hold`) — an MCP server's expanded header, a deployment's
  user secret;
- **what looks like a credential**, by its shape (:data:`CREDENTIALS`): a
  private key, an AWS key, a GitHub or Slack token, an API key, a signed
  token — the built-in check of every application (R-06).

:class:`CredentialsWithheldCapability` is given to every agent the runtime
makes; :func:`redact` is what everything else said or kept goes through.

What it cannot do: code the model writes runs in a sandbox that has the
account's secrets in its environment (a skill's script needs them), and code
can print a secret changed — reversed, encoded — which no value matches.
"""

from __future__ import annotations

import json
import os
import re
import threading
from dataclasses import replace
from functools import lru_cache
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Mapping

from pydantic_ai import ModelRetry, RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.exceptions import (
    ToolFailed,
    ToolFailedError,
    ToolRetryError,
)
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    SystemPromptPart,
    TextPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.tools import ToolDefinition

#: What a credential looks like, by kind. Precise patterns only: a check that
#: cries wolf is turned off, and then it checks nothing.
CREDENTIALS: Dict[str, re.Pattern[str]] = {
    "a private key": re.compile(r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----"),
    "an AWS access key": re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    "a GitHub token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
    "a Slack token": re.compile(r"\bxox[abposr]-[A-Za-z0-9-]{10,}\b"),
    "an API key": re.compile(r"\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b"),
    "a Google API key": re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
    "a signed token": re.compile(
        r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"
    ),
}

#: The kind a secret this runtime holds is said as.
HELD = "a stored secret"

#: What a credential becomes in what is shown.
WITHHELD = "[a credential, withheld]"

_PRIVATE_KEY_BLOCK = re.compile(
    r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----.*?(?:-----END (?:[A-Z]+ )?PRIVATE KEY-----|\Z)",
    re.DOTALL,
)

#: The words of a variable's name that make it a secret: one of them as a
#: part of the name (``EARTHDATA_TOKEN``, ``DATALAYER_APP_USER_SECRET_<UID>``)…
_SECRET_WORDS = frozenset(
    {
        "KEY",
        "APIKEY",
        "TOKEN",
        "SECRET",
        "PASSWORD",
        "PASSWD",
        "PAT",
        "CREDENTIAL",
        "CREDENTIALS",
        "COOKIE",
        "AUTHORIZATION",
        "JWT",
        "BEARER",
    }
)
#: …unless the name ends with a word that says it is not the secret itself:
#: where it is, who it is for, how long it lives (``DATALAYER_API_KEY_URL``,
#: ``AWS_ACCESS_KEY_ID``, ``JWT_TOKEN_TTL``).
_NOT_THE_SECRET = frozenset(
    {
        "URL",
        "URI",
        "HOST",
        "PORT",
        "PATH",
        "FILE",
        "DIR",
        "ID",
        "NAME",
        "USER",
        "USERNAME",
        "TYPE",
        "KIND",
        "TTL",
        "EXPIRY",
        "EXPIRES",
        "LIMIT",
        "LENGTH",
        "ENABLED",
        "DISABLED",
        "VALIDATE",
        "HEADER",
        "SCOPE",
        "SCOPES",
        "ALGORITHM",
        "ALG",
    }
)

#: A value shorter than this is never withheld by its value: ``true``, a port,
#: a name — withholding them would withhold every word that matches.
MIN_SECRET_LENGTH = 8

_held: set[str] = set()
_lock = threading.Lock()
_compiled: tuple[tuple[str, ...], re.Pattern[str] | None] = ((), None)


@lru_cache(maxsize=4096)
def is_secret_name(name: str) -> bool:
    """Whether an environment variable's name says its value is a secret."""
    words = [word for word in re.split(r"[^A-Za-z0-9]+", name.upper()) if word]
    if not words or words[-1] in _NOT_THE_SECRET:
        return False
    return any(word in _SECRET_WORDS for word in words) or name.upper().endswith(
        ("APIKEY", "_KEY", "TOKEN", "SECRET", "PASSWORD")
    )


def _secret_value(value: Any) -> str:
    text = str(value or "").strip()
    if len(text) < MIN_SECRET_LENGTH or text.startswith(("/", "~", "./")):
        # A path names where a secret is, not the secret.
        return ""
    return text


def hold(value: Any) -> None:
    """Hold ``value`` as a secret: withheld wherever it would be shown."""
    text = _secret_value(value)
    if text:
        with _lock:
            _held.add(text)


def hold_env(env: Mapping[str, Any]) -> None:
    """Hold the values of ``env`` whose names say they are secrets."""
    for name, value in env.items():
        if is_secret_name(str(name)):
            hold(value)


#: An argument or a header that sends a credential: what is expanded into it
#: is held, whatever the variable it came from is called.
SENDS_CREDENTIAL = re.compile(
    r"authorization|bearer|token|secret|password|api[-_]?key|x-[a-z-]*key",
    re.IGNORECASE,
)


def hold_expansion(raw: str, name: str, value: str) -> None:
    """Hold what ``${name}`` expanded to in ``raw`` when it is a credential:
    the variable's name says so, or ``raw`` sends one (``Authorization: Bearer
    ${…}``)."""
    if value and (is_secret_name(name) or SENDS_CREDENTIAL.search(raw)):
        hold(value)


def release(value: Any) -> None:
    """No longer hold ``value`` (a secret taken back)."""
    with _lock:
        _held.discard(str(value or "").strip())


def held_secrets() -> List[str]:
    """Every secret this runtime holds now, longest first."""
    values = set(_held)
    for name, value in list(os.environ.items()):
        if is_secret_name(name):
            text = _secret_value(value)
            if text:
                values.add(text)
    return sorted(values, key=lambda text: (-len(text), text))


def _held_pattern() -> re.Pattern[str] | None:
    global _compiled
    values = tuple(held_secrets())
    cached_values, cached = _compiled
    if values == cached_values:
        return cached
    pattern = (
        re.compile("|".join(re.escape(value) for value in values)) if values else None
    )
    _compiled = (values, pattern)
    return pattern


def withhold(text: str) -> str:
    """``text`` with every secret this runtime holds withheld."""
    if not text:
        return text
    pattern = _held_pattern()
    return pattern.sub(WITHHELD, text) if pattern is not None else text


def redact(text: str) -> str:
    """A text with every credential in it withheld: the secrets this runtime
    holds, by their value, then what looks like one; a key block to its end."""
    text = withhold(text)
    text = _PRIVATE_KEY_BLOCK.sub(WITHHELD, text)
    for kind, pattern in CREDENTIALS.items():
        if kind != "a private key":
            text = pattern.sub(WITHHELD, text)
    return text


def _text_of(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, default=str)
    except (TypeError, ValueError):
        return str(value)


def credentials_in(value: Any) -> List[str]:
    """The kinds of credential a value holds, in order, each once."""
    text = _text_of(value)
    found = [kind for kind, pattern in CREDENTIALS.items() if pattern.search(text)]
    held = _held_pattern()
    if held is not None and held.search(text):
        found.insert(0, HELD)
    return found


def redacted(value: Any) -> Any:
    """``value`` with every credential in it withheld, its shape kept.

    Text, and the text of a list, a tuple or a mapping, is redacted in place
    of its own; any other value that holds one is said as its redacted text.
    """
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, Mapping):
        return {key: redacted(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [redacted(inner) for inner in value]
    if isinstance(value, tuple):
        return tuple(redacted(inner) for inner in value)
    text = str(value)
    said = redact(text)
    return value if said == text else said


# --- what the model reads ------------------------------------------------------------


class ToolErrorWithheld(RuntimeError):
    """A tool's error that held a credential, said with it withheld.

    Raised from nothing (``from None``): the original, which holds it, is
    neither chained nor logged with the traceback.
    """

    def __init__(self, message: str, kind: str):
        super().__init__(message)
        self.kind = kind


def _redact_part(part: Any) -> None:
    """Redact what a part of a message says, in place."""
    if isinstance(part, (SystemPromptPart, TextPart)):
        part.content = redact(part.content)
    elif isinstance(part, UserPromptPart):
        if isinstance(part.content, str):
            part.content = redact(part.content)
        else:
            part.content = [
                redact(item) if isinstance(item, str) else item for item in part.content
            ]
    elif isinstance(part, ToolReturnPart):
        part.content = redacted(part.content)
    elif isinstance(part, RetryPromptPart):
        part.content = redacted(part.content)


def redact_messages(messages: Iterable[Any]) -> None:
    """Redact a conversation's messages in place: what it keeps is what was sent."""
    for message in messages:
        if isinstance(message, (ModelRequest, ModelResponse)):
            for part in message.parts:
                _redact_part(part)
            instructions = getattr(message, "instructions", None)
            if isinstance(instructions, str):
                message.instructions = redact(instructions)


def _redacted_tool(tool: ToolDefinition) -> ToolDefinition:
    description = tool.description
    schema = tool.parameters_json_schema
    said = redact(description) if description else description
    shown = redacted(schema) if schema else schema
    if said == description and shown == schema:
        return tool
    return replace(tool, description=said, parameters_json_schema=shown)


class CredentialsWithheldCapability(AbstractCapability[Any]):
    """Nothing the model reads holds a credential (LOOP R-19).

    - **a tool's result and its error** are redacted as the tool returns,
      before anything else reads them — the other capabilities, the record,
      the stream to the browser, the span of the call;
    - **a tool's description and parameters** as the tools are given;
    - **every request to the model** — its instructions, the prompt, what
      came back from the page (``host_context``), a retry — as it is sent,
      the conversation kept as it was sent.

    Placed last among an agent's capabilities: it then wraps each tool call
    innermost, and reads each request after every other capability added to it.
    """

    async def prepare_tools(
        self, ctx: RunContext[Any], tool_defs: list[ToolDefinition]
    ) -> list[ToolDefinition]:
        return [_redacted_tool(tool) for tool in tool_defs]

    async def before_model_request(
        self, ctx: RunContext[Any], request_context: Any
    ) -> Any:
        redact_messages(request_context.messages)
        parameters = request_context.model_request_parameters
        parts = getattr(parameters, "instruction_parts", None)
        tools = getattr(parameters, "function_tools", None)
        changes: Dict[str, Any] = {}
        if parts:
            changes["instruction_parts"] = [
                replace(part, content=redact(part.content)) for part in parts
            ]
        if tools:
            changes["function_tools"] = [_redacted_tool(tool) for tool in tools]
        if changes:
            request_context = replace(
                request_context,
                model_request_parameters=replace(parameters, **changes),
            )
        return request_context

    async def wrap_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: Any,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        handler: Callable[[dict[str, Any]], Awaitable[Any]],
    ) -> Any:
        try:
            result = await handler(args)
        except ToolRetryError as error:
            part = error.tool_retry
            said = redacted(part.content)
            if said == part.content:
                raise
            raise ToolRetryError(replace(part, content=said)) from None
        except ToolFailedError as error:
            part = error.tool_failed
            said = redacted(part.content)
            if said == part.content:
                raise
            raise ToolFailedError(replace(part, content=said)) from None
        except ModelRetry as error:
            said = redact(error.message)
            if said == error.message:
                raise
            raise ModelRetry(said) from None
        except ToolFailed as error:
            said = redact(error.message)
            if said == error.message:
                raise
            raise ToolFailed(said) from None
        except Exception as error:
            text = str(error)
            said = redact(text)
            if said == text:
                raise
            raise ToolErrorWithheld(said, type(error).__name__) from None
        return redacted(result)


def credentials_withheld(capabilities: List[Any]) -> List[Any]:
    """``capabilities`` with :class:`CredentialsWithheldCapability` last, once."""
    kept = [
        capability
        for capability in capabilities
        if not isinstance(capability, CredentialsWithheldCapability)
    ]
    return [*kept, CredentialsWithheldCapability()]
