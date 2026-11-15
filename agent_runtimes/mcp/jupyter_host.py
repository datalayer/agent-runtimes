# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What runs in the runtime's Jupyter container: a server, a browser, a session.

The user, 15 November 2026: "OK in the jupyter which is not a sidecar, but a
container as such - no new sidecar/container, reuse the existing jupyter one."

A cloud runtime's Pod has two containers this module knows: agent-runtimes
(Alpine, musl) and Jupyter (the environment's image, Debian, glibc), on one
network — the Pod's 127.0.0.1 — but on separate disks. The agent-runtimes
container already reaches the Jupyter one through its server and kernels: its
agents' code runs there (``AGENT_RUNTIMES_JUPYTER_SANDBOX``, the sandbox of
:mod:`agent_runtimes.services.code_sandbox_manager`), and so do their skills'
scripts. What its own image cannot run is started the same way: a short cell,
in a kernel of its own that is shut down after it, starts a process in its own
session (it outlives the kernel), and agent-runtimes reaches what it serves on
127.0.0.1.

What runs there:

- the catalogue's ``linkedin`` MCP server (``mcp-server-linkedin``, whose
  browser driver, patchright, has no musl build), over Streamable HTTP bound to
  127.0.0.1 on a port chosen at its start (:func:`start_server`);
- the Chromium a person signs in to LinkedIn with, headful on a virtual
  display (Xvfb) started with it, driven over its DevTools port from
  agent-runtimes as its own browser is (:func:`start_browser`);
- the session it leaves: the cookies are read off that browser and written
  *in the Jupyter container*, under :data:`SESSIONS_ROOT` (0600 in 0700, outside
  the home, so neither the file browser nor a snapshot of the home sees it),
  where the server reads it (:func:`keep_session`). A cookie never crosses into
  agent-runtimes, nor into a cell's code, a log or an answer: the cells carry
  ports, paths and process ids alone;
- or the person's session pasted in Settings › LinkedIn (``LINKEDIN_LI_AT``,
  their Vault's, given to this runtime: the user, 15 November 2026), written
  there the same way before the server first starts (:func:`seed_session`).
  It is handed over the Pod's 127.0.0.1, once, to the cell that names a
  nonce (:class:`Handoff`): the cell's code — what a kernel's history keeps —
  holds a port and a nonce, never the value, and so do its answer and its log.

The Jupyter container is the runtime's, one person's, and gone with the Pod.
"""

from __future__ import annotations

import asyncio
import hmac
import inspect
import json
import logging
import os
import secrets
import socket
import threading
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

#: The Jupyter server of the runtime's Pod, its token in its query.
JUPYTER_SANDBOX_ENV = "AGENT_RUNTIMES_JUPYTER_SANDBOX"

#: Where the sessions are kept in the Jupyter container: never under its home.
SESSIONS_ROOT = "/tmp/.datalayer-browser-sessions"  # nosec B108 - the Jupyter container's, made 0700 there, one person's

#: What the Jupyter container runs for a server of the catalogue, by its id.
SERVER_COMMANDS: Dict[str, List[str]] = {"linkedin": ["mcp-server-linkedin"]}

#: The browsers the Jupyter image carries (Playwright's, patchright's).
BROWSERS_GLOB = "/opt/playwright/chromium-*/chrome-linux*/chrome"

#: The virtual display the sign-in browser runs headful on: Xvfb, its sockets'
#: directory (its lock files are beside it), and the screen, larger than the
#: browser's window as a person's is. reCAPTCHA Enterprise scored the headless
#: browser a bot on LinkedIn's sign-in (r1, 15 November 2026).
XVFB_COMMAND = ["Xvfb"]
X11_SOCKETS = "/tmp/.X11-unix"  # nosec B108 - X's own, in the Jupyter container
SCREEN = "1920x1080x24"

#: How the answer of a cell is told apart from what else it printed.
MARK = "__datalayer_jupyter_host__"

#: How long a server is given to listen, and a browser to start, in seconds.
SERVER_WAIT = 120.0
BROWSER_WAIT = 60.0

_LOCK: Optional[asyncio.Lock] = None

#: Where each server the Jupyter container runs listens, by its id, while it runs.
_HOSTED: Dict[str, str] = {}

#: The port each server last listened on, asked for again at its next start.
_PORTS: Dict[str, int] = {}


class JupyterHostFailed(RuntimeError):
    """The Jupyter container did not do what it was asked, in a sentence."""


def jupyter_url() -> str:
    """The runtime's Jupyter server, or ``""`` when its Pod has none."""
    named = os.environ.get(JUPYTER_SANDBOX_ENV, "").strip()
    if named:
        return named
    try:
        from agent_runtimes.services.code_sandbox_manager import (
            get_code_sandbox_manager,
        )

        config = get_code_sandbox_manager().config
        if config.variant == "jupyter-server" and config.jupyter_url:
            if config.jupyter_token and "token=" not in config.jupyter_url:
                separator = "&" if "?" in config.jupyter_url else "?"
                return f"{config.jupyter_url}{separator}token={config.jupyter_token}"
            return str(config.jupyter_url)
    except Exception:
        pass
    return ""


