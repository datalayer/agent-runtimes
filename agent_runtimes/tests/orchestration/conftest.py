# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""One suite, run against every registered adapter (O0-12).

The whole of the parametrization is here, so that a scenario is written once
and a binding added to ``BINDINGS`` is run through all of them without a
scenario being edited. A test that wanted only one protocol would have to
say so out loud, which is the point.

The suite also reports what it came to (O1-14): section 16's cross-framework
conformance rate is the share of the scenarios each binding could run that it
passed. Each scenario's outcome against each binding is recorded as
``orchestration.conformance.scenarios`` — exported when the process has a
meter provider, as it does when the suite runs against a deployed control
plane — and printed at the end of the run.
"""

from __future__ import annotations

import re
from typing import Any

import pytest

from agent_runtimes.monitoring.orchestration_measures import (
    FAILED,
    PASSED,
    REDUCED,
    conformance_rate,
    conformance_scenario,
    flush,
    worse_outcome,
)
from agent_runtimes.tests.orchestration.bindings import BINDINGS, ConformanceBinding

#: What each ``(scenario, binding)`` came to, as its tests reported.
OUTCOMES: dict[tuple[str, str], str] = {}

#: A scenario test: its class is the scenario, its parameter the binding.
_SCENARIO_TEST = re.compile(
    r"test_conformance\.py::Test(?P<scenario>\w+)::\w+\[(?P<binding>[^\]]+)\]$"
)

#: The class that tests the harness rather than a scenario.
_NOT_A_SCENARIO = "TheHarness"


@pytest.fixture(params=BINDINGS, ids=[entry.name for entry in BINDINGS])
def binding(request: pytest.FixtureRequest) -> ConformanceBinding:
    """
    The adapter and worker this run of the scenario is against.

    Parameters
    ----------
    request : pytest.FixtureRequest
        The parametrized request.

    Returns
    -------
    ConformanceBinding
        One entry of the registry.
    """
    return request.param


def _scenario(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def pytest_runtest_logreport(report: pytest.TestReport) -> None:
    """
    Keep what a scenario came to against a binding, one test at a time.

    Parameters
    ----------
    report : pytest.TestReport
        One phase of one test.
    """
    found = _SCENARIO_TEST.search(report.nodeid)
    if found is None or found["scenario"] == _NOT_A_SCENARIO:
        return
    if report.failed:
        outcome = FAILED
    elif report.skipped:
        outcome = REDUCED
    elif report.when == "call":
        outcome = PASSED
    else:
        return
    key = (_scenario(found["scenario"]), found["binding"])
    OUTCOMES[key] = worse_outcome(OUTCOMES.get(key), outcome)


def pytest_terminal_summary(terminalreporter: Any) -> None:
    """
    Record the scenarios' outcomes and print each binding's conformance rate.

    Parameters
    ----------
    terminalreporter : Any
        Pytest's terminal reporter.
    """
    if not OUTCOMES:
        return
    for (scenario, binding), outcome in sorted(OUTCOMES.items()):
        conformance_scenario(scenario=scenario, binding=binding, outcome=outcome)
    flush()
    terminalreporter.section("orchestration conformance")
    for binding, tally in conformance_rate(OUTCOMES).items():
        reduced = f", {tally.reduced} reduced" if tally.reduced else ""
        terminalreporter.write_line(
            f"{binding:<26} {tally.passed}/{tally.run} scenarios passed{reduced}"
        )
