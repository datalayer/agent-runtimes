# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""LinkedIn's session pasted in Settings, written as the server's on the runtime.

The user, 15 November 2026: LinkedIn's reCAPTCHA loops forever on the sign-in
made from the runtime's browser (an AWS address); "Keep it in Vault per person —
paste once in Settings › LinkedIn; stored encrypted in your Vault secrets and
handed to each new Marketer runtime automatically." The interactive sign-in
stays beside it. Every value here is a fake: never a real session.
"""

from __future__ import annotations

import asyncio
import json
import os
import socket
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest

from agent_runtimes.guardrails import credentials
from agent_runtimes.guardrails.declared_secrets import declared_secrets
from agent_runtimes.mcp import browser_session as sessions
from agent_runtimes.mcp import jupyter_host

FAKE = "AQEDAfakeFAKEfake0000000000000000-not-a-real-session"


def run_cell(operation: str, **arguments: Any) -> tuple[Dict[str, Any], str, str]:
    """Run a cell as the Jupyter container's kernel would; its answer, stdout and code."""
    code = jupyter_host.cell(operation, arguments)
    ran = subprocess.run(
        [sys.executable, "-c", code], capture_output=True, text=True, timeout=120
    )
    assert ran.returncode == 0, ran.stderr
    return jupyter_host.answer_of(ran.stdout), ran.stdout + ran.stderr, code


@pytest.fixture
def sessions_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    root = tmp_path / "sessions"
    monkeypatch.setattr(jupyter_host, "SESSIONS_ROOT", str(root))
    return root


@pytest.fixture(autouse=True)
def fresh(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sessions, "_SETTINGS", {})
    monkeypatch.setattr(sessions, "_TRIED", set())
    monkeypatch.setattr(sessions, "_SIGNED_OUT", set())
    monkeypatch.setattr(sessions, "_HELD", {})
    monkeypatch.delenv("AGENT_RUNTIMES_VISITORS", raising=False)
    monkeypatch.delenv(sessions.LINKEDIN.settings_secret, raising=False)


def _seed_cell(handoff: jupyter_host.Handoff, probe: bool = False):
    return run_cell(
        "seed-session",
        provider="linkedin",
        port=handoff.port,
        nonce=handoff.nonce,
        cookie={**sessions.settings_cookie_of(sessions.LINKEDIN, ""), "value": ""},
        session_cookie="li_at",
        source_runtime=sessions.SOURCE_RUNTIME,
        profile_mark=sessions.PROFILE_MARK,
        probe=probe,
    )


# --- the handoff ----------------------------------------------------------------------------


def test_the_handoff_gives_the_value_once_to_its_nonce_alone() -> None:
    handoff = jupyter_host.Handoff(FAKE, timeout=10)

    def ask(nonce: str) -> bytes:
        with socket.create_connection(("127.0.0.1", handoff.port), timeout=5) as c:
            c.sendall((nonce + "\n").encode())
            return c.recv(4096)

    assert ask("not-the-nonce") == b""
    assert ask(handoff.nonce) == FAKE.encode()
    assert handoff.handed is True
    handoff.close()
    with pytest.raises(OSError):
        ask(handoff.nonce)


# --- the cell, in the Jupyter container -----------------------------------------------------


def test_the_settings_session_lands_owner_only_and_never_in_the_cell(
    sessions_root: Path,
) -> None:
    handoff = jupyter_host.Handoff(FAKE, timeout=60)
    answer, output, code = _seed_cell(handoff)
    handoff.close()
    assert answer["settings"] == "used"
    assert answer["state"] == "signed-in"
    # Neither the cell's code (a kernel's history), nor what it printed.
    assert FAKE not in code and FAKE not in output
    auth = sessions_root / "linkedin" / "auth"
    written = json.loads((auth / "cookies.json").read_text())
    assert written == [
        {
            "name": "li_at",
            "value": FAKE,
            "domain": ".linkedin.com",
            "path": "/",
            "expires": written[0]["expires"],
            "httpOnly": True,
            "secure": True,
            "sameSite": "None",
        }
    ]
    assert written[0]["expires"] > answer["expires"] - 1
    state = json.loads((auth / "source-state.json").read_text())
    assert state["origin"] == sessions.FROM_SETTINGS
    assert state["cookies_path"] == str(auth / "cookies.json")
    assert (auth / "profile" / sessions.PROFILE_MARK).exists()
    for path in (sessions_root, auth.parent, auth, auth / "profile"):
        assert stat.S_IMODE(os.stat(path).st_mode) == 0o700
    for name in ("cookies.json", "source-state.json"):
        assert stat.S_IMODE(os.stat(auth / name).st_mode) == 0o600


