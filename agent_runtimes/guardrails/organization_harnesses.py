# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An organization's own harness, served on the runtime (SH-46).

The shared catalogue's ``custom`` harness names no command; an organization
names one in its own catalogue — IAM's organization document, beside its own
Frames (``GET /api/iam/v1/organizations/{uid}/harnesses``): an ``org-…`` spec
and its register entry, the terms, the licence and the credential required
as for any harness (agentspecs' ``organization_harness`` validates the two
together). It is served through the same adapter and the same Shield as the
catalogue's, and only:

- for an application of **that** organization (its ``app_instance``'s
  ``organization_uid``), read with the caller's token: another organization's
  member reads nothing there, and a runtime with no organization has none;
- once an administrator **reviewed its command**: the organization's policy
  admits ``<id>@<the command's digest>`` (``harnesses.admit``, agentspecs'
  ``admission_id``) — a changed command has another digest and is refused
  until reviewed again; an organization harness is never admitted by a policy
  that lists no harness (unlike the catalogue's, which the register admits).

Everywhere else — the shared catalogue, the standalone ``agent-shield``, an
application of no organization — it is refused in a sentence. Fail closed:
IAM unreachable is a refusal, not a fallback.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Mapping, Optional, Sequence, Tuple

from agentspecs.harnesses import (
    HarnessError,
    admission_id,
    is_organization_harness,
)
from agentspecs.harnesses import organization_harness as validated_organization_harness

from agent_runtimes.types import HarnessSpec

__all__ = [
    "OrganizationHarnessRefused",
    "admission_refusal",
    "is_organization_harness",
    "organization_harness",
    "read_organization_harnesses",
]


class OrganizationHarnessRefused(ValueError):
    """An organization's own harness this runtime will not serve, said in a sentence."""


Reader = Callable[[str], Mapping[str, Any]]


def read_organization_harnesses(
    organization_uid: str,
    *,
    iam_url: str,
    token: Optional[str],
    timeout: float = 10.0,
) -> Dict[str, Any]:
    """The organization's own harnesses, by id, read from IAM with the caller's token.

    Raises
    ------
    OrganizationHarnessRefused
        Nobody signed in, IAM unreachable or answering otherwise than 200.
    """
    import httpx

    unread = f"The harnesses of organization {organization_uid} were not read"
    if not token:
        raise OrganizationHarnessRefused(f"{unread}: nobody signed in.")
    url = f"{iam_url.rstrip('/')}/api/iam/v1/organizations/{organization_uid}/harnesses"
    try:
        response = httpx.get(
            url, headers={"Authorization": f"Bearer {token}"}, timeout=timeout
        )
    except httpx.HTTPError as error:
        raise OrganizationHarnessRefused(
            f"{unread}: IAM could not be reached ({type(error).__name__})."
        ) from None
    if response.status_code != 200:
        raise OrganizationHarnessRefused(
            f"{unread}: IAM answered {response.status_code}."
        )
    harnesses = response.json().get("harnesses")
    if not isinstance(harnesses, dict):
        raise OrganizationHarnessRefused(f"{unread}: IAM answered no harnesses.")
    return harnesses


def organization_harness(
    harness_id: str,
    *,
    organization_uid: str,
    read: Reader,
) -> Tuple[HarnessSpec, str]:
    """An organization's own harness as the runtime runs it, and the id its policy must admit.

    Parameters
    ----------
    harness_id : str
        ``org-…``.
    organization_uid : str
        The organization of the application it serves; none refuses.
    read : callable
        ``organization_uid → {id: {"spec": …, "register": …}}``, IAM's answer.

    Returns
    -------
    tuple[HarnessSpec, str]
        The runtime's harness spec (its register entry under ``registered``)
        and ``<id>@<digest>``, what an administrator admits.

    Raises
    ------
    OrganizationHarnessRefused
        In a sentence.
    """
    if not is_organization_harness(harness_id):
        raise OrganizationHarnessRefused(
            f"{harness_id!r} is not an organization's own harness."
        )
    if not organization_uid:
        raise OrganizationHarnessRefused(
            f"The harness {harness_id!r} is an organization's own, and this application "
            "belongs to no organization: it is served only for its organization's applications."
        )
    kept = dict(read(organization_uid)).get(harness_id)
    if not isinstance(kept, Mapping):
        raise OrganizationHarnessRefused(
            f"Organization {organization_uid} has no harness named {harness_id!r}."
        )
    try:
        spec, entry = validated_organization_harness(
            dict(kept.get("spec") or {}), dict(kept.get("register") or {})
        )
    except HarnessError as invalid:
        raise OrganizationHarnessRefused(str(invalid)) from None
    if not spec.enabled:
        raise OrganizationHarnessRefused(
            f"The harness {harness_id!r} is turned off in its organization's catalogue."
        )
    registered = entry.model_dump(
        mode="json",
        include={
            "adapter",
            "version",
            "licence_source",
            "terms_source",
            "credential",
            "binaries",
            "note",
        },
    )
    runtime = HarnessSpec.model_validate(
        {**spec.model_dump(mode="json"), "registered": registered}
    )
    return runtime, admission_id(spec)


def admission_refusal(policies: Sequence[Any], admitted: str) -> Optional[str]:
    """Why the policies in force do not admit an organization's own harness, or ``None``.

    The command an administrator reviewed is admitted by name and digest
    (``<id>@<digest>``) on the strictest scope that lists any harness; a
    policy listing none admits no organization harness — the register admits
    the catalogue's, and an organization's own was never registered there.
    """
    from agent_shield.policy import SCOPES_STRICTEST_FIRST  # noqa: PLC0415

    harness_id = admitted.partition("@")[0]
    ordered = sorted(
        policies, key=lambda policy: SCOPES_STRICTEST_FIRST.index(policy.scope)
    )
    for policy in ordered:
        admit = list(getattr(getattr(policy, "harnesses", None), "admit", None) or [])
        if not admit:
            continue
        if admitted in admit:
            return None
        if any(item.partition("@")[0] == harness_id for item in admit):
            return (
                f"The harness {harness_id!r} is refused: its command changed since an "
                f"administrator reviewed it — the {policy.scope} policy admits another "
                f"digest; reviewed again, it is admitted as {admitted!r}."
            )
        return (
            f"The harness {harness_id!r} is refused: the {policy.scope} policy does "
            f"not admit it ({', '.join(admit)})."
        )
    return (
        f"The harness {harness_id!r} is refused: an organization's own harness runs only "
        f"once an administrator reviewed its command and admitted {admitted!r} on the "
        "organization's policy (harnesses.admit)."
    )
