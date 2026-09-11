# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The environments client, against what the registry routes answered (PLAN_ENV.md, E1-18).

``environments_registry_recorded.json`` holds what each E1-01 route of Runtimes
was sent and answered, recorded from the service's own in-memory app. A
client whose ``_fetch`` records each request and replays those answers is held
to the request each route takes, and its typed answers to the canonical models
of ``code_sandboxes.environments``.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator

import pytest
import requests
from code_sandboxes.environments.builders import CapabilityReport
from code_sandboxes.environments.errors import SPEC_INVALID, EnvironmentsError
from code_sandboxes.environments.lifecycle import VersionState
from code_sandboxes.environments.schema import schema_text
from code_sandboxes.environments.spec import Environment

from agent_runtimes.client import AgentClient
from agent_runtimes.mixins.environments import (
    EnvironmentsMixin,
    EnvironmentsRequestError,
)
from agent_runtimes.models.environment import (
    EnvironmentArtifactRecord,
    EnvironmentBuildLogChunk,
    EnvironmentBuildLogPage,
    EnvironmentBuildRecord,
    EnvironmentRecord,
    EnvironmentsPage,
    EnvironmentValidationReport,
    EnvironmentVersionRecord,
)

HERE = Path(__file__).resolve().parent
PACKAGE_ROOT = HERE.parents[1]
RECORDED: dict[str, dict[str, Any]] = json.loads(
    (HERE / "environments_registry_recorded.json").read_text(encoding="utf-8")
)["calls"]
RUNTIMES = "https://runtimes.example"


def uid_in(name: str, position: int = -1) -> str:
    """The uid a recorded call's path names."""
    return RECORDED[name]["path"].split("/")[position]


ENV = RECORDED["create_environment"]["body"]["uid"]
DRAFT = RECORDED["create_version"]["body"]["uid"]
READY = RECORDED["deprecate_version"]["body"]["uid"]
QUEUED = RECORDED["create_builds"]["body"]["builds"][0]["uid"]
FAILED = uid_in("retry_build", -2)
ARCHIVED = uid_in("archive_environment", -2)
DELETED = uid_in("delete_environment")


class _Urls:
    runtimes_url = RUNTIMES


class _Response:
    def __init__(
        self,
        status_code: int = 200,
        payload: Any = None,
        lines: Iterable[str] = (),
        breaks: bool = False,
    ) -> None:
        self.status_code = status_code
        self._payload = payload
        self._lines = list(lines)
        self._breaks = breaks
        self.closed = False

    def json(self) -> Any:
        if self._payload is None:
            raise ValueError("no body")
        return self._payload

    def iter_lines(self, decode_unicode: bool = False) -> Iterator[str]:
        yield from self._lines
        if self._breaks:
            raise requests.exceptions.ChunkedEncodingError("connection broken")

    def close(self) -> None:
        self.closed = True


def refused(url: str, status: int, body: Any) -> RuntimeError:
    """What ``datalayer_core``'s ``_fetch`` raises for an HTTP error: a RuntimeError from it."""
    try:
        raise requests.HTTPError(response=_Response(status, body))
    except requests.HTTPError as error:
        try:
            raise RuntimeError(
                f"Failed to request the URL {url} (status={status})"
            ) from error
        except RuntimeError as raised:
            return raised


class _Recorded(EnvironmentsMixin):
    """A client whose ``_fetch`` records each request and replays the answers it is given."""

    urls = _Urls()

    def __init__(self, *answers: Any) -> None:
        self.calls: list[dict[str, Any]] = []
        self._answers = list(answers)

    def _fetch(self, request: str, **kwargs: Any) -> Any:
        self.calls.append({"url": request, **kwargs})
        answer = self._answers.pop(0)
        if isinstance(answer, BaseException):
            raise answer
        if isinstance(answer, _Response):
            return answer
        if answer["status"] >= 400:
            raise refused(request, answer["status"], answer["body"])
        return _Response(answer["status"], answer["body"])


def replaying(name: str) -> tuple[_Recorded, dict[str, Any]]:
    record = RECORDED[name]
    return _Recorded(record), record


