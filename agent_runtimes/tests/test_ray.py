# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for Ray URL resolution and Ray mixin requests."""

from __future__ import annotations

from agent_runtimes.mixins.ray import RayMixin
from datalayer_core.utils.urls import DatalayerURLs


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def json(self):
        return self._payload


class _FakeRayClient(RayMixin):
    def __init__(self):
        self.urls = DatalayerURLs.from_environment(runtimes_url="https://ray.example")
        self.calls = []

    def _fetch(self, url: str, **kwargs):
        self.calls.append((url, kwargs))
        return _FakeResponse({"success": True, "url": url, "kwargs": kwargs})


def test_urls_resolve_runtimes_url_from_environment(monkeypatch):
    monkeypatch.setenv("DATALAYER_RUNTIMES_URL", "https://runtimes-from-env.example/")
    urls = DatalayerURLs.from_environment()
    assert urls.runtimes_url == "https://runtimes-from-env.example"


def test_urls_resolve_runtimes_url_from_default(monkeypatch):
    monkeypatch.delenv("DATALAYER_RUNTIMES_URL", raising=False)
    urls = DatalayerURLs.from_environment()
    assert urls.runtimes_url == "https://r1.datalayer.run"


def test_ray_mixin_job_logs_and_events_paths():
    client = _FakeRayClient()

    logs_payload = client.ray_get_job_logs(
        "job-1",
        namespace="team-a",
        pod_name="pod-1",
        container="submitter",
        tail_lines=50,
    )
    events_payload = client.ray_get_job_events("job-1", namespace="team-a", limit=25)

    assert logs_payload["success"] is True
    assert events_payload["success"] is True

    logs_url, logs_kwargs = client.calls[0]
    assert logs_url.endswith("/api/runtimes/v1/ray/jobs/job-1/logs")
    assert logs_kwargs["params"] == {
        "namespace": "team-a",
        "tail_lines": 50,
        "pod_name": "pod-1",
        "container": "submitter",
    }

    events_url, events_kwargs = client.calls[1]
    assert events_url.endswith("/api/runtimes/v1/ray/jobs/job-1/events")
    assert events_kwargs["params"] == {
        "namespace": "team-a",
        "limit": 25,
    }


def test_ray_mixin_uses_runtimes_path_by_default():
    client = _FakeRayClient()

    payload = client.ray_list_clusters(namespace="default")

    assert payload["success"] is True
    assert len(client.calls) == 1
    first_url, _ = client.calls[0]
    assert first_url.endswith("/api/runtimes/v1/ray/clusters")


def test_ray_mixin_uses_addon_path_in_direct_mode():
    client = _FakeRayClient()
    client._ray_direct_addon = True

    payload = client.ray_list_clusters(namespace="default")

    assert payload["success"] is True
    assert len(client.calls) == 1
    first_url, _ = client.calls[0]
    assert first_url.endswith("/api/ray/v1/clusters")
