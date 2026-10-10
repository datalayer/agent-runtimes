# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Serve every runtime member of every scene over A2A, on local runtimes (LOOP A-15).

The scenes of the catalogue (``agent_runtimes.specs.scenes``) cast members
that run on a runtime: Accounting, Month-end close, Crop monitoring, Disaster
assessment, Change detection. A runtime serves one application over A2A at a
time, so each gets a runtime of its own: Accounting on the one already
running at ``--url`` (``npm run examples`` starts it on 8767, as before), and
each other member on a runtime this script starts (``python -m agent_runtimes
serve --port N``), ports from ``--ports-from`` (8768) in the catalogue's
order — the same ports the Scenes example reads (``sceneRuntimePorts``)
unless ``VITE_A2A_<MEMBER>_URL`` says otherwise.

    python examples/sales-accounting-a2a/serve_scenes.py --url http://127.0.0.1:8767 --wait 300

A member whose setup is incomplete — Odoo or Earthdata keys missing on this
machine — is not served, and what it needs is printed (its application's
setup notes, and what the runtime refused); the others are served all the
same, and the page draws the member and says what it needs. ``--only`` names
the members to serve, ``--no-start`` serves on runtimes already running at
the ports. The script stays up while the runtimes it started run.
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from typing import Dict, Iterable, List, Optional, Sequence

#: The port the examples serve Accounting on, as ``npm run examples`` starts it.
ACCOUNTING_PORT = 8767

#: The first port a runtime is started on for the other members.
SCENE_PORTS_FROM = 8768


def _id_of(ref: str) -> str:
    """A reference without its version: ``accounting:0.0.1`` is ``accounting``."""
    at = ref.rfind(":")
    return ref[:at] if at > 0 and "." in ref[at + 1 :] else ref


def runtime_members(scenes: Optional[Iterable] = None) -> List[str]:
    """The members on a runtime across the scenes, each once, in the catalogue's order.

    A scene's cast in its order; a member cast twice is served once.
    """
    if scenes is None:
        from agent_runtimes.specs.scenes import list_scene_specs

        scenes = list_scene_specs()
    seen: List[str] = []
    for scene in scenes:
        for member in scene.cast:
            app_id = _id_of(member.app)
            if (
                app_id
                and (member.runs_in or "runtime") == "runtime"
                and app_id not in seen
            ):
                seen.append(app_id)
    return seen


def ports_of(
    members: Sequence[str],
    accounting_port: int = ACCOUNTING_PORT,
    ports_from: int = SCENE_PORTS_FROM,
) -> Dict[str, int]:
    """The port each member is served on: Accounting on its own, the others from ``ports_from`` on, in order."""
    ports: Dict[str, int] = {}
    next_port = ports_from
    for app_id in members:
        if app_id == "accounting":
            ports[app_id] = accounting_port
        else:
            ports[app_id] = next_port
            next_port += 1
    return ports


def a2a_url(url: str, app_id: str) -> str:
    """Where a member is served over A2A on the runtime at ``url``."""
    return f"{url.rstrip('/')}/api/v1/a2a/agents/{app_id}"


def member_setup(app_id: str) -> List[str]:
    """What a member's application needs that is not set up, in sentences, from the catalogue."""
    from agent_runtimes.specs.apps import APP_CATALOGUE

    app = APP_CATALOGUE.get(app_id)
    return list(getattr(app, "setup", None) or []) if app is not None else []


def wait_for(url: str, seconds: float) -> bool:
    """Whether a runtime answers at ``url`` within ``seconds``."""
    import httpx

    deadline = time.monotonic() + seconds
    while True:
        try:
            httpx.get(url, timeout=2.0)
            return True
        except httpx.TransportError:
            if time.monotonic() >= deadline:
                return False
            time.sleep(1.0)


def serve(url: str, app_id: str) -> bool:
    """Serve one member on the runtime at ``url``; says what it needs when it is refused."""
    from agentspecs.apps import APP_CATALOGUE, dump_app

    from agent_runtimes.commands.apps import configure_on

    app = APP_CATALOGUE.get(app_id)
    if app is None:
        print(f"• {app_id} is not in the application catalogue: not served.")
        return False
    try:
        configured = configure_on(url, dump_app(app), a2a_url=url)
    except Exception as error:  # noqa: BLE001 - said, not raised: the others are served.
        print(f"• {app.name} is not served on {url}: {error}")
        for note in member_setup(app_id):
            print(f"  {note}")
        return False
    for note in configured.get("setup") or []:
        print(f"• {note}")
    served = configured["a2a"]
    print(f"{app.name} is served over A2A at {served['url']}")
    print(f"Its card: {served['card']}")
    return True


def start_runtime(port: int) -> subprocess.Popen:
    """Start a runtime on ``port``, as ``npm run examples`` starts Accounting's."""
    env = {
        **os.environ,
        "PYTHONIOENCODING": "utf-8",
        "AGENT_RUNTIMES_DEBUG": os.environ.get("AGENT_RUNTIMES_DEBUG", "false"),
        "AGENT_RUNTIMES_LOG_LEVEL": os.environ.get("AGENT_RUNTIMES_LOG_LEVEL", "info"),
    }
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "agent_runtimes",
            "serve",
            "--port",
            str(port),
            "--log-level",
            env["AGENT_RUNTIMES_LOG_LEVEL"],
        ],
        env=env,
    )


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--url",
        default=f"http://127.0.0.1:{ACCOUNTING_PORT}",
        help="The runtime Accounting is served on, already running.",
    )
    parser.add_argument(
        "--wait",
        type=float,
        default=0,
        help="Seconds to wait for a runtime to answer before serving on it.",
    )
    parser.add_argument(
        "--ports-from",
        type=int,
        default=SCENE_PORTS_FROM,
        help="The first port of the runtimes started for the other members.",
    )
    parser.add_argument(
        "--only",
        default="",
        help="The members to serve, by application id, comma-separated; all unsaid.",
    )
    parser.add_argument(
        "--no-start",
        action="store_true",
        help="Start no runtime: the other members' are already running at their ports.",
    )
    args = parser.parse_args(argv)
    members = runtime_members()
    if args.only:
        wanted = [one.strip() for one in args.only.split(",") if one.strip()]
        unknown = [one for one in wanted if one not in members]
        if unknown:
            parser.error(
                f"not a member on a runtime of any scene: {', '.join(unknown)}"
            )
        members = [one for one in members if one in wanted]
    ports = ports_of(members, ports_from=args.ports_from)
    host = args.url.rstrip("/").rsplit(":", 1)[0]
    started: List[subprocess.Popen] = []
    served = 0
    for app_id in members:
        if app_id == "accounting":
            url = args.url.rstrip("/")
        else:
            url = f"{host}:{ports[app_id]}"
            if not args.no_start:
                started.append(start_runtime(ports[app_id]))
        wait = (
            args.wait
            if (app_id == "accounting" or args.no_start)
            else max(args.wait, 120)
        )
        if not wait_for(url, wait):
            print(f"• {app_id} is not served: no runtime answers at {url}.")
            for note in member_setup(app_id):
                print(f"  {note}")
            continue
        if serve(url, app_id):
            served += 1
    print(f"{served} of {len(members)} scene members served over A2A.")
    if not started:
        return 0 if served else 1

    def stop(*_: object) -> None:
        for process in started:
            if process.poll() is None:
                process.terminate()

    signal.signal(signal.SIGTERM, stop)
    try:
        for process in started:
            process.wait()
    except KeyboardInterrupt:
        stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
