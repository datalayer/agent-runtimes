# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A widget's page written in its code (LOOP P-05): ``@app.page``.

A widget's page is a function of its inputs::

    app = Application(id="quote", kind="widget", agent="jupyter-data-analyst:0.0.1")
    app.output("total", title="Total")
    app.output("lines", "Table", columns=["item", "amount"])

    @app.page
    def quote(seats: int = 10, plan: Literal["Team", "Business"] = "Team") -> dict:
        price = 12 if plan == "Team" else 30
        return {"total": f"{seats * price} €", "lines": [{"item": plan, "amount": seats * price}]}

Its inputs are the function's parameters — each typed by its annotation, its
default its default, one without a default required — or declared with
``app.input(name, field)``; together they are a form (LOOP C-16), drawn on the
page at ``/inputs/<name>``. Its outputs are declared with ``app.output``, each
drawn at ``/outputs/<name>`` with its component; one ``result``, in words,
when none is. As an input changes, the page sends them all as the ``page``
action of its session; the runtime checks them against the form (422 and a
sentence), runs the function on them, and answers its outputs as a
``loop.page`` event, which the page shows in place.

Pure, but for `run_page`, which calls the application's code.
"""

from __future__ import annotations

import enum
import inspect
import json
import types
import typing
from typing import Any, Dict, List, Mapping, Optional, Tuple

from agent_runtimes.types import AppPageOutputSpec, AppSpec

#: The action of a session that runs its page on the inputs it carries
#: (``payload: {"inputs": {...}}``).
PAGE_ACTION = "page"

#: The ``CUSTOM`` event that says what a page shows: ``{inputs, outputs}``.
LOOP_PAGE = "loop.page"

#: What each component an output is drawn with shows its value as.
OUTPUT_SHOWS: Dict[str, str] = {
    "Text": "text",
    "Image": "url",
    "Table": "rows",
    "Chart": "points",
}

#: The output a page has when its code declares none: its result, in words.
RESULT_OUTPUT: Dict[str, Any] = {"name": "result", "title": "Result"}

_SCALARS: Dict[type, str] = {
    bool: "boolean",
    int: "integer",
    float: "number",
    str: "string",
}


class PageSignature(typing.NamedTuple):
    """What a page's function takes."""

    session: bool
    """Whether it takes the session first."""
    fields: Dict[str, Dict[str, Any]]
    """Each input it takes, as a field of the inputs' form."""
    required: List[str]
    """Those without a default."""
    open: bool
    """Whether it takes any other input (``**inputs``)."""


def _scalar(kind: Any, said: str) -> str:
    for python, json_type in _SCALARS.items():
        if kind is python:
            return json_type
    raise TypeError(
        f"{said} is a {getattr(kind, '__name__', kind)}: an input is a bool, an int, "
        "a float, a str, a Literal of them, an Enum or a list of them."
    )


def _choices(values: Tuple[Any, ...], said: str) -> Dict[str, Any]:
    kinds = {_scalar(type(value), said) for value in values}
    if len(kinds) != 1:
        raise TypeError(
            f"{said} takes values of several types: one, as a Literal says it."
        )
    return {"type": kinds.pop(), "enum": list(values)}


