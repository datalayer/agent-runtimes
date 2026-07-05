# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Model prediction script for the Iris dataset.
"""

import numpy as np

data = Iris(
    sepal_length=sepal_length,
    sepal_width=sepal_width,
    petal_length=petal_length,
    petal_width=petal_width,
)
features = np.array(
    [[data.sepal_length, data.sepal_width, data.petal_length, data.petal_width]]
)
prediction = model.predict(features)[0]
