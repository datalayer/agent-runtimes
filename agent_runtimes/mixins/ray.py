# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Ray management mixin for Datalayer Core."""

from __future__ import annotations

from typing import Any, Optional


class RayMixin:
    """Mixin for managing Ray clusters and Ray jobs through the Ray addon API."""

    _RAY_API_PREFIXES_RUNTIMES = ("/api/runtimes/v1/ray",)
    _RAY_API_PREFIXES_ADDON = ("/api/ray/v1",)

    def _get_ray_api_prefixes(self) -> tuple[str, ...]:
        if bool(getattr(self, "_ray_direct_addon", False)):
            return self._RAY_API_PREFIXES_ADDON
        return self._RAY_API_PREFIXES_RUNTIMES

    def _ray_request(
        self,
        path: str,
        *,
        method: str,
        params: Optional[dict[str, Any]] = None,
        json_body: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        prefixes = self._get_ray_api_prefixes()
        prefix = prefixes[0]
        response = self._fetch(
            f"{self.urls.runtimes_url}{prefix}{path}",
            method=method,
            params=params,
            json=json_body,
        )
        return response.json()

    def ray_list_clusters(self, *, namespace: str = "default") -> dict[str, Any]:
        return self._ray_request(
            "/clusters",
            method="GET",
            params={"namespace": namespace},
        )

    def ray_create_cluster(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._ray_request(
            "/clusters",
            method="POST",
            json_body=payload,
        )

    def ray_get_cluster(self, name: str, *, namespace: str = "default") -> dict[str, Any]:
        return self._ray_request(
            f"/clusters/{name}",
            method="GET",
            params={"namespace": namespace},
        )

    def ray_delete_cluster(self, name: str, *, namespace: str = "default") -> dict[str, Any]:
        return self._ray_request(
            f"/clusters/{name}",
            method="DELETE",
            params={"namespace": namespace},
        )

    def ray_submit_job(
        self,
        cluster_name: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return self._ray_request(
            f"/clusters/{cluster_name}/jobs",
            method="POST",
            json_body=payload,
        )

    def ray_list_jobs(
        self,
        *,
        namespace: str = "default",
        cluster_name: Optional[str] = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"namespace": namespace}
        if cluster_name:
            params["cluster_name"] = cluster_name
        return self._ray_request(
            "/jobs",
            method="GET",
            params=params,
        )

    def ray_get_job(self, name: str, *, namespace: str = "default") -> dict[str, Any]:
        return self._ray_request(
            f"/jobs/{name}",
            method="GET",
            params={"namespace": namespace},
        )

    def ray_get_job_logs(
        self,
        name: str,
        *,
        namespace: str = "default",
        pod_name: Optional[str] = None,
        container: Optional[str] = None,
        tail_lines: int = 200,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "namespace": namespace,
            "tail_lines": tail_lines,
        }
        if pod_name:
            params["pod_name"] = pod_name
        if container:
            params["container"] = container
        return self._ray_request(
            f"/jobs/{name}/logs",
            method="GET",
            params=params,
        )

    def ray_get_job_events(
        self,
        name: str,
        *,
        namespace: str = "default",
        limit: int = 100,
    ) -> dict[str, Any]:
        return self._ray_request(
            f"/jobs/{name}/events",
            method="GET",
            params={
                "namespace": namespace,
                "limit": limit,
            },
        )

    def ray_delete_job(self, name: str, *, namespace: str = "default") -> dict[str, Any]:
        return self._ray_request(
            f"/jobs/{name}",
            method="DELETE",
            params={"namespace": namespace},
        )
