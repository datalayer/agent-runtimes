# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``datalayer envs``, every command against a fake client (PLAN_ENV.md, E1-20).

The fake is ``AgentClient`` over a fake ``_fetch``. Each route answers what
E1-01's routes answered in ``environments_registry_recorded.json``, so a
command is held to the requests its client calls really send, among them the
``If-Match`` taken from the record it has just read. The routes E1-04, E1-14
and E1-16 have not built answer their recorded 501s.

No log stream could be recorded before E1-16 builds the route; ``BUILD_LOG``
is framed the way E1-18's reader takes one, each event's id the chunk's
sequence and ``event: end`` once the build is terminal.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Iterable, Iterator

import pytest
import requests
import yaml
from click.testing import Result
from code_sandboxes.environments.spec import Environment, parse_environment
from typer.main import get_command
from typer.testing import CliRunner

from agent_runtimes.client import AgentClient
from agent_runtimes.commands import envs
from agent_runtimes.displays.environments import (
    PackageChange,
    diff_packages,
    locked_versions,
    top_level_packages,
)

HERE = Path(__file__).resolve().parent
RECORDED: dict[str, dict[str, Any]] = json.loads(
    (HERE / "environments_registry_recorded.json").read_text(encoding="utf-8")
)["calls"]
RUNTIMES = "https://runtimes.example"
API = f"{RUNTIMES}/api/runtimes/v1"

#: ``geo``, private, its ETag ``"101"``.
ENVIRONMENT = RECORDED["get_environment"]["body"]
#: Version 1, a draft.
DRAFT = RECORDED["get_version"]["body"]
#: Version 2, ready, its ETag ``"103"``.
READY = RECORDED["list_versions"]["body"]["versions"][0]
QUEUED = RECORDED["create_builds"]["body"]["builds"][0]
SPEC = RECORDED["create_version"]["json"]["spec"]

ENV_UID = ENVIRONMENT["uid"]
DRAFT_UID = DRAFT["uid"]
READY_UID = READY["uid"]
BUILD_UID = QUEUED["uid"]

COMMANDS = {
    "ls",
    "create",
    "show",
    "versions",
    "edit",
    "validate",
    "resolve",
    "diff",
    "build",
    "logs",
    "try",
    "promote",
    "rollback",
    "deprecate",
    "archive",
}

#: What a Datalayer build writes, one chunk per step.
BUILD_LOG = [
    "#1 [internal] load build definition from Dockerfile\n",
    "#5 [2/4] RUN uv pip sync --require-hashes /opt/datalayer/lock.txt\n",
    "#5 2.31 Installed 184 packages in 2.31s\n",
    "#8 exporting to image\n",
]

runner = CliRunner(env={"NO_COLOR": "1", "TERM": "dumb", "COLUMNS": "240"})


def record(base: dict[str, Any], **changes: Any) -> dict[str, Any]:
    return {**copy.deepcopy(base), **changes}


class _Response:
    def __init__(
        self, status_code: int = 200, payload: Any = None, lines: Iterable[str] = ()
    ) -> None:
        self.status_code = status_code
        self._payload = payload
        self._lines = list(lines)
        self.closed = False

    def json(self) -> Any:
        if self._payload is None:
            raise ValueError("no body")
        return self._payload

    def iter_lines(self, decode_unicode: bool = False) -> Iterator[str]:
        yield from self._lines

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


def ok(body: Any) -> tuple[int, Any]:
    return 200, body


def created(body: Any) -> tuple[int, Any]:
    return 201, body


def answered(name: str) -> tuple[int, Any]:
    """What a recorded call answered, refusals included."""
    return RECORDED[name]["status"], RECORDED[name]["body"]


def chunk(sequence: int) -> dict[str, Any]:
    text = BUILD_LOG[sequence]
    return {
        "sequence": sequence,
        "text": text,
        "size": len(text.encode()),
        "createdAt": "2026-09-11T17:00:41Z",
    }


def build_log_stream() -> _Response:
    """``BUILD_LOG`` as the ``logs?follow=true`` route streams it."""
    lines = [": connected", ""]
    for sequence in range(len(BUILD_LOG)):
        lines += [
            f"id: {sequence}",
            "event: chunk",
            f"data: {json.dumps(chunk(sequence))}",
            "",
        ]
    return _Response(200, lines=[*lines, "event: end", "data: {}", ""])


class Registry:
    """The routes a test answers, each with its answers in turn, the last one repeated."""

    def __init__(self) -> None:
        self.routes: dict[tuple[str, str], list[Any]] = {}
        self.calls: list[dict[str, Any]] = []

    def on(self, method: str, path: str, *answers: Any) -> None:
        self.routes[(method, path)] = list(answers)

    def fetch(self, url: str, **kwargs: Any) -> Any:
        assert url.startswith(API), url
        method, path = kwargs.get("method", "GET"), url[len(API) :]
        self.calls.append({"method": method, "path": path, **kwargs})
        answers = self.routes.get((method, path))
        if not answers:
            raise AssertionError(f"nothing answers {method} {path}")
        answer = answers.pop(0) if len(answers) > 1 else answers[0]
        if isinstance(answer, _Response):
            return answer
        status, body = answer
        if status >= 400:
            raise refused(url, status, body)
        return _Response(status, body)

    def sent(self, method: str, path: str) -> list[dict[str, Any]]:
        return [
            call
            for call in self.calls
            if (call["method"], call["path"]) == (method, path)
        ]

    def writes(self) -> list[tuple[str, str]]:
        return [
            (call["method"], call["path"])
            for call in self.calls
            if call["method"] != "GET"
        ]