def assert_sent(
    call: dict[str, Any], record: dict[str, Any], *, json_body: bool = True
) -> None:
    """The request a recorded call was: its method, URL, query, headers and body."""
    assert call.get("method", "GET") == record["method"]
    assert call["url"] == RUNTIMES + record["path"]
    assert call.get("params") == record["params"]
    for header, value in (record["headers"] or {}).items():
        assert call["headers"][header] == value
    if json_body:
        assert call.get("json") == record["json"]


# -- the listing ------------------------------------------------------------------


def test_the_listing_sends_its_filters_and_answers_the_page() -> None:
    client, record = replaying("list_environments")
    page = client._list_environments(origin="user", limit=1)
    assert_sent(client.calls[0], record)
    (entry,) = page["environments"]
    assert (entry["name"], entry["origin"], entry["promotedVersion"]["status"]) == (
        "ada/geo",
        "user",
        "ready",
    )
    assert page["nextCursor"]


def test_the_listing_unfiltered_sends_what_it_always_sent() -> None:
    client, record = replaying("list_environments_all")
    client._list_environments()
    assert client.calls == [{"url": RUNTIMES + record["path"]}]


def test_a_failed_listing_still_answers_success_false() -> None:
    client = _Recorded(refused(RUNTIMES, 500, {"detail": "operator away"}))
    assert client._list_environments()["success"] is False


def test_the_agent_client_reads_every_page_and_types_the_user_entries(
    monkeypatch,
) -> None:
    monkeypatch.setenv("DATALAYER_RUNTIMES_URL", RUNTIMES)
    first = {**RECORDED["list_environments_all"]["body"], "nextCursor": "page-2"}
    second = {
        key: value
        for key, value in RECORDED["list_environments"]["body"].items()
        if key != "nextCursor"
    }
    answers = [first, second]
    calls: list[dict[str, Any]] = []

    class _Client(AgentClient):
        def _fetch(self, request: str, **kwargs: Any) -> Any:
            calls.append({"url": request, **kwargs})
            return _Response(200, answers.pop(0))

    client = _Client(api_key="test-key-not-used")
    listed = client.list_environments()
    assert [call.get("params") for call in calls] == [None, {"cursor": "page-2"}]
    assert [item.name for item in listed] == [
        "python-cpu-env",
        "e2b-code-interpreter",
        "ada/geo",
        "ada/geo",
    ]
    platform, user = listed[0], listed[2]
    assert (
        platform.uid,
        platform.origin,
        platform.promoted_version,
        platform.variants,
    ) == (None, None, None, None)
    assert user.uid == ENV and user.origin == "user"
    assert (
        user.promoted_version is not None
        and user.promoted_version.status is VersionState.READY
    )
    assert user.variants == ["datalayer", "e2b"]
    assert "ada/geo" in client._available_environments_names


# -- environments -----------------------------------------------------------------


def test_create_environment() -> None:
    client, record = replaying("create_environment")
    environment = client.create_environment(
        "geo",
        title="Geo",
        description="Geospatial",
        idempotency_key="env-1",
        correlation_id="trace-1",
    )
    assert_sent(client.calls[0], record)
    assert isinstance(environment, EnvironmentRecord)
    assert (environment.uid, environment.owner_type, environment.etag) == (
        ENV,
        "user",
        '"101"',
    )
    assert environment.promoted_version_uid is None


def test_get_environment() -> None:
    client, record = replaying("get_environment")
    environment = client.get_environment(ENV)
    assert_sent(client.calls[0], record)
    assert environment.name == "geo" and environment.visibility == "private"


def test_update_environment_names_the_version_it_replaces() -> None:
    client, record = replaying("update_environment")
    environment = client.update_environment(ENV, if_match='"101"', title="Geospatial")
    assert_sent(client.calls[0], record)
    assert (environment.title, environment.etag) == ("Geospatial", '"102"')
    with pytest.raises(ValueError):
        _Recorded().update_environment(ENV, if_match="", title="x")


