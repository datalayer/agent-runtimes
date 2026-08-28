# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for Client decorators functionality."""

import os
import time

import pytest
from dotenv import load_dotenv

from agent_runtimes.decorators.datalayer import datalayer

load_dotenv()


TEST_DATALAYER_API_KEY = os.environ.get("TEST_DATALAYER_API_KEY")


def sum_test(x: float, y: float, z: float = 1) -> float:
    """
    Sum three numbers.

    Parameters
    ----------
    x : float
        The first number.
    y : float
        The second number.
    z : float, optional
        The third number (default is 1).

    Returns
    -------
    float
        The sum of the three numbers.
    """
    return x + y + z


@pytest.mark.parametrize(
    "args,expected_output,decorator",
    [
        ([1, 4.5, 2], 7.5, datalayer(token=TEST_DATALAYER_API_KEY)),
        (
            [1, 4.5, 2],
            7.5,
            datalayer(given_name="runtime-test", token=TEST_DATALAYER_API_KEY),
        ),
        ([1, 4.5, 2], 7.5, datalayer(output="result", token=TEST_DATALAYER_API_KEY)),
        (
            [1, 4.5, 2],
            7.5,
            datalayer(inputs=["a", "b", "c"], token=TEST_DATALAYER_API_KEY),
        ),
    ],
)
@pytest.mark.skipif(
    not bool(TEST_DATALAYER_API_KEY),
    reason="TEST_DATALAYER_API_KEY is not set, skipping secret tests.",
)
def test_decorator(args, expected_output, decorator):  # type: ignore
    """
    Test the Datalayer decorator.
    """
    time.sleep(10)
    func = decorator(sum_test)
    assert func(*args) == expected_output
    time.sleep(10)
