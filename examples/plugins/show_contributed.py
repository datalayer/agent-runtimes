#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The two packages' contributions, as `loop plugins` would list them.

Without installing anything: each package's `extension()` is registered on a
fresh platform the way discovery registers an installed one, then the
session's points are read — the `aider` harness beside the catalogue's, the
`omnigent-jsonl/1` format beside `datalayer-session/1` — and a yaml missing
its terms is refused, naming the plugin::

    python show_contributed.py
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "aider-harness"))
sys.path.insert(0, str(HERE / "omnigent-format"))


def main() -> int:
    import aider_harness
    import omnigent_session_format
    from reactor import PluginPlatform

    from agent_runtimes.plugins.host import (
        accepted,
        describe_plugins,
        plugins_lines,
        refusals,
        session_platform,
    )
    from agent_runtimes.plugins.points import HARNESSES, SESSION_FORMATS

    platform = PluginPlatform(extension_group="examples.plugins")
    session_platform(platform, discover_installed=False)
    platform.register_extension_object(aider_harness.extension())
    platform.register_extension_object(omnigent_session_format.extension())
    harnesses = [c.id for c in accepted(platform, HARNESSES)]
    print("harnesses  " + ", ".join(harnesses))
    print("formats    " + ", ".join(c.id for c in accepted(platform, SESSION_FORMATS)))
    for line in plugins_lines(describe_plugins(platform, "aider-harness")):
        print(f"plugins    {line}")

    # The same harness without its terms: refused at the seam, by name.
    without = Path(tempfile.mkdtemp(prefix="aider-no-terms-")) / "aider.yaml"
    text = (HERE / "aider-harness" / "aider_harness" / "aider.yaml").read_text(
        encoding="utf-8"
    )
    without.write_text(
        text.replace(
            "terms:\n  served_to_third_parties: permitted\n  licence: Apache-2.0 (adapter and agent)\n",
            "",
        ),
        encoding="utf-8",
    )
    os.environ["AIDER_HARNESS_YAML"] = str(without)
    again = PluginPlatform(extension_group="examples.plugins")
    session_platform(again, discover_installed=False)
    again.register_extension_object(aider_harness.extension())
    for refusal in refusals(again):
        print(f"refused    {refusal.line()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
