# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Which library loggers the command line shows.

A library that logs at INFO on every request, or once as it finds its
credentials, writes over what a command prints. Nothing is disabled: the
libraries work as they do, the root logger keeps its level, and a warning or
an error of theirs is shown; their INFO lines are shown when asked for
(``-v``, ``--verbose``, ``--debug``, a debug log level).
"""

from __future__ import annotations

import logging
from typing import Iterable, Mapping, Sequence

#: Loggers that talk on every request or at import; WARNING unless verbose.
QUIET_LOGGERS = (
    "httpx",
    "httpx2",
    "httpcore",
    "mcp",
    "botocore",
    "boto3",
    "urllib3",
    "fastmcp",
)

#: AWS's SDK, which says at INFO where it found its credentials
#: (``botocore.credentials``) before the first command prints anything.
AWS_LOGGERS = ("botocore", "boto3")

#: The variable that names the log level of ``agent-runtimes serve``.
LOG_LEVEL_VARIABLE = "AGENT_RUNTIMES_LOG_LEVEL"


def asked_verbose(argv: Sequence[str], environ: Mapping[str, str]) -> bool:
    """Whether the command line, or its environment, asks for the library logs.

    Parameters
    ----------
    argv : Sequence[str]
        The command's arguments, without the program's name.
    environ : Mapping[str, str]
        The environment, read for the log level variable.

    Returns
    -------
    bool
        True for ``-v``, ``--verbose``, ``--debug``, or a debug log level
        (``--log-level debug``, ``-l debug``, or the variable).
    """
    words = list(argv)
    if {"-v", "--verbose", "--debug"} & set(words):
        return True
    levels = [environ.get(LOG_LEVEL_VARIABLE, "")]
    for index, word in enumerate(words):
        if word in ("-l", "--log-level") and index + 1 < len(words):
            levels.append(words[index + 1])
        elif word.startswith("--log-level="):
            levels.append(word.split("=", 1)[1])
    return any(level.strip().lower() == "debug" for level in levels)


def quiet_loggers(
    names: Iterable[str] = QUIET_LOGGERS, level: int = logging.WARNING
) -> None:
    """Set the named library loggers to ``level``, their children with them.

    Parameters
    ----------
    names : Iterable[str]
        The loggers' names; a child with no level of its own
        (``botocore.credentials``) follows its parent.
    level : int
        The level they log from.
    """
    for name in names:
        logging.getLogger(name).setLevel(level)


__all__ = [
    "AWS_LOGGERS",
    "LOG_LEVEL_VARIABLE",
    "QUIET_LOGGERS",
    "asked_verbose",
    "quiet_loggers",
]
