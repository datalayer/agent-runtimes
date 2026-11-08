# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
No token in the server's log.

A browser cannot set a header on a websocket, so the page sends its token in
the query string — ``/api/v1/configure/sandbox/ws?agent_id=…&token=eyJ…`` —
and uvicorn logged that path whole, the user's JWT with it (r1, 8 November
2026): in its access log for a request, in ``uvicorn.error`` for a websocket
it accepted or refused. A filter on both loggers withholds the value of every
credential in a query string before the line is written.
"""

from __future__ import annotations

import logging
import re
from typing import Any

#: A query parameter whose value is a credential.
_QUERY_CREDENTIAL = re.compile(
    r"([?&](?:token|access_token|id_token|api_key|apikey|key|jwt|auth|"
    r"authorization|password|secret)=)[^&\s\"']+",
    re.IGNORECASE,
)

WITHHELD = "[withheld]"

#: The loggers uvicorn writes a request's path to.
LOGGERS = ("uvicorn.access", "uvicorn.error", "uvicorn")


def redact_query(text: str) -> str:
    """``text`` with the value of each credential in a query string withheld."""
    return _QUERY_CREDENTIAL.sub(lambda m: m.group(1) + WITHHELD, text)


def _redacted(value: Any) -> Any:
    if isinstance(value, str):
        return redact_query(value)
    if isinstance(value, tuple):
        return tuple(_redacted(v) for v in value)
    if isinstance(value, dict):
        return {k: _redacted(v) for k, v in value.items()}
    return value


class QueryTokenFilter(logging.Filter):
    """Withhold the credentials of a query string in a log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact_query(record.msg)
        if record.args:
            record.args = _redacted(record.args)
        return True


def install_access_log_redaction() -> None:
    """Put the filter on uvicorn's loggers, once."""
    for name in LOGGERS:
        logger = logging.getLogger(name)
        if not any(isinstance(f, QueryTokenFilter) for f in logger.filters):
            logger.addFilter(QueryTokenFilter())