def test_a_stale_if_match_raises_the_412_and_its_body() -> None:
    client, record = replaying("update_environment_stale")
    with pytest.raises(EnvironmentsRequestError) as raised:
        client.update_environment(ENV, if_match='"101"', title="Stale")
    assert_sent(client.calls[0], record)
    error = raised.value
    assert (error.status, error.code, error.detail) == (
        412,
        "DL_ENV_PRECONDITION_FAILED",
        {"etag": '"102"'},
    )
    assert error.correlation_id and str(error) == record["body"]["message"]
    # A request's own code, not one of the section 10 taxonomy.
    assert error.error_code is None
    assert isinstance(error, RuntimeError)


def test_a_refusal_carries_the_callers_correlation_id() -> None:
    client, record = replaying("get_environment_missing")
    with pytest.raises(EnvironmentsRequestError) as raised:
        client.get_environment(ENV, correlation_id="trace-9")
    assert_sent(client.calls[0], record)
    assert (raised.value.status, raised.value.code, raised.value.correlation_id) == (
        404,
        "DL_ENV_NOT_FOUND",
        "trace-9",
    )


def test_delete_environment_answers_nothing() -> None:
    client, record = replaying("delete_environment")
    assert client.delete_environment(DELETED) is None
    assert_sent(client.calls[0], record)


def test_archive_environment() -> None:
    client, record = replaying("archive_environment")
    environment = client.archive_environment(ARCHIVED)
    assert_sent(client.calls[0], record)
    assert environment.archived_at


def test_promote_a_version_and_then_none() -> None:
    client, record = replaying("promote_version")
    promoted = client.promote_environment_version(
        ENV,
        READY,
        if_match=record["headers"]["If-Match"],
        acknowledge_unavailable_variants=[],
    )
    assert_sent(client.calls[0], record)
    assert promoted.promoted_version_uid == READY

    client, record = replaying("unpromote_version")
    none = client.promote_environment_version(
        ENV, None, if_match=record["headers"]["If-Match"]
    )
    assert_sent(client.calls[0], record)
    assert client.calls[0]["json"] == {"versionUid": None}
    assert none.promoted_version_uid is None


# -- versions ---------------------------------------------------------------------


def test_create_version_sends_the_spec_the_canonical_models_parse() -> None:
    client, record = replaying("create_version")
    version = client.create_environment_version(
        ENV, record["json"]["spec"], label="first", idempotency_key="v-1"
    )
    call = client.calls[0]
    assert_sent(call, record, json_body=False)
    assert call["json"]["label"] == "first"
    assert Environment.model_validate(
        call["json"]["spec"]
    ) == Environment.model_validate(record["json"]["spec"])
    assert isinstance(version, EnvironmentVersionRecord)
    assert isinstance(version.spec, Environment) and version.spec.metadata.name == "geo"
    assert (version.version, version.status) == (1, VersionState.DRAFT)
    assert version.spec_digest.startswith("sha256:")


def test_create_version_takes_the_canonical_model_itself() -> None:
    client, record = replaying("create_version")
    client.create_environment_version(
        ENV, Environment.model_validate(record["json"]["spec"])
    )
    assert (
        Environment.model_validate(
            client.calls[0]["json"]["spec"]
        ).spec.language.version
        == "3.13"
    )


def test_a_spec_the_models_refuse_is_refused_before_any_request() -> None:
    client = _Recorded()
    document = {**RECORDED["create_version"]["json"]["spec"], "status": "ready"}
    with pytest.raises(EnvironmentsError) as raised:
        client.create_environment_version(ENV, document)
    assert raised.value.code is SPEC_INVALID
    assert client.calls == []


def test_a_spec_the_service_refuses_raises_its_section_10_code_and_field() -> None:
    client, record = replaying("create_version_invalid")
    with pytest.raises(EnvironmentsRequestError) as raised:
        client.create_environment_version(ENV, record["json"]["spec"])
    assert raised.value.status == 422
    assert raised.value.error_code is SPEC_INVALID
    assert raised.value.field == "spec.language.version"