@pytest.fixture
def registry(monkeypatch: pytest.MonkeyPatch) -> Registry:
    monkeypatch.setenv("DATALAYER_RUNTIMES_URL", RUNTIMES)
    monkeypatch.setattr(
        "agent_runtimes.mixins.environments.time.sleep", lambda seconds: None
    )
    fake = Registry()

    class FakeClient(AgentClient):
        def _fetch(self, request: str, **kwargs: Any) -> Any:
            return fake.fetch(request, **kwargs)

    client = FakeClient(api_key="test-key-not-used")
    monkeypatch.setattr(envs, "_make_client", lambda **options: client)
    return fake


def invoke(*args: str) -> Result:
    return runner.invoke(envs.app, list(args))


def spec_file(
    tmp_path: Path, document: dict[str, Any], name: str = "spec.yaml"
) -> Path:
    path = tmp_path / name
    path.write_text(yaml.safe_dump(document), encoding="utf-8")
    return path


# -- the group ----------------------------------------------------------------------


def test_the_group_has_every_command_and_each_takes_the_three_outputs() -> None:
    assert {command.name for command in envs.app.registered_commands} == COMMANDS
    for name in sorted(COMMANDS):
        result = invoke(name, "--help")
        assert result.exit_code == 0, result.output
        assert "--output" in result.stdout
        assert all(word in result.stdout for word in ("table", "json", "yaml")), name


def test_core_defines_no_envs_group_to_merge_over_this_one() -> None:
    from datalayer_core.cli.__main__ import app as core_app

    assert "envs" not in get_command(core_app).commands  # type: ignore[attr-defined]


# -- ls -------------------------------------------------------------------------------


def test_ls_lists_the_platform_and_user_environments(registry: Registry) -> None:
    registry.on("GET", "/environments", answered("list_environments_all"))
    names = ["python-cpu-env", "e2b-code-interpreter", "ada/geo"]

    table = invoke("ls")
    assert table.exit_code == 0, table.output
    assert all(name in table.stdout for name in names)

    listed = json.loads(invoke("ls", "--output", "json").stdout)
    assert [entry["name"] for entry in listed] == names
    assert listed[2]["uid"] == ENV_UID
    assert listed[2]["promoted_version"]["status"] == "ready"
    assert [
        entry["name"] for entry in yaml.safe_load(invoke("ls", "-o", "yaml").stdout)
    ] == names


# -- create ---------------------------------------------------------------------------


def test_create_makes_the_environment_and_its_first_draft_from_the_file(
    registry: Registry, tmp_path: Path
) -> None:
    registry.on("POST", "/environments", answered("create_environment"))
    registry.on("POST", f"/environments/{ENV_UID}/versions", answered("create_version"))
    path = spec_file(tmp_path, record(SPEC, metadata={"name": "geo", "title": "Geo"}))

    result = invoke(
        "create",
        "-f",
        str(path),
        "--description",
        "Geospatial",
        "--label",
        "first",
        "-o",
        "json",
    )
    assert result.exit_code == 0, result.output
    answer = json.loads(result.stdout)
    assert (answer["environment"]["uid"], answer["version"]["uid"]) == (
        ENV_UID,
        DRAFT_UID,
    )
    assert answer["version"]["status"] == "draft"

    (environment,) = registry.sent("POST", "/environments")
    assert environment["json"] == {
        "name": "geo",
        "title": "Geo",
        "description": "Geospatial",
    }
    (version,) = registry.sent("POST", f"/environments/{ENV_UID}/versions")
    assert version["json"]["label"] == "first"
    assert Environment.model_validate(version["json"]["spec"]) == parse_environment(
        path.read_text(encoding="utf-8")
    )

    # The same file asked for again is a replay: the same keys.
    again = invoke(
        "create", "-f", str(path), "--description", "Geospatial", "--label", "first"
    )
    assert again.exit_code == 0, again.output
    assert f"Next: datalayer envs validate {DRAFT_UID}" in again.stdout
    keys = [call["headers"]["Idempotency-Key"] for call in registry.calls]
    assert keys[0] == keys[2] and keys[1] == keys[3] and keys[0] != keys[1]


