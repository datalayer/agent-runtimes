# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's computer (LOOP R-23, I-01): what its agent is given of it,
what it holds, and who has it.

Its computer is the sandbox its agent runs on. Three permissions of its
Appspec say what the agent may do there, each off until it is turned on:

- **shell**: run code on it — `execute_code` (Codemode), `run_skill_script`;
- **files**: read and write its files — `list_computer_files`,
  `read_computer_file`, `write_computer_file`, given here
  (`computer_toolset`);
- **browse**: use a browser on it — no tool: no sandbox Datalayer runs has a
  browser yet, so nothing is given whatever it says.

A part that is off gives no tool: the agent is never shown one
(`AppRulesCapability.prepare_tools`, beside what its connections give).

A person may **take over** its computer: what runs on it is interrupted, and
every call its agent makes to a tool of its computer waits until they **hand
it back** (`wait_until_handed_back`). Meanwhile the person runs code on it
themselves (`run_as_person`).

What the person sees of it — its files, read-only, and what was run on it — is
read here too, from its working directory only: a path that leaves it is
refused.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, Dict, FrozenSet, List, Mapping, Optional

from agent_runtimes.types import AppSpec

#: The parts of a computer, in the order a person reads them.
PARTS: tuple[str, ...] = ("browse", "files", "shell")

#: Tools that run code on the application's computer.
SHELL_TOOLS: FrozenSet[str] = frozenset({"execute_code", "run_skill_script"})

#: The tools of its files, and what each does (F-10's classes).
FILE_CLASSES: Mapping[str, List[str]] = {
    "list_computer_files": ["read"],
    "read_computer_file": ["read"],
    "write_computer_file": ["write"],
}
FILE_TOOLS: FrozenSet[str] = frozenset(FILE_CLASSES)

#: Tools of a browser on it: none exists in any sandbox yet.
BROWSE_TOOLS: FrozenSet[str] = frozenset()

#: The tools of each part.
PART_TOOLS: Mapping[str, FrozenSet[str]] = {
    "browse": BROWSE_TOOLS,
    "files": FILE_TOOLS,
    "shell": SHELL_TOOLS,
}

#: The most of a file read or downloaded, as a file given to a session.
FILE_LIMIT = 25 * 1024 * 1024

#: The most of a file's text an agent is told.
TEXT_LIMIT = 120_000

#: How often a call waiting for the computer looks again.
WAIT_STEP = 0.2


class ComputerRefused(RuntimeError):
    """Why the computer cannot do what was asked, in a sentence, with a status."""

    def __init__(self, status: int, reason: str):
        """Keep the status and the sentence."""
        super().__init__(reason)
        self.status = status
        self.reason = reason


# --- what it may do --------------------------------------------------------------


def part_of(tool_name: str) -> Optional[str]:
    """The part of the computer a tool uses, or None for a tool of no computer."""
    for part, tools in PART_TOOLS.items():
        if tool_name in tools:
            return part
    return None


def parts_on(app: AppSpec) -> Dict[str, bool]:
    """Each part of its computer, on or off."""
    computer = app.permissions.computer
    return {part: bool(getattr(computer, part)) for part in PARTS}


def has_computer(app: AppSpec) -> bool:
    """Whether its agent uses a computer at all: a part of it is on."""
    return any(parts_on(app).values())


def computer_gives(app: AppSpec, tool_name: str) -> bool:
    """Whether its computer gives the agent a tool.

    Always for a tool of no computer; for one of a part, only when that part
    is on.
    """
    part = part_of(tool_name)
    return part is None or parts_on(app)[part]


# --- who has it --------------------------------------------------------------------


@dataclass(frozen=True)
class Holder:
    """A person who took an agent's computer over."""

    kind: str
    uid: str
    since: float

    def describe(self) -> Dict[str, Any]:
        """Say it as the routes do."""
        return {"kind": self.kind, "uid": self.uid, "since": self.since}


#: The computers taken over, by agent id.
_HELD: Dict[str, Holder] = {}


def holder_of(agent_id: str) -> Optional[Holder]:
    """Who has taken an agent's computer over, or None while its agent has it."""
    return _HELD.get(agent_id)


def take_over(agent_id: str, kind: str, uid: str) -> Dict[str, Any]:
    """A person takes an agent's computer: what runs on it is interrupted.

    Raises
    ------
    ComputerRefused
        When somebody else has it.
    """
    held = _HELD.get(agent_id)
    if held is not None and (held.kind, held.uid) != (kind, uid):
        raise ComputerRefused(409, "Somebody else has taken this computer over.")
    holder = held or Holder(kind=kind, uid=uid, since=time.time())
    _HELD[agent_id] = holder
    return {"held": holder.describe(), "interrupted": _interrupt(agent_id)}


def hand_back(agent_id: str, kind: str, uid: str) -> None:
    """Give an agent its computer back: its waiting calls go on.

    Raises
    ------
    ComputerRefused
        When somebody else has it; a computer nobody took is already its agent's.
    """
    held = _HELD.get(agent_id)
    if held is None:
        return
    if kind != "local" and (held.kind, held.uid) != (kind, uid):
        raise ComputerRefused(409, "Somebody else has taken this computer over.")
    _HELD.pop(agent_id, None)


def forget_holders() -> None:
    """Every computer back to its agent (a runtime restarting, a test)."""
    _HELD.clear()


async def wait_until_handed_back(agent_id: Optional[str]) -> None:
    """Wait while a person has the agent's computer."""
    if not agent_id:
        return
    while agent_id in _HELD:
        await asyncio.sleep(WAIT_STEP)


# --- the sandbox ---------------------------------------------------------------------


