# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""A stranger launches somebody else's publication by its version uid (D-12, E2-15).

It is in nobody's listing but its owner's, so `create_runtime` finds it
through the publication, which carries the rate a launch reserves by.
"""

from __future__ import annotations

from typing import Any

import pytest

from agent_runtimes.client.agent_client import AgentClient
from agent_runtimes.models.environment import EnvironmentPublicationRecord

VERSION_UID = "01M2TGPZJ742A3Z0VC7JF8NN2F"
ENVIRONMENT_UID = "01M2TG3GPQQG6ZDZR2K983HANY"


def a_publication(status: str = "published") -> EnvironmentPublicationRecord:
    """A publication as Runtimes answers it, with the rate it prices."""
    return EnvironmentPublicationRecord.model_validate(
        {
            "versionUid": VERSION_UID,
            "environmentUid": ENVIRONMENT_UID,
            "ownerUid": "01JV1VE1T5VG22Z05F6EFBMW8E",
            "status": status,
            "burningRate": 0.0008,
            "snapshot": {
                "environmentUid": ENVIRONMENT_UID,
                "environmentName": "backfill-drill",
                "versionNumber": 2,
                "sizeClass": "small",
            },
        }
    )


def a_client(publication: EnvironmentPublicationRecord | Exception) -> AgentClient:
    """A client whose publication read answers `publication`, or raises it."""
    client = AgentClient.__new__(AgentClient)

    def get_environment_publication(
        version_uid: str, **_: Any
    ) -> EnvironmentPublicationRecord:
        """The one read `_publication_to_launch` makes."""
        assert version_uid == VERSION_UID
        if isinstance(publication, Exception):
            raise publication
        return publication

    client.get_environment_publication = get_environment_publication  # type: ignore[method-assign]
    return client


def test_a_published_version_is_found_by_its_uid_and_priced_by_its_publication() -> (
    None
):
    """The publication names the environment to launch and what it costs."""
    found = a_client(a_publication())._publication_to_launch(
        "eric/backfill-drill", VERSION_UID
    )
    assert found is not None
    assert found.environment_uid == ENVIRONMENT_UID
    assert found.burning_rate == 0.0008
    assert found.snapshot.size_class == "small"


@pytest.mark.parametrize(
    "named", [ENVIRONMENT_UID, "backfill-drill", "eric/backfill-drill"]
)
def test_the_environment_is_named_by_uid_or_by_name(named: str) -> None:
    """By its uid, its name, or `<account>/<name>`."""
    assert (
        a_client(a_publication())._publication_to_launch(named, VERSION_UID) is not None
    )


def test_a_version_number_finds_no_publication() -> None:
    """A number means something only in an environment the caller can see."""
    client = a_client(AssertionError("a number must not be looked up"))
    assert client._publication_to_launch("eric/backfill-drill", 2) is None
    assert client._publication_to_launch("eric/backfill-drill", "2") is None
    assert client._publication_to_launch("eric/backfill-drill", None) is None


def test_a_withdrawn_publication_is_not_launched() -> None:
    """Unpublished is no longer public."""
    client = a_client(a_publication(status="unpublished"))
    assert client._publication_to_launch("eric/backfill-drill", VERSION_UID) is None


def test_a_version_that_is_not_public_is_not_launched() -> None:
    """A version never published answers 404, and is not launched."""
    client = a_client(RuntimeError("404: No environment publication"))
    assert client._publication_to_launch("eric/backfill-drill", VERSION_UID) is None


def test_a_publication_of_another_environment_is_not_launched() -> None:
    """A version uid of another environment than the one named is refused."""
    client = a_client(a_publication())
    assert (
        client._publication_to_launch("eric/geospatial-analysis", VERSION_UID) is None
    )