def test_create_for_an_organization(registry: Registry, tmp_path: Path) -> None:
    registry.on("POST", "/environments", answered("create_environment"))
    registry.on("POST", f"/environments/{ENV_UID}/versions", answered("create_version"))
    result = invoke(
        "create",
        "--file",
        str(spec_file(tmp_path, SPEC)),
        "--organization",
        "01J9ENVORG000000000000000000",
        "--visibility",
        "organization",
    )
    assert result.exit_code == 0, result.output
    (environment,) = registry.sent("POST", "/environments")
    assert environment["json"] == {
        "name": "geo",
        "visibility": "organization",
        "ownerType": "organization",
        "ownerUid": "01J9ENVORG000000000000000000",
    }


def test_create_refuses_a_spec_the_models_refuse_before_any_request(
    registry: Registry, tmp_path: Path
) -> None:
    result = invoke(
        "create", "-f", str(spec_file(tmp_path, record(SPEC, status="ready")))
    )
    assert result.exit_code == 1
    assert result.stderr.startswith("DL_ENV_SPEC_INVALID: ")
    assert registry.calls == []


def test_create_prints_the_services_refusal_its_code_and_correlation_id(
    registry: Registry, tmp_path: Path
) -> None:
    invalid = RECORDED["create_version_invalid"]
    registry.on("POST", "/environments", answered("create_environment"))
    registry.on(
        "POST", f"/environments/{ENV_UID}/versions", answered("create_version_invalid")
    )
    path = spec_file(tmp_path, invalid["json"]["spec"])

    result = invoke("create", "-f", str(path))
    assert result.exit_code == 1
    first, *rest = result.stderr.splitlines()
    assert first == f"DL_ENV_SPEC_INVALID: {invalid['body']['message']}"
    assert f"  correlation id: {invalid['body']['correlationId']}" in rest

    as_json = invoke("create", "-f", str(path), "-o", "json")
    assert as_json.exit_code == 1
    error = json.loads(as_json.stderr)["error"]
    assert (error["status"], error["code"], error["field"]) == (
        422,
        "DL_ENV_SPEC_INVALID",
        "spec.language.version",
    )


# -- show and versions ---------------------------------------------------------------------


def test_show_an_environment_by_uid_and_by_account_name(registry: Registry) -> None:
    registry.on(
        "GET",
        "/environments",
        ok(record(RECORDED["list_environments"]["body"], nextCursor=None)),
    )
    registry.on("GET", f"/environments/{ENV_UID}", ok(ENVIRONMENT))

    by_uid = invoke("show", ENV_UID)
    assert by_uid.exit_code == 0, by_uid.output
    assert "Geospatial" in by_uid.stdout and "private" in by_uid.stdout
    assert registry.sent("GET", "/environments") == []

    by_name = invoke("show", "ada/geo", "-o", "yaml")
    assert by_name.exit_code == 0, by_name.output
    assert yaml.safe_load(by_name.stdout)["uid"] == ENV_UID
    (listing,) = registry.sent("GET", "/environments")
    assert listing["params"] == {"origin": "user", "q": "geo"}


def test_show_a_version_by_number_with_its_spec(registry: Registry) -> None:
    registry.on(
        "GET",
        f"/environments/{ENV_UID}/versions",
        ok({"versions": [READY, DRAFT], "nextCursor": None}),
    )
    result = invoke("show", f"{ENV_UID}@1")
    assert result.exit_code == 0, result.output
    assert DRAFT_UID in result.stdout and "draft" in result.stdout
    assert "not resolved yet" in result.stdout
    assert "- geopandas==1.1.1" in result.stdout

    missing = invoke("show", f"{ENV_UID}@7")
    assert missing.exit_code == 1
    assert missing.stderr.strip() == f"{ENV_UID} has no version 7"


def test_show_prints_the_404_of_an_environment_it_cannot_see(
    registry: Registry,
) -> None:
    registry.on("GET", f"/environments/{ENV_UID}", answered("get_environment_missing"))
    result = invoke("show", ENV_UID)
    assert result.exit_code == 1
    assert result.stderr.splitlines() == [
        f"DL_ENV_NOT_FOUND: No environment {ENV_UID}",
        "  correlation id: trace-9",
    ]


def test_versions_reads_every_page_and_marks_the_promoted_version(
    registry: Registry,
) -> None:
    registry.on("GET", f"/environments/{ENV_UID}", answered("promote_version"))
    registry.on(
        "GET",
        f"/environments/{ENV_UID}/versions",
        ok({"versions": [READY], "nextCursor": "page-2"}),
        ok({"versions": [DRAFT], "nextCursor": None}),
    )
    table = invoke("versions", ENV_UID)
    assert table.exit_code == 0, table.output
    assert "2 (promoted)" in table.stdout and DRAFT_UID in table.stdout
    pages = registry.sent("GET", f"/environments/{ENV_UID}/versions")
    assert [page.get("params") for page in pages] == [None, {"cursor": "page-2"}]

    registry.on(
        "GET", f"/environments/{ENV_UID}/versions", ok({"versions": [READY, DRAFT]})
    )
    listed = json.loads(invoke("versions", ENV_UID, "-o", "json").stdout)
    assert [(item["version"], item["status"]) for item in listed] == [
        (2, "ready"),
        (1, "draft"),
    ]


# -- edit -----------------------------------------------------------------------------------


