# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Agent Runtimes Server application."""

import asyncio
import os

from datalayer_core.utils.urls import DatalayerURLs
from jupyter_server.extension.application import ExtensionApp, ExtensionAppJinjaMixin
from jupyter_server.utils import url_path_join
from traitlets import Bool, CInt, Instance, Unicode, default
from traitlets.config import Configurable

from agent_runtimes._version import __version__
from agent_runtimes.jupyter.agent import create_jupyter_chat_agent
from agent_runtimes.jupyter.config import JupyterChatConfig
from agent_runtimes.jupyter.handlers.chat_handler import VercelAIChatHandler
from agent_runtimes.jupyter.handlers.config_handler import ConfigHandler
from agent_runtimes.jupyter.handlers.configure_handler import ConfigureHandler
from agent_runtimes.jupyter.handlers.index_handler import IndexHandler
from agent_runtimes.jupyter.handlers.login_handler import LoginHandler
from agent_runtimes.jupyter.handlers.mcp_handler import (
    MCPServerHandler,
    MCPServersHandler,
)
from agent_runtimes.mcp import (
    MCPToolManager,
    get_mcp_manager,
    initialize_config_mcp_servers,
)
from agent_runtimes.services.authn.state import get_server_port

DEFAULT_STATIC_FILES_PATH = os.path.join(os.path.dirname(__file__), "./static")

DEFAULT_TEMPLATE_FILES_PATH = os.path.join(os.path.dirname(__file__), "./templates")


