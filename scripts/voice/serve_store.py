#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Serve the pinned store to a page on this machine, as Datalayer's origin serves it (VOICE.md VO-49).

    python scripts/voice/serve_store.py --store ~/.cache/speech-store [--port 8770]

The browser's models at ``/<model id>/<path>`` and onnxruntime-web's own
files at ``/onnxruntime-web/<version>/``, from the onnxruntime-web the page
bundles (``--node-modules`` when it is not this checkout's), with the CORS
headers a page on another port needs. For a local run only: in production
the same layout is on Datalayer's storage.
"""

from __future__ import annotations

import argparse
import functools
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class StoreHandler(SimpleHTTPRequestHandler):
    runtime: Path = Path()
    version: str = ""

    def translate_path(self, path: str) -> str:
        prefix = f"/onnxruntime-web/{self.version}/"
        if path.startswith(prefix):
            return str(self.runtime / path[len(prefix) :].split("?")[0])
        return super().translate_path(path)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--store", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8770)
    parser.add_argument(
        "--node-modules", type=Path, default=ROOT.parent.parent / "node_modules"
    )
    args = parser.parse_args()
    runtime = args.node_modules / "onnxruntime-web"
    if not (runtime / "package.json").is_file():
        raise SystemExit(
            f"No onnxruntime-web in {args.node_modules}: install the voice packages first."
        )
    StoreHandler.runtime = runtime / "dist"
    StoreHandler.version = json.loads((runtime / "package.json").read_text())["version"]
    handler = functools.partial(StoreHandler, directory=str(args.store))
    print(
        f"http://127.0.0.1:{args.port}/ serves {args.store} and onnxruntime-web {StoreHandler.version}"
    )
    ThreadingHTTPServer(("127.0.0.1", args.port), handler).serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
