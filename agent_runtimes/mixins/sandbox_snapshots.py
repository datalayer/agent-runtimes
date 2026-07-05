# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

from typing import Any


class SandboxSnapshotsCreateMixin:
    """Mixin class for creating snapshots."""

    def _create_snapshot(
        self, pod_name: str, name: str, description: str, stop: bool = True
    ) -> dict[str, Any]:
        """
        Create a snapshot from a runtime.

        Parameters
        ----------
        pod_name : str
            The pod name of the runtime to snapshot.
        name : str
            Name for the snapshot.
        description : str
            Description for the snapshot.
        stop : bool
            Whether to stop the runtime after creating snapshot.

        Returns
        -------
        dict[str, Any]
            Response containing snapshot creation details.
        """
        body = {
            "pod_name": pod_name,
            "name": name,
            "description": description,
            "stop": stop,
        }
        try:
            response = self._fetch(  # type: ignore
                "{}/api/runtimes/v1/sandbox-snapshots".format(self.urls.runtimes_url),  # type: ignore
                method="POST",
                json=body,
            )
            return response.json()
        except RuntimeError as e:
            return {"success": False, "message": str(e)}


class SandboxSnapshotsDeleteMixin:
    """
    Mixin class that provides snapshot deletion functionality.
    """

    def _delete_snapshot(self, snapshot_uid: str) -> dict[str, Any]:
        """
        Delete snapshots of the current runtime.

        Parameters
        ----------
        snapshot_uid : str
            The unique identifier of the snapshot to delete.

        Returns
        -------
        dict[str, Any]
            Dictionary containing success status and message.
        """
        try:
            response = self._fetch(  # type: ignore
                "{}/api/runtimes/v1/sandbox-snapshots/{}".format(
                    self.urls.runtimes_url,  # type: ignore
                    snapshot_uid,
                ),
                method="DELETE",
            )
            return {
                "success": response.status_code in (200, 202, 204),
                "message": "Snapshot deleted successfully.",
            }
        except RuntimeError as e:
            return {"success": False, "message": str(e)}


class SandboxSnapshotsListMixin:
    """
    Mixin class to provide functionality for listing snapshots.
    """

    def _list_snapshots(self) -> dict[str, Any]:
        """
        List all available snapshots.

        Returns
        -------
        dict[str, Any]
            Dictionary containing snapshot information or error details.
        """
        try:
            response = self._fetch(  # type: ignore
                "{}/api/runtimes/v1/sandbox-snapshots".format(self.urls.runtimes_url),  # type: ignore
            )
            return response.json()
        except RuntimeError as e:
            return {"success": False, "message": str(e)}


class SandboxSnapshotsMixin(
    SandboxSnapshotsCreateMixin, SandboxSnapshotsDeleteMixin, SandboxSnapshotsListMixin
):
    """
    Mixin class that provides snapshot management functionality.
    """