def test_edit_a_draft_sends_the_etag_it_just_read(registry: Registry) -> None:
    registry.on("GET", f"/environment-versions/{DRAFT_UID}", ok(DRAFT))
    registry.on(
        "PATCH", f"/environment-versions/{DRAFT_UID}", answered("update_version")
    )
    result = invoke("edit", DRAFT_UID, "--label", "renamed")
    assert result.exit_code == 0, result.output
    assert "renamed" in result.stdout
    (patch,) = registry.sent("PATCH", f"/environment-versions/{DRAFT_UID}")
    assert patch["headers"]["If-Match"] == DRAFT["etag"]
    assert patch["json"] == {"label": "renamed"}


def test_edit_a_ready_version_opens_a_new_draft(
    registry: Registry, tmp_path: Path
) -> None:
    changed = record(SPEC)
    changed["spec"]["packages"]["python"]["dependencies"].append("rasterio==1.4.3")
    registry.on("GET", f"/environment-versions/{READY_UID}", ok(READY))
    third = record(DRAFT, uid="01M28PM3VERSI0N3000000000", version=3)
    registry.on("POST", f"/environments/{ENV_UID}/versions", created(third))

    result = invoke("edit", READY_UID, "-f", str(spec_file(tmp_path, changed)))
    assert result.exit_code == 0, result.output
    assert (
        "Version 2 is ready, which cannot change: the edit is draft version 3."
        in result.stdout
    )
    assert registry.writes() == [("POST", f"/environments/{ENV_UID}/versions")]
    (post,) = registry.sent("POST", f"/environments/{ENV_UID}/versions")
    assert (
        "rasterio==1.4.3"
        in post["json"]["spec"]["spec"]["packages"]["python"]["dependencies"]
    )
    assert post["headers"]["Idempotency-Key"]


def test_edit_an_environment_sends_the_etag_it_just_read(registry: Registry) -> None:
    registry.on("GET", f"/environments/{ENV_UID}", ok(ENVIRONMENT))
    registry.on("PATCH", f"/environments/{ENV_UID}", answered("update_environment"))
    result = invoke("edit", ENV_UID, "--title", "Geospatial", "-o", "json")
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout)["etag"] == '"102"'
    (patch,) = registry.sent("PATCH", f"/environments/{ENV_UID}")
    assert (patch["headers"]["If-Match"], patch["json"]) == (
        '"101"',
        {"title": "Geospatial"},
    )


def test_edit_prints_the_412_when_the_record_changed_since_it_was_read(
    registry: Registry,
) -> None:
    registry.on("GET", f"/environments/{ENV_UID}", ok(ENVIRONMENT))
    registry.on(
        "PATCH", f"/environments/{ENV_UID}", answered("update_environment_stale")
    )
    result = invoke("edit", ENV_UID, "--title", "Stale")
    assert result.exit_code == 1
    assert result.stderr.splitlines()[0] == (
        "DL_ENV_PRECONDITION_FAILED: The record changed since the version If-Match names"
    )


@pytest.mark.parametrize(
    "options", [["--label", "x", "--title", "y"], []], ids=["both", "neither"]
)
def test_edit_takes_a_version_edit_or_an_environment_edit(
    registry: Registry, options: list[str]
) -> None:
    result = invoke("edit", DRAFT_UID, *options)
    assert result.exit_code == 2
    assert registry.calls == []


# -- validate, resolve, try ----------------------------------------------------------------


def test_validate_prints_each_variants_findings_and_exits_1_when_one_cannot_build(
    registry: Registry,
) -> None:
    registry.on(
        "POST",
        f"/environment-versions/{DRAFT_UID}/validate",
        answered("validate_version"),
    )
    result = invoke("validate", DRAFT_UID, "--variant", "datalayer")
    assert result.exit_code == 1
    assert "not supported" in result.stdout
    assert (
        "DL_ENV_CAPABILITY_UNSUPPORTED: the datalayer Environment builder"
        in result.stdout
    )
    (call,) = registry.sent("POST", f"/environment-versions/{DRAFT_UID}/validate")
    assert call["json"] == {"variants": ["datalayer"]}


def test_validate_exits_0_when_every_variant_can_build(registry: Registry) -> None:
    report = {
        "versionUid": DRAFT_UID,
        "specDigest": DRAFT["specDigest"],
        "supported": True,
        "reports": [{"variant": "datalayer", "findings": [], "supported": True}],
    }
    registry.on("POST", f"/environment-versions/{DRAFT_UID}/validate", ok(report))
    result = invoke("validate", DRAFT_UID, "-o", "json")
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout) == report
    (call,) = registry.sent("POST", f"/environment-versions/{DRAFT_UID}/validate")
    assert call["json"] == {}