def test_a_session_signed_in_from_the_chat_is_never_overwritten(
    sessions_root: Path,
) -> None:
    auth = sessions_root / "linkedin" / "auth"
    auth.mkdir(parents=True)
    (auth / "cookies.json").write_text(
        json.dumps(
            [{"name": "li_at", "value": "signed-in-here", "expires": 4102444800.0}]
        )
    )
    (auth / "source-state.json").write_text(json.dumps({"origin": "sign-in"}))
    handoff = jupyter_host.Handoff(FAKE, timeout=60)
    answer, _, _ = _seed_cell(handoff)
    handoff.close()
    assert answer["settings"] == "kept"
    assert "signed-in-here" in (auth / "cookies.json").read_text()


@pytest.mark.skipif(
    not Path("~/.local/share/uv/tools/mcp-server-linkedin/bin/python")
    .expanduser()
    .exists(),
    reason="no local mcp-server-linkedin",
)
def test_mcp_server_linkedin_reads_the_settings_session(sessions_root: Path) -> None:
    """The server finds the session and imports its li_at, as it starts (4.30.0)."""
    handoff = jupyter_host.Handoff(FAKE, timeout=60)
    _seed_cell(handoff)
    handoff.close()
    profile = sessions_root / "linkedin" / "auth" / "profile"
    check = (
        "import json\n"
        "from linkedin_mcp_server.authentication import get_authentication_source\n"
        "from linkedin_mcp_server.session_state import get_source_profile_dir, portable_cookie_path\n"
        "from linkedin_mcp_server.core.browser import BrowserManager\n"
        "assert get_authentication_source() is True\n"
        "path = portable_cookie_path(get_source_profile_dir())\n"
        "_, names = BrowserManager._bridge_cookie_names()\n"
        "kept = [c['name'] for c in json.loads(path.read_text())\n"
        "        if 'linkedin.com' in c.get('domain', '') and c.get('name') in names]\n"
        "print(json.dumps({'profile': str(get_source_profile_dir()), 'imported': kept}))\n"
    )
    ran = subprocess.run(
        [
            str(
                Path(
                    "~/.local/share/uv/tools/mcp-server-linkedin/bin/python"
                ).expanduser()
            ),
            "-c",
            check,
        ],
        capture_output=True,
        text=True,
        timeout=120,
        env={**os.environ, "USER_DATA_DIR": str(profile)},
    )
    assert ran.returncode == 0, ran.stderr[-2000:]
    said = json.loads(ran.stdout.strip().splitlines()[-1])
    assert said["imported"] == ["li_at"]
    assert FAKE not in ran.stdout + ran.stderr


# --- LinkedIn's answer ------------------------------------------------------------------------


class _Answer:
    def __init__(self, status: int, location: str = "", cookies: tuple = ()) -> None:
        self.status = status
        self._location = location
        self._cookies = cookies

    def getheader(self, name: str) -> str:
        return self._location if name == "Location" else ""

    def getheaders(self) -> List[tuple]:
        return [("Set-Cookie", cookie) for cookie in self._cookies]

    def read(self, size: int) -> bytes:
        return b""


#: What LinkedIn answered a fake li_at, 15 November 2026: the feed again, the session deleted.
DELETED = (
    "li_at=delete me; Version=1; Path=/; Domain=.www.linkedin.com; "
    "Expires=Thu, 01-Jan-1970 00:00:00 GMT; Max-Age=0; Secure; SameSite=None; HttpOnly",
)


