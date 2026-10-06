# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application does when its agent calls a tool.

A rule is written in a person's words — *ask me before it sends anything* —
and applies to what a tool does: a class of action (read, write, send, buy,
delete, publish) or named tools. The classes are the catalogue's
(`agent_runtimes.specs.actions`), written on every tool by somebody who
looked; a tool nobody classed is unknown, and unknown is the most restricted.

The decision, in order:

1. a tool of a server the application is not connected to, or that its
   connection leaves out (`only`), is left to the person: an application
   reaches nothing it does not name;
2. a tool that can act, on a connection that only reads, is left to the person;
3. a rule that names the tool decides what the tool does of its own — and what
   the arguments of the call make it do *besides* is still decided by its
   class: *label a message: do it* does not become *trash it: do it*;
4. a tool nobody classed is left to the person;
5. otherwise each of its classes is decided by the rule on that class — or,
   with no rule, reading is done and anything that acts waits for a person —
   and the most restricted wins.

Before any call, the first two steps decide what the agent is *given*
(`gives`, LOOP U-15): a connection's level maps to its tools by their
classes, so a read connection carries no tool that writes, and a tool nobody
classed is taken to write.

The same decision is written in `agentspecs.apps.behaviour_for`, and in
TypeScript in `src/loop/apps/rules.ts`. `APP_BEHAVIOURS`, generated from
agentspecs, is what all three have to agree on.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from email.utils import getaddresses
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from agent_runtimes.specs.actions import BACKEND_TOOL_ACTIONS, SERVER_ACTIONS
from agent_runtimes.types import ActionConditionSpec, AppConnectionSpec, AppSpec

DO_IT = "do_it"
IF_ASKED = "if_asked"
ASK_FIRST = "ask_first"
LEAVE_TO_ME = "leave_to_me"

#: The four behaviours, from the freest to the most restricted.
BEHAVIOURS: Tuple[str, ...] = (DO_IT, IF_ASKED, ASK_FIRST, LEAVE_TO_ME)

READ = "read"

#: What an application does about a class no rule of its own covers. Reading
#: needs no rule; anything that acts waits for a person: never `do_it`.
DEFAULT_BEHAVIOURS: Dict[str, str] = {
    "read": DO_IT,
    "write": ASK_FIRST,
    "send": ASK_FIRST,
    "buy": ASK_FIRST,
    "delete": ASK_FIRST,
    "publish": ASK_FIRST,
}

#: `server.tool`, the server with or without its version.
_SERVER_TOOL = re.compile(
    r"^(?P<server>[A-Za-z0-9_-]+)(?::\d+(?:\.\d+)*)?\.(?P<tool>[A-Za-z_][A-Za-z0-9_-]*)$"
)


def _id_of(ref: str) -> str:
    """The id of a reference, `id` or `id:version`."""
    base, _, version = str(ref).rpartition(":")
    return base if base and "." in version else str(ref)


def split_ref(ref: str) -> Tuple[Optional[str], str]:
    """A tool reference as (server, tool): `tavily.tavily_search`, or a tool id alone."""
    matched = _SERVER_TOOL.match(str(ref))
    if matched is not None:
        return matched.group("server"), matched.group("tool")
    return None, _id_of(str(ref))


def is_pattern(name: str) -> bool:
    """Whether a tool name is a pattern: it stands for several."""
    return "*" in name or "?" in name


def matches(name: str, pattern: str) -> bool:
    """Whether a name matches a pattern: `*` is any run of characters, `?` any one.

    Nothing else is special — no bracket expressions — and case counts: the
    same pattern means the same thing here, in agentspecs and in TypeScript.
    """
    expression = "".join(
        ".*" if character == "*" else "." if character == "?" else re.escape(character)
        for character in pattern
    )
    return re.fullmatch(expression, name, flags=re.DOTALL) is not None


#: The largest whole number every reader holds exactly: JavaScript's, 2**53 - 1.
MAX_SAFE_INTEGER = 9007199254740991


def is_comparable(value: Any) -> bool:
    """Whether a value is one every reader compares the same way.

    A word, true or false, or a number that is finite and — when it is whole —
    held exactly by a JavaScript number.
    """
    if isinstance(value, (str, bool)):
        return True
    if isinstance(value, int):
        return abs(value) <= MAX_SAFE_INTEGER
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            return False
        return not value.is_integer() or abs(value) <= MAX_SAFE_INTEGER
    return False


def _same(value: Any, wanted: Any) -> bool:
    """Whether an argument's value is the one a condition names; words whatever their case."""
    if isinstance(value, str) and isinstance(wanted, str):
        return value.strip().lower() == wanted.strip().lower()
    if isinstance(value, bool) or isinstance(wanted, bool):
        return isinstance(value, bool) and isinstance(wanted, bool) and value is wanted
    # A number no reader holds exactly is equal to nothing.
    return is_comparable(value) and is_comparable(wanted) and bool(value == wanted)