@pytest.mark.parametrize(
    ("command", "route", "recorded", "item"),
    [
        ("resolve", "resolve", "resolve_version", "E1-04"),
        ("try", "trial", "trial_version", "E1-14"),
    ],
)
def test_resolve_and_try_print_their_501_until_the_items_land(
    registry: Registry, command: str, route: str, recorded: str, item: str
) -> None:
    registry.on(
        "POST", f"/environment-versions/{READY_UID}/{route}", answered(recorded)
    )
    result = invoke(command, READY_UID)
    assert result.exit_code == 1
    assert result.stderr.startswith("HTTP 501: ") and item in result.stderr

    as_yaml = invoke(command, READY_UID, "-o", "yaml")
    assert as_yaml.exit_code == 1
    assert yaml.safe_load(as_yaml.stderr)["error"]["status"] == 501


@pytest.mark.parametrize(
    ("command", "route"), [("resolve", "resolve"), ("try", "trial")]
)
def test_resolve_and_try_print_what_the_service_answers(
    registry: Registry, command: str, route: str
) -> None:
    registry.on(
        "GET", f"/environments/{ENV_UID}/versions", ok({"versions": [READY, DRAFT]})
    )
    answer = {"versionUid": READY_UID, "status": "accepted"}
    registry.on("POST", f"/environment-versions/{READY_UID}/{route}", ok(answer))
    result = invoke(command, f"{ENV_UID}@2", "-o", "json")
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout) == answer
    table = invoke(command, READY_UID)
    assert table.exit_code == 0 and "accepted" in table.stdout


# -- diff -------------------------------------------------------------------------------------

LOCK_V1 = """\
# This file was autogenerated by uv via the following command:
#    uv pip compile --generate-hashes requirements.in
geopandas==1.1.1 \\
    --hash=sha256:1111 \\
    --hash=sha256:2222
    # via -r requirements.in
numpy==2.2.0 \\
    --hash=sha256:3333
    # via
    #   geopandas
    #   pandas
pandas==2.3.3 \\
    --hash=sha256:4444
    # via geopandas
requests==2.32.3 \\
    --hash=sha256:5555
    # via -r requirements.in
"""

LOCK_V2 = """\
geopandas==1.1.2 \\
    --hash=sha256:6666
    # via -r requirements.in
numpy==2.1.3 \\
    --hash=sha256:7777
    # via -r requirements.in
pandas==2.3.3 \\
    --hash=sha256:4444
    # via geopandas
rasterio==1.4.3 \\
    --hash=sha256:8888
    # via -r requirements.in
"""


def locked(
    number: int, dependencies: list[str], lock: str | None, digest: str | None = None
) -> dict[str, Any]:
    """A resolved version: its spec's dependencies, its lock's digest, and the lock when it is served."""
    version = record(
        READY,
        uid=f"01M28PM3LOCKEDVERSI0N{number:05d}",
        version=number,
        lockDigest=digest or f"sha256:{number:064x}",
    )
    version["spec"]["spec"]["packages"]["python"]["dependencies"] = dependencies
    if lock is not None:
        version["lock"] = {
            "digest": version["lockDigest"],
            "format": "uv-pip-compile",
            "content": lock,
        }
    return version


def test_diff_names_the_versions_that_have_no_lock_yet(registry: Registry) -> None:
    registry.on("GET", f"/environment-versions/{DRAFT_UID}", ok(DRAFT))
    registry.on("GET", f"/environment-versions/{READY_UID}", ok(READY))
    result = invoke("diff", DRAFT_UID, READY_UID)
    assert result.exit_code == 0, result.output
    assert result.stdout.splitlines() == [
        f"Version 1 ({DRAFT_UID}) has no lock yet.",
        f"Version 2 ({READY_UID}) has no lock yet.",
    ]

    answer = json.loads(invoke("diff", DRAFT_UID, READY_UID, "-o", "json").stdout)
    assert answer["diff"] is None and len(answer["notes"]) == 2
    assert (answer["from"]["version"], answer["to"]["lockDigest"]) == (1, "")


def test_diff_lists_the_top_level_packages_added_removed_upgraded_and_downgraded(
    registry: Registry,
) -> None:
    before = locked(1, ["geopandas==1.1.1", "numpy", "requests"], LOCK_V1)
    after = locked(2, ["geopandas==1.1.2", "numpy<2.2", "rasterio==1.4.3"], LOCK_V2)
    registry.on("GET", f"/environment-versions/{before['uid']}", ok(before))
    registry.on("GET", f"/environment-versions/{after['uid']}", ok(after))

    answer = json.loads(
        invoke("diff", before["uid"], after["uid"], "-o", "json").stdout
    )
    assert answer["notes"] == []
    assert answer["diff"] == {
        "added": [{"name": "rasterio", "before": None, "after": "1.4.3"}],
        "removed": [{"name": "requests", "before": "2.32.3", "after": None}],
        "upgraded": [{"name": "geopandas", "before": "1.1.1", "after": "1.1.2"}],
        "downgraded": [{"name": "numpy", "before": "2.2.0", "after": "2.1.3"}],
        "changed": [],
    }

    table = invoke("diff", before["uid"], after["uid"])
    assert table.exit_code == 0, table.output
    rows = [line.split() for line in table.stdout.splitlines()]
    for row in (
        ["added", "rasterio", "-", "1.4.3"],
        ["removed", "requests", "2.32.3", "-"],
        ["upgraded", "geopandas", "1.1.1", "1.1.2"],
        ["downgraded", "numpy", "2.2.0", "2.1.3"],
    ):
        assert any(cells[1::2] == row for cells in rows if len(cells) == 9), row


