# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A ULID: what a new session's uid is, as the platform's other uids are —
26 characters of Crockford's base32, the first ten the time in
milliseconds, so uids sort by when they were minted.

Sessions opened before keep their uids — 32 hexadecimal characters, a
dashed UUID, a channel's own — and are read, resumed and transferred as
they are: a uid is 8 to 128 letters, digits, hyphens or underscores.
"""

from __future__ import annotations

import os
import re
import time

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

#: What a ULID looks like.
ULID = re.compile(r"^[0-7][0-9A-HJKMNP-TV-Z]{25}$")


def new_ulid() -> str:
    """A new ULID: 48 bits of time, 80 of randomness."""
    value = (int(time.time() * 1000) << 80) | int.from_bytes(os.urandom(10), "big")
    return "".join(_CROCKFORD[(value >> shift) & 31] for shift in range(125, -1, -5))


def is_ulid(value: str) -> bool:
    return bool(ULID.fullmatch(value or ""))


__all__ = ["ULID", "is_ulid", "new_ulid"]
