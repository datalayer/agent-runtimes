# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Example runtime tools referenced by tool specifications.

These callables are loaded dynamically from ToolSpec.runtime metadata.
"""


async def runtime_echo(text: str) -> str:
    """Echo input text back to the caller."""
    return text


async def runtime_sensitive_echo(text: str, reason: str | None = None) -> str:
    """Echo input text and optional reason after approval."""
    if reason:
        return f"{text} (reason: {reason})"
    return text


async def runtime_send_mail(
    to: str,
    subject: str,
    body: str,
    cc: str | None = None,
) -> str:
    """Simulate sending an email and return a fake delivery receipt."""
    receipt = [
        "FAKE_MAIL_SENT",
        f"to={to}",
        f"subject={subject}",
        f"body_chars={len(body)}",
    ]
    if cc:
        receipt.append(f"cc={cc}")
    return " | ".join(receipt)


__all__ = [
    "runtime_echo",
    "runtime_sensitive_echo",
    "runtime_send_mail",
]