def test_diff_of_one_lock_moves_no_package(registry: Registry) -> None:
    same = "sha256:" + "ab" * 32
    before = locked(1, ["geopandas==1.1.1", "numpy"], None, digest=same)
    after = locked(2, ["geopandas==1.1.1"], None, digest=same)
    registry.on("GET", f"/environment-versions/{before['uid']}", ok(before))
    registry.on("GET", f"/environment-versions/{after['uid']}", ok(after))
    result = invoke("diff", before["uid"], after["uid"], "-o", "yaml")
    assert result.exit_code == 0, result.output
    answer = yaml.safe_load(result.stdout)
    assert answer["diff"]["removed"] == [
        {"name": "numpy", "before": None, "after": None}
    ]
    assert not answer["diff"]["upgraded"] and not answer["diff"]["downgraded"]


def test_diff_says_when_the_service_does_not_answer_a_lock(registry: Registry) -> None:
    before = locked(1, ["geopandas==1.1.1"], LOCK_V1)
    after = locked(2, ["geopandas==1.1.2"], None)
    registry.on("GET", f"/environment-versions/{before['uid']}", ok(before))
    registry.on("GET", f"/environment-versions/{after['uid']}", ok(after))
    result = invoke("diff", before["uid"], after["uid"])
    assert result.exit_code == 0, result.output
    assert result.stdout.strip() == (
        f"Version 2 ({after['uid']}) has the lock {after['lockDigest']}, "
        "whose content the service does not answer yet."
    )


def test_a_lock_pins_one_version_per_package() -> None:
    extra = (
        "Django[argon2]==5.1.4 ; python_version >= '3.10' \\\n"
        "    --hash=sha256:9999\n"
        "--index-url https://pypi.org/simple\n"
        "-e ./local\n"
        "flask>=3.0\n"
    )
    assert locked_versions(LOCK_V1 + extra) == {
        "geopandas": "1.1.1",
        "numpy": "2.2.0",
        "pandas": "2.3.3",
        "requests": "2.32.3",
        "django": "5.1.4",
    }
    environment = parse_environment(
        record(
            SPEC,
            spec=record(
                SPEC["spec"],
                packages={"python": {"dependencies": ["GeoPandas>=1", "Requests"]}},
            ),
        )
    )
    assert top_level_packages(environment, LOCK_V1) == {
        "geopandas": "1.1.1",
        "requests": "2.32.3",
    }


def test_versions_are_ordered_as_versions_not_as_text() -> None:
    diff = diff_packages(
        {"a": "1.9.0", "b": "1.0", "c": "2024.1", "d": "1.0"},
        {"a": "1.10.0", "b": "1.0.0", "c": "not a version", "d": None},
    )
    assert diff.upgraded == [PackageChange("a", "1.9.0", "1.10.0")]
    assert diff.changed == [
        PackageChange("c", "2024.1", "not a version"),
        PackageChange("d", "1.0", None),
    ]
    assert not (diff.added or diff.removed or diff.downgraded)


# -- build and logs ---------------------------------------------------------------------------


def follow_routes(registry: Registry, status: str, **changes: Any) -> None:
    registry.on(
        "POST", f"/environment-versions/{DRAFT_UID}/builds", answered("create_builds")
    )
    registry.on("GET", f"/environment-builds/{BUILD_UID}/logs", build_log_stream())
    ended = record(QUEUED, status=status, finishedAt="2026-09-11T17:03:12Z", **changes)
    registry.on("GET", f"/environment-builds/{BUILD_UID}", ok(ended))


def test_build_queues_a_build_per_variant(registry: Registry) -> None:
    registry.on(
        "POST", f"/environment-versions/{DRAFT_UID}/builds", answered("create_builds")
    )
    result = invoke("build", DRAFT_UID, "--variant", "datalayer", "--force")
    assert result.exit_code == 0, result.output
    assert BUILD_UID in result.stdout and "queued" in result.stdout
    (call,) = registry.sent("POST", f"/environment-versions/{DRAFT_UID}/builds")
    assert call["json"] == {"variants": ["datalayer"], "force": True}
    assert "Idempotency-Key" not in call["headers"]
    assert registry.sent("GET", f"/environment-builds/{BUILD_UID}/logs") == []

    listed = json.loads(invoke("build", DRAFT_UID, "-o", "json").stdout)
    assert [item["uid"] for item in listed] == [BUILD_UID]


def test_build_follow_renders_the_log_and_exits_0_when_the_build_succeeded(
    registry: Registry,
) -> None:
    follow_routes(registry, "succeeded")
    result = invoke("build", DRAFT_UID, "--follow")
    assert result.exit_code == 0, result.output
    log = "".join(BUILD_LOG)
    assert log in result.stdout
    queued, outcome = result.stdout.split(log)
    assert BUILD_UID in queued and "queued" in queued
    assert BUILD_UID in outcome and "succeeded" in outcome
    assert result.stderr == ""
    (stream,) = registry.sent("GET", f"/environment-builds/{BUILD_UID}/logs")
    assert stream["params"] == {"follow": "true"} and stream["stream"] is True