@pytest.mark.parametrize(
    "status, location, cookies, said",
    [
        (200, "", (), "accepted"),
        (302, "https://www.linkedin.com/feed/", DELETED, "refused"),
        (302, "https://www.linkedin.com/uas/login?session_redirect=x", (), "refused"),
        (303, "https://www.linkedin.com/authwall?trk=x", (), "refused"),
        (999, "", (), "unchecked"),
        (302, "https://www.linkedin.com/checkpoint/challenge", (), "refused"),
    ],
)
def test_linkedin_is_asked_once_and_its_login_means_refused(
    monkeypatch: pytest.MonkeyPatch,
    status: int,
    location: str,
    cookies: tuple,
    said: str,
) -> None:
    import http.client

    sent: List[Dict[str, str]] = []

    class Connection:
        def __init__(self, host: str, **_: Any) -> None:
            assert host == "www.linkedin.com"

        def request(self, method: str, path: str, headers: Dict[str, str]) -> None:
            assert (method, path) == ("GET", "/feed/")
            sent.append(headers)

        def getresponse(self) -> _Answer:
            return _Answer(status, location, cookies)

        def close(self) -> None:
            pass

    monkeypatch.setattr(http.client, "HTTPSConnection", Connection)
    assert sessions.probe_li_at(FAKE) == said
    assert sent[0]["Cookie"] == f"li_at={FAKE}"


def test_a_value_that_is_no_cookie_is_refused_without_asking() -> None:
    assert sessions.probe_li_at("two words") == "refused"
    assert sessions.probe_li_at("a;b=c") == "refused"
    assert sessions.probe_li_at("") == "refused"


# --- the runtime: given, seeded once, said, signed out ------------------------------------