def _manager() -> Any:
    """The runtime's sandbox manager."""
    from agent_runtimes.services.code_sandbox_manager import get_code_sandbox_manager

    return get_code_sandbox_manager()


def sandbox_of(agent_id: str) -> Any:
    """The sandbox an agent runs its code in: its own, else the runtime's."""
    manager = _manager()
    return manager.get_agent_sandbox(agent_id) or manager.get_managed_sandbox()


def started(agent_id: str) -> bool:
    """Whether the agent's computer is running, without starting it."""
    manager = _manager()
    if manager.get_agent_sandbox(agent_id) is not None:
        return True
    return bool(manager.get_managed_sandbox().is_started)


def _interrupt(agent_id: str) -> bool:
    """Interrupt what runs on the agent's computer; whether something was."""
    if not started(agent_id):
        return False
    sandbox = sandbox_of(agent_id)
    if not sandbox.is_executing:
        return False
    return bool(sandbox.interrupt())


def inside(path: str) -> str:
    """A path of its working directory, as given; refused when it leaves it.

    Raises
    ------
    ComputerRefused
        For an absolute path, or one that goes up out of it.
    """
    text = (path or ".").strip() or "."
    pure = PurePosixPath(text)
    if pure.is_absolute() or ".." in pure.parts:
        raise ComputerRefused(
            400, f"{text} is not in its working directory: give a path inside it."
        )
    return str(pure)


def list_files(agent_id: str, path: str = ".") -> List[Dict[str, Any]]:
    """What a directory of the agent's computer holds, directories first."""
    where = inside(path)
    if not started(agent_id):
        return []
    try:
        found = sandbox_of(agent_id).files.list(where)
    except FileNotFoundError:
        raise ComputerRefused(404, f"There is no directory {where}.") from None
    entries = [
        {
            "name": info.name,
            "path": str(PurePosixPath(where) / info.name),
            "type": "directory" if info.is_directory else "file",
            "size": int(info.size),
            "modified": float(info.modified),
        }
        for info in found
    ]
    return sorted(entries, key=lambda item: (item["type"] != "directory", item["name"]))


def read_file(agent_id: str, path: str) -> bytes:
    """A file of the agent's computer, whole, up to the limit.

    Raises
    ------
    ComputerRefused
        When there is no such file, or it is too large.
    """
    where = inside(path)
    if where == "." or not started(agent_id):
        raise ComputerRefused(404, f"There is no file {where}.")
    files = sandbox_of(agent_id).files
    if not files.exists(where):
        raise ComputerRefused(404, f"There is no file {where}.")
    content = files.read_bytes(where)
    if len(content) > FILE_LIMIT:
        raise ComputerRefused(
            413, f"{where} is larger than {FILE_LIMIT // (1024 * 1024)} MB."
        )
    return bytes(content)


def run_as_person(agent_id: str, kind: str, uid: str, code: str) -> Dict[str, Any]:
    """Code a person who took the computer over runs on it, and what it said.

    Raises
    ------
    ComputerRefused
        When they have not taken it over.
    """
    held = _HELD.get(agent_id)
    if held is None or (held.kind, held.uid) != (kind, uid):
        raise ComputerRefused(409, "Take the computer over first: its agent has it.")
    result = sandbox_of(agent_id).run_code(code)
    error = ""
    if not result.execution_ok:
        error = str(result.execution_error or "It did not run.")
    elif result.code_error is not None:
        error = str(result.code_error)
    return {
        "stdout": result.logs.stdout_text,
        "stderr": result.logs.stderr_text,
        "error": error,
    }


# --- what its agent is given ---------------------------------------------------------


def computer_toolset(app: AppSpec, agent_id: Optional[str]) -> Any:
    """The tools of its files, when its files are on; None otherwise."""
    if not parts_on(app)["files"] or not agent_id:
        return None
    from pydantic_ai.toolsets import FunctionToolset

    def list_computer_files(path: str = ".") -> str:
        """List a directory of your computer's working directory (`.` for its top)."""
        entries = list_files(agent_id, path)
        if not entries:
            return f"{inside(path)} is empty."
        return "\n".join(
            f"{entry['path']}/"
            if entry["type"] == "directory"
            else f"{entry['path']} ({entry['size']:,} bytes)"
            for entry in entries
        )

    def read_computer_file(path: str) -> str:
        """Read a text file of your computer's working directory."""
        content = read_file(agent_id, path)
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            return f"{inside(path)} is not a text file."
        if len(text) > TEXT_LIMIT:
            return (
                text[:TEXT_LIMIT] + f"\n… ({len(text) - TEXT_LIMIT:,} characters more)"
            )
        return text

    def write_computer_file(path: str, content: str) -> str:
        """Write a text file in your computer's working directory."""
        where = inside(path)
        if where == ".":
            raise ComputerRefused(400, "Name the file to write.")
        sandbox_of(agent_id).files.write(where, content)
        return f"Written: {where} ({len(content.encode('utf-8')):,} bytes)."

    return FunctionToolset(
        [list_computer_files, read_computer_file, write_computer_file],
        id="computer",
    )


__all__ = [
    "BROWSE_TOOLS",
    "FILE_CLASSES",
    "FILE_TOOLS",
    "PARTS",
    "PART_TOOLS",
    "SHELL_TOOLS",
    "ComputerRefused",
    "Holder",
    "computer_gives",
    "computer_toolset",
    "forget_holders",
    "hand_back",
    "has_computer",
    "holder_of",
    "inside",
    "list_files",
    "part_of",
    "parts_on",
    "read_file",
    "run_as_person",
    "sandbox_of",
    "started",
    "take_over",
    "wait_until_handed_back",
]