def available() -> bool:
    """Whether this runtime has a Jupyter container to run things in."""
    return bool(jupyter_url())


def hosts(server_id: str) -> bool:
    """Whether the Jupyter container runs this server of the catalogue."""
    return server_id in SERVER_COMMANDS


# --- a value handed over the Pod's loopback -------------------------------------------------


class Handoff:
    """
    One value, handed once over the Pod's 127.0.0.1 to the cell that names its nonce.

    What keeps a secret out of a cell's code, which a kernel's history keeps:
    the cell carries the port and the nonce, and reads the value from here. It
    listens on the loopback alone, answers the first connection that sends the
    nonce and nothing else, and closes after it or after ``timeout`` seconds.
    """

    def __init__(self, value: str, timeout: float = 120.0) -> None:
        self._value = value.encode("utf-8")
        self.nonce = secrets.token_hex(16)
        self.handed = False
        self._deadline = time.monotonic() + timeout
        self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._socket.bind(("127.0.0.1", 0))
        self._socket.listen(4)
        self._socket.settimeout(0.5)
        self.port = int(self._socket.getsockname()[1])
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    def _serve(self) -> None:
        try:
            while time.monotonic() < self._deadline and not self.handed:
                try:
                    connection, _ = self._socket.accept()
                except (socket.timeout, OSError):
                    continue
                with connection:
                    try:
                        connection.settimeout(5)
                        said = b""
                        while b"\n" not in said and len(said) < 128:
                            chunk = connection.recv(128)
                            if not chunk:
                                break
                            said += chunk
                        if hmac.compare_digest(
                            said.split(b"\n")[0].strip(), self.nonce.encode()
                        ):
                            connection.sendall(self._value)
                            self.handed = True
                    except OSError:
                        continue
        finally:
            self._value = b""
            try:
                self._socket.close()
            except OSError:
                pass

    def close(self) -> None:
        """Stop listening, whether or not it was handed."""
        self._deadline = 0.0
        self._thread.join(5)


# --- the cell -----------------------------------------------------------------------------


def _playwright_cookie_source() -> str:
    """The one conversion of a DevTools cookie, shared with the runtime's own path."""
    from agent_runtimes.mcp.browser_session import playwright_cookie

    return inspect.getsource(playwright_cookie)


def _probe_source() -> str:
    """The one question to LinkedIn of a pasted session, shared with the runtime's own path."""
    from agent_runtimes.mcp.browser_session import probe_li_at

    return inspect.getsource(probe_li_at)


