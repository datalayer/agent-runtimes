#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Record what ``loop`` refuses of a scene, for every editor of a scene to be held to it.

plans/STUDIO.md S-10: one validation over the three — what the spec editor
refuses, the stage refuses and ``loop`` refuses, in the same words. The
browser's half is ``src/apps/apps/sceneChecks.ts``; this script
writes down what agentspecs itself says of the same scenes, and
``src/apps/__tests__/scene-checks.test.ts`` holds it to it sentence by
sentence. Two copies of a rule drift unless something compares them.

Each case is a scene as a person writes it, in agentspecs' own spelling, so
the table also exercises the editor's reader (``sceneOfYaml``).

Usage:
    python3 scripts/record-scene-checks.py \
      --agentspecs agentspecs \
      --output src/apps/__tests__/fixtures/sceneCheckCases.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

#: A cast, a setting and a script that parse, as pieces the cases lay over.
HEAD = """schema: loop.scene/v1
id: probe
version: 0.0.1
name: Probe
"""

SALES = """  - member: sales
    app: sales
    role: initiator
    runs_in: runtime
    persona:
      name: Sales
"""

BOOKS = """  - member: books
    app: accounting
    role: contributor
    runs_in: runtime
    persona:
      name: Accounting
"""

ODOO = """  - member: odoo
    server: odoo-accounting
    persona:
      name: Odoo
"""