@pytest.fixture
def alpine(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.setenv(
        "AGENT_RUNTIMES_JUPYTER_SANDBOX", "http://127.0.0.1:2300/jupyter?token=t"
    )
    monkeypatch.setenv("USER_DATA_DIR", str(tmp_path / "local" / "profile"))
    monkeypatch.setattr(sessions, "on_musl", lambda: True)
    monkeypatch.setattr(sessions, "_server_known", lambda provider: True)
    calls: List[tuple[str, Dict[str, Any]]] = []
    outcome = {"settings": "used"}

    async def call(
        operation: str, timeout: float = 0, **arguments: Any
    ) -> Dict[str, Any]:
        calls.append((operation, arguments))
        if operation == "seed-session":
            # As the cell does: the value read off the handoff, never an argument.
            with socket.create_connection(
                ("127.0.0.1", arguments["port"]), timeout=5
            ) as c:
                c.sendall((arguments["nonce"] + "\n").encode())
                got = c.recv(4096).decode()
            assert got == FAKE
            if outcome["settings"] == "refused":
                return {"settings": "refused", "state": "none", "expires": None}
            return {"settings": "used", "state": "signed-in", "expires": 4102444800.0}
        if operation == "forget":
            return {"state": "none", "expires": None}
        return {"state": "none", "expires": None}

    monkeypatch.setattr(jupyter_host, "call", call)

    class Lifecycle:
        async def stop_server(self, server_id: str) -> bool:
            return True

        def knows(self, server_id: str) -> bool:
            return True

    monkeypatch.setattr(
        "agent_runtimes.mcp.lifecycle.get_mcp_lifecycle_manager", lambda: Lifecycle()
    )
    return calls, outcome, tmp_path


def test_without_the_secret_nothing_is_written(alpine) -> None:
    calls, _, _ = alpine
    assert asyncio.run(sessions.seed(sessions.LINKEDIN)) == ""
    assert calls == []
    assert sessions.status(sessions.LINKEDIN)["settings"] == "none"


def test_given_the_secret_the_server_starts_signed_in(
    alpine, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls, _, tmp_path = alpine
    monkeypatch.setenv("LINKEDIN_LI_AT", FAKE)
    assert asyncio.run(sessions.seed(sessions.LINKEDIN)) == "used"
    operation, arguments = calls[0]
    assert operation == "seed-session"
    assert FAKE not in json.dumps(arguments)
    assert arguments["cookie"]["domain"] == ".linkedin.com"
    status = sessions.status(sessions.LINKEDIN)
    assert status["state"] == "signed-in"
    assert status["settings"] == "used" and status["notice"] == ""
    assert FAKE not in json.dumps(status)
    # Withheld wherever it would be shown.
    assert FAKE not in credentials.redact(f"the cookie is {FAKE}")
    # Once: a restart after a sign-in never writes it again.
    assert asyncio.run(sessions.seed(sessions.LINKEDIN)) == ""
    assert len(calls) == 1
    # Nothing on agent-runtimes' disk.
    assert not (tmp_path / "local").exists()


def test_refused_by_linkedin_the_chat_says_paste_a_new_one(
    alpine, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, outcome, _ = alpine
    outcome["settings"] = "refused"
    monkeypatch.setenv("LINKEDIN_LI_AT", FAKE)
    assert asyncio.run(sessions.seed(sessions.LINKEDIN)) == "refused"
    status = sessions.status(sessions.LINKEDIN)
    assert status["state"] == "none"
    assert status["settings"] == "refused"
    assert status["notice"] == (
        "Your LinkedIn session in Settings no longer works: paste a new one."
    )
    # The manual sign-in stays offered.
    assert status["offered"] is True


def test_sign_out_forgets_the_runtimes_copy_alone(
    alpine, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls, _, _ = alpine
    monkeypatch.setenv("LINKEDIN_LI_AT", FAKE)
    asyncio.run(sessions.seed(sessions.LINKEDIN))
    status = asyncio.run(sessions.sign_out(sessions.LINKEDIN))
    assert status["state"] == "none" and status["settings"] == "none"
    assert "forget" in [operation for operation, _ in calls]
    # The Vault's stays (this runtime's environment is not the Vault), and
    # is not written again on this runtime.
    assert os.environ["LINKEDIN_LI_AT"] == FAKE
    assert sessions.settings_cookie(sessions.LINKEDIN) == ""


def test_a_visitors_runtime_is_never_given_it(
    alpine, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls, _, _ = alpine
    monkeypatch.setenv("LINKEDIN_LI_AT", FAKE)
    monkeypatch.setattr("agent_runtimes.apps.visitors.visitors_runtime", lambda: True)
    assert asyncio.run(sessions.seed(sessions.LINKEDIN)) == ""
    assert calls == []


def test_on_a_glibc_runtime_it_is_written_beside_the_servers_profile(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(sessions, "on_musl", lambda: False)
    monkeypatch.setenv("USER_DATA_DIR", str(tmp_path / "linkedin-mcp" / "profile"))
    monkeypatch.setenv("LINKEDIN_LI_AT", FAKE)
    monkeypatch.setattr(sessions, "probe_li_at", lambda value: "accepted")
    assert asyncio.run(sessions.seed(sessions.LINKEDIN)) == "used"
    root = tmp_path / "linkedin-mcp"
    assert stat.S_IMODE(os.stat(root / "cookies.json").st_mode) == 0o600
    assert sessions.session_origin() == sessions.FROM_SETTINGS
    assert sessions.session_state(sessions.LINKEDIN) == "signed-in"


# --- what the catalogue declares ---------------------------------------------------------


def test_the_catalogue_gives_it_when_there_never_requires_it() -> None:
    declared = declared_secrets(
        {
            "id": "a",
            "mcp_servers": ["linkedin"],
            "optional": {"mcp_servers": ["linkedin"]},
        }
    )
    assert "LINKEDIN_LI_AT" in declared.runtime
    assert "LINKEDIN_LI_AT" not in declared.kernel
    assert all("LINKEDIN_LI_AT" not in names for names in declared.consumers.values())
    assert declared.missing(lambda name: False, who="a") == []
    assert credentials.is_secret_name("LINKEDIN_LI_AT")


def test_a_deployment_is_never_given_it() -> None:
    declared = declared_secrets(
        {"id": "a", "mcp_servers": ["linkedin"]},
        app_instance={"deployment_uid": "01DEPLOYMENT"},
    )
    assert "LINKEDIN_LI_AT" not in declared.runtime


def test_with_it_the_marketer_has_its_one_network(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sessions, "session_state", lambda provider, *a, **k: "none")
    declared = declared_secrets(
        {
            "id": "m",
            "mcp_servers": ["linkedin"],
            "optional": {"mcp_servers": ["linkedin"], "at_least_one": [["linkedin"]]},
        }
    )
    assert declared.missing(lambda name: False, who="m")
    assert declared.missing(lambda name: name == "LINKEDIN_LI_AT", who="m") == []


# --- refused end to end: a fake LinkedIn that deletes the fake session ----------------------


def _linkedin_deleting(monkeypatch: pytest.MonkeyPatch) -> List[str]:
    """LinkedIn as it answered a fake li_at on 15 November 2026: the session deleted."""
    import http.client

    asked: List[str] = []

    class Connection:
        def __init__(self, host: str, **_: Any) -> None:
            asked.append(host)

        def request(self, method: str, path: str, headers: Dict[str, str]) -> None:
            pass

        def getresponse(self) -> _Answer:
            return _Answer(302, "https://www.linkedin.com/feed/", DELETED)

        def close(self) -> None:
            pass

    monkeypatch.setattr(http.client, "HTTPSConnection", Connection)
    return asked


def test_a_refused_session_is_not_written_said_and_the_server_left_out(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from agent_runtimes.mcp.lifecycle import MCPLifecycleManager

    monkeypatch.setattr(sessions, "on_musl", lambda: False)
    monkeypatch.setattr(sessions, "_server_known", lambda provider: True)
    monkeypatch.setenv("USER_DATA_DIR", str(tmp_path / "linkedin-mcp" / "profile"))
    monkeypatch.setenv("LINKEDIN_LI_AT", FAKE)
    asked = _linkedin_deleting(monkeypatch)
    reason = asyncio.run(MCPLifecycleManager._seed_browser_session("linkedin"))
    assert asked == ["www.linkedin.com"]
    # Nothing written for the server.
    assert not (tmp_path / "linkedin-mcp" / "cookies.json").exists()
    # The agent's host and the chat are told why its LinkedIn tools are not there.
    assert reason.startswith("LinkedIn reading is unavailable on this runtime:")
    assert (
        "Your LinkedIn session in Settings no longer works: paste a new one." in reason
    )
    assert "sign in to LinkedIn from the chat" in reason
    assert FAKE not in reason
    status = sessions.status(sessions.LINKEDIN)
    assert status["settings"] == "refused"
    assert (
        status["notice"]
        == "Your LinkedIn session in Settings no longer works: paste a new one."
    )
    # Sign in to LinkedIn stays offered, and a later start is refused the same way.
    assert status["offered"] is True and status["state"] == "none"
    assert asyncio.run(MCPLifecycleManager._seed_browser_session("linkedin")) == reason
    assert asked == ["www.linkedin.com"]  # asked once


def test_signed_in_from_the_chat_after_a_refusal_the_server_starts(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from agent_runtimes.mcp.lifecycle import MCPLifecycleManager

    monkeypatch.setattr(sessions, "on_musl", lambda: False)
    monkeypatch.setenv("USER_DATA_DIR", str(tmp_path / "linkedin-mcp" / "profile"))
    monkeypatch.setenv("LINKEDIN_LI_AT", FAKE)
    _linkedin_deleting(monkeypatch)
    assert asyncio.run(MCPLifecycleManager._seed_browser_session("linkedin"))
    # As Done writes a session signed in from the chat.
    sessions.write_linkedin_session(
        [{"name": "li_at", "value": "signed-in-here", "domain": ".www.linkedin.com"}]
    )
    assert asyncio.run(MCPLifecycleManager._seed_browser_session("linkedin")) == ""
