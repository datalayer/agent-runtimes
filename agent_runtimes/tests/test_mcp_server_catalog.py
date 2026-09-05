# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""One catalogue of MCP servers, kept in three places.

`MCP_SERVER_CATALOG` is what the runtime actually launches.
`agentspecs/mcp-servers/*.yaml` is the documented specification form, which
the docs describe field by field. And the docs page lists the servers by name
in prose.

Three copies drift in the direction nobody notices: a server added to the
runtime and not to the specification is undocumented, one added to the
specification and not the runtime cannot be launched, and the prose list goes
stale in silence — it named eight servers while thirteen existed, so five
were invisible to anybody reading the documentation to find out what was
available.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_mcp_server_catalog.py -v
```
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG

#: The specification form, beside the package that documents it.
SPECS = (
    Path(__file__).resolve().parents[2]
    / "agentspecs"
    / "agentspecs"
    / "mcp-servers"
)

#: The prose list, which is the copy a reader meets first.
DOCS = (
    Path(__file__).resolve().parents[2]
    / "agentspecs"
    / "docs"
    / "docs"
    / "agents"
    / "mcp-servers"
    / "index.mdx"
)


def _comparable(args) -> list[str]:
    """Arguments with the one runtime-resolved value put back in its box.

    `filesystem` serves the system temp directory: the specification says
    `${TMPDIR}` and the runtime calls `tempfile.gettempdir()`, so the two are
    the same intention and never the same string. Everything else is compared
    literally, which is the point — a URL or a flag that differs between the
    two definitions is a server that behaves one way and is documented
    another.
    """
    import tempfile  # noqa: PLC0415

    temporary = tempfile.gettempdir()
    return [
        "<tmp>" if str(arg) in ("${TMPDIR}", temporary) else str(arg) for arg in args
    ]


def specifications() -> dict[str, dict]:
    return {
        path.stem: yaml.safe_load(path.read_text())
        for path in sorted(SPECS.glob("*.yaml"))
    }


class TestTheThreeCopiesAgree:
    def test_every_runtime_server_has_a_specification(self) -> None:
        missing = sorted(set(MCP_SERVER_CATALOG) - set(specifications()))
        assert missing == [], f"launched but undocumented: {missing}"

    def test_every_specification_has_a_runtime_server(self) -> None:
        missing = sorted(set(specifications()) - set(MCP_SERVER_CATALOG))
        assert missing == [], f"specified but not launchable: {missing}"

    def test_the_documented_list_names_every_server(self) -> None:
        """It named eight while thirteen existed. A reader looking for what
        is available found five of them missing, with nothing saying so.

        The **list**, not the page: a server mentioned in a paragraph
        somewhere else is not one a reader finds by scanning what is
        available, and matching anywhere on the page would let a bullet be
        deleted without a word.
        """
        import re  # noqa: PLC0415

        listed = set(
            re.findall(r"^- \*\*`([a-z0-9-]+)`\*\*", DOCS.read_text(), re.M)
        )
        missing = sorted(set(MCP_SERVER_CATALOG) - listed)
        assert missing == [], f"in the catalogue, absent from the docs list: {missing}"
        gone = sorted(listed - set(MCP_SERVER_CATALOG))
        assert gone == [], f"documented but no longer in the catalogue: {gone}"

    @pytest.mark.parametrize("server_id", sorted(MCP_SERVER_CATALOG))
    def test_the_two_definitions_say_the_same_thing(self, server_id: str) -> None:
        """The fields that decide behaviour, not the prose ones. A command or
        an argument list that differs between them is a server that behaves
        one way and is documented another."""
        spec = specifications()[server_id]
        server = MCP_SERVER_CATALOG[server_id]
        assert spec["id"] == server.id
        assert spec["command"] == server.command
        assert _comparable(spec["args"]) == _comparable(server.args)
        assert spec.get("transport", "stdio") == server.transport
        assert bool(spec.get("enabled", True)) is bool(server.enabled)
        assert list(spec.get("envvars") or []) == list(server.required_env_vars or [])


class TestTheSpecificationsAreWellFormed:
    @pytest.mark.parametrize("server_id", sorted(specifications()))
    def test_the_required_fields_are_there(self, server_id: str) -> None:
        spec = specifications()[server_id]
        for field in ("id", "version", "name", "description", "command"):
            assert spec.get(field), f"{server_id}.yaml has no {field}"
        # `args` may legitimately be empty — `eurus-mcp` takes none — so this
        # asks that the key is *there*, which is what the schema requires.
        assert "args" in spec and spec["args"] is not None, f"{server_id}.yaml has no args"

    @pytest.mark.parametrize("server_id", sorted(specifications()))
    def test_the_id_matches_the_file_name(self, server_id: str) -> None:
        assert specifications()[server_id]["id"] == server_id

    @pytest.mark.parametrize("server_id", sorted(specifications()))
    def test_the_emoji_is_an_emoji(self, server_id: str) -> None:
        """`github.yaml` had two stray list items after `emoji:`, which YAML
        folded into the scalar: its emoji was
        `'🐙 - git - collaboration'`. It parsed, so nothing complained, and
        the whole string went wherever an emoji goes."""
        emoji = specifications()[server_id].get("emoji", "")
        assert emoji and len(emoji) <= 4, f"{server_id}.yaml emoji is {emoji!r}"

    @pytest.mark.parametrize("server_id", sorted(specifications()))
    def test_a_secret_is_named_and_never_written_down(self, server_id: str) -> None:
        """A credential belongs in `${VAR}`, expanded at launch. One written
        into `args` or `env` is a secret committed to a repository."""
        spec = specifications()[server_id]
        written = " ".join(str(part) for part in spec.get("args") or [])
        written += " " + " ".join(
            f"{key}={value}" for key, value in (spec.get("env") or {}).items()
        )
        for marker in ("Bearer ", "api_key=", "token="):
            if marker in written:
                after = written.split(marker, 1)[1]
                assert after.startswith("${"), (
                    f"{server_id}.yaml writes a credential down: {after[:40]!r}"
                )


class TestTheHostedDatalayerServer:
    """This platform's own server, in this platform's catalogue."""

    def test_it_is_in_the_catalogue(self) -> None:
        assert "datalayer" in MCP_SERVER_CATALOG

    def test_it_points_at_the_hosted_endpoint(self) -> None:
        assert "https://mcp.datalayer.run/mcp" in MCP_SERVER_CATALOG["datalayer"].args

    def test_it_presents_a_token_rather_than_opening_a_browser(self) -> None:
        """`mcp-remote` can do OAuth 2.1 with PKCE, which is right for a
        person at a desktop client and wrong here: it opens a browser and
        waits for somebody to approve a consent screen. An agent runtime has
        nobody at the keyboard."""
        args = MCP_SERVER_CATALOG["datalayer"].args
        assert "--header" in args
        assert any("${DATALAYER_API_KEY}" in str(arg) for arg in args)

    def test_it_is_off_by_default(self) -> None:
        """Every other server here reaches something outside Datalayer. This
        one reaches *this* platform, and an agent in a Datalayer sandbox
        already has the notebook it was given — enabling it says "act on my
        other notebooks too", which is a choice rather than a discovery."""
        assert MCP_SERVER_CATALOG["datalayer"].enabled is False

    def test_the_token_is_required_and_named(self) -> None:
        assert MCP_SERVER_CATALOG["datalayer"].required_env_vars == [
            "DATALAYER_API_KEY:0.0.1"
        ]