def condition_holds(
    condition: ActionConditionSpec, arguments: Mapping[str, Any]
) -> bool:
    """Whether the arguments of a call make a condition true."""
    if condition.argument not in arguments:
        return False
    value = arguments[condition.argument]
    if condition.equals and any(_same(value, wanted) for wanted in condition.equals):
        return True
    if condition.includes:
        values = value if isinstance(value, (list, tuple, set)) else [value]
        return any(
            _same(item, wanted) for item in values for wanted in condition.includes
        )
    return False


def _entry(server: str, name: str) -> Tuple[List[str], List[ActionConditionSpec]]:
    """What answers for a tool of a server: its own classes, and its conditions."""
    actions = SERVER_ACTIONS.get(server)
    if actions is None:
        return [], []
    if name in actions.tools:
        return list(actions.tools[name]), list(actions.conditions.get(name, []))
    for pattern, classes in actions.tools.items():
        if is_pattern(pattern) and matches(name, pattern):
            return list(classes), list(actions.conditions.get(pattern, []))
    return list(actions.default), []


@dataclass(frozen=True)
class Forwarding:
    """Where a call of a tool that forwards mail says what it forwards, from where, and to whom."""

    message: str
    """The argument naming the message forwarded; a call without it does not forward."""

    mailbox: str
    """The argument holding the address of the mailbox it sends from."""

    recipients: Tuple[str, ...]
    """The arguments holding its recipients."""


#: The tools that forward a message, by (server, tool) — as `agentspecs.actions.FORWARDING`.
FORWARDING: Dict[Tuple[str, str], Forwarding] = {
    ("google-workspace", "send_gmail_message"): Forwarding(
        message="forward_message_id",
        mailbox="user_google_email",
        recipients=("to", "cc", "bcc"),
    ),
}


def addresses(value: Any) -> List[str]:
    """The mail addresses an argument holds — one, several separated by commas, or a list — in lower case."""
    items = value if isinstance(value, (list, tuple)) else [value]
    words = [str(item) for item in items if isinstance(item, str) and item.strip()]
    return [
        address.strip().lower() for _, address in getaddresses(words) if "@" in address
    ]


def domain_of(address: str) -> str:
    """The domain of a mail address, in lower case."""
    return address.rpartition("@")[2].strip().lower()


def forwards_outside(server: str, tool_name: str, arguments: Mapping[str, Any]) -> bool:
    """Whether a call forwards a message to somebody outside the organization (LOOP W-04).

    The organization is the domain of the mailbox the call sends from. Fails
    closed: a forward that does not say its mailbox is outside. A reply is
    not a forward.
    """
    forwarding = FORWARDING.get((server, tool_name))
    if forwarding is None or not str(arguments.get(forwarding.message) or "").strip():
        return False
    home = addresses(arguments.get(forwarding.mailbox))
    if not home:
        return True
    recipients = [
        address
        for name in forwarding.recipients
        for address in addresses(arguments.get(name))
    ]
    return any(domain_of(address) != domain_of(home[0]) for address in recipients)


def classes_of(ref: str, arguments: Optional[Mapping[str, Any]] = None) -> List[str]:
    """The classes of a tool, by reference; empty when nobody classed it.

    With the `arguments` of a call, the classes of that call. Without them,
    everything the tool can do: nobody said what it is asked. A forward
    outside the organization is told from the call (`forwards_outside`): it
    publishes besides sending.
    """
    server, name = split_ref(ref)
    if server is None:
        return list(BACKEND_TOOL_ACTIONS.get(name, []))
    classes, conditions = _entry(server, name)
    for condition in conditions:
        if arguments is None or condition_holds(condition, arguments):
            classes.extend(item for item in condition.classes if item not in classes)
    if (
        arguments is not None
        and classes
        and "publish" not in classes
        and forwards_outside(server, name, arguments)
    ):
        classes.append("publish")
    return classes


def is_read_only(classes: Sequence[str]) -> bool:
    """Whether a tool only reads. An unknown tool — no class — does not."""
    return len(classes) > 0 and all(item == READ for item in classes)


def strictest(behaviours: Sequence[str]) -> str:
    """The most restricted of several behaviours."""
    return max(behaviours, key=BEHAVIOURS.index)


def _connection(app: AppSpec, server: str) -> Optional[AppConnectionSpec]:
    """The application's connection to a server, or None."""
    for connection in app.connections:
        if _id_of(connection.server) == server:
            return connection
    return None