#: What runs in the Jupyter container's kernel. Its standard library and
#: tornado (Jupyter's own) alone; every name kept inside ``_dl_host``.
_CELL = r"""
def _dl_host(raw):
    import asyncio, glob, json, os, shutil, signal, socket, subprocess, threading, time, uuid
    from typing import Any, Dict
    from datetime import datetime, timezone
    args = json.loads(raw)
    root = os.path.join(args["sessions"], args["provider"])
    # The server's own directory, apart from what runs it: it takes the
    # profile's parent whole (it rotates and clears it), and refuses one that
    # holds files not its own.
    auth = os.path.join(root, "auth")
    profile = os.path.join(auth, "profile")

    def private_dir(path):
        os.makedirs(path, mode=0o700, exist_ok=True)
        os.chmod(path, 0o700)

    def private_write(path, text):
        temporary = "%s.%s" % (path, uuid.uuid4().hex)
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as written:
            written.write(text)
        os.replace(temporary, path)

    def kill(name):
        path = os.path.join(root, name + ".pid")
        try:
            pid = int(open(path).read().strip())
        except (OSError, ValueError):
            return False
        def reaped():
            try:
                return os.waitpid(pid, os.WNOHANG)[0] == pid
            except ChildProcessError:
                return False
        try:
            os.killpg(pid, signal.SIGTERM)
            for _ in range(50):
                if reaped():
                    break
                os.kill(pid, 0)
                time.sleep(0.1)
            else:
                os.killpg(pid, signal.SIGKILL)
                reaped()
        except (ProcessLookupError, PermissionError):
            pass
        try:
            os.unlink(path)
        except OSError:
            pass
        return True

    def free_port():
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            return probe.getsockname()[1]

    def listens(port):
        with socket.socket() as probe:
            probe.settimeout(1)
            return probe.connect_ex(("127.0.0.1", port)) == 0

    def tail(path, lines=30):
        try:
            with open(path, encoding="utf-8", errors="replace") as read:
                return "".join(read.readlines()[-lines:])
        except OSError:
            return ""

    def started(name, command, env):
        private_dir(root)
        log = os.path.join(root, name + ".log")
        descriptor = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        process = subprocess.Popen(
            command, env=env, cwd=root, stdin=subprocess.DEVNULL,
            stdout=descriptor, stderr=descriptor, start_new_session=True,
        )
        os.close(descriptor)
        private_write(os.path.join(root, name + ".pid"), str(process.pid))
        return process, log

    def cookies_of(port, urls):
        from urllib.request import urlopen
        from tornado.websocket import websocket_connect
        targets = json.load(urlopen("http://127.0.0.1:%d/json/list" % port, timeout=10))
        pages = [t for t in targets if t.get("type") == "page"]
        if not pages:
            raise RuntimeError("the sign-in browser has no page")
        async def ask():
            connection = await websocket_connect(pages[0]["webSocketDebuggerUrl"], max_message_size=64 * 1024 * 1024)
            try:
                connection.write_message(json.dumps({"id": 1, "method": "Network.getCookies", "params": {"urls": urls}}))
                while True:
                    message = await asyncio.wait_for(connection.read_message(), 20)
                    if message is None:
                        raise RuntimeError("the sign-in browser closed its connection")
                    answer = json.loads(message)
                    if answer.get("id") == 1:
                        return list((answer.get("result") or {}).get("cookies") or [])
            finally:
                connection.close()
        box = {}
        def run():
            try:
                box["cookies"] = asyncio.run(ask())
            except BaseException as error:
                box["error"] = error
        worker = threading.Thread(target=run)
        worker.start()
        worker.join(40)
        if "error" in box:
            raise box["error"]
        return box.get("cookies") or []

    def state():
        try:
            cookies = json.load(open(os.path.join(auth, "cookies.json"), encoding="utf-8"))
        except (OSError, ValueError):
            return {"state": "none", "expires": None}
        for cookie in cookies if isinstance(cookies, list) else []:
            if isinstance(cookie, dict) and cookie.get("name") == args.get("session_cookie"):
                expires = cookie.get("expires")
                return {"state": "signed-in", "expires": expires if isinstance(expires, (int, float)) and expires > 0 else None}
        return {"state": "none", "expires": None}

    PLAYWRIGHT_COOKIE

    PROBE_LI_AT

    def received(port, nonce):
        # The value from agent-runtimes, over the Pod's loopback: never in this code.
        with socket.create_connection(("127.0.0.1", int(port)), timeout=10) as connection:
            connection.sendall((nonce + "\n").encode())
            chunks = []
            while True:
                chunk = connection.recv(65536)
                if not chunk:
                    break
                chunks.append(chunk)
        return b"".join(chunks).decode("utf-8").strip()

    def origin():
        try:
            said = json.load(open(os.path.join(auth, "source-state.json"), encoding="utf-8"))
        except (OSError, ValueError):
            return ""
        return str(said.get("origin") or "sign-in") if isinstance(said, dict) else ""

    def write_session(cookies, made_from):
        private_dir(root)
        private_dir(auth)
        private_dir(profile)
        cookies_path = os.path.join(auth, "cookies.json")
        private_write(cookies_path, json.dumps([playwright_cookie(c) for c in cookies], indent=2))
        private_write(os.path.join(auth, "source-state.json"), json.dumps({
            "version": 1,
            "source_runtime_id": args["source_runtime"],
            "login_generation": str(uuid.uuid4()),
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "profile_path": profile,
            "cookies_path": cookies_path,
            "origin": made_from,
        }, indent=2))
        private_write(os.path.join(profile, args["profile_mark"]), "Written by agent-runtimes' browser session.\n")

    def forget_session():
        for name in ("cookies.json", "source-state.json"):
            try:
                os.unlink(os.path.join(auth, name))
            except OSError:
                pass
        shutil.rmtree(profile, ignore_errors=True)
        shutil.rmtree(os.path.join(auth, "runtime-profiles"), ignore_errors=True)

    do = args["do"]
    answer: Dict[str, Any] = {}
    if do in ("start-server", "start-browser", "keep-session", "seed-session"):
        private_dir(args["sessions"])
    if do == "start-server":
        kill("server")
        private_dir(root)
        # The port it had, when free again: codemode's registry keeps the
        # server's address, so a restart (after a sign-in) keeps it too.
        port = int(args.get("port") or 0)
        if not port or listens(port):
            port = free_port()
        env = {
            "HOME": os.environ.get("HOME", "/home/datalayer"),
            "PATH": "/opt/linkedin-mcp/bin:/usr/local/bin:/usr/bin:/bin",
            "LANG": "C.UTF-8",
            "PLAYWRIGHT_BROWSERS_PATH": "/opt/playwright",
            "USER_DATA_DIR": profile,
        }
        env.update(args.get("env") or {})
        command = list(args["command"]) + [
            "--transport", "streamable-http", "--host", "127.0.0.1",
            "--port", str(port), "--path", "/mcp",
        ]
        if shutil.which(command[0], path=env["PATH"]) is None:
            answer = {"error": "%s is not installed in this Jupyter container" % command[0]}
        else:
            process, log = started("server", command, env)
            deadline = time.time() + args["wait"]
            while time.time() < deadline and process.poll() is None and not listens(port):
                time.sleep(0.25)
            if process.poll() is None and listens(port):
                answer = {"port": port, "pid": process.pid}
            else:
                kill("server")
                answer = {"error": "it did not listen", "tail": tail(log)}
    elif do == "stop-server":
        answer = {"stopped": kill("server")}
    elif do == "start-browser":
        kill("browser")
        kill("xvfb")
        signin = os.path.join(root, "signin")
        shutil.rmtree(signin, ignore_errors=True)
        private_dir(root)
        private_dir(signin)
        found = sorted(glob.glob(args["browsers"]))
        x11 = args["x11"]
        def display_free(number):
            return not os.path.exists(os.path.join(x11, "X%d" % number)) and not os.path.exists(
                os.path.join(os.path.dirname(x11), ".X%d-lock" % number))
        if not found:
            answer = {"error": "no Chromium in this Jupyter container"}
        elif shutil.which(args["xvfb"][0], path="/usr/local/bin:/usr/bin:/bin") is None:
            answer = {"error": "%s is not installed in this Jupyter container" % args["xvfb"][0]}
        else:
            # Headful, on a virtual display of its own: reCAPTCHA Enterprise
            # scores a headless browser a bot.
            number = [n for n in range(99, 300) if display_free(n)][0]
            display = ":%d" % number
            xvfb, xlog = started("xvfb", list(args["xvfb"]) + [display, "-screen", "0", args["screen"], "-nolisten", "tcp"], {"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8"})
            deadline = time.time() + args["wait"]
            while time.time() < deadline and xvfb.poll() is None and not os.path.exists(os.path.join(x11, "X%d" % number)):
                time.sleep(0.05)
            if xvfb.poll() is not None or not os.path.exists(os.path.join(x11, "X%d" % number)):
                kill("xvfb")
                answer = {"error": "its display did not start", "tail": tail(xlog)}
        if not answer:
            # As a person's Chrome says itself: LinkedIn's bot check (Cloudflare)
            # holds a browser saying HeadlessChrome on "Just a moment..." for
            # good, and lets the same one through under its regular name.
            try:
                said = subprocess.run([found[-1], "--version"], capture_output=True, text=True, timeout=20).stdout
                major = [w for w in said.split() if w[:1].isdigit()][0].split(".")[0]
            except Exception:
                major = "140"
            regular = [
                "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/%s.0.0.0 Safari/537.36" % major,
                "--disable-blink-features=AutomationControlled",
            ]
            command = [found[-1]] + list(args["flags"]) + regular + ["--user-data-dir=" + signin, "about:blank"]
            process, log = started("browser", command, {"HOME": os.environ.get("HOME", "/home/datalayer"), "PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "DISPLAY": display})
            written = os.path.join(signin, "DevToolsActivePort")
            deadline = time.time() + args["wait"]
            port = 0
            while time.time() < deadline and process.poll() is None:
                try:
                    first = open(written).read().splitlines()[:1]
                except OSError:
                    first = []
                if first and first[0].strip().isdigit():
                    port = int(first[0])
                    break
                time.sleep(0.05)
            if port:
                answer = {"port": port, "display": display}
            else:
                kill("browser")
                kill("xvfb")
                answer = {"error": "its browser did not start", "tail": tail(log)}
    elif do == "stop-browser":
        kill("browser")
        kill("xvfb")
        shutil.rmtree(os.path.join(root, "signin"), ignore_errors=True)
        answer = {"stopped": True}
    elif do == "keep-session":
        cookies = cookies_of(int(args["port"]), list(args["urls"]))
        if not any(c.get("name") == args["session_cookie"] and c.get("value") for c in cookies):
            answer = {"refused": "not-signed-in"}
        else:
            write_session(cookies, "sign-in")
            answer = state()
        del cookies
    elif do == "seed-session":
        # The person's session pasted in Settings: written for the server
        # unless one signed in from the chat is there; LinkedIn asked once.
        value = received(args["port"], args["nonce"])
        if not value:
            answer = {"settings": "none", **state()}
        elif state()["state"] == "signed-in" and origin() == "sign-in":
            answer = {"settings": "kept", **state()}
        elif args.get("probe", True) and probe_li_at(value) == "refused":
            if origin() == "settings":
                forget_session()
            answer = {"settings": "refused", **state()}
        else:
            cookie = dict(args["cookie"])
            cookie["value"] = value
            write_session([cookie], "settings")
            del cookie
            answer = {"settings": "used", **state()}
        del value
    elif do == "state":
        answer = state()
    elif do == "forget":
        forget_session()
        answer = state()
    else:
        answer = {"error": "no %r here" % do}
    print(MARK_TEXT + json.dumps(answer))
"""