@pytest.mark.parametrize(
    ("status", "error_code", "detail"),
    [("failed", "DL_ENV_BUILD_FAILED", "uv pip sync exited 1"), ("cancelled", "", "")],
)
def test_build_follow_exits_1_when_the_build_did_not_succeed(
    registry: Registry, status: str, error_code: str, detail: str
) -> None:
    follow_routes(registry, status, errorCode=error_code, errorDetail=detail)
    result = invoke("build", DRAFT_UID, "--follow")
    assert result.exit_code == 1
    assert "".join(BUILD_LOG) in result.stdout
    words = f"Build {BUILD_UID} (datalayer, r1) ended {status}"
    assert result.stderr.strip() == (
        f"{words}: {error_code} {detail}" if error_code else words
    )


def test_build_follow_as_json_lines_a_record_per_build_chunk_and_outcome(
    registry: Registry,
) -> None:
    follow_routes(registry, "succeeded", cacheHit=True)
    result = invoke("build", DRAFT_UID, "--follow", "-o", "json")
    assert result.exit_code == 0, result.output
    records = [json.loads(line) for line in result.stdout.splitlines()]
    assert records[0]["build"]["status"] == "queued"
    assert [item["chunk"]["text"] for item in records[1:-1]] == BUILD_LOG
    assert {item["buildUid"] for item in records[1:-1]} == {BUILD_UID}
    assert (records[-1]["build"]["status"], records[-1]["build"]["cacheHit"]) == (
        "succeeded",
        True,
    )


def test_build_follow_prints_the_501_until_e1_16_builds_the_stream(
    registry: Registry,
) -> None:
    registry.on(
        "POST", f"/environment-versions/{DRAFT_UID}/builds", answered("create_builds")
    )
    registry.on(
        "GET", f"/environment-builds/{BUILD_UID}/logs", answered("follow_build_log")
    )
    result = invoke("build", DRAFT_UID, "--follow")
    assert result.exit_code == 1
    assert BUILD_UID in result.stdout
    assert result.stderr.startswith("HTTP 501: ") and "E1-16" in result.stderr
    assert len(registry.sent("GET", f"/environment-builds/{BUILD_UID}/logs")) == 1


def test_logs_reads_every_stored_chunk(registry: Registry) -> None:
    registry.on(
        "GET",
        f"/environment-builds/{BUILD_UID}/logs",
        ok({"chunks": [chunk(0), chunk(1)], "nextCursor": "1", "complete": False}),
        ok({"chunks": [chunk(2)], "nextCursor": "2", "complete": True}),
    )
    result = invoke("logs", BUILD_UID)
    assert result.exit_code == 0, result.output
    assert result.stdout == "".join(BUILD_LOG[:3])
    pages = registry.sent("GET", f"/environment-builds/{BUILD_UID}/logs")
    assert [page.get("params") for page in pages] == [None, {"cursor": "1"}]

    registry.on(
        "GET",
        f"/environment-builds/{BUILD_UID}/logs",
        ok({"chunks": [chunk(0)], "nextCursor": "0", "complete": True}),
    )
    answer = json.loads(invoke("logs", BUILD_UID, "-o", "json").stdout)
    assert answer["buildUid"] == BUILD_UID and answer["complete"] is True
    assert [item["text"] for item in answer["chunks"]] == BUILD_LOG[:1]


@pytest.mark.parametrize(("status", "exit_code"), [("succeeded", 0), ("failed", 1)])
def test_logs_follow_exits_with_the_builds_outcome(
    registry: Registry, status: str, exit_code: int
) -> None:
    registry.on("GET", f"/environment-builds/{BUILD_UID}/logs", build_log_stream())
    registry.on(
        "GET", f"/environment-builds/{BUILD_UID}", ok(record(QUEUED, status=status))
    )
    result = invoke("logs", BUILD_UID, "--follow")
    assert result.exit_code == exit_code, result.output
    assert "".join(BUILD_LOG) in result.stdout


# -- promote, rollback, deprecate, archive -------------------------------------------------


def test_promote_sends_the_environments_etag_it_just_read_and_the_acknowledgement(
    registry: Registry,
) -> None:
    registry.on("GET", f"/environment-versions/{READY_UID}", ok(READY))
    registry.on(
        "GET", f"/environments/{ENV_UID}", ok(record(ENVIRONMENT, etag='"102"'))
    )
    registry.on(
        "PUT", f"/environments/{ENV_UID}/promoted-version", answered("promote_version")
    )
    result = invoke("promote", READY_UID, "--acknowledge", "e2b")
    assert result.exit_code == 0, result.output
    assert "Version 2 of geo is promoted." in result.stdout
    (put,) = registry.sent("PUT", f"/environments/{ENV_UID}/promoted-version")
    assert put["headers"]["If-Match"] == '"102"'
    assert put["json"] == {
        "versionUid": READY_UID,
        "acknowledgeUnavailableVariants": ["e2b"],
    }


