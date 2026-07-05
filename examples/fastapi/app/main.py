# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""FastAPI application for Iris species prediction using sklearn."""

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from sklearn.datasets import load_iris

from agent_runtimes.client import RuntimeClient

from .models import Iris

load_dotenv()


HERE = Path(__file__).parent

SNAPSHOT_NAME = "snapshot-iris-model"

IRIS_NAMES = load_iris().target_names

app = FastAPI()


@app.get("/")
def home():  # type: ignore
    """
    Home endpoint providing a welcome message.

    Returns
    -------
    dict
        Welcome message for the API.
    """
    return {"message": "Welcome to the Iris Prediction API!"}


@app.post("/predict")
def predict_species(data: Iris):  # type: ignore
    """
    Predict Iris species based on flower measurements.

    Parameters
    ----------
    data : Iris
        Iris flower measurements (sepal_length, sepal_width, petal_length, petal_width).

    Returns
    -------
    dict
        Dictionary containing the predicted species name.
    """
    client = RuntimeClient()
    with client.create_runtime(snapshot_name=SNAPSHOT_NAME) as runtime:
        runtime.execute(HERE / "models.py")
        runtime.execute(HERE / "scripts/predict.py", variables=data.model_dump())
        prediction = runtime.get_variable("prediction")
        return {"predicted_species": IRIS_NAMES[prediction]}