def _indented(source: str) -> str:
    return "".join(
        f"    {line}\n" if line.strip() else "\n" for line in source.splitlines()
    )


def cell(operation: str, arguments: Dict[str, Any]) -> str:
    """The code a kernel of the Jupyter container runs for one operation."""
    body = (
        _CELL.replace("    PLAYWRIGHT_COOKIE\n", _indented(_playwright_cookie_source()))
        .replace("    PROBE_LI_AT\n", _indented(_probe_source()))
        .replace("MARK_TEXT", repr(MARK))
    )
    raw = json.dumps({"do": operation, "sessions": SESSIONS_ROOT, **arguments})
    return f"{body}\n_dl_host({raw!r})\ndel _dl_host\n"


def answer_of(stdout: str) -> Dict[str, Any]:
    """The answer a cell printed, or refused when it printed none."""
    for line in reversed(stdout.splitlines()):
        if line.startswith(MARK):
            answer = json.loads(line[len(MARK) :])
            if isinstance(answer, dict):
                return answer
    raise JupyterHostFailed("The Jupyter container gave no answer.")


def _run(code: str, timeout: float) -> str:
    """Run a cell in a kernel of its own on the runtime's Jupyter, and shut it down."""
    url = jupyter_url()
    if not url:
        raise JupyterHostFailed("This runtime has no Jupyter container.")
    from code_sandboxes import CodeSandboxClient

    sandbox = CodeSandboxClient.create(
        variant="jupyter-server", server_url=url, reuse_kernel=False
    ).sandbox
    sandbox.start()
    try:
        execution = sandbox.run_code(code, timeout=timeout)
    finally:
        try:
            sandbox.stop()
        except Exception:
            pass
    error = getattr(execution, "code_error", None)
    if error is not None:
        # The error's name alone: its value may quote what the cell held.
        raise JupyterHostFailed(
            f"The Jupyter container failed: {getattr(error, 'name', 'an error')}."
        )
    if getattr(execution, "execution_ok", True) is False:
        raise JupyterHostFailed("The Jupyter container did not run the cell.")
    return str(execution.logs.stdout_text)


