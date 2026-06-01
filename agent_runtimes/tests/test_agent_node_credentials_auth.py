# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for authenticated Agent Node credentials updates."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.routes import agent_node as agent_node_route


def _build_client() -> TestClient:
    """Build a FastAPI test client with the agent-node router mounted."""
    app = FastAPI()
    app.include_router(agent_node_route.router, prefix="/api/v1")
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset_runtime_credentials(request: pytest.FixtureRequest) -> None:
    """Reset runtime credentials before each test and clean up afterwards."""
    agent_node_route.set_runtime_credentials(None, None)

    def _cleanup() -> None:
        agent_node_route.set_runtime_credentials(None, None)

    request.addfinalizer(_cleanup)


def test_credentials_rejects_missing_authorization() -> None:
    """Ensure endpoint rejects unauthenticated credential updates."""
    client = _build_client()

    response = client.post(
        "/api/v1/agent-node/credentials",
        json={"token": "abc", "runtimes_url": "https://r1.datalayer.run"},
    )

    assert response.status_code == 401


def test_credentials_rejects_mismatched_payload_token() -> None:
    """Ensure payload token cannot differ from Authorization token."""
    client = _build_client()

    response = client.post(
        "/api/v1/agent-node/credentials",
        headers={"Authorization": "Bearer user-token"},
        json={"token": "other-token", "runtimes_url": "https://r1.datalayer.run"},
    )

    assert response.status_code == 403


def test_credentials_accepts_authenticated_set_and_clear() -> None:
    """Allow authenticated credential set and authenticated clear operations."""
    client = _build_client()

    # Set credentials using authenticated token.
    set_response = client.post(
        "/api/v1/agent-node/credentials",
        headers={"Authorization": "Bearer user-token"},
        json={"token": "user-token", "runtimes_url": "https://r1.datalayer.run"},
    )
    assert set_response.status_code == 200
    assert set_response.json()["has_token"] is True

    creds = agent_node_route.get_runtime_credentials()
    assert creds["token"] == "user-token"
    assert creds["runtimes_url"] == "https://r1.datalayer.run"

    # Clear credentials while authenticated with previous token.
    clear_response = client.post(
        "/api/v1/agent-node/credentials",
        headers={"Authorization": "Bearer user-token"},
        json={"token": None, "runtimes_url": None},
    )
    assert clear_response.status_code == 200
    assert clear_response.json()["has_token"] is False

    creds = agent_node_route.get_runtime_credentials()
    assert creds["token"] is None
    assert creds["runtimes_url"] is None
