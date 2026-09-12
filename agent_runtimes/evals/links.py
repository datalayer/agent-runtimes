# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The addresses of the product that the evals tooling prints and embeds.

One place for them (BENCHMARK.md, B4-08). The runner's messages, the CLI,
and every link a report embeds — in the Markdown, the CSV and the console —
point at the pages people use, the benchmark at `/benchmarks/{id}` and the
run at `/runs/{launch}`, on the deployment `DATALAYER_UI_URL` names. A report
generated against a local plane links to the local app rather than to a host
written into the code.
"""

from __future__ import annotations

import os
from urllib.parse import quote

__all__ = [
    "DEFAULT_UI_URL",
    "agentspec_url",
    "benchmark_report_url",
    "benchmark_url",
    "launch_url",
    "run_url",
    "ui_base_url",
]

DEFAULT_UI_URL = "https://datalayer.app"


def ui_base_url() -> str:
    """Where the product is: `DATALAYER_UI_URL`, else Datalayer's."""
    return str(os.environ.get("DATALAYER_UI_URL") or DEFAULT_UI_URL).strip().rstrip("/")


def _named(value: str) -> str:
    return str(value or "").strip()


def _segment(value: str) -> str:
    return quote(_named(value), safe="")


def benchmark_url(evalset_id: str) -> str:
    """The benchmark's page, which is what the product calls an evalset."""
    return f"{ui_base_url()}/benchmarks/{_segment(evalset_id)}" if _named(evalset_id) else ""


def benchmark_report_url(evalset_id: str) -> str:
    """The benchmark's live report: its Report tab."""
    page = benchmark_url(evalset_id)
    return f"{page}/report" if page else ""


def launch_url(launch_id: str) -> str:
    """The launch's page: its runs, and the live report of each."""
    return f"{ui_base_url()}/runs/{_segment(launch_id)}" if _named(launch_id) else ""


def run_url(launch_id: str, run_id: str) -> str:
    """One experiment run of a launch; empty unless both are known."""
    page = launch_url(launch_id)
    return f"{page}/experiments/{_segment(run_id)}" if page and _named(run_id) else ""


def agentspec_url(agent_spec_id: str) -> str:
    """The agentspec's page."""
    return f"{ui_base_url()}/settings/agentspecs/{_segment(agent_spec_id)}" if _named(agent_spec_id) else ""