def field_of(name: str, annotation: Any, default: Any) -> Dict[str, Any]:
    """An input as a field of the inputs' form, from its annotation and its default.

    Parameters
    ----------
    name : str
        The parameter's name.
    annotation : Any
        Its annotation, or ``inspect.Parameter.empty``.
    default : Any
        Its default, or ``inspect.Parameter.empty``.

    Returns
    -------
    dict
        Its JSON Schema, titled by its name.

    Raises
    ------
    TypeError
        For an input of a type a form does not ask.
    """
    said = f"The input {name!r}"
    empty = inspect.Parameter.empty
    kind = annotation
    if kind is empty:
        kind = type(default) if default is not empty and default is not None else str
    if typing.get_origin(kind) in (typing.Union, types.UnionType):
        given = [arg for arg in typing.get_args(kind) if arg is not type(None)]
        if len(given) != 1:
            raise TypeError(f"{said} is one of several types: say one.")
        kind = given[0]
    field: Dict[str, Any] = {"title": name.replace("_", " ").capitalize()}
    origin = typing.get_origin(kind)
    if origin is typing.Literal:
        field.update(_choices(typing.get_args(kind), said))
    elif isinstance(kind, type) and issubclass(kind, enum.Enum):
        field.update(_choices(tuple(member.value for member in kind), said))
    elif origin in (list, tuple, typing.Sequence) or kind in (list, tuple):
        items = typing.get_args(kind)[:1] or (str,)
        item = items[0]
        if typing.get_origin(item) is typing.Literal:
            field.update(
                {"type": "array", "items": _choices(typing.get_args(item), said)}
            )
        else:
            field.update({"type": "array", "items": {"type": _scalar(item, said)}})
    else:
        field["type"] = _scalar(kind, said)
    if default is not empty:
        value = default.value if isinstance(default, enum.Enum) else default
        field["default"] = list(value) if isinstance(value, tuple) else value
    return field


def _parameters(function: Any) -> List[inspect.Parameter]:
    try:
        signature = inspect.signature(function, eval_str=True)
    except (NameError, TypeError):
        signature = inspect.signature(function)
    return list(signature.parameters.values())


def _is_session(parameter: inspect.Parameter) -> bool:
    annotation = parameter.annotation
    named = getattr(annotation, "__name__", annotation)
    return parameter.name == "session" or named == "Session"


def page_signature(function: Any) -> PageSignature:
    """What a page's function takes: the session first or not, then its inputs.

    Raises
    ------
    TypeError
        For an input taken only by position (``*args``) or of a type a form
        does not ask.
    """
    parameters = _parameters(function)
    session = bool(parameters) and _is_session(parameters[0])
    if session:
        parameters = parameters[1:]
    fields: Dict[str, Dict[str, Any]] = {}
    required: List[str] = []
    open_ = False
    for parameter in parameters:
        if parameter.kind is inspect.Parameter.VAR_KEYWORD:
            open_ = True
            continue
        if parameter.kind in (
            inspect.Parameter.VAR_POSITIONAL,
            inspect.Parameter.POSITIONAL_ONLY,
        ):
            raise TypeError(
                f"{function.__name__} takes {parameter.name} by position: a page's "
                "inputs are given by name."
            )
        fields[parameter.name] = field_of(
            parameter.name, parameter.annotation, parameter.default
        )
        if parameter.default is inspect.Parameter.empty:
            required.append(parameter.name)
    return PageSignature(session, fields, required, open_)


def page_values(app: AppSpec, inputs: Any) -> Dict[str, Any]:
    """The inputs a page runs on, checked against its form, each with its default
    for the rest (LOOP C-16).

    Raises
    ------
    ValueError
        In a sentence: the application has no page, the inputs are not values
        by name, or its form refuses them.
    """
    from agent_runtimes.loop.apps.session import form_values

    page = app.interface.page
    if page is None:
        raise ValueError(f"{app.name} has no page of its code: nothing runs one.")
    if not isinstance(inputs, Mapping):
        raise ValueError('A page\'s inputs are values by name: {"inputs": {...}}.')
    unknown = sorted(set(inputs) - set(page.inputs.get("properties") or {}))
    if unknown:
        raise ValueError(
            f"The page of {app.name} has no input {', '.join(unknown)}: its inputs are "
            f"{', '.join(page.inputs.get('properties') or {})}."
        )
    return form_values(page.inputs, inputs, "Its page's inputs")


