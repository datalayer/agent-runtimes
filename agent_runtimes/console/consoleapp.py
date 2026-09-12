# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Interactive console backed by :class:`code_sandboxes.CodeSandboxClient`."""

from __future__ import annotations

import typing as t

from datalayer_core.mixins.authn import AuthnMixin
from datalayer_core.utils.urls import DatalayerURLs
from jupyter_core.application import JupyterApp
from traitlets import Bool, Dict, Unicode, default
from traitlets.config import catch_config_error

from agent_runtimes._version import __version__
from agent_runtimes.console.manager import RuntimeManager

aliases = {
    "agent": "RuntimesConsoleApp.given_name",
    "runtimes-url": "RuntimesConsoleApp.runtimes_url",
    "api-key": "RuntimesConsoleApp.token",
    "external-token": "RuntimesConsoleApp.external_token",
    "kernel-name": "RuntimesConsoleApp.kernel_name",
    "kernel-path": "RuntimesConsoleApp.kernel_path",
    "existing": "RuntimesConsoleApp.existing",
}

flags = {
    "no-browser": (
        {"RuntimesConsoleApp": {"no_browser": True}},
        "Will prompt for user and password on the CLI.",
    )
}


class RuntimesConsoleApp(AuthnMixin, JupyterApp):
    """Small REPL that executes through the variant-neutral sandbox client."""

    name = "datalayer-console"
    version = __version__
    aliases = Dict(aliases)
    flags = Dict(flags)

    given_name = Unicode("", config=True, help="Runtime name to connect to.")
    user_handle = Unicode("", config=True, help="Username for authentication.")
    runtimes_url = Unicode("", config=True, help="Datalayer Runtimes server URL.")
    iam_url = Unicode("", config=True, help="Datalayer IAM server URL.")
    token = Unicode("", config=True, help="Authentication token.")
    external_token = Unicode("", config=True, help="External authentication token.")
    no_browser = Bool(False, config=True, help="Prompt for credentials in the CLI.")
    kernel_name = Unicode("", config=True, help="Runtime kernel name.")
    kernel_path = Unicode("", config=True, help="Runtime kernel path.")
    existing = Unicode("", config=True, help="Existing runtime kernel identifier.")

    def __init__(self, **kwargs: t.Any) -> None:
        super().__init__(**kwargs)
        self.runtime_manager: RuntimeManager | None = None

    @default("runtimes_url")
    def _runtimes_url_default(self) -> str:
        return DatalayerURLs.from_environment().runtimes_url

    @default("iam_url")
    def _iam_url_default(self) -> str:
        return DatalayerURLs.from_environment().iam_url

    @property
    def urls(self) -> DatalayerURLs:
        return DatalayerURLs.from_environment(
            runtimes_url=self.runtimes_url,
            iam_url=self.iam_url,
        )

    @catch_config_error
    def initialize(self, argv: t.Any = None) -> None:
        super().initialize(argv)
        if getattr(self, "_dispatching", False):
            return
        self._log_in()
        self.runtime_manager = RuntimeManager(
            runtimes_url=self.runtimes_url,
            token=self.token or "",
            username=self.user_handle or "",
            log=self.log,
        )
        self.runtime_manager.start_kernel(
            name=self.given_name or self.kernel_name,
            path=self.kernel_path or None,
        )

    def start(self) -> None:
        if self.runtime_manager is None or self.runtime_manager.client is None:
            raise RuntimeError("Code sandbox client is not initialized.")

        client = self.runtime_manager.client
        execution_count = 1
        print("Datalayer Code Sandbox Console. Press Ctrl+D or Ctrl+C to exit.")
        try:
            while True:
                try:
                    code = input(f"In [{execution_count}]: ")
                except EOFError:
                    print()
                    break
                if not code.strip():
                    continue
                reply = client.execute(code)
                for output in reply.get("outputs", []):
                    output_type = output.get("output_type")
                    if output_type == "stream":
                        print(str(output.get("text", "")), end="")
                    elif output_type in {"execute_result", "display_data"}:
                        text = (output.get("data") or {}).get("text/plain")
                        if text is not None:
                            print(text)
                    elif output_type == "error":
                        traceback = output.get("traceback") or []
                        print("\n".join(str(line) for line in traceback))
                execution_count += 1
        finally:
            client.stop(shutdown_kernel=False)


main = launch_new_instance = RuntimesConsoleApp.launch_instance


if __name__ == "__main__":
    main()