class AgentRuntimesExtensionApp(ExtensionAppJinjaMixin, ExtensionApp):
    """The Agent Runtimes Server extension."""

    name = "agent_runtimes"

    extension_url = "/agent_runtimes"

    load_other_extensions = True

    static_paths = [DEFAULT_STATIC_FILES_PATH]

    template_paths = [DEFAULT_TEMPLATE_FILES_PATH]

    # One URL per service: there is no single base any more. Each of them can
    # be set and None or ' ' (empty string); the consumer of those settings is
    # then free to consider it as null. What is not configured is resolved from
    # the environment — `DATALAYER_IAM_URL` and friends — and falls back to the
    # default of the service, see `DatalayerURLs`.
    iam_url = Unicode(
        config=True,
        allow_none=True,
        help="""URL to connect to the Datalayer IAM API.""",
    )

    runtimes_url = Unicode(
        config=True,
        allow_none=True,
        help="""URL to connect to the Datalayer Runtimes API.""",
    )

    spacer_url = Unicode(
        config=True,
        allow_none=True,
        help="""URL to connect to the Datalayer Spacer API.""",
    )

    library_url = Unicode(
        config=True,
        allow_none=True,
        help="""URL to connect to the Datalayer Library API.""",
    )

    ai_agents_url = Unicode(
        config=True,
        allow_none=True,
        help="""URL to connect to the Datalayer AI Agents API.""",
    )

    ai_inference_url = Unicode(
        config=True,
        allow_none=True,
        help="""URL to connect to the Datalayer AI Inference API.""",
    )

    @default("iam_url")
    def _default_iam_url(self) -> str:
        return DatalayerURLs.from_environment().iam_url

    @default("runtimes_url")
    def _default_runtimes_url(self) -> str:
        return DatalayerURLs.from_environment().runtimes_url

    @default("spacer_url")
    def _default_spacer_url(self) -> str:
        return DatalayerURLs.from_environment().spacer_url

    @default("library_url")
    def _default_library_url(self) -> str:
        return DatalayerURLs.from_environment().library_url

    @default("ai_agents_url")
    def _default_ai_agents_url(self) -> str:
        return DatalayerURLs.from_environment().ai_agents_url

    @default("ai_inference_url")
    def _default_ai_inference_url(self) -> str:
        return DatalayerURLs.from_environment().ai_inference_url

    @property
    def service_urls(self) -> dict:
        """The URL of every service, as the browser and the templates read them."""
        return {
            "iam_url": self.iam_url,
            "runtimes_url": self.runtimes_url,
            "spacer_url": self.spacer_url,
            "library_url": self.library_url,
            "ai_agents_url": self.ai_agents_url,
            "ai_inference_url": self.ai_inference_url,
        }

    white_label = Bool(False, config=True, help="""Display white label content.""")

    benchmarks = Bool(False, config=True, help="""Show the benchmarks page.""")

    kernels = Bool(False, config=True, help="""Show the kernels page.""")

    webapp = Bool(False, config=True, help="""Show the webapp page.""")

    class Launcher(Configurable):
        """Datalayer launcher configuration."""

        category = Unicode(
            "Datalayer",
            config=True,
            help=("Application launcher card category."),
        )

        name = Unicode(
            "Runtimes",
            config=True,
            help=("Application launcher card name."),
        )

        icon_svg_url = Unicode(
            None,
            allow_none=True,
            config=True,
            help=("Application launcher card icon."),
        )

        rank = CInt(
            0,
            config=True,
            help=("Application launcher card rank."),
        )

    launcher = Instance(Launcher)

    @default("launcher")
    def _default_launcher(self) -> "AgentRuntimesExtensionApp.Launcher":
        """
        Get default launcher configuration.

        Returns
        -------
        AgentRuntimesExtensionApp.Launcher
            The default launcher configuration instance.
        """
        return AgentRuntimesExtensionApp.Launcher(parent=self, config=self.config)

    class Brand(Configurable):
        """Datalayer brand configuration."""

        name = Unicode(
            "Datalayer",
            config=True,
            help=("Brand name."),
        )

        logo_url = Unicode(
            "https://assets.datalayer.tech/datalayer-25.svg",
            config=True,
            help=("Logo URL."),
        )

        logo_square_url = Unicode(
            "https://assets.datalayer.tech/datalayer-square.png",
            config=True,
            help=("Logo square URL."),
        )

        about = Unicode(
            "AI Agents for Data Analysis",
            config=True,
            help=("About brand."),
        )

        copyright = Unicode(
            "© 2025 Datalayer, Inc.",
            config=True,
            help=("Copyright."),
        )

        docs_url = Unicode(
            "https://docs.datalayer.app",
            config=True,
            help=("Documentation URL."),
        )

        support_url = Unicode(
            "https://datalayer.ai/support",
            config=True,
            help=("Support URL."),
        )

        pricing_url = Unicode(
            "https://datalayer.ai/pricing",
            config=True,
            help=("Pricing URL."),
        )

        terms_url = Unicode(
            "https://datalayer.ai/terms",
            config=True,
            help=("Terms URL."),
        )

        privacy_url = Unicode(
            "https://datalayer.ai/privacy",
            config=True,
            help=("Privacy URL."),
        )

    brand = Instance(Brand)

    @default("brand")
    def _default_brand(self) -> "AgentRuntimesExtensionApp.Brand":
        """
        Get default brand configuration.

        Returns
        -------
        AgentRuntimesExtensionApp.Brand
            The default brand configuration instance.
        """
        return AgentRuntimesExtensionApp.Brand(parent=self, config=self.config)

    def initialize_settings(self) -> None:
        """Initialize server settings based on configuration."""

        try:
            # Create configuration manager
            config = JupyterChatConfig()

            # Get Jupyter server connection details
            connection_url = self.serverapp.connection_url
            token = self.serverapp.token
            self.log.info(f"Jupyter server URL: {connection_url}")

            # Initialize MCP servers (check availability and discover tools)
            self.log.info("Initializing MCP servers...")
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # We're in an async context, create a task
                    import nest_asyncio

                    nest_asyncio.apply()
                mcp_servers = loop.run_until_complete(
                    initialize_config_mcp_servers(discover_tools=True)
                )
                self.log.info(f"Initialized {len(mcp_servers)} MCP servers")

                # Load initialized MCP servers into the global MCP manager
                mcp_manager_global = get_mcp_manager()
                mcp_manager_global.load_servers(mcp_servers)
            except Exception as mcp_error:
                self.log.warning(
                    f"Failed to initialize MCP servers: {mcp_error}. "
                    "MCP functionality may be limited."
                )

            # Create chat agent without eagerly attaching MCP server tools
            # We'll create the MCP connection per request to avoid async context issues
            default_model = config.get_default_model()
            self.log.info(f"Creating chat agent with model: {default_model}")

            agent = None
            try:
                agent = create_jupyter_chat_agent(model=default_model, mcp_server=None)
                if agent is None:
                    self.log.warning(
                        "Chat agent could not be created (missing API keys or configuration). "
                        "Chat functionality will be disabled."
                    )
                else:
                    self.log.info(
                        "Chat agent created; MCP tools will be attached per request"
                    )
            except Exception as agent_error:
                self.log.warning(
                    f"Failed to create chat agent: {agent_error}. "
                    "Chat functionality will be disabled. "
                    "Please check your API key configuration (e.g., ANTHROPIC_API_KEY, OPENAI_API_KEY)."
                )

            # Create MCP tool manager for additional MCP servers
            mcp_manager = MCPToolManager()

            # Load additional MCP servers from configuration
            saved_servers = config.load_mcp_servers()
            for server in saved_servers:
                self.log.info(
                    f"Loading additional MCP server: {server.name} ({server.url})"
                )
                mcp_manager.add_server(server)

            # Register additional MCP tools with agent (only if agent exists)
            if agent is not None:
                mcp_manager.register_with_agent(agent)

            # Store in settings for handlers to access
            # Store agent even if None so handlers can check for availability
            self.settings["chat_agent"] = agent
            self.settings["mcp_manager"] = mcp_manager
            self.settings["chat_config"] = config
            self.settings["chat_base_url"] = connection_url
            self.settings["chat_token"] = token

            if agent is None:
                self.log.info(
                    "Agent Runtimes extension initialized with limited functionality "
                    "(chat agent unavailable)"
                )
            else:
                self.log.info("Agent Runtimes extension initialized successfully")

        except Exception as e:
            self.log.error(
                f"Error initializing Agent Runtimes: {e}. "
                "Extension will continue with limited functionality.",
                exc_info=True,
            )
            # Don't raise - allow the extension to load with limited functionality
            # Store None values in settings so handlers can detect unavailability
            self.settings["chat_agent"] = None
            self.settings["mcp_manager"] = MCPToolManager()
            self.settings["chat_config"] = JupyterChatConfig()
            self.settings["chat_base_url"] = None
            self.settings["chat_token"] = None

        self.serverapp.answer_yes = True

        if self.benchmarks:
            self.serverapp.default_url = "/datalayer/benchmarks"
        if self.kernels:
            self.serverapp.default_url = "/datalayer/kernels"
        if self.webapp:
            self.serverapp.default_url = "/datalayer/web"

        port = get_server_port()
        if port is not None:
            self.serverapp.port = port

        settings = dict(
            **self.service_urls,
            launcher={
                "category": self.launcher.category,
                "name": self.launcher.name,
                "icon": self.launcher.icon_svg_url,
                "rank": self.launcher.rank,
            },
            brand={
                "name": self.brand.name,
                "about": self.brand.about,
                "docs_url": self.brand.docs_url,
                "support_url": self.brand.support_url,
                "pricing_url": self.brand.pricing_url,
                "terms_url": self.brand.terms_url,
                "privacy_url": self.brand.privacy_url,
            },
            white_label=self.white_label,
        )

        self.settings.update(**settings)

    def initialize_templates(self) -> None:
        """Initialize Jinja templates with Datalayer variables."""
        self.serverapp.jinja_template_vars.update(
            {
                "datalayer_version": __version__,
                **self.service_urls,
            }
        )

    def initialize_handlers(self) -> None:
        """Initialize HTTP request handlers."""
        handlers = [
            ("/", IndexHandler),
            (self.name, IndexHandler),
            (url_path_join(self.name, "config"), ConfigHandler),
            (url_path_join(self.name, "benchmarks"), IndexHandler),
            (url_path_join(self.name, "kernels"), IndexHandler),
            (url_path_join(self.name, "login"), LoginHandler),
            (url_path_join(self.name, "configure"), ConfigureHandler),
            (url_path_join(self.name, "chat"), VercelAIChatHandler),
            (url_path_join(self.name, "mcp", "servers"), MCPServersHandler),
            (url_path_join(self.name, "mcp", "servers", r"([^/]+)"), MCPServerHandler),
        ]
        self.handlers.extend(handlers)


# -----------------------------------------------------------------------------
# Main entry point
# -----------------------------------------------------------------------------


main = launch_new_instance = AgentRuntimesExtensionApp.launch_instance