def _reaches(connection: AppConnectionSpec, tool_name: str) -> bool:
    """Whether a connection lets the application use a tool of its server."""
    return not connection.only or any(
        matches(tool_name, pattern) for pattern in connection.only
    )


def gives(app: AppSpec, tool: str) -> bool:
    """Whether the application is given a tool of a server: its connection's level.

    A connection gives the tools of its server it reaches (`only`); one that
    only reads gives only the tools that only read — what a tool does is its
    action class, and a tool nobody classed is taken to write, so a read
    connection does not give it. A tool of a server the application is not
    connected to is not given.

    Parameters
    ----------
    app : AppSpec
        The application.
    tool : str
        The tool, as `server.tool`.

    Returns
    -------
    bool
        True when the agent is given the tool.

    Raises
    ------
    ValueError
        When `tool` names no server: a catalogue tool is given by the spec's
        `tools`, not by a connection.
    """
    server, name = split_ref(tool)
    if server is None:
        raise ValueError(f"`{tool}` is not a tool of a server (`server.tool`).")
    connection = _connection(app, server)
    if connection is None or not _reaches(connection, name):
        return False
    return connection.access != READ or is_read_only(classes_of(f"{server}.{name}"))


def _normal(target: str) -> str:
    """What a rule applies to, versions aside."""
    if target in DEFAULT_BEHAVIOURS:
        return target
    server, name = split_ref(target)
    return f"{server}.{name}" if server is not None else name


def _by_classes(app: AppSpec, classes: Sequence[str]) -> List[str]:
    """What the rules on classes decide for each of these classes."""
    by_class = {
        target: rule.behaviour
        for rule in app.rules
        for target in rule.applies_to
        if target in DEFAULT_BEHAVIOURS
    }
    return [by_class.get(item, DEFAULT_BEHAVIOURS[item]) for item in classes]


#: Why a call was decided as it was.
NOT_CONNECTED = "not_connected"
LEFT_OUT = "left_out"
READ_ONLY = "read_only"
RULE_ON_TOOL = "rule_on_tool"
UNCLASSED = "unclassed"
RULE_ON_CLASS = "rule_on_class"
BY_DEFAULT = "default"


@dataclass(frozen=True)
class Decision:
    """What an application does about a tool call, and why."""

    behaviour: str
    """`do_it`, `if_asked`, `ask_first` or `leave_to_me`."""

    tool: str
    """The tool, as `server.tool` or a catalogue id."""

    classes: Tuple[str, ...]
    """What the call does: its classes of action."""

    because: str
    """Which step decided: one of the reasons above."""

    rule: str = ""
    """The rule that decided, in its author's words; empty when none did."""

    @property
    def sentence(self) -> str:
        """The decision as a sentence a person reads."""
        does = " and ".join(_VERBS.get(item, item) for item in self.classes)
        if self.because == NOT_CONNECTED:
            return f"The application is not connected to what `{self.tool}` belongs to."
        if self.because == LEFT_OUT:
            return f"The application's connection leaves `{self.tool}` out."
        if self.because == READ_ONLY:
            return f"`{self.tool}` can {does}, and the connection only reads."
        if self.because == UNCLASSED:
            return f"Nobody has said what `{self.tool}` does, so it is left to you."
        said = _SAYS[self.behaviour]
        if self.rule:
            return f"Your rule “{self.rule}”: {said}."
        return f"`{self.tool}` can {does}, and no rule covers that: {said}."


_VERBS = {
    "read": "read",
    "write": "create or change things",
    "send": "send",
    "buy": "buy",
    "delete": "delete",
    "publish": "share or publish",
}

_SAYS = {
    DO_IT: "do it",
    IF_ASKED: "do it if you asked",
    ASK_FIRST: "ask you first",
    LEAVE_TO_ME: "leave it to you",
}