async def call(
    operation: str, timeout: float = 180.0, **arguments: Any
) -> Dict[str, Any]:
    """One operation in the Jupyter container, one at a time, its answer."""
    global _LOCK
    if _LOCK is None:
        _LOCK = asyncio.Lock()
    code = cell(operation, arguments)
    async with _LOCK:
        stdout = await asyncio.to_thread(_run, code, timeout)
    return answer_of(stdout)


# --- a server ----------------------------------------------------------------------------


async def start_server(server_id: str, env: Dict[str, str]) -> str:
    """
    Start a server of the catalogue in the Jupyter container, its address.

    Parameters
    ----------
    server_id : str
        The server, one of :data:`SERVER_COMMANDS`.
    env : dict
        Its catalogue's environment, expanded: never the runtime's own, which
        holds the person's secrets for other servers.

    Returns
    -------
    str
        Where it listens on the Pod's 127.0.0.1, over Streamable HTTP.
    """
    command = SERVER_COMMANDS.get(server_id)
    if command is None:
        raise JupyterHostFailed(f"The Jupyter container does not run {server_id!r}.")
    from agent_runtimes.mcp.browser_session import provider_of_server

    provider = provider_of_server(server_id)
    answer = await call(
        "start-server",
        timeout=SERVER_WAIT + 60,
        provider=provider.id if provider else server_id,
        command=command,
        env=env,
        wait=SERVER_WAIT,
        session_cookie=provider.session_cookie if provider else "",
        port=_PORTS.get(server_id, 0),
    )
    if "port" not in answer:
        tail = str(answer.get("tail") or "").strip()
        if tail:
            logger.warning("%s in the Jupyter container said:\n%s", server_id, tail)
        raise JupyterHostFailed(
            f"{server_id} did not start in the Jupyter container: "
            f"{answer.get('error') or 'no port'}."
        )
    logger.info(
        "MCP server '%s' runs in the Jupyter container on 127.0.0.1:%s",
        server_id,
        answer["port"],
    )
    _PORTS[server_id] = int(answer["port"])
    url = f"http://127.0.0.1:{int(answer['port'])}/mcp"
    _HOSTED[server_id] = url
    return url


