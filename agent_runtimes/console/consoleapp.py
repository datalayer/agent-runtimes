# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Console application for connecting to Datalayer runtimes."""

import typing as t

from jupyter_core.application import JupyterApp
from jupyter_kernel_client.konsoleapp import (
    KonsoleApp,
)
from jupyter_kernel_client.konsoleapp import (
    aliases as base_aliases,
)
from jupyter_kernel_client.konsoleapp import (
    flags as base_flags,
)
from traitlets import Bool, Dict, Unicode, default
from traitlets.config import catch_config_error

from agent_runtimes._version import __version__
from agent_runtimes.console.manager import RuntimeManager
from datalayer_core.mixins.authn import AuthnMixin
from datalayer_core.utils.urls import DatalayerURLs

datalayer_aliases = dict(base_aliases)
datalayer_aliases["run-url"] = "RuntimesConsoleApp.run_url"
datalayer_aliases["api-key"] = "RuntimesConsoleApp.token"
datalayer_aliases["external-token"] = "RuntimesConsoleApp.external_token"

datalayer_flags = dict(base_flags)
datalayer_flags.update(
    {
        "no-browser": (
            {"RuntimesConsoleApp": {"no_browser": True}},
            "Will prompt for user and password on the CLI.",
        )
    }
)

aliases = dict(datalayer_aliases)
aliases.update(
    {
        "agent": "RuntimesConsoleApp.runtime_name",
    }
)


class RuntimesConsoleApp(AuthnMixin, KonsoleApp):
    """Console for Datalayer runtimes."""

    name = "datalayer-console"

    version = __version__

    aliases = Dict(aliases)

    flags = datalayer_flags

    runtime_name = Unicode(
        "", config=True, help="""The name of the Runtime to connect to."""
    )

    # Additional attributes required by the app
    user_handle = Unicode("", config=True, help="""Username for authentication.""")

    # URL configuration attributes
    run_url = Unicode("", config=True, help="""Datalayer server URL.""")

    iam_url = Unicode("", config=True, help="""Datalayer IAM server URL.""")

    # Token attributes for authentication
    token = Unicode("", config=True, help="""Authentication token.""")

    external_token = Unicode("", config=True, help="""External authentication token.""")

    # Authentication configuration
    no_browser = Bool(
        False, config=True, help="""Will prompt for user and password on the CLI."""
    )

    @default("run_url")
    def _run_url_default(self) -> str:
        """Get the default run URL from environment."""
        urls = DatalayerURLs.from_environment()
        return urls.run_url

    @default("iam_url")
    def _iam_url_default(self) -> str:
        """Get the default IAM URL from environment."""
        urls = DatalayerURLs.from_environment()
        return urls.iam_url

    @property
    def urls(self) -> DatalayerURLs:
        """
        Get a DatalayerURLs object with the configured URLs.

        Returns
        -------
        DatalayerURLs
            URLs object with run_url and iam_url from the app configuration.
        """
        from datalayer_core.utils.urls import DatalayerURLs

        return DatalayerURLs.from_environment(
            run_url=self.run_url,
            iam_url=self.iam_url,
        )

    @default("kernel_manager_class")
    def _kernel_manager_class_default(self) -> type:
        """
        Get the default kernel manager class.

        Returns
        -------
        type
            The RuntimeManager class.
        """
        return RuntimeManager

    @default("kernel_name")
    def _kernel_name_default(self) -> str:
        """
        Get the default kernel name.

        Returns
        -------
        str
            Empty string (no default kernel name).
        """
        # Don't set a default kernel name
        return ""

    @catch_config_error
    def initialize(self, argv: t.Any = None) -> None:
        """
        Do actions after construct, but before starting the app.

        Parameters
        ----------
        argv : t.Any, optional
            Command line arguments.
        """
        super(JupyterApp, self).initialize(argv)

        if self.token is None:
            self.user_handle = None

        if getattr(self, "_dispatching", False):
            return

        self._log_in()

        self.kernel_client = None
        self.shell = None

        self.init_kernel_manager()
        self.init_kernel_client()

        if self.kernel_client is not None:
            if self.kernel_client.client.channels_running:
                # create the shell
                self.init_shell()
                # and draw the banner
                self.init_banner()

    def init_kernel_manager(self) -> None:
        """Initialize the kernel manager."""
        # Create a RuntimeManager and start a kernel.
        self.kernel_client = self.kernel_manager_class(
            parent=self,
            run_url=self.run_url,
            token=self.token or "",
            username=self.user_handle or "",
        )

        if self.kernel_client is not None:
            if not self.existing:
                self.kernel_client.start_kernel(
                    name=self.kernel_name, path=self.kernel_path
                )
            elif self.kernel_client.kernel is None:
                msg = f"Unable to connect to kernel with ID {self.existing}."
                raise RuntimeError(msg)

    def init_shell(self) -> None:
        """
        Initialize the shell.

        Forces own_kernel to False to prevent shutting down the kernel on exit.
        """
        super().init_shell()
        # Force `own_kernel` to False to prevent shutting down the kernel
        # on exit
        if self.shell is not None:
            self.shell.own_kernel = False


main = launch_new_instance = RuntimesConsoleApp.launch_instance


if __name__ == "__main__":
    main()
