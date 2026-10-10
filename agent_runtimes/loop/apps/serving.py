# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application served on this machine, with hot reload (LOOP P-08).

``loop apps run app.py --web`` serves an application as ``app.mount`` serves
one in a FastAPI of one's own (LOOP P-25): its page — the embed, the renderer
of the hosted page, of the Studio's Preview and of a host's page — the
session API and its code under ``/app``, its agent on a runtime in this
process. Nothing of it is a second renderer.

With ``--watch``, a `HotReload` reads the files of the application's folder
twice a second. When one changed, the application is built again:

- taken, its code is the one its next sessions run (`serve_code`), its agent
  is made again with the spec it now builds, and the page reloads, starting
  a new conversation;
- refused — the file does not build, or its spec would not validate — the
  page says why over the application, which runs on as it was, until a
  change is taken. Its id cannot change while it runs: that is another
  application, refused in a sentence.
"""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Set

from fastapi import FastAPI
from fastapi.responses import StreamingResponse

from agent_runtimes.loop.apps.loading import AppNotRunnable

#: Where an application is served on this machine.
APP_PATH = "/app"

#: The files of its folder whose change builds it again.
WATCHED_SUFFIXES = (".py", ".yaml", ".yml", ".json")

#: How often the folder is read, in seconds.
WATCH_SECONDS = 0.5


def _snapshot(folder: Path, file: Path) -> Dict[str, float]:
    """When each watched file of the folder last changed: the application's own file always."""
    seen: Dict[str, float] = {}
    for candidate in [file, *sorted(folder.iterdir())]:
        if candidate.is_file() and candidate.suffix in WATCHED_SUFFIXES:
            seen[str(candidate)] = candidate.stat().st_mtime_ns
    return seen