def test_list_versions() -> None:
    client, record = replaying("list_versions")
    page = client.list_environment_versions(ENV, limit=1)
    assert_sent(client.calls[0], record)
    assert isinstance(page, EnvironmentsPage)
    (version,) = page.items
    assert (
        isinstance(version, EnvironmentVersionRecord)
        and version.status is VersionState.READY
    )
    assert page.next_cursor == record["body"]["nextCursor"]


def test_get_version() -> None:
    client, record = replaying("get_version")
    version = client.get_environment_version(DRAFT)
    assert_sent(client.calls[0], record)
    assert version.required_variants == ["datalayer"] and version.optional_variants == [
        "e2b"
    ]


def test_update_version() -> None:
    client, record = replaying("update_version")
    version = client.update_environment_version(
        DRAFT, if_match='"101"', label="renamed"
    )
    assert_sent(client.calls[0], record)
    assert version.label == "renamed"


def test_validate_version_answers_capability_reports() -> None:
    client, record = replaying("validate_version")
    report = client.validate_environment_version(DRAFT, variants=["datalayer"])
    assert_sent(client.calls[0], record)
    assert isinstance(report, EnvironmentValidationReport) and report.supported is False
    (variant,) = report.reports
    assert isinstance(variant, CapabilityReport)
    assert variant.supported is False
    assert variant.findings[0].code == "DL_ENV_CAPABILITY_UNSUPPORTED"


@pytest.mark.parametrize(
    ("name", "call", "item"),
    [
        (
            "resolve_version",
            lambda client: client.resolve_environment_version(DRAFT),
            "E1-04",
        ),
        (
            "trial_version",
            lambda client: client.trial_environment_version(READY),
            "E1-14",
        ),
    ],
)
def test_the_routes_not_built_yet_raise_their_501(
    name: str, call: Callable[[Any], Any], item: str
) -> None:
    client, record = replaying(name)
    with pytest.raises(EnvironmentsRequestError) as raised:
        call(client)
    assert_sent(client.calls[0], record)
    assert raised.value.status == 501 and item in str(raised.value)


def test_deprecate_version() -> None:
    client, record = replaying("deprecate_version")
    version = client.deprecate_environment_version(READY)
    assert_sent(client.calls[0], record)
    assert version.status is VersionState.DEPRECATED and version.deprecated_at


# -- builds, artifacts and logs ----------------------------------------------------


def test_create_builds() -> None:
    client, record = replaying("create_builds")
    builds = client.create_environment_builds(
        DRAFT,
        variants=["datalayer"],
        required_variants=["datalayer"],
        regions=["r1"],
        force=False,
        idempotency_key="build-1",
        correlation_id="trace-2",
    )
    assert_sent(client.calls[0], record)
    (build,) = builds
    assert isinstance(build, EnvironmentBuildRecord)
    assert (build.uid, build.status, build.idempotency_key, build.correlation_id) == (
        QUEUED,
        "queued",
        "build-1:datalayer:r1",
        "trace-2",
    )


def test_list_builds() -> None:
    client, record = replaying("list_builds")
    page = client.list_environment_builds(DRAFT, limit=10)
    assert_sent(client.calls[0], record)
    assert [build.uid for build in page.items] == [QUEUED] and page.next_cursor is None


def test_list_artifacts() -> None:
    client, record = replaying("list_artifacts")
    page = client.list_environment_artifacts(READY)
    assert_sent(client.calls[0], record)
    (artifact,) = page.items
    assert isinstance(artifact, EnvironmentArtifactRecord)
    assert (
        artifact.variant,
        artifact.region,
        artifact.status,
        artifact.reference_count,
    ) == ("datalayer", "r1", "ready", 0)


def test_get_build() -> None:
    client, record = replaying("get_build")
    build = client.get_environment_build(QUEUED)
    assert_sent(client.calls[0], record)
    assert (build.attempt, build.cache_hit, build.started_at) == (1, False, None)


def test_read_build_logs() -> None:
    client, record = replaying("read_build_log")
    page = client.read_environment_build_logs(QUEUED, cursor="0", limit=10)
    assert_sent(client.calls[0], record)
    assert isinstance(page, EnvironmentBuildLogPage)
    assert [chunk.sequence for chunk in page.chunks] == [1]
    assert (page.next_cursor, page.complete) == ("1", False)


