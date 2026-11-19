# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The call contract: one operation of an agent's ``openapi``, answered by its agent.

:func:`call_operation` is what the MCP server, the REST API and the PAP
company all call. It checks the inputs against the operation's input schema,
tells the agent the operation's instruction, its inputs as JSON and the JSON
it must answer, runs the agent with **structured output** bound to the
operation's ``200`` schema (pydantic-ai's ``StructuredDict``), checks the
answer against that schema, asks once more when it does not fit, and answers
the JSON — or an :class:`OperationError` naming its HTTP status:

- 400 — the inputs are not the operation's;
- 402 — the spend limit is reached;
- 422 — the agent's answer did not fit the schema, twice;
- 429 — the caller's rate cap (raised by the access check before a call).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Mapping, Optional, Sequence

from agentspecs.openapi import OpenApiOperation
from jsonschema import Draft202012Validator
from pydantic_ai import Agent, StructuredDict
from pydantic_ai.exceptions import ModelHTTPError, UsageLimitExceeded

from agent_runtimes.guardrails.model_budget import ModelBudgetExceeded

#: The key an answer that is not a JSON object is wrapped under.
_WRAPPED = "result"


class OperationError(Exception):
    """Why an operation was not answered, with its HTTP status."""

    def __init__(
        self, status: int, detail: str, errors: Sequence[str] = (), code: str = ""
    ) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail
        self.errors = tuple(errors)
        #: The error's code, when a protocol names one (``approval_required``).
        self.code = code

    def as_dict(self) -> dict[str, Any]:
        """What a caller is answered."""
        return {
            **({"error": self.code} if self.code else {}),
            "detail": self.detail,
            **({"errors": list(self.errors)} if self.errors else {}),
        }


#: The Operations extension's code for an action a person approves first (Operations 4).
APPROVAL_REQUIRED = "approval_required"

#: What a caller is told of an operation a person approves (``x-pap``), wherever it is
#: called from, when the call carries no approval the company verified.
NEEDS_APPROVAL = (
    "This is done only once the person approved it. A personal agent asks them: it "
    "calls the company's API in its Session, gets the operation to approve, and sends "
    "the same request again with the approval."
)


def approval_required() -> OperationError:
    """The refusal of an operation a person approves, called without their approval."""
    return OperationError(403, NEEDS_APPROVAL, code=APPROVAL_REQUIRED)


@dataclass
class OperationAgent:
    """The agent an operation is answered by, and what each of its runs is given."""

    agent: Agent
    #: The toolsets of a run besides the agent's own (on a runtime, its MCP servers).
    toolsets: Sequence[Any] = field(default_factory=tuple)
    #: Anything else every run is given (``capabilities``, ``model``…).
    run_kwargs: Mapping[str, Any] = field(default_factory=dict)


def _problems(schema: Mapping[str, Any], value: Any) -> list[str]:
    """What in ``value`` does not fit ``schema``, each said with where."""
    found = []
    for error in sorted(
        Draft202012Validator(dict(schema)).iter_errors(value),
        key=lambda e: list(e.path),
    ):
        where = ".".join(str(part) for part in error.absolute_path)
        found.append(f"{where}: {error.message}" if where else error.message)
    return found


def _output_schema(operation: OpenApiOperation) -> tuple[dict[str, Any], bool]:
    """The schema the agent's structured output is bound to, and whether it is wrapped."""
    schema = operation.output_schema
    if schema.get("type") == "object":
        return dict(schema), False
    return {
        "type": "object",
        "properties": {_WRAPPED: dict(schema)},
        "required": [_WRAPPED],
    }, True


def operation_prompt(operation: OpenApiOperation, inputs: Mapping[str, Any]) -> str:
    """What the agent is told: the operation's instruction, its inputs as JSON, and the
    JSON it answers."""
    return "\n\n".join(
        [
            operation.instruction,
            "The inputs, as JSON:\n"
            + json.dumps(dict(inputs), indent=2, sort_keys=True),
            "Answer with JSON matching this schema:\n"
            + json.dumps(operation.output_schema, indent=2, sort_keys=True),
        ]
    )


def input_problems(operation: OpenApiOperation, inputs: Mapping[str, Any]) -> list[str]:
    """Why ``inputs`` are not ``operation``'s, in sentences; none when they are."""
    return list(_problems(operation.input_schema, dict(inputs)))


async def call_operation(
    agent: OperationAgent,
    operation: OpenApiOperation,
    inputs: Mapping[str, Any],
    usage: Optional[dict[str, int]] = None,
) -> Any:
    """Answer ``operation`` with ``inputs`` through ``agent``: the JSON its ``200`` says.

    Raises
    ------
    OperationError
        400 for inputs that are not the operation's, 402 when the spend limit
        is reached, 422 when the agent's answer did not fit, twice.

    ``usage``, when given, is added the tokens its runs spent (``tokens``).
    """
    if not isinstance(inputs, Mapping):
        raise OperationError(
            400, f"The inputs of {operation.operation_id} are a JSON object."
        )
    problems = _problems(operation.input_schema, dict(inputs))
    if problems:
        raise OperationError(
            400, f"These are not the inputs of {operation.operation_id}.", problems
        )
    schema, wrapped = _output_schema(operation)
    output_type = StructuredDict(
        schema, name=operation.operation_id, description=operation.instruction[:1024]
    )
    prompt = operation_prompt(operation, inputs)
    said: Optional[list[str]] = None
    for _ in range(2):
        asked = prompt
        if said:
            asked += (
                "\n\nYour previous answer did not fit the schema: "
                + "; ".join(said)
                + ". Answer again, fitting it."
            )
        try:
            result = await agent.agent.run(
                asked,
                output_type=output_type,
                toolsets=list(agent.toolsets) or None,
                **dict(agent.run_kwargs),
            )
        except UsageLimitExceeded as error:
            raise OperationError(402, f"The spend limit is reached: {error}") from error
        except ModelHTTPError as error:
            if error.status_code == 402:
                raise OperationError(
                    402, "The spend limit is reached: the model was not called."
                ) from error
            raise
        except ModelBudgetExceeded as error:
            raise OperationError(402, str(error)) from error
        if usage is not None:
            spent = result.usage
            spent = spent() if callable(spent) else spent
            usage["tokens"] = usage.get("tokens", 0) + int(
                getattr(spent, "total_tokens", 0) or 0
            )
        answer = result.output
        if wrapped and isinstance(answer, Mapping):
            answer = answer.get(_WRAPPED)
        said = _problems(operation.output_schema, answer)
        if not said:
            return answer
    raise OperationError(
        422,
        f"The answer of {operation.operation_id} did not fit its schema, asked twice.",
        said or (),
    )


__all__ = [
    "APPROVAL_REQUIRED",
    "NEEDS_APPROVAL",
    "OperationAgent",
    "OperationError",
    "approval_required",
    "call_operation",
    "input_problems",
    "operation_prompt",
]