class HotReload:
    """The application of a file, built again when the files beside it change.

    Parameters
    ----------
    path : Path
        The application's file: an ``app.py``, or an Appspec.
    application : Application
        The application as it was first built.
    load : callable
        Builds the application of ``path`` again; raises `AppNotRunnable`
        with the reasons when it would not run.
    say : callable, optional
        Where what happened is said, a line each: the terminal.
    """

    def __init__(
        self,
        path: Path,
        application: Any,
        load: Callable[[Path], Any],
        *,
        say: Optional[Callable[[str], None]] = None,
    ) -> None:
        """Hold the application, and what its folder looks like now."""
        self.path = Path(path).resolve()
        self.application = application
        self._load = load
        self._say = say or (lambda _line: None)
        self._seen = _snapshot(self.path.parent, self.path)
        self._listeners: Set["asyncio.Queue[Dict[str, Any]]"] = set()
        self._runtime: Optional[FastAPI] = None
        self._api_prefix = "/api/v1"
        #: Every reload, in order: what the page was told.
        self.history: List[Dict[str, Any]] = []

    # --- what changed --------------------------------------------------------------

    def changed(self) -> bool:
        """Whether a watched file changed since it was last read."""
        now = _snapshot(self.path.parent, self.path)
        if now == self._seen:
            return False
        self._seen = now
        return True

    async def reload(self) -> Dict[str, Any]:
        """Build the application again; what the page is told, ``reloaded`` or ``refused``."""
        from agent_runtimes.loop.apps.mounting import create_agent, create_payload
        from agent_runtimes.loop.apps.sessions import serve_code

        started = time.monotonic()
        before = self.application
        try:
            built = self._load(self.path)
        except AppNotRunnable as refused:
            return self._tell(
                "refused",
                f"{self.path.name} was not taken: {before.spec.name} runs as it was.",
                problems=list(refused.problems),
            )
        except Exception as error:  # noqa: BLE001 - the developer's file, said in a sentence
            return self._tell(
                "refused",
                f"{self.path.name} was not taken: {before.spec.name} runs as it was.",
                problems=[f"{type(error).__name__}: {error}"],
            )
        if built.spec.id != before.spec.id:
            return self._tell(
                "refused",
                f"{self.path.name} was not taken: {before.spec.name} runs as it was.",
                problems=[
                    f"Its id changed from {before.spec.id!r} to {built.spec.id!r}: "
                    "that is another application — stop this one and run it."
                ],
            )
        try:
            payload = create_payload(built)
        except ValueError as refused:
            return self._tell(
                "refused",
                f"{self.path.name} was not taken: {before.spec.name} runs as it was.",
                problems=[str(refused)],
            )
        if self._runtime is not None:
            await self._remove_agent(before.spec.id)
            await create_agent(self._runtime, payload, self._api_prefix)
        serve_code(built)
        self.application = built
        seconds = time.monotonic() - started
        return self._tell(
            "reloaded",
            f"{built.spec.name} was built again from {self.path.name} in {seconds:.1f} s.",
        )

    async def _remove_agent(self, agent_id: str) -> None:
        """Remove the agent made with the application before, to make it again."""
        import httpx

        assert self._runtime is not None
        transport = httpx.ASGITransport(app=self._runtime)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://127.0.0.1"
        ) as client:
            removed = await client.delete(
                f"{self._api_prefix}/agents/{agent_id}", timeout=None
            )
        if removed.status_code not in (200, 204, 404):
            raise RuntimeError(
                f"The agent of {agent_id} was not removed ({removed.status_code}): {removed.text[:500]}"
            )

    def _tell(
        self, kind: str, says: str, problems: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Say what happened: to the terminal, and to every page listening."""
        told = {"kind": kind, "says": says, "problems": problems or []}
        self.history.append(told)
        self._say(says)
        for problem in told["problems"]:
            self._say(f"  {problem}")
        for listener in list(self._listeners):
            listener.put_nowait(told)
        return told

    # --- the page's events ---------------------------------------------------------

    async def events(self) -> StreamingResponse:
        """What the page listens to: a server-sent event at each reload."""
        listener: "asyncio.Queue[Dict[str, Any]]" = asyncio.Queue()
        self._listeners.add(listener)

        async def stream() -> AsyncIterator[str]:
            """Each reload as a server-sent event, and a comment now and then."""
            try:
                # A comment first, so the page knows it is connected.
                yield ": listening\n\n"
                while True:
                    try:
                        told = await asyncio.wait_for(listener.get(), timeout=15.0)
                    except asyncio.TimeoutError:
                        yield ": still here\n\n"
                        continue
                    yield f"event: {told['kind']}\ndata: {json.dumps(told, ensure_ascii=False)}\n\n"
            finally:
                self._listeners.discard(listener)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # --- while the server runs -----------------------------------------------------

    @asynccontextmanager
    async def watching(self, runtime: FastAPI, api_prefix: str) -> AsyncIterator[None]:
        """Watch the folder while the server runs; the agent made again on ``runtime``."""
        self._runtime = runtime
        self._api_prefix = api_prefix

        async def watch() -> None:
            """Read the folder, and build the application again when it changed."""
            while True:
                await asyncio.sleep(WATCH_SECONDS)
                if self.changed():
                    await self.reload()

        task = asyncio.create_task(watch())
        try:
            yield
        finally:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            # The page's streams end with the server.
            self._listeners.clear()


def local_server(
    application: Any,
    *,
    hot_reload: Optional[HotReload] = None,
    embed_origin: str = "",
    embed_dir: Optional[Path] = None,
    config: Any = None,
) -> FastAPI:
    """The FastAPI ``loop apps run --web`` serves: the application at ``/app``.

    ``/`` leads to it. The embed's script is loaded from ``embed_origin``,
    or, with ``embed_dir`` — a build of the embed, agent-runtimes'
    ``dist-embed`` — from this server at ``/embed/``.
    """
    from fastapi.responses import RedirectResponse
    from fastapi.staticfiles import StaticFiles

    from agent_runtimes.loop.apps.mounting import EMBED_SCRIPT_PATH, mount

    if embed_dir is not None:
        script = Path(embed_dir) / Path(EMBED_SCRIPT_PATH).name
        if not script.is_file():
            raise ValueError(
                f"{embed_dir} holds no build of the embed: {script.name} is not there "
                "(agent-runtimes' `npm run build:embed` writes it to dist-embed)."
            )
        if embed_origin:
            raise ValueError(
                "--embed-dir serves the embed from here: no --embed-origin with it."
            )
    elif not embed_origin:
        raise ValueError("Say where the embed's script is: an origin, or a folder.")

    api = FastAPI(title=f"{application.spec.name} — loop apps run --web")

    async def home() -> RedirectResponse:
        """`/` leads to the application."""
        return RedirectResponse(APP_PATH)

    api.add_api_route("/", home, methods=["GET"], include_in_schema=False)
    if embed_dir is not None:
        api.mount(
            str(Path(EMBED_SCRIPT_PATH).parent),
            StaticFiles(directory=str(embed_dir)),
            name="embed",
        )
    mount(
        application,
        api,
        APP_PATH,
        embed_origin=embed_origin if embed_dir is None else "",
        config=config,
        hot_reload=hot_reload,
    )
    return api


__all__ = [
    "APP_PATH",
    "HotReload",
    "WATCHED_SUFFIXES",
    "WATCH_SECONDS",
    "local_server",
]
