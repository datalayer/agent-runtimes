# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Every route of section 9 is reachable from both SDKs and the CLI (E4-07).

The TypeScript SDK has held itself to an exact match against section 9 since
E1-01. The Python SDK and the CLI never did, and the cost of that showed:
E2-15 shipped `publish`, `unpublish` and `publication` as routes, the
TypeScript client gained calls for them, and for a day there was no way to
publish an environment from Python or from a terminal at all — the make target
`PLAN_ENVS.md` E2-16 asks for could not even be written.

So the route table is read from the TypeScript test rather than copied: one
list, three clients, and a route added to any one of them fails the other two
until they catch up.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Callable

from agent_runtimes.client import AgentClient
from agent_runtimes.tests.test_envs_command import RECORDED

#: A ULID in the shape the routes take, so a path can be normalised back.
UID = "01JV1VE1T5VG22Z05F6EFBMW8E"

_ULID = re.compile(r"/[0-9A-HJKMNP-TV-Z]{26}(?=/|$)")

#: A spec the recordings already prove the client accepts, so this test is
#: about routes rather than about the validator.
SPEC = RECORDED["create_version"]["json"]["spec"]


class _Sent(Exception):
    """Raised once a call's route is recorded, so nothing has to be answered."""

    def __init__(self, method: str, path: str) -> None:
        super().__init__(f"{method} {path}")
        self.route = f"{method} {_ULID.sub('/{uid}', path)}"


class _RouteRecorder(AgentClient):
    """Answers nothing: the route is the whole point, so the call stops there."""

    def _environments_request(self, method: str, path: str, **_: Any) -> Any:
        raise _Sent(method, path)

    def _fetch(self, request: str, **kwargs: Any) -> Any:
        # The unfiltered listing predates `_environments_request` and still
        # goes straight to the transport, so parity has to watch both seams
        # rather than the tidier one only.
        path = request.split("/api/runtimes/v1", 1)[-1].split("?", 1)[0]
        raise _Sent(str(kwargs.get("method", "GET")).upper(), path)


def _route_of(call: Callable[[AgentClient], Any]) -> str:
    client = _RouteRecorder(api_key="test-key-not-used")
    try:
        call(client)
    except _Sent as sent:
        return sent.route
    raise AssertionError("the call reached no route")


def section_9_routes() -> list[str]:
    """The routes as the TypeScript client's own parity test lists them."""
    source = (
        Path(__file__).resolve().parents[2]
        / "src/api/runtimes/__tests__/environments.unit.test.ts"
    ).read_text()
    block = re.search(r"const SECTION_9_ROUTES = \[(.*?)\];", source, re.S)
    assert block, "the TypeScript parity test no longer lists SECTION_9_ROUTES"
    # Line comments first: an apostrophe in one ("An owner's quotas") would
    # otherwise open a quoted "route".
    entries = re.sub(r"//[^\n]*", "", block.group(1))
    return sorted(re.findall(r"'([^']+)'", entries))


#: Every environments call the Python SDK offers, and the route it issues.
SDK_CALLS: list[tuple[str, Callable[[AgentClient], Any]]] = [
    ("create_environment", lambda c: c.create_environment(SPEC)),
    ("list_environments", lambda c: c._list_environments()),
    ("get_environment", lambda c: c.get_environment(UID)),
    (
        "update_environment",
        lambda c: c.update_environment(UID, if_match='"1"', title="t"),
    ),
    ("delete_environment", lambda c: c.delete_environment(UID)),
    ("archive_environment", lambda c: c.archive_environment(UID)),
    (
        "promote_environment_version",
        lambda c: c.promote_environment_version(UID, UID, if_match='"1"'),
    ),
    ("create_environment_version", lambda c: c.create_environment_version(UID, SPEC)),
    ("list_environment_versions", lambda c: c.list_environment_versions(UID)),
    ("get_environment_version", lambda c: c.get_environment_version(UID)),
    (
        "update_environment_version",
        lambda c: c.update_environment_version(UID, if_match='"1"', spec=SPEC),
    ),
    ("validate_environment_version", lambda c: c.validate_environment_version(UID)),
    ("resolve_environment_version", lambda c: c.resolve_environment_version(UID)),
    ("trial_environment_version", lambda c: c.trial_environment_version(UID)),
    ("deprecate_environment_version", lambda c: c.deprecate_environment_version(UID)),
    (
        "publish_environment_version",
        lambda c: c.publish_environment_version(UID, if_match='"1"'),
    ),
    ("unpublish_environment_version", lambda c: c.unpublish_environment_version(UID)),
    ("get_environment_publication", lambda c: c.get_environment_publication(UID)),
    ("fork_environment_version", lambda c: c.fork_environment_version(UID)),
    (
        "create_environment_builds",
        lambda c: c.create_environment_builds(UID, variants=["datalayer"]),
    ),
    ("list_environment_builds", lambda c: c.list_environment_builds(UID)),
    ("list_environment_artifacts", lambda c: c.list_environment_artifacts(UID)),
    (
        "list_environment_version_sandboxes",
        lambda c: c.list_environment_version_sandboxes(UID),
    ),
    ("get_environment_quotas", lambda c: c.get_environment_quotas()),
    ("get_environment_build", lambda c: c.get_environment_build(UID)),
    ("read_environment_build_logs", lambda c: c.read_environment_build_logs(UID)),
    ("cancel_environment_build", lambda c: c.cancel_environment_build(UID)),
    ("retry_environment_build", lambda c: c.retry_environment_build(UID)),
]