def hosted_url(server_id: str) -> str:
    """
    Where a server the Jupyter container runs listens, or ``""``.

    What codemode's registry is given in place of the server's command: on
    the Alpine image that command (``uvx mcp-server-linkedin``) cannot run.
    """
    return _HOSTED.get(server_id, "")


async def stop_server(server_id: str) -> None:
    """Stop a server the Jupyter container runs."""
    from agent_runtimes.mcp.browser_session import provider_of_server

    provider = provider_of_server(server_id)
    _HOSTED.pop(server_id, None)
    try:
        await call(
            "stop-server", timeout=60, provider=provider.id if provider else server_id
        )
    except Exception as error:
        logger.warning("%s did not stop in the Jupyter container: %s", server_id, error)


# --- a sign-in browser and its session ------------------------------------------------


async def start_browser(provider_id: str, flags: List[str]) -> int:
    """Start a Chromium on a virtual display in the Jupyter container, its DevTools port."""
    answer = await call(
        "start-browser",
        timeout=2 * BROWSER_WAIT + 60,
        provider=provider_id,
        browsers=BROWSERS_GLOB,
        flags=flags,
        wait=BROWSER_WAIT,
        xvfb=XVFB_COMMAND,
        x11=X11_SOCKETS,
        screen=SCREEN,
    )
    if "port" not in answer:
        raise JupyterHostFailed(
            f"The sign-in browser did not start in the Jupyter container: "
            f"{answer.get('error') or 'no port'}."
        )
    return int(answer["port"])


