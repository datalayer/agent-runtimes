# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A person's own browser session, for an MCP server that reads through one.

The user, 15 November 2026: "for linkedin, we need to use the embedded browser
with the mcp server to allow full access". The catalogue's ``linkedin`` server
(stickerdaniel's ``mcp-server-linkedin``) acts on a signed-in LinkedIn session,
not a key: it reads the feed, posts, comments and the inbox as the person.

How a session is made, on the person's own runtime:

1. *Sign in to LinkedIn*, in the chat (the ``browser-session`` reactor plugin),
   starts the runtime's own headless Chromium — the one an application's
   computer browses with (``agent_runtimes.apps.browser``); on a cloud runtime,
   one headful on the Jupyter container's virtual display — at LinkedIn's
   login page, and the chat draws it: its screenshot, and the person's clicks,
   typing and keys sent back (:func:`start`, :func:`step`).
2. The person signs in there, as on any page; a second factor is answered the
   same way. Nobody else sees the page: it is the person's runtime, reached
   with their token.
3. *Done* (:func:`finish`) reads the browser's LinkedIn cookies over the
   DevTools protocol, writes them where the server reads a session made
   elsewhere — ``cookies.json`` and ``source-state.json`` beside its profile,
   under ``~/.linkedin-mcp`` — closes the browser, and starts the server again,
   which signs in from them.

Or pasted once, in Settings › LinkedIn (the user, 15 November 2026: LinkedIn's
reCAPTCHA loops forever on a sign-in made from an AWS address): the ``li_at``
cookie of the person's own browser, kept in their Vault secrets as
``LINKEDIN_LI_AT``, given to each new runtime of theirs whose agent uses the
server (the catalogue's ``optional_envvars``: never required, never to a
deployment's, never in the sandbox). Before the server first starts, the
runtime writes it as the server's session (:func:`seed`) — in the Jupyter
container, handed over the Pod's loopback so that no cell's code holds it — and
asks LinkedIn once whether it signs in: sent to its login, the chat says the
session in Settings no longer works. The interactive sign-in stays beside it,
unchanged; a session signed in there is never overwritten, and *Sign out* forgets
the runtime's copy alone (the Vault's stays, and is not written again on that
runtime).

What keeps it the person's: the files are the runtime's own, mode 0600 in a
0700 directory of its home, on the pod's own disk — a runtime is one person's,
never shared, and its disk is gone when it ends; nothing is logged but the
session's state, never a cookie; a visitors' runtime refuses it outright, and
so does a deployment's (its routes are its application's alone). The platform
keeps no browser profile per person, so a new runtime asks again.