def decision_for(
    app: AppSpec,
    tool: str,
    *,
    arguments: Optional[Mapping[str, Any]] = None,
    classes: Optional[Sequence[str]] = None,
) -> Decision:
    """What an application does when its agent calls a tool, and why.

    `tool` is `server.tool` for a tool of an MCP server, the id of a tool of
    the catalogue, or the name of one of the application's own tools (LOOP
    P-06). Its classes are the catalogue's — or, for its own, what it says it
    `does` — unless given; a tool met at run time that the catalogue does not
    know is given none, and is left to the person.

    Pass the `arguments` of the call: the decision is then for that call.
    Without them it is for the worst the tool can do.
    """
    server, name = split_ref(tool)
    wanted = f"{server}.{name}" if server is not None else name
    own_tool = app.tool(name) if server is None and classes is None else None
    if own_tool is not None:
        classes = list(own_tool.does)
    if classes is not None:
        own, besides, possible = list(classes), [], list(classes)
    else:
        possible = classes_of(tool)
        own = classes_of(tool, {})
        now = possible if arguments is None else classes_of(tool, arguments)
        besides = [item for item in now if item not in own]
    doing = tuple([*own, *besides])
    if server is not None:
        connection = _connection(app, server)
        if connection is None:
            return Decision(LEAVE_TO_ME, wanted, doing, NOT_CONNECTED)
        if not _reaches(connection, name):
            return Decision(LEAVE_TO_ME, wanted, doing, LEFT_OUT)
        if connection.access == READ and any(item != READ for item in possible):
            acting = tuple(item for item in possible if item != READ)
            return Decision(LEAVE_TO_ME, wanted, acting, READ_ONLY)
    ruled = _rules_by_class(app)

    def decided(items: Sequence[str]) -> List[Tuple[str, str]]:
        """The behaviour for each class, with the rule that says it."""
        return [ruled.get(item, (DEFAULT_BEHAVIOURS[item], "")) for item in items]

    def strictest_of(found: List[Tuple[str, str]], because: str) -> Decision:
        behaviour, rule = max(found, key=lambda pair: BEHAVIOURS.index(pair[0]))
        return Decision(behaviour, wanted, doing, because if rule else BY_DEFAULT, rule)

    for rule in app.rules:
        tools = [
            target for target in rule.applies_to if target not in DEFAULT_BEHAVIOURS
        ]
        if any(_normal(named) == wanted for named in tools):
            besides_decided = decided(besides)
            stricter = [
                pair
                for pair in besides_decided
                if BEHAVIOURS.index(pair[0]) > BEHAVIOURS.index(rule.behaviour)
            ]
            if stricter:
                behaviour, by = max(
                    stricter, key=lambda pair: BEHAVIOURS.index(pair[0])
                )
                return Decision(
                    behaviour, wanted, doing, RULE_ON_CLASS if by else BY_DEFAULT, by
                )
            return Decision(rule.behaviour, wanted, doing, RULE_ON_TOOL, rule.action)
    if not doing:
        return Decision(LEAVE_TO_ME, wanted, (), UNCLASSED)
    return strictest_of(decided(doing), RULE_ON_CLASS)


def _rules_by_class(app: AppSpec) -> Dict[str, Tuple[str, str]]:
    """The behaviour each class is ruled to, with the rule's own words."""
    return {
        target: (rule.behaviour, rule.action)
        for rule in app.rules
        for target in rule.applies_to
        if target in DEFAULT_BEHAVIOURS
    }


def behaviour_for(
    app: AppSpec,
    tool: str,
    *,
    arguments: Optional[Mapping[str, Any]] = None,
    classes: Optional[Sequence[str]] = None,
) -> str:
    """What an application does when its agent calls a tool: see `decision_for`."""
    return decision_for(app, tool, arguments=arguments, classes=classes).behaviour


def tool_behaviours(app: AppSpec) -> Dict[str, str]:
    """What the application does about every classed tool of the servers it connects to.

    For each tool in its plain use — no argument that makes it do more; see
    `tool_escalations` for those. A server that classes its tools by a
    pattern is reported by that pattern.
    """
    behaviours: Dict[str, str] = {}
    for connection in app.connections:
        server = _id_of(connection.server)
        actions = SERVER_ACTIONS.get(server)
        if actions is None:
            continue
        for name, found in actions.tools.items():
            ref = f"{server}.{name}"
            if not is_pattern(name):
                behaviours[ref] = behaviour_for(app, ref, arguments={})
            elif connection.access == READ and any(item != READ for item in found):
                behaviours[ref] = LEAVE_TO_ME
            else:
                behaviours[ref] = (
                    strictest(_by_classes(app, found)) if found else LEAVE_TO_ME
                )
    return behaviours


def tool_escalations(app: AppSpec) -> Dict[str, List[Dict[str, Any]]]:
    """Where what a tool is asked changes what the application does about it."""
    escalations: Dict[str, List[Dict[str, Any]]] = {}
    for connection in app.connections:
        server = _id_of(connection.server)
        actions = SERVER_ACTIONS.get(server)
        if actions is None:
            continue
        for name, conditions in actions.conditions.items():
            if is_pattern(name):
                continue
            ref = f"{server}.{name}"
            plain = behaviour_for(app, ref, arguments={})
            for condition in conditions:
                values = condition.includes or condition.equals
                value = [values[0]] if condition.includes else values[0]
                then = behaviour_for(app, ref, arguments={condition.argument: value})
                if then != plain:
                    data = condition.model_dump(exclude_defaults=True)
                    escalations.setdefault(ref, []).append({**data, "behaviour": then})
    return escalations
