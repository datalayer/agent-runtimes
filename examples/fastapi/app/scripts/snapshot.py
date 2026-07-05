# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Snapshot script for FastAPI sklearn example."""

from pathlib import Path

from dotenv import load_dotenv

from agent_runtimes.client import RuntimeClient

load_dotenv()

HERE = Path(__file__).parent
SNAPSHOT_NAME = "snapshot-iris-model"

client = RuntimeClient()
with client.create_runtime(name="runtime-fast-api-sklearn-example") as runtime:
    response = runtime.execute_file(HERE / "train.py")
    snapshot = runtime.create_snapshot(
        name=SNAPSHOT_NAME,
        description="Snapshot of the sklearn trained iris model",
        stop=False,
    )