On a cloud runtime (15 November 2026, the user: "reuse the existing jupyter
one") the server, the sign-in browser and the session are all in the Pod's
Jupyter container, the agent-runtimes image (Alpine) running none of them
(:mod:`agent_runtimes.mcp.jupyter_host`): the browser is driven from here over
its DevTools port on the Pod's 127.0.0.1, and Done has the Jupyter container read
its cookies and write them there, outside its home, 0600 in 0700. No cookie
crosses into agent-runtimes; what it keeps of the session is its state and the
session cookie's expiry.

Pure but for the files, the browser and the MCP server it restarts.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from agent_runtimes.apps.browser import (
    Browser,
    PageSeen,
    browser_of,
    browser_running,
    close_browser,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SessionProvider:
    """A site whose MCP server reads through a person's browser session."""

    #: The provider's id, as the routes and the chat name it.
    id: str
    #: Its name, as the person reads it.
    name: str
    #: The MCP server of the catalogue that reads the session.
    server: str
    #: Where the person signs in.
    login_url: str
    #: The addresses whose cookies make the session.
    cookie_urls: tuple[str, ...]
    #: The cookie without which there is no session.
    session_cookie: str
    #: The person's secret that holds that cookie, pasted in Settings (``""``: none).
    settings_secret: str = ""
    #: Where the cookie is set, as the provider sets it.
    cookie_domain: str = ""


LINKEDIN = SessionProvider(
    id="linkedin",
    name="LinkedIn",
    server="linkedin",
    login_url="https://www.linkedin.com/login",
    cookie_urls=("https://www.linkedin.com/", "https://linkedin.com/"),
    session_cookie="li_at",
    settings_secret="LINKEDIN_LI_AT",
    cookie_domain=".linkedin.com",
)

PROVIDERS: Dict[str, SessionProvider] = {LINKEDIN.id: LINKEDIN}

#: The source runtime the session is written for: never the server's own, so
#: it always derives a fresh browser profile from the cookies (its "bridge"),
#: whatever the machine it runs on.
SOURCE_RUNTIME = "datalayer-browser-session"

#: The file that marks the profile directory as one this module wrote.
PROFILE_MARK = ".datalayer-browser-session"

#: Where a session came from, as ``source-state.json`` says it: signed in from
#: the chat, or the person's pasted in Settings.
FROM_SIGN_IN = "sign-in"
FROM_SETTINGS = "settings"

#: How long a pasted ``li_at`` is taken to live: LinkedIn's last about a year.
SETTINGS_COOKIE_SECONDS = 365 * 24 * 3600


class SessionRefused(Exception):
    """A browser session that cannot be made here, in a sentence."""

    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail


def provider_of(provider_id: str) -> SessionProvider:
    """The provider named, or refused in a sentence."""
    provider = PROVIDERS.get(provider_id)
    if provider is None:
        raise SessionRefused(
            404,
            f"No browser session is made for {provider_id!r}: "
            f"{', '.join(sorted(PROVIDERS))} only.",
        )
    return provider


def provider_of_server(server_id: str) -> Optional[SessionProvider]:
    """The browser session an MCP server of the catalogue reads through, if any."""
    for provider in PROVIDERS.values():
        if provider.server == server_id:
            return provider
    return None


def _browser_key(provider: SessionProvider) -> str:
    """The runtime's browser for this session, apart from every agent's."""
    return f"browser-session:{provider.id}"


def profile_dir(environ: Optional[Dict[str, str]] = None) -> Path:
    """Where the LinkedIn server keeps its profile: ``USER_DATA_DIR``, else its default."""
    env = os.environ if environ is None else environ
    return Path(env.get("USER_DATA_DIR") or "~/.linkedin-mcp/profile").expanduser()


def auth_root(environ: Optional[Dict[str, str]] = None) -> Path:
    """The directory beside the profile, where its session files are."""
    return profile_dir(environ).parent


def playwright_cookie(cookie: Dict[str, Any]) -> Dict[str, Any]:
    """A DevTools cookie, as Playwright's ``add_cookies`` takes it."""
    same_site = str(cookie.get("sameSite") or "Lax")
    if same_site not in ("Lax", "Strict", "None"):
        same_site = "Lax"
    expires = cookie.get("expires")
    session = bool(cookie.get("session")) or not isinstance(expires, (int, float))
    return {
        "name": str(cookie.get("name") or ""),
        "value": str(cookie.get("value") or ""),
        "domain": str(cookie.get("domain") or ""),
        "path": str(cookie.get("path") or "/"),
        "expires": -1 if session else float(expires),  # type: ignore[arg-type]
        "httpOnly": bool(cookie.get("httpOnly")),
        "secure": bool(cookie.get("secure")),
        "sameSite": same_site,
    }


def settings_cookie_of(
    provider: SessionProvider, value: str, now: Optional[float] = None
) -> Dict[str, Any]:
    """The person's pasted session as the cookie the browser would hold, DevTools' shape."""
    moment = time.time() if now is None else now
    return {
        "name": provider.session_cookie,
        "value": value,
        "domain": provider.cookie_domain,
        "path": "/",
        "expires": float(int(moment) + SETTINGS_COOKIE_SECONDS),
        "httpOnly": True,
        "secure": True,
        "sameSite": "None",
    }


def probe_li_at(value: str, timeout: float = 15.0) -> str:
    """
    Whether LinkedIn signs in with an ``li_at``: ``accepted``, ``refused`` or ``unchecked``.

    One read of the feed, its redirect not followed: LinkedIn answers a live
    session with the page, and a dead one by deleting it (``Set-Cookie:
    li_at=delete me``, ``Max-Age=0``; seen 15 November 2026 with a fake value)
    or with its login or a checkpoint (``refused``). Anything
    else — its bot wall (999), no network — is ``unchecked``, and
    the session is kept: the server says more when it reads. Its standard
    library alone: the Jupyter container runs this very function. Never says
    any part of the value.
    """
    import http.client
    import ssl

    if not value or any(c in value for c in ' ;,"\r\n\t') or not value.isprintable():
        return "refused"
    try:
        connection = http.client.HTTPSConnection(
            "www.linkedin.com", timeout=timeout, context=ssl.create_default_context()
        )
        try:
            connection.request(
                "GET",
                "/feed/",
                headers={
                    "Cookie": "li_at=" + value,
                    "User-Agent": (
                        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
                    ),
                    "Accept": "text/html,application/xhtml+xml",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            response = connection.getresponse()
            status = response.status
            location = str(response.getheader("Location") or "").lower()
            set_cookies = [
                str(header).lower()
                for name, header in (response.getheaders() or [])
                if str(name).lower() == "set-cookie"
            ]
            response.read(1024)
        finally:
            connection.close()
    except Exception:
        return "unchecked"
    if any(
        cookie.startswith("li_at=") and ("delete me" in cookie or "max-age=0" in cookie)
        for cookie in set_cookies
    ):
        return "refused"
    if status == 200:
        return "accepted"
    if 300 <= status < 400 and any(
        word in location
        for word in ("/login", "/authwall", "/uas/login", "/signup", "/checkpoint")
    ):
        return "refused"
    return "unchecked"


def _private_write(path: Path, text: str) -> None:
    """Write a file only its owner reads, replacing it whole."""
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as written:
        written.write(text)
    os.replace(temporary, path)


def write_linkedin_session(
    cookies: List[Dict[str, Any]],
    environ: Optional[Dict[str, str]] = None,
    now: Optional[float] = None,
    origin: str = FROM_SIGN_IN,
) -> Path:
    """
    Write a LinkedIn session where ``mcp-server-linkedin`` reads one made elsewhere.

    ``cookies.json`` (Playwright's cookies) and ``source-state.json`` in the
    directory above its profile, and the profile directory marked, so that the
    server finds a session and derives a fresh browser profile from it.

    Parameters
    ----------
    cookies : list of dict
        The browser's LinkedIn cookies, as DevTools gives them.
    environ : dict, optional
        The server's environment (``USER_DATA_DIR``); the process's when unsaid.
    now : float, optional
        The moment written, epoch seconds; the clock's when unsaid.
    origin : str
        Where it came from: :data:`FROM_SIGN_IN` or :data:`FROM_SETTINGS`.

    Returns
    -------
    Path
        The directory the session was written in.

    Raises
    ------
    SessionRefused
        When the cookies hold no LinkedIn session.
    """
    if not any(
        c.get("name") == LINKEDIN.session_cookie and c.get("value") for c in cookies
    ):
        raise SessionRefused(
            409,
            "LinkedIn did not sign you in yet: finish signing in on its page, then press Done.",
        )
    profile = profile_dir(environ)
    root = profile.parent
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    profile.mkdir(mode=0o700, parents=True, exist_ok=True)
    for directory in (root, profile):
        os.chmod(directory, 0o700)
    cookies_path = root / "cookies.json"
    _private_write(
        cookies_path, json.dumps([playwright_cookie(c) for c in cookies], indent=2)
    )
    created = datetime.fromtimestamp(time.time() if now is None else now, timezone.utc)
    _private_write(
        root / "source-state.json",
        json.dumps(
            {
                "version": 1,
                "source_runtime_id": SOURCE_RUNTIME,
                "login_generation": str(uuid.uuid4()),
                "created_at": created.isoformat().replace("+00:00", "Z"),
                "profile_path": str(profile),
                "cookies_path": str(cookies_path),
                "origin": origin,
            },
            indent=2,
        ),
    )
    _private_write(
        profile / PROFILE_MARK, "Written by agent-runtimes' browser session.\n"
    )
    return root


def session_state(
    provider: SessionProvider,
    environ: Optional[Dict[str, str]] = None,
    now: Optional[float] = None,
) -> str:
    """
    What the runtime holds of a person's session: ``signed-in``, ``expired`` or ``none``.

    Read from the files alone, never their values but the session cookie's
    expiry.
    """
    if provider.id != LINKEDIN.id:
        return "none"
    if environ is None and in_jupyter(provider):
        return _held_state(provider, now)
    path = auth_root(environ) / "cookies.json"
    try:
        cookies = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return "none"
    moment = time.time() if now is None else now
    for cookie in cookies if isinstance(cookies, list) else []:
        if isinstance(cookie, dict) and cookie.get("name") == provider.session_cookie:
            expires = cookie.get("expires")
            if isinstance(expires, (int, float)) and 0 < expires < moment:
                return "expired"
            return "signed-in"
    return "none"


def session_origin(environ: Optional[Dict[str, str]] = None) -> str:
    """Where the session this runtime holds came from, read off ``source-state.json``; ``""`` when none."""
    try:
        state = json.loads(
            (auth_root(environ) / "source-state.json").read_text(encoding="utf-8")
        )
    except (OSError, ValueError):
        return ""
    return str(state.get("origin") or FROM_SIGN_IN) if isinstance(state, dict) else ""


def forget(provider: SessionProvider, environ: Optional[Dict[str, str]] = None) -> None:
    """Remove the person's session: its files and its derived profiles."""
    if provider.id != LINKEDIN.id:
        return
    root = auth_root(environ)
    for name in ("cookies.json", "source-state.json"):
        try:
            (root / name).unlink()
        except FileNotFoundError:
            pass
    shutil.rmtree(profile_dir(environ), ignore_errors=True)
    shutil.rmtree(root / "runtime-profiles", ignore_errors=True)


def refuse_here() -> None:
    """Refuse a browser session on a runtime that is nobody's own."""
    from agent_runtimes.apps.visitors import visitors_runtime

    if visitors_runtime():
        raise SessionRefused(
            403, "Without an account there is no browser session: sign in to use it."
        )


def _server_known(provider: SessionProvider) -> bool:
    """Whether this runtime's agents use the provider's server."""
    try:
        from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager

        return get_mcp_lifecycle_manager().knows(provider.server)
    except Exception:
        return False


def on_musl() -> bool:
    """Whether this runtime's C library is musl (Alpine): the runtime image's."""
    import glob
    import platform
    import sys

    if not sys.platform.startswith("linux"):
        return False
    return bool(glob.glob("/lib/ld-musl-*")) or platform.libc_ver()[0] == ""


def in_jupyter(provider: SessionProvider) -> bool:
    """
    Whether the provider's server, its sign-in browser and its session are the Jupyter container's.

    On a musl runtime (the platform's Alpine image) whose Pod has a Jupyter
    container: the image the server and its browser driver run on.
    """
    from agent_runtimes.mcp import jupyter_host

    return (
        provider.id == LINKEDIN.id
        and on_musl()
        and jupyter_host.hosts(provider.server)
        and jupyter_host.available()
    )


def server_runs_here(provider: SessionProvider) -> str:
    """
    Why the provider's server cannot run for this runtime, or ``""`` when it can.

    ``mcp-server-linkedin`` drives its browser with patchright, which publishes
    no build for musl: on the platform's Alpine runtime image it runs in the
    Pod's Jupyter container (:func:`in_jupyter`); a musl runtime without one
    cannot run it, and no session would help.
    """
    if provider.id == LINKEDIN.id and on_musl() and not in_jupyter(provider):
        return (
            "LinkedIn's full access needs its MCP server, which does not run on "
            "this runtime's image (its browser driver has no Alpine build) and "
            "this runtime has no Jupyter container to run it in."
        )
    return ""


#: What the runtime knows of a session the Jupyter container holds: its state
#: and its session cookie's expiry, never a cookie. None until asked.
_HELD: Dict[str, Dict[str, Any]] = {}


def _held_state(provider: SessionProvider, now: Optional[float] = None) -> str:
    """The state of a session the Jupyter container holds, as last learned."""
    held = _HELD.get(provider.id)
    if not held or held.get("state") != "signed-in":
        return "none"
    expires = held.get("expires")
    moment = time.time() if now is None else now
    if isinstance(expires, (int, float)) and 0 < expires < moment:
        return "expired"
    return "signed-in"


async def refresh(provider: SessionProvider) -> None:
    """Learn what the Jupyter container holds, once, when it was never asked."""
    if provider.id in _HELD or not in_jupyter(provider):
        return
    from agent_runtimes.mcp import jupyter_host

    try:
        _HELD[provider.id] = await jupyter_host.session_state(
            provider.id, provider.session_cookie
        )
    except Exception as error:
        logger.warning(
            "What the Jupyter container holds of %s is unknown: %s",
            provider.name,
            type(error).__name__,
        )


#: What came of the person's session pasted in Settings, by provider, on this
#: runtime: ``used`` (written for the server: LinkedIn took it, or could not be
#: asked), ``refused`` (LinkedIn sent it to its login), ``kept`` (a session
#: signed in from the chat was there, and stays). None until it was tried.
_SETTINGS: Dict[str, str] = {}

#: The providers whose Settings session was tried on this runtime: once, at the
#: server's first start; a restart after a sign-in never writes it again.
_TRIED: Set[str] = set()

#: The providers signed out of on this runtime: their Settings session is not
#: written again here (the Vault keeps it for the next runtime).
_SIGNED_OUT: Set[str] = set()


def settings_refused_words(provider: SessionProvider) -> str:
    """What the chat says when LinkedIn sent the pasted session to its login."""
    return f"Your {provider.name} session in Settings no longer works: paste a new one."


def settings_refused(provider: SessionProvider) -> bool:
    """
    Whether LinkedIn refused the session pasted in Settings, and none was signed in since.

    The server is then not started (``MCPLifecycleManager._seed_browser_session``):
    its tools would fail at each call; without them the agent says it cannot
    read LinkedIn, the chat's header says why, and *Sign in to LinkedIn* stays.
    """
    return _SETTINGS.get(provider.id) == "refused" and session_state(provider) != (
        "signed-in"
    )


def settings_refused_reason(provider: SessionProvider) -> str:
    """What the server's failure says, to the agent's host and the chat."""
    return (
        f"{provider.name} reading is unavailable on this runtime: "
        f"{settings_refused_words(provider)} (Settings › {provider.name}), "
        f"or sign in to {provider.name} from the chat."
    )


def settings_cookie(provider: SessionProvider) -> str:
    """
    The person's session pasted in Settings, as this runtime was given it; ``""`` when none here.

    Never on a visitors' runtime nor a deployment's (the catalogue gives it to
    neither: a person's own runtime alone), nor once the person signed out here.
    """
    if not provider.settings_secret or provider.id in _SIGNED_OUT:
        return ""
    from agent_runtimes.apps.visitors import visitors_runtime
    from agent_runtimes.guardrails.declared_secrets import on_a_deployment

    try:
        if visitors_runtime() or on_a_deployment():
            return ""
    except Exception:
        return ""
    return os.environ.get(provider.settings_secret, "").strip()


async def seed(provider: SessionProvider) -> str:
    """
    Write the person's session pasted in Settings as the server's, before it first starts.

    In the Jupyter container when the server runs there (handed over the Pod's
    loopback, never in a cell's code), else beside the server's profile here;
    LinkedIn asked once whether it signs in. A session signed in from the chat
    is never overwritten. Never logs, says or returns any part of the value.

    Returns
    -------
    str
        What came of it (:data:`_SETTINGS`), ``""`` when there was nothing to do.
    """
    if provider.id in _TRIED:
        return ""
    value = settings_cookie(provider)
    if not value:
        return ""
    _TRIED.add(provider.id)
    from agent_runtimes.guardrails.credentials import hold

    # Withheld wherever it would be shown: an answer, a tool's result, a log.
    hold(value)
    if in_jupyter(provider):
        from agent_runtimes.mcp import jupyter_host

        answer = await jupyter_host.seed_session(
            provider.id,
            value,
            settings_cookie_of(provider, ""),
            provider.session_cookie,
            SOURCE_RUNTIME,
            PROFILE_MARK,
        )
        outcome = str(answer.get("settings") or "used")
        _HELD[provider.id] = {
            "state": answer.get("state"),
            "expires": answer.get("expires"),
        }
    elif session_state(provider) == "signed-in" and session_origin() == FROM_SIGN_IN:
        outcome = "kept"
    elif probe_li_at(value) == "refused":
        if session_origin() == FROM_SETTINGS:
            forget(provider)
        outcome = "refused"
    else:
        write_linkedin_session(
            [settings_cookie_of(provider, value)], origin=FROM_SETTINGS
        )
        outcome = "used"
    del value
    _SETTINGS[provider.id] = outcome
    logger.info("The %s session in Settings: %s", provider.name, outcome)
    return outcome


def status(provider: SessionProvider) -> Dict[str, Any]:
    """What the chat is told: the session's state, and whether one is being made."""
    browsing = browser_running(_browser_key(provider)) is not None
    settings = _SETTINGS.get(provider.id, "none")
    return {
        "provider": provider.id,
        "name": provider.name,
        "server": provider.server,
        "offered": _server_known(provider) and not server_runs_here(provider),
        "unavailable": server_runs_here(provider),
        "state": session_state(provider),
        "signingIn": browsing,
        # The session pasted in Settings: never its value, what came of it.
        "settings": "used" if settings == "kept" else settings,
        "notice": settings_refused_words(provider) if settings == "refused" else "",
    }


def _factory(provider: SessionProvider) -> Optional[Any]:
    """Where the sign-in browser starts: the Jupyter container, or here."""
    if not in_jupyter(provider):
        return None
    from agent_runtimes.apps.browser import SIGNIN_FLAGS, ChromiumBrowser
    from agent_runtimes.mcp import jupyter_host

    async def launch() -> Browser:
        # Headful on the Jupyter container's virtual display, clicked and
        # typed as a hand would: reCAPTCHA Enterprise scored the headless one,
        # clicked in an instant and typed with no key, a bot (r1, 15 November 2026).
        port = await jupyter_host.start_browser(provider.id, list(SIGNIN_FLAGS))

        async def stop() -> None:
            await jupyter_host.stop_browser(provider.id)

        return await ChromiumBrowser.attach(port, stop, humane=True)

    return launch


async def start(provider: SessionProvider) -> Dict[str, Any]:
    """Start the runtime's browser at the provider's login page."""
    refuse_here()
    unavailable = server_runs_here(provider)
    if unavailable:
        raise SessionRefused(409, unavailable)
    browser = await browser_of(_browser_key(provider), _factory(provider))
    seen = await browser.open(provider.login_url)
    logger.info("A %s browser session is being signed in", provider.name)
    return {"page": seen.describe()}


async def held(provider: SessionProvider) -> Browser:
    """The session's browser, or refused when none is being signed in."""
    browser = browser_running(_browser_key(provider))
    if browser is None:
        raise SessionRefused(
            409,
            f"No {provider.name} sign-in is open: press Sign in to {provider.name} again.",
        )
    return browser


async def screenshot(provider: SessionProvider) -> bytes:
    """The login page as it shows."""
    return await (await held(provider)).screenshot()


async def step(provider: SessionProvider, kind: str, body: Dict[str, Any]) -> PageSeen:
    """One of the person's steps on the login page: a click, typing, a key, a scroll."""
    browser = await held(provider)
    if kind == "click":
        return await browser.click_at(float(body.get("x", 0)), float(body.get("y", 0)))
    if kind == "type":
        return await browser.type_text(str(body.get("text") or ""))
    if kind == "key":
        return await browser.press(str(body.get("key") or ""))
    if kind == "scroll":
        return await browser.scroll(float(body.get("dy", 0)))
    raise SessionRefused(422, f"{kind!r} is no step: click, type, key or scroll.")


async def _keep_in_jupyter(provider: SessionProvider, browser: Browser) -> None:
    """Have the Jupyter container read the sign-in browser's cookies and keep them there."""
    from agent_runtimes.mcp import jupyter_host

    port = getattr(browser, "devtools_port", None)
    if not isinstance(port, int):
        raise SessionRefused(501, "This runtime's browser does not give its cookies.")
    kept = await jupyter_host.keep_session(
        provider.id,
        port,
        list(provider.cookie_urls),
        provider.session_cookie,
        SOURCE_RUNTIME,
        PROFILE_MARK,
    )
    if kept.get("refused"):
        raise SessionRefused(
            409,
            f"{provider.name} did not sign you in yet: finish signing in on its page, then press Done.",
        )
    _HELD[provider.id] = {"state": kept.get("state"), "expires": kept.get("expires")}


async def finish(provider: SessionProvider) -> Dict[str, Any]:
    """
    Keep the session the person signed in, close the browser, start the server again.

    Raises
    ------
    SessionRefused
        When the page holds no session yet.
    """
    refuse_here()
    browser = await held(provider)
    if in_jupyter(provider):
        await _keep_in_jupyter(provider, browser)
    else:
        read = getattr(browser, "cookies", None)
        if read is None:
            raise SessionRefused(
                501, "This runtime's browser does not give its cookies."
            )
        cookies = await read(list(provider.cookie_urls))
        write_linkedin_session(cookies)
    await close_browser(_browser_key(provider))
    # Signed in from the chat: what was said of the Settings session is past.
    _SETTINGS.pop(provider.id, None)
    logger.info("A %s browser session was kept for this runtime", provider.name)
    restarted = False
    if _server_known(provider):
        from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager

        try:
            restarted = await asyncio.wait_for(
                get_mcp_lifecycle_manager().restart(provider.server), 180
            )
        except Exception as error:  # the session is kept; the server says why
            logger.warning(
                "%s did not start again: %s", provider.server, type(error).__name__
            )
    return {**status(provider), "restarted": restarted}


async def cancel(provider: SessionProvider) -> Dict[str, Any]:
    """Close the sign-in without keeping anything."""
    await close_browser(_browser_key(provider))
    return status(provider)


async def sign_out(provider: SessionProvider) -> Dict[str, Any]:
    """
    Forget the session and start the server again, without it.

    The runtime's copy alone: a session pasted in Settings stays in the Vault,
    for the next runtime, and is not written again on this one.
    """
    await close_browser(_browser_key(provider))
    _SIGNED_OUT.add(provider.id)
    _SETTINGS.pop(provider.id, None)
    if in_jupyter(provider):
        from agent_runtimes.mcp import jupyter_host

        _HELD[provider.id] = await jupyter_host.forget(
            provider.id, provider.session_cookie
        )
    else:
        forget(provider)
    if _server_known(provider):
        from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager

        try:
            await get_mcp_lifecycle_manager().stop_server(provider.server)
        except Exception:
            pass
    return status(provider)


__all__ = [
    "LINKEDIN",
    "PROVIDERS",
    "SOURCE_RUNTIME",
    "SessionProvider",
    "SessionRefused",
    "auth_root",
    "cancel",
    "finish",
    "forget",
    "in_jupyter",
    "playwright_cookie",
    "profile_dir",
    "probe_li_at",
    "provider_of",
    "provider_of_server",
    "refresh",
    "seed",
    "session_origin",
    "settings_cookie",
    "settings_refused",
    "settings_refused_reason",
    "settings_cookie_of",
    "screenshot",
    "session_state",
    "sign_out",
    "start",
    "status",
    "step",
    "write_linkedin_session",
]
