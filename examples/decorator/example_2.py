# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Datalayer decorator example demonstrating function execution in remote runtimes."""

from pathlib import Path

from dotenv import load_dotenv

from agent_runtimes.decorators.datalayer import datalayer

load_dotenv()


HERE = Path(__file__).parent


# Example 2: Function with inputs and output variables
@datalayer(
    runtime_name="data-processing",
    environment="ai-agents-env",
    inputs=["data"],
    output="processed_result",
)
def process_data(data: list[float]) -> dict:
    """
    Process data and return statistics.

    Parameters
    ----------
    data : list
        List of numerical values to process.

    Returns
    -------
    dict
        Dictionary containing statistical measures of the data.
    """
    import statistics

    processed_result = {
        "count": len(data),
        "mean": statistics.mean(data),
        "median": statistics.median(data),
        "stdev": statistics.stdev(data) if len(data) > 1 else 0,
        "min": min(data),
        "max": max(data),
    }

    print(f"Processed {len(data)} data points")
    print(f"Statistics: {processed_result}")

    return processed_result


if __name__ == "__main__":
    print("Datalayer Decorator Examples")
    print("=" * 40)

    # Example 2: Data processing
    print("\n2. Data Processing Example")
    print("-" * 30)
    sample_data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25]
    result2 = process_data(sample_data)
    print(f"Processing result: {result2}")