def _records(value: Any, output: AppPageOutputSpec) -> List[Dict[str, Any]]:
    to_dict = getattr(value, "to_dict", None)
    if callable(to_dict) and not isinstance(value, Mapping):
        # A table of pandas, or of anything that says its rows so.
        value = to_dict(orient="records")
    if not isinstance(value, (list, tuple)) or not all(
        isinstance(row, Mapping) for row in value
    ):
        what = "rows" if output.component == "Table" else "points"
        raise ValueError(
            f"Its output {output.name!r} is a {output.component}: its {what} are a "
            "list of records, each a value by column."
        )
    return [dict(row) for row in value]


def shown_value(output: AppPageOutputSpec, value: Any) -> Any:
    """An output's value as its component draws it, or why it cannot be.

    Raises
    ------
    ValueError
        For a value its component does not draw, or that JSON does not write.
    """
    if output.component not in OUTPUT_SHOWS:
        # A component its developer wrote (LOOP P-17): any value JSON writes,
        # a table of pandas its rows.
        to_dict = getattr(value, "to_dict", None)
        shown: Any = (
            to_dict(orient="records")
            if callable(to_dict) and not isinstance(value, Mapping)
            else value
        )
    elif output.component in ("Table", "Chart"):
        shown = _records(value, output)
    elif output.component == "Image":
        if not isinstance(value, str):
            raise ValueError(
                f"Its output {output.name!r} is an Image: its value is its address, "
                "a URL or a data URL."
            )
        shown = value
    elif value is None:
        shown = ""
    elif isinstance(value, bool):
        shown = "yes" if value else "no"
    elif isinstance(value, (str, int, float)):
        shown = str(value)
    else:
        raise ValueError(
            f"Its output {output.name!r} is words: its value is a str or a number, "
            f"not a {type(value).__name__}."
        )
    try:
        json.dumps(shown)
    except (TypeError, ValueError) as wrong:
        raise ValueError(
            f"Its output {output.name!r} is not what JSON writes: {wrong}."
        ) from None
    return shown


def page_outputs(app: AppSpec, result: Any) -> Dict[str, Any]:
    """What a page's function returned, as its outputs: each by name, drawn.

    A page of one output may return its value; else it returns its outputs by
    name, each of them.

    Raises
    ------
    ValueError
        In a sentence: an output missing or unknown, or a value its component
        does not draw.
    """
    page = app.interface.page
    assert page is not None
    outputs = page.outputs
    names = [output.name for output in outputs]
    if len(outputs) == 1 and not (
        isinstance(result, Mapping) and set(result) == {outputs[0].name}
    ):
        given: Mapping[str, Any] = {outputs[0].name: result}
    elif not isinstance(result, Mapping):
        raise ValueError(
            f"{page.function} returned a {type(result).__name__}: a page of several "
            f"outputs returns them by name ({', '.join(names)})."
        )
    else:
        given = result
    unknown = sorted(set(given) - set(names))
    if unknown:
        raise ValueError(
            f"{page.function} returned {', '.join(unknown)}, which its page does not "
            f"show: its outputs are {', '.join(names)}."
        )
    missing = [name for name in names if name not in given]
    if missing:
        raise ValueError(
            f"{page.function} did not return {', '.join(missing)}: its page shows "
            "each of its outputs."
        )
    return {output.name: shown_value(output, given[output.name]) for output in outputs}


async def run_page(
    function: Any, session: Any, values: Mapping[str, Any]
) -> Optional[Any]:
    """Run a page's function on its inputs: the session first when it takes it."""
    signature = page_signature(function)
    if signature.session:
        result = function(session, **values)
    else:
        result = function(**values)
    if inspect.isawaitable(result):
        result = await result
    return result


__all__ = [
    "LOOP_PAGE",
    "OUTPUT_SHOWS",
    "PAGE_ACTION",
    "RESULT_OUTPUT",
    "PageSignature",
    "field_of",
    "page_outputs",
    "page_signature",
    "page_values",
    "run_page",
    "shown_value",
]
