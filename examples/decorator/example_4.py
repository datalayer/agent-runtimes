# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Datalayer decorator example demonstrating function execution in remote runtimes."""

import time
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

from agent_runtimes.decorators.datalayer import datalayer

load_dotenv()


HERE = Path(__file__).parent


# Example 4: Data analysis
@datalayer(
    runtime_name="analysis-runtime",
    environment="ai-agents-env",
    timeout=30.0,
)
def analyze_dataset() -> dict:
    """
    Analyze a dataset and return insights.

    Returns
    -------
    dict
        Dictionary containing dataset analysis results and statistics.
    """
    import numpy as np
    import pandas as pd

    # Generate sample data
    np.random.seed(42)
    data = {
        "feature_1": np.random.normal(50, 15, 1000),
        "feature_2": np.random.exponential(2, 1000),
        "feature_3": np.random.uniform(0, 100, 1000),
        "target": np.random.normal(75, 20, 1000),
    }

    df = pd.DataFrame(data)

    # Perform analysis
    analysis_results = {
        "dataset_shape": df.shape,
        "missing_values": df.isnull().sum().to_dict(),
        "descriptive_stats": df.describe().to_dict(),
        "correlations": df.corr()["target"].drop("target").to_dict(),
    }

    print("Dataset Analysis Complete")
    print(f"Shape: {analysis_results['dataset_shape']}")
    print(f"Correlations with target: {analysis_results['correlations']}")

    return analysis_results


if __name__ == "__main__":
    print("Datalayer Decorator Examples")
    print("=" * 40)

    # Example 4: Data analysis
    print("\n4. Data Analysis Example")
    print("-" * 30)
    result4 = analyze_dataset()
    print(f"Analysis complete. Dataset shape: {result4['dataset_shape']}")
