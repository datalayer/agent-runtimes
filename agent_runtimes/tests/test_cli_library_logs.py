# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A command's output is not written over by a library's INFO lines: AWS's
SDK says where it found its credentials before `loop sessions` prints
anything. Nothing is disabled — the root logger keeps its level, the
library's warnings are shown, and its INFO lines are when asked for.
"""

from __future__ import annotations

import logging
import subprocess
import sys
from typing import Iterator, List

import pytest

from agent_runtimes.utils.logs import (
    AWS_LOGGERS,
    QUIET_LOGGERS,
    asked_verbose,
    quiet_loggers,
)

FOUND = "Found credentials in environment variables."


class _Kept(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.NOTSET)
        self.records: List[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


@pytest.fixture
def shown() -> Iterator[_Kept]:
    """The root logger at INFO with a handler that keeps what is emitted;
    the loggers as they were, after.
    """
    root = logging.getLogger()
    names = sorted({*AWS_LOGGERS, *QUIET_LOGGERS, "botocore.credentials"})
    held = {name: logging.getLogger(name).level for name in names}
    root_level, disabled = root.level, logging.root.manager.disable
    handler = _Kept()
    logging.disable(logging.NOTSET)
    root.setLevel(logging.INFO)
    root.addHandler(handler)
    for name in names:
        logging.getLogger(name).setLevel(logging.NOTSET)
    try:
        yield handler
    finally:
        root.removeHandler(handler)
        root.setLevel(root_level)
        logging.disable(disabled)
        for name, level in held.items():
            logging.getLogger(name).setLevel(level)


def test_the_credentials_line_is_not_shown_and_a_warning_is(shown: _Kept) -> None:
    credentials = logging.getLogger("botocore.credentials")
    if not asked_verbose(["sessions"], {}):
        quiet_loggers(AWS_LOGGERS)
    credentials.info(FOUND)
    credentials.warning("Refreshing temporary credentials failed.")
    logging.getLogger("agent_runtimes.somewhere").info("ours")
    assert [(record.name, record.levelname) for record in shown.records] == [
        ("botocore.credentials", "WARNING"),
        ("agent_runtimes.somewhere", "INFO"),
    ]
    # Nothing is disabled, and the root logger keeps its level.
    assert logging.getLogger().level == logging.INFO
    assert not credentials.disabled and not logging.getLogger("botocore").disabled


def test_asked_for_it_is_shown(shown: _Kept) -> None:
    credentials = logging.getLogger("botocore.credentials")
    if not asked_verbose(["sessions", "--verbose"], {}):
        quiet_loggers(AWS_LOGGERS)
    credentials.info(FOUND)
    assert [record.getMessage() for record in shown.records] == [FOUND]


def test_what_asks_for_the_library_logs() -> None:
    for argv in (
        ["mcp", "-v", "tools"],
        ["sessions", "--verbose"],
        ["serve", "--debug"],
        ["serve", "--log-level", "debug"],
        ["serve", "--log-level=DEBUG"],
        ["serve", "-l", "debug"],
    ):
        assert asked_verbose(argv, {}), argv
    assert asked_verbose(["serve"], {"AGENT_RUNTIMES_LOG_LEVEL": "debug"})
    for argv in (["sessions"], ["serve", "--log-level", "info"], ["serve", "-l"], []):
        assert not asked_verbose(argv, {}), argv
    assert not asked_verbose(["serve"], {"AGENT_RUNTIMES_LOG_LEVEL": "info"})


def test_one_list_of_quiet_loggers() -> None:
    from agent_runtimes.commands import mcp

    assert mcp.QUIET_LOGGERS is QUIET_LOGGERS
    assert set(AWS_LOGGERS) <= set(QUIET_LOGGERS)


PROBE = (
    """
import logging, sys
sys.argv = ["loop", *sys.argv[1:]]
import agent_runtimes.main  # the `loop` entry point: agent_runtimes.main:main
assert logging.getLogger().getEffectiveLevel() == logging.INFO
log = logging.getLogger("botocore.credentials")
log.info("%s")
log.warning("a warning of the library")
"""
    % FOUND
)


@pytest.mark.parametrize(
    "arguments, said",
    [(["sessions"], False), (["sessions", "--verbose"], True)],
)
def test_both_entry_points_set_it_as_they_are_imported(
    arguments: List[str], said: bool
) -> None:
    done = subprocess.run(
        [sys.executable, "-c", PROBE, *arguments],
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert done.returncode == 0, done.stderr[-2000:]
    assert (FOUND in done.stderr) is said
    assert "a warning of the library" in done.stderr
