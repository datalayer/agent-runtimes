# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Training script for Streamlit sklearn example."""

from sklearn.datasets import load_iris
from sklearn.linear_model import LogisticRegression

# Load data
iris = load_iris()
X, y = iris.data, iris.target

# Train model
model = LogisticRegression(max_iter=200)
model.fit(X, y)