#: Each case: its name, and the scene as it is written.
CASES: List[Dict[str, str]] = [
    {
        "name": "a scene with nobody on stage",
        "yaml": HEAD,
    },
    {
        "name": "the entry is not in the cast",
        "yaml": HEAD + "entry: nobody\ncast:\n" + SALES,
    },
    {
        "name": "the entry is a system",
        "yaml": HEAD + "entry: odoo\ncast:\n" + ODOO,
    },
    {
        "name": "a system asks",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + ODOO
        + "    talks_to:\n      - member: sales\n        over: a2a\n",
    },
    {
        "name": "a member talks to itself",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + "    talks_to:\n      - member: sales\n        over: a2a\n",
    },
    {
        "name": "a member talks to nobody of the cast",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + "    talks_to:\n      - member: ghost\n        over: a2a\n",
    },
    {
        "name": "a system asked over a2a",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + "    talks_to:\n      - member: odoo\n        over: a2a\n"
        + ODOO,
    },
    {
        "name": "an agent asked over mcp",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + "    talks_to:\n      - member: books\n        over: mcp\n"
        + BOOKS,
    },
    {
        "name": "a member named twice",
        "yaml": HEAD + "entry: sales\ncast:\n" + SALES + SALES,
    },
    {
        "name": "two beats with one name",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + """script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: sales
        answers: words
  - id: open
    cue:
      say: Show them again
    expect: The books are read again
    moves:
      - who: sales
        answers: words
""",
    },
    {
        "name": "a member placed outside the box",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + "stage:\n  positions:\n    sales:\n      x: 40\n      y: 0.5\n",
    },
    {
        "name": "a member that is nothing at all",
        "yaml": HEAD + "entry: sales\ncast:\n" + SALES + "  - member: ghost\n",
    },
    {
        "name": "the scene wears a member's face",
        "yaml": HEAD
        + "emoji: \U0001f9ee\nentry: sales\ncast:\n"
        + SALES
        + "      face: \U0001f9ee\n",
    },
    {
        "name": "a system of the setting that is no server",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + "setting:\n  systems:\n    - server: nosuch\n      as: Nope\n",
    },
    {
        "name": "a system nobody reaches",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + "setting:\n  systems:\n    - server: odoo-accounting\n      as: Odoo\n",
    },
    {
        "name": "a system reached through a connection",
        "yaml": HEAD
        + "entry: books\ncast:\n"
        + BOOKS
        + "setting:\n  systems:\n    - server: odoo-accounting\n      as: Odoo\n",
    },
    {
        "name": "a Frame the catalogue has not",
        "yaml": HEAD + "entry: sales\ncast:\n" + SALES + "setting:\n  frames:\n    - nosuch\n",
    },
    {
        "name": "the stage places someone not in the cast",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + "stage:\n  positions:\n    ghost:\n      x: 0.2\n      y: 0.4\n",
    },
    {
        "name": "a balloon opens first for someone not in the cast",
        "yaml": HEAD + "entry: sales\ncast:\n" + SALES + "stage:\n  opens_first: ghost\n",
    },
    {
        "name": "an address for someone not in the cast",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + "deployment:\n  addresses:\n    ghost: GHOST_URL\n",
    },
    {
        "name": "an address for a member in the browser",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES.replace("runs_in: runtime", "runs_in: browser")
        + "deployment:\n  addresses:\n    sales: SALES_URL\n",
    },
    {
        "name": "visitors may watch and a member has no address",
        "yaml": HEAD + "entry: sales\ncast:\n" + SALES + "audience:\n  who: visitors\n",
    },
    {
        "name": "a beat its entry does not answer",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + BOOKS
        + """script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: books
        answers: table
""",
    },
    {
        "name": "a beat moved by someone not in the cast",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + """script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: sales
        answers: words
      - who: ghost
        answers: words
""",
    },
    {
        "name": "a beat moved by a system",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + ODOO
        + """script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: sales
        answers: words
      - who: odoo
        answers: words
""",
    },
    {
        "name": "a move that asks someone not in the cast",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + """script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: sales
        asks: ghost
        over: a2a
        what: the books
""",
    },
    {
        "name": "a move over mcp that asks no system",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + BOOKS
        + """script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: sales
        asks: books
        over: mcp
        what: the books
""",
    },
    {
        "name": "a move over a2a that asks a system",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + ODOO
        + """script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: sales
        asks: odoo
        over: a2a
        what: the books
""",
    },
    {
        "name": "a move that asks a member it does not talk to",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + BOOKS
        + """script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: sales
        asks: books
        over: a2a
        what: the books
""",
    },
    {
        "name": "a branch that goes on to no beat",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + """script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: sales
        answers: words
    branch:
      - decision: there is nothing to read
        expect: it says so
        then: nowhere
""",
    },
    {
        "name": "a rehearsal of a beat that is not in the script",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + """rehearsal:
  beats:
    - beat: nowhere
      lines:
        - 'You → Sales'
""",
    },
    {
        "name": "a rehearsal that names a beat twice",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + """script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: sales
        answers: words
rehearsal:
  beats:
    - beat: open
      lines:
        - 'You → Sales'
    - beat: open
      lines:
        - 'Sales: a table'
""",
    },
    {
        "name": "a rehearsal that names someone not on stage",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + """script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: sales
        answers: words
rehearsal:
  beats:
    - beat: open
      lines:
        - 'You → Stranger'
""",
    },
    {
        "name": "a scene that plays",
        "yaml": HEAD
        + "entry: sales\ncast:\n"
        + SALES
        + "    talks_to:\n      - member: books\n        over: a2a\n"
        + BOOKS
        + """setting:
  systems:
    - server: odoo-accounting
      as: Odoo
      holds: Datalayer's books
stage:
  positions:
    sales:
      x: 0
      y: 0
    books:
      x: 0.5
      y: 0
  opens_first: sales
script:
  - id: open
    cue:
      say: Show the books
    expect: The books are read
    moves:
      - who: sales
        asks: books
        over: a2a
        what: the open invoices
      - who: sales
        answers: table
rehearsal:
  beats:
    - beat: open
      lines:
        - 'You → Sales'
        - 'Sales → Accounting'
        - 'Sales: a table'
""",
    },
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agentspecs", type=Path, required=True, help="The agentspecs clone to read the checks from")
    parser.add_argument("--output", type=Path, required=True, help="The JSON table the browser's checks are held to")
    args = parser.parse_args()

    sys.path.insert(0, str(args.agentspecs.resolve()))
    import yaml  # noqa: PLC0415
    from agentspecs.scenes import SceneError, parse_scene, scene_problems  # noqa: PLC0415

    recorded: List[Dict[str, Any]] = []
    for case in CASES:
        data = yaml.safe_load(case["yaml"])
        try:
            scene = parse_scene(data)
        except SceneError as error:
            says = [str(error)]
        else:
            says = scene_problems(scene)
        recorded.append({"name": case["name"], "yaml": case["yaml"], "says": says})

    table = {
        "says": "What `loop` refuses of a scene, recorded from agentspecs (plans/STUDIO.md S-10).",
        "recordedWith": "scripts/record-scene-checks.py",
        "cases": recorded,
    }
    args.output.write_text(json.dumps(table, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(recorded)} cases written to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
