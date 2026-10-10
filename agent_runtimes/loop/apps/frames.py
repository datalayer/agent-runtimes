# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The contexts an application's agent works under (LOOP U-31, U-32).

An application names its contexts — the Frames of the catalogue, or its
organization's own (``org-…``) — in its ``context``. Its agent is told them
(`agentspecs.frames.render_frames`) after its own prompt and before the
application's instructions, as the organization reads them: the version its
owners saved in place of the catalogue's, and its own beside.

The organization's Frames are kept by IAM
(``GET /api/iam/v1/organizations/{uid}/frames``) and read with the caller's
token, as the plugins it turned off are (C-12). An organization that changed
nothing reads the catalogue's. What cannot be read — no token, IAM
unreachable or refusing, an answer of the wrong shape — is said and stops the
application: an agent never works under the catalogue's version in place of
its organization's without anybody knowing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence

from agentspecs.frames import (
    FrameError,
    compose_frames,
    frames_with_organization,
    is_organization_frame,
    render_frames,
)

from agent_runtimes.loop.apps.loading import AppNotRunnable, frame_id_of

#: Who manages an organization's own context, as the agent is told.
ORGANIZATION_OWNER = "your organization"


class FramesUnread(RuntimeError):
    """The organization's contexts could not be read, in a sentence."""


@dataclass(frozen=True)
class OrganizationFrames:
    """The contexts of the organization an application belongs to, as IAM keeps them."""

    organization_uid: Optional[str] = None
    """The organization; None for an application of nobody's organization."""

    versions: Dict[str, Any] = field(default_factory=dict)
    """Its versions of the catalogue's contexts, and its own, by id."""

    @property
    def own(self) -> List[str]:
        """The ids of its own contexts."""
        return [
            identity for identity in self.versions if is_organization_frame(identity)
        ]


#: An application of nobody's organization: the catalogue's contexts.
NO_ORGANIZATION = OrganizationFrames()


def read_organization_frames(
    organization_uid: Optional[str],
    *,
    iam_url: str,
    token: Optional[str],
    timeout: float = 10.0,
) -> OrganizationFrames:
    """The contexts of an organization, read from IAM with the caller's token.

    Parameters
    ----------
    organization_uid : str or None
        The organization the application belongs to; none is read without one.
    iam_url : str
        IAM's address.
    token : str or None
        The caller's token.
    timeout : float
        Seconds to wait for IAM.

    Returns
    -------
    OrganizationFrames
        Its versions and its own contexts; none for no organization.

    Raises
    ------
    FramesUnread
        When there is an organization and its contexts cannot be read.
    """
    import httpx

    if not organization_uid:
        return NO_ORGANIZATION
    unread = f"The contexts of organization {organization_uid} were not read"
    if not token:
        raise FramesUnread(
            f"{unread}: nobody signed in, so the application cannot keep to them."
        )
    url = f"{iam_url.rstrip('/')}/api/iam/v1/organizations/{organization_uid}/frames"
    try:
        response = httpx.get(
            url, headers={"Authorization": f"Bearer {token}"}, timeout=timeout
        )
    except httpx.HTTPError as error:
        raise FramesUnread(
            f"{unread}: IAM could not be reached ({type(error).__name__})."
        ) from None
    if response.status_code != 200:
        raise FramesUnread(f"{unread}: IAM answered {response.status_code}.")
    frames = response.json().get("frames")
    if not isinstance(frames, dict):
        raise FramesUnread(f"{unread}: IAM answered no contexts.")
    return OrganizationFrames(organization_uid, frames)


def frames_problems(
    context: Sequence[str], organization: OrganizationFrames
) -> List[str]:
    """What an application's contexts name that its organization does not have, in sentences."""
    problems: List[str] = []
    for ref in context:
        if not is_organization_frame(ref):
            continue
        if organization.organization_uid is None:
            problems.append(
                f"{ref!r} is a context of an organization's own, and the application "
                "belongs to no organization that was said."
            )
        elif frame_id_of(ref) not in organization.versions:
            problems.append(f"Its organization has no context named {ref!r}.")
    return problems


def frames_instructions(
    context: Sequence[str], organization: OrganizationFrames
) -> str:
    """What the agent is told of the contexts an application works under; empty for none.

    Parameters
    ----------
    context : sequence of str
        The application's ``context``.
    organization : OrganizationFrames
        The contexts of the organization it belongs to.

    Returns
    -------
    str
        The contexts as the organization reads them, in Markdown.

    Raises
    ------
    AppNotRunnable
        When it names a context its organization does not have, or one of
        the organization's contexts cannot be read.
    """
    if not context:
        return ""
    problems = frames_problems(context, organization)
    if problems:
        raise AppNotRunnable(problems)
    try:
        frames = frames_with_organization(
            organization.versions, owner=ORGANIZATION_OWNER
        )
        return render_frames(compose_frames(list(context), frames))
    except FrameError as error:
        raise AppNotRunnable([str(error)]) from None