async def stop_browser(provider_id: str) -> None:
    """Stop the sign-in browser and remove its profile."""
    try:
        await call("stop-browser", timeout=60, provider=provider_id)
    except Exception as error:
        logger.warning("The sign-in browser did not stop: %s", error)


async def keep_session(
    provider_id: str,
    port: int,
    urls: List[str],
    session_cookie: str,
    source_runtime: str,
    profile_mark: str,
) -> Dict[str, Any]:
    """
    Read the sign-in browser's cookies and write them for the server, all in Jupyter.

    Returns
    -------
    dict
        ``{"state": "signed-in", "expires": …}``, or ``{"refused": "not-signed-in"}``.
    """
    return await call(
        "keep-session",
        timeout=120,
        provider=provider_id,
        port=port,
        urls=urls,
        session_cookie=session_cookie,
        source_runtime=source_runtime,
        profile_mark=profile_mark,
    )


async def seed_session(
    provider_id: str,
    value: str,
    cookie: Dict[str, Any],
    session_cookie: str,
    source_runtime: str,
    profile_mark: str,
    probe: bool = True,
) -> Dict[str, Any]:
    """
    Write the person's session pasted in Settings for the server, in Jupyter.

    The value is handed over the Pod's loopback (:class:`Handoff`), never put
    in the cell's code; ``cookie`` is its shape without it.

    Returns
    -------
    dict
        ``{"settings": "used" | "kept" | "refused" | "none", "state": …, "expires": …}``.
    """
    handoff = Handoff(value)
    try:
        return await call(
            "seed-session",
            timeout=120,
            provider=provider_id,
            port=handoff.port,
            nonce=handoff.nonce,
            cookie={**cookie, "value": ""},
            session_cookie=session_cookie,
            source_runtime=source_runtime,
            profile_mark=profile_mark,
            probe=probe,
        )
    finally:
        await asyncio.to_thread(handoff.close)


async def session_state(provider_id: str, session_cookie: str) -> Dict[str, Any]:
    """What the Jupyter container holds of a session: its state and its expiry."""
    return await call(
        "state", timeout=60, provider=provider_id, session_cookie=session_cookie
    )


async def forget(provider_id: str, session_cookie: str) -> Dict[str, Any]:
    """Remove a session from the Jupyter container."""
    return await call(
        "forget", timeout=60, provider=provider_id, session_cookie=session_cookie
    )


__all__ = [
    "BROWSERS_GLOB",
    "Handoff",
    "JUPYTER_SANDBOX_ENV",
    "JupyterHostFailed",
    "SERVER_COMMANDS",
    "SESSIONS_ROOT",
    "answer_of",
    "available",
    "call",
    "cell",
    "forget",
    "hosted_url",
    "hosts",
    "jupyter_url",
    "keep_session",
    "seed_session",
    "session_state",
    "start_browser",
    "start_server",
    "stop_browser",
    "stop_server",
]
