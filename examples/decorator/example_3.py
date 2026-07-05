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


# Example 3: Machine learning example
@datalayer(
    runtime_name="ml-training",
    environment="ai-env",
    inputs=["features", "labels"],
    output="model_metrics",
    debug=True,
)
def train_simple_model(features: list[float], labels: list[float]) -> dict:
    """
    Train a simple machine learning model.

    Parameters
    ----------
    features : list
        List of feature values for training.
    labels : list
        List of target labels corresponding to features.

    Returns
    -------
    dict
        Dictionary containing model performance metrics.
    """
    import numpy as np
    from sklearn.linear_model import LinearRegression
    from sklearn.metrics import mean_squared_error, r2_score
    from sklearn.model_selection import train_test_split

    # Convert to numpy arrays
    X = np.array(features).reshape(-1, 1)
    y = np.array(labels)

    # Split the data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # Train the model
    model = LinearRegression()
    model.fit(X_train, y_train)

    # Make predictions
    y_pred = model.predict(X_test)

    # Calculate metrics
    model_metrics = {
        "mse": float(mean_squared_error(y_test, y_pred)),
        "r2": float(r2_score(y_test, y_pred)),
        "coefficient": float(model.coef_[0]),
        "intercept": float(model.intercept_),
        "train_size": len(X_train),
        "test_size": len(X_test),
    }

    print(f"Model trained with R2 score: {model_metrics['r2']:.3f}")
    print(f"Mean Squared Error: {model_metrics['mse']:.3f}")

    return model_metrics


if __name__ == "__main__":
    print("Datalayer Decorator Examples")
    print("=" * 40)

    # Example 3: Machine learning
    print("\n3. Machine Learning Example")
    print("-" * 30)
    # Generate sample training data (simple linear relationship)
    sample_features = list(range(1, 101))  # Features: 1 to 100
    sample_labels = [
        2 * x + 1 + np.random.normal(0, 5) for x in sample_features
    ]  # y = 2x + 1 + noise

    result3 = train_simple_model(sample_features, sample_labels)
    print(f"Model metrics: {result3}")
