# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Streamlit application for Iris species prediction using sklearn."""

from pathlib import Path

import streamlit as st
from sklearn.datasets import load_iris

from agent_runtimes.client import RuntimeClient
from models import Iris

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass


HERE = Path(__file__).parent
SNAPSHOT_NAME = "snapshot-streamlit-model"
IRIS_NAMES = load_iris().target_names

col1, col2, col3 = st.columns([0.2, 0.6, 0.2])
with col2:
    st.image(
        "https://assets.datalayer.tech/datalayer-25.svg",
        width=200,
        use_container_width=True,
    )
st.title("""Streamlit + Datalayer Client Example""")

st.markdown("")
st.markdown("""
#### Enter the values to get a prediction of the Iris flower species.
""")


def predict_species(data: Iris):  # type: ignore
    """
    Predict Iris species based on flower measurements.

    Parameters
    ----------
    data : Iris
        Iris flower measurements (sepal_length, sepal_width, petal_length, petal_width).

    Returns
    -------
    str
        The predicted species name.
    """
    client = RuntimeClient()
    with client.create_runtime(snapshot_name=SNAPSHOT_NAME) as runtime:
        runtime.execute(HERE / "models.py")
        runtime.execute(HERE / "scripts/predict.py", variables=data.model_dump())
        prediction = runtime.get_variable("prediction")
        return IRIS_NAMES[prediction]


data1, data2 = st.columns([0.5, 0.5])

with data1:
    st.number_input("Sepal length:", key="sepal_length", value=5.1)
    st.number_input("Sepal width:", key="sepal_width", value=3.5)

with data2:
    st.number_input("Petal Length:", key="petal_length", value=1.4)
    st.number_input("Petal width:", key="petal_width", value=0.2)


if st.button("Click to Predict!", use_container_width=True):
    data = Iris(
        sepal_length=st.session_state.sepal_length,
        sepal_width=st.session_state.sepal_width,
        petal_length=st.session_state.petal_length,
        petal_width=st.session_state.petal_width,
    )
    with st.spinner(text="Performing prediction using Datalayer Runtimes!"):
        result = predict_species(data)

    st.text_input("Prediction:", value=result)
