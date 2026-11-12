# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The fake adapter's framework: what `fake.py` runs in the sandbox.

Standard library only, and unaware of this package, as a real framework is.
Reads a request on stdin, answers one JSON object on stdout.
"""

from __future__ import annotations

import json
import os
import sys
import time


def definition(source: str) -> dict:
    """The definition in the source."""
    with open(os.path.join(source, "fake-eval.json")) as handle:
        return json.load(handle)


def main() -> None:
    """Answer one request."""
    request = json.loads(sys.stdin.read())
    loaded = definition(request["source"])
    if request["op"] == "inspect":
        print(json.dumps({"definition": loaded}))
        return
    case = next(item for item in loaded["cases"] if item["id"] == request["native_id"])
    if case.get("sleep_seconds"):
        time.sleep(float(case["sleep_seconds"]))
    if case.get("crash"):
        sys.stderr.write(f"the framework crashed on {case['id']}\n")
        sys.exit(3)
    with open("framework.log", "w") as log:
        log.write(f"ran {case['id']} with token {os.environ.get('FAKE_TOKEN', '')}\n")
    answer = case.get("answer", "")
    print(
        json.dumps(
            {
                "sample": case["id"],
                "input": case.get("input"),
                "answer": answer,
                "scores": [
                    {
                        "name": "exact",
                        "value": 1.0 if answer == case.get("target") else 0.0,
                        "answer": answer,
                    }
                ],
                "usage": {"input_tokens": 3, "output_tokens": 1},
            }
        )
    )


main()
