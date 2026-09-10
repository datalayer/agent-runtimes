# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""One suite, run against every registered adapter (O0-12).

The whole of the parametrization is here, so that a scenario is written once
and a binding added to ``BINDINGS`` is run through all of them without a
scenario being edited. A test that wanted only one protocol would have to
say so out loud, which is the point.
"""

from __future__ import annotations

import pytest

from agent_runtimes.tests.orchestration.bindings import BINDINGS, ConformanceBinding


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
