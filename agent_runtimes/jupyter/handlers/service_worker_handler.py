# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Service worker handler for Agent Runtimes."""

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# Datalayer License

from pathlib import Path
from typing import Optional

from jupyter_server.base.handlers import JupyterHandler
from tornado.web import HTTPError, StaticFileHandler


class ServiceWorkerHandler(StaticFileHandler, JupyterHandler):
    """Serve the service worker script."""

    def initialize(self) -> None:
        """Initialize the API spec handler."""
        # Must match the folder containing the service worker asset as specified
        # in the webpack.lab-config.js
        import datalayer_ui

        DATALAYER_UI_PATH = Path(datalayer_ui.__file__).parent
        extensionStatic = (
            Path(DATALAYER_UI_PATH).parent / "datalayer_ui" / "labextension" / "static"
        )
        super().initialize(path=str(extensionStatic))

    def validate_absolute_path(self, root: str, absolute_path: str) -> Optional[str]:
        """
        Only allow to serve the service worker.

        Parameters
        ----------
        root : str
            The root directory path.
        absolute_path : str
            The absolute path to validate.

        Returns
        -------
        Optional[str]
            The validated absolute path or None.
        """
        # Must match the filename name set in webpack.lab-config.js
        if Path(absolute_path).name != "lite-service-worker.js":
            raise HTTPError(404)
        return super().validate_absolute_path(root, absolute_path)

    def get_content_type(self) -> str:
        """
        Get the content type.

        Returns
        -------
        str
            The content type for JavaScript files.
        """
        return "text/javascript"

    def set_extra_headers(self, path: str) -> None:
        """
        Add extra headers to the response.

        Parameters
        ----------
        path : str
            The file path being served.
        """
        # Allow a service worker to get a broader scope than
        # its path.
        # See https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register#examples
        #     https://medium.com/dev-channel/two-http-headers-related-to-service-workers-you-never-may-have-heard-of-c8862f76cc60
        self.set_header("Service-Worker-Allowed", "/")