def test_every_sdk_call_reaches_a_route_of_section_9() -> None:
    """No call invents a route the service does not serve."""
    routes = {_route_of(call) for _, call in SDK_CALLS}
    unknown = sorted(routes - set(section_9_routes()))
    assert unknown == [], (
        f"the Python SDK calls routes section 9 does not list: {unknown}"
    )


def test_the_python_sdk_has_a_call_for_every_route_of_section_9() -> None:
    """The parity E4-07 asks for, in the direction that bites.

    A route with no client is a route nobody outside the browser can reach —
    which is what happened to `publish` between E2-15 and E2-16.
    """
    covered = {_route_of(call) for _, call in SDK_CALLS}
    missing = sorted(set(section_9_routes()) - covered)
    assert missing == [], f"section 9 routes the Python SDK cannot reach: {missing}"


def test_each_sdk_call_is_named_once() -> None:
    names = [name for name, _ in SDK_CALLS]
    assert len(set(names)) == len(names)
    for name, _ in SDK_CALLS:
        assert hasattr(AgentClient, name), f"{name} is no longer a client method"


# -- the CLI ----------------------------------------------------------------------------------


def _cli_source() -> str:
    return (Path(__file__).resolve().parents[1] / "commands/envs.py").read_text()


def cli_called_methods() -> set[str]:
    """The client methods the `envs` commands call, read from their source.

    Reading the source rather than driving every command is deliberate: a
    command's arguments are its own business, and what parity is about is
    whether a route has a way in at all.
    """
    return set(re.findall(r"client\.([a-z_]+)\(", _cli_source()))


def test_the_cli_reaches_every_route_of_section_9() -> None:
    """A route no command can reach is a route nobody at a terminal has.

    Five were unreachable when this test was written: a version's builds and
    its artifacts could not be listed, a running build could not be cancelled,
    a failed one could not be retried, and a published environment could not
    be forked.
    """
    called = cli_called_methods()
    reachable = {_route_of(call) for name, call in SDK_CALLS if name in called}
    missing = sorted(set(section_9_routes()) - reachable)
    assert missing == [], f"section 9 routes no `envs` command reaches: {missing}"


def test_every_client_method_the_cli_calls_exists() -> None:
    """The source-reading above is only as good as the names it finds."""
    for name in sorted(cli_called_methods()):
        assert hasattr(AgentClient, name), (
            f"`envs` calls {name}, which the client has not"
        )


def test_the_typescript_client_covers_the_same_routes() -> None:
    """One table, three clients.

    The TypeScript test asserts its own calls against `SECTION_9_ROUTES`; this
    asserts that the list it holds is the list the Python side is checked
    against, so a route added to one client cannot quietly skip the others.
    """
    routes = section_9_routes()
    assert len(routes) == len(set(routes))
    assert routes == sorted(routes)
    # Every route is a method and a path under the registry, nothing else.
    for route in routes:
        method, _, path = route.partition(" ")
        assert method in {"GET", "POST", "PUT", "PATCH", "DELETE"}, route
        assert path.startswith("/environment"), route