def test_cancel_build() -> None:
    client, record = replaying("cancel_build")
    build = client.cancel_environment_build(QUEUED)
    assert_sent(client.calls[0], record)
    assert (build.status, build.cancelled_by) == (
        "cancelled",
        RECORDED["cancel_build"]["body"]["requestedBy"],
    )


def test_retry_build() -> None:
    client, record = replaying("retry_build")
    build = client.retry_environment_build(FAILED)
    assert_sent(client.calls[0], record)
    assert (build.attempt, build.status, build.idempotency_key) == (
        2,
        "queued",
        f"retry:{FAILED}",
    )


# -- following a build's log -------------------------------------------------------


def framed(sequence: int) -> list[str]:
    chunk = {
        "sequence": sequence,
        "text": f"step {sequence}\n",
        "size": 7,
        "createdAt": "2026-09-11T17:00:41Z",
    }
    return [f"id: {sequence}", "event: chunk", f"data: {json.dumps(chunk)}", ""]


def test_following_a_log_resumes_after_the_last_chunk_and_receives_each_once() -> None:
    first = _Response(
        200, lines=[*framed(0), *framed(1), "id: 2", "event: chunk"], breaks=True
    )
    second = _Response(
        200,
        lines=[": keepalive", "", *framed(2), *framed(3), "event: end", "data: {}", ""],
    )
    client = _Recorded(first, second)
    chunks = list(client.follow_environment_build_logs(QUEUED, reconnect_delay=0))
    assert all(isinstance(chunk, EnvironmentBuildLogChunk) for chunk in chunks)
    assert [chunk.sequence for chunk in chunks] == [0, 1, 2, 3]
    url = f"{RUNTIMES}/api/runtimes/v1/environment-builds/{QUEUED}/logs"
    assert [call["url"] for call in client.calls] == [url, url]
    assert all(
        call["params"] == {"follow": "true"} and call["stream"] is True
        for call in client.calls
    )
    assert client.calls[0]["headers"] == {"Accept": "text/event-stream"}
    assert client.calls[1]["headers"]["Last-Event-ID"] == "1"
    assert first.closed and second.closed


def test_following_a_log_is_refused_with_the_501_and_not_retried() -> None:
    record = RECORDED["follow_build_log"]
    client = _Recorded(record)
    with pytest.raises(EnvironmentsRequestError) as raised:
        list(client.follow_environment_build_logs(QUEUED, reconnect_delay=0))
    assert raised.value.status == 501 and "E1-16" in str(raised.value)
    assert len(client.calls) == 1
    assert client.calls[0]["params"] == record["params"]


def test_following_a_log_gives_up_after_its_reconnects() -> None:
    client = _Recorded(*[requests.exceptions.ConnectionError("away")] * 3)
    with pytest.raises(RuntimeError, match="dropped 3 times"):
        list(
            client.follow_environment_build_logs(
                QUEUED, max_reconnects=2, reconnect_delay=0
            )
        )
    assert len(client.calls) == 3


# -- the generated TypeScript types -----------------------------------------------------


def run_check(schema: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            str(PACKAGE_ROOT / "scripts/generate-environments-types.py"),
            "--check",
        ],
        capture_output=True,
        text=True,
        env={"DATALAYER_ENVIRONMENT_SCHEMA": str(schema), "PATH": ""},
        timeout=60,
    )


def test_the_generated_types_check_fails_when_the_schema_changes(
    tmp_path: Path,
) -> None:
    unchanged = tmp_path / "environment-v1alpha1.json"
    unchanged.write_text(schema_text(), encoding="utf-8")
    assert run_check(unchanged).returncode == 0

    # A bound no TypeScript type shows fails the check as much as a new field.
    schema = json.loads(schema_text())
    schema["$defs"]["Language"]["properties"]["version"]["pattern"] = r"^3\.1[3-9]$"
    changed = tmp_path / "changed.json"
    changed.write_text(
        json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    result = run_check(changed)
    assert result.returncode == 1
    assert "npm run generate:environments" in result.stderr