def test_promote_prints_the_412_when_the_environment_changed(
    registry: Registry,
) -> None:
    registry.on("GET", f"/environment-versions/{READY_UID}", ok(READY))
    registry.on("GET", f"/environments/{ENV_UID}", ok(ENVIRONMENT))
    registry.on(
        "PUT",
        f"/environments/{ENV_UID}/promoted-version",
        answered("update_environment_stale"),
    )
    result = invoke("promote", READY_UID, "-o", "json")
    assert result.exit_code == 1
    assert json.loads(result.stderr)["error"]["code"] == "DL_ENV_PRECONDITION_FAILED"
    (put,) = registry.sent("PUT", f"/environments/{ENV_UID}/promoted-version")
    assert put["json"] == {"versionUid": READY_UID}


def history(*states: str) -> list[dict[str, Any]]:
    """Versions newest first, the last state being version 1's."""
    count = len(states)
    return [
        record(
            READY,
            uid=f"01M28PM3HISTORYVERSI0N{count - index:04d}",
            version=count - index,
            status=state,
        )
        for index, state in enumerate(states)
    ]


def test_rollback_promotes_the_newest_older_ready_version_and_queues_nothing(
    registry: Registry,
) -> None:
    v3, v2, v1 = history("ready", "failed", "partially_ready")
    registry.on(
        "GET",
        f"/environments/{ENV_UID}",
        ok(record(ENVIRONMENT, promotedVersionUid=v3["uid"], etag='"107"')),
    )
    registry.on(
        "GET", f"/environments/{ENV_UID}/versions", ok({"versions": [v3, v2, v1]})
    )
    registry.on(
        "PUT",
        f"/environments/{ENV_UID}/promoted-version",
        ok(record(ENVIRONMENT, promotedVersionUid=v1["uid"], etag='"108"')),
    )
    result = invoke("rollback", ENV_UID, "--acknowledge", "modal")
    assert result.exit_code == 0, result.output
    assert "geo is rolled back from version 3 to version 1." in result.stdout
    assert registry.writes() == [("PUT", f"/environments/{ENV_UID}/promoted-version")]
    (put,) = registry.sent("PUT", f"/environments/{ENV_UID}/promoted-version")
    assert put["headers"]["If-Match"] == '"107"'
    assert put["json"] == {
        "versionUid": v1["uid"],
        "acknowledgeUnavailableVariants": ["modal"],
    }


@pytest.mark.parametrize(
    ("promoted", "states", "words"),
    [
        (
            0,
            ("ready", "draft"),
            "geo has no ready version older than version 2 to roll back to",
        ),
        (None, ("ready",), "geo has no promoted version to roll back from"),
    ],
)
def test_rollback_refuses_when_there_is_nothing_to_roll_back_to(
    registry: Registry, promoted: int | None, states: tuple[str, ...], words: str
) -> None:
    versions = history(*states)
    promoted_uid = versions[promoted]["uid"] if promoted is not None else None
    registry.on(
        "GET",
        f"/environments/{ENV_UID}",
        ok(record(ENVIRONMENT, promotedVersionUid=promoted_uid)),
    )
    registry.on("GET", f"/environments/{ENV_UID}/versions", ok({"versions": versions}))
    result = invoke("rollback", ENV_UID)
    assert result.exit_code == 1
    assert result.stderr.strip() == words
    assert registry.writes() == []


def test_deprecate_sends_the_versions_etag_it_just_read(registry: Registry) -> None:
    registry.on("GET", f"/environment-versions/{READY_UID}", ok(READY))
    registry.on(
        "POST",
        f"/environment-versions/{READY_UID}/deprecate",
        answered("deprecate_version"),
    )
    result = invoke("deprecate", READY_UID, "-o", "json")
    assert result.exit_code == 0, result.output
    assert json.loads(result.stdout)["status"] == "deprecated"
    (post,) = registry.sent("POST", f"/environment-versions/{READY_UID}/deprecate")
    assert post["headers"]["If-Match"] == READY["etag"] == '"103"'

    table = invoke("deprecate", READY_UID)
    assert table.exit_code == 0 and "deprecated" in table.stdout


def test_archive_sends_the_environments_etag_it_just_read(registry: Registry) -> None:
    archived = RECORDED["archive_environment"]["body"]
    uid = archived["uid"]
    registry.on(
        "GET",
        f"/environments/{uid}",
        ok(record(archived, archivedAt=None, etag='"105"')),
    )
    registry.on("POST", f"/environments/{uid}/archive", ok(archived))
    result = invoke("archive", uid)
    assert result.exit_code == 0, result.output
    assert "Archived" in result.stdout and archived["archivedAt"] in result.stdout
    (post,) = registry.sent("POST", f"/environments/{uid}/archive")
    assert post["headers"]["If-Match"] == '"105"'
