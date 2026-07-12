# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Datalayer decorator example demonstrating function execution in remote runtimes."""

from pathlib import Path

from dotenv import load_dotenv

from agent_runtimes.decorators.datalayer import datalayer

load_dotenv()


HERE = Path(__file__).parent


# Example 1: Simple function with decorator
@datalayer(runtime_name="my-runtime", environment="ai-agents-env")
def simple_computation(x: int, y: int) -> int:
    """
    Simple computation that runs on a remote runtime.

    Parameters
    ----------
    x : int
        First integer value for computation.
    y : int
        Second integer value for computation.

    Returns
    -------
    int
        Result of x * y + 10.
    """
    result = x * y + 10
    print(f"Computing {x} * {y} + 10 = {result}")
    return result


if __name__ == "__main__":
    print("Datalayer Decorator Examples")
    print("=" * 40)

    # Example 1: Simple computation
    print("\n1. Simple Computation Example")
    print("-" * 30)
    result1 = simple_computation(5, 8)
    print(f"Result: {result1}")
