# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the Typer-based CLI."""

import json
import os
from unittest.mock import MagicMock, patch

from typer.testing import CliRunner

from agent_runtimes.__main__ import app
from agent_runtimes.commands.list_agents import OutputFormat
from agent_runtimes.commands.serve import LogLevel, parse_mcp_servers, parse_skills

runner = CliRunner(
    env={"NO_COLOR": "1", "TERM": "dumb", "_TYPER_STANDARD_TRACEBACK": "1"}
)


class TestCLIHelp:
    """Tests for CLI help and basic functionality."""

    def test_help_flag(self) -> None:
        """Test that --help returns usage information."""
        result = runner.invoke(app, ["--help"])
        assert result.exit_code == 0
        assert "Agent Runtimes CLI" in result.stdout
        assert "serve" in result.stdout
        assert "list-agents" in result.stdout
        assert "list-specs" in result.stdout

    def test_serve_help_flag(self) -> None:
        """Test that serve --help returns usage information."""
        result = runner.invoke(app, ["serve", "--help"])
        assert result.exit_code == 0
        assert "Start the agent-runtimes server" in result.stdout
        assert "--host" in result.stdout
        assert "--port" in result.stdout
        assert "--agent-id" in result.stdout
        assert "--agent-name" in result.stdout
        assert "--no-config-mcp-servers" in result.stdout
        assert "--mcp-servers" in result.stdout
        assert "--codemode" in result.stdout
        assert "--skills" in result.stdout

    def test_list_agents_help_flag(self) -> None:
        """Test that list-agents --help returns usage information."""
        result = runner.invoke(app, ["list-agents", "--help"])
        assert result.exit_code == 0
        assert "List running agents on a server" in result.stdout
        assert "--host" in result.stdout
        assert "--port" in result.stdout
        assert "--output" in result.stdout

    def test_list_specs_help_flag(self) -> None:
        """Test that list-specs --help returns usage information."""
        result = runner.invoke(app, ["list-specs", "--help"])
        assert result.exit_code == 0
        assert "List available agent specs" in result.stdout
        assert "--output" in result.stdout

    def test_list_specs_command(self) -> None:
        """Test that list-specs lists available agents."""
        result = runner.invoke(app, ["list-specs"])
        assert result.exit_code == 0
        assert "Available Agent Specs" in result.stdout
        # Check for known agent specs
        assert "data-acquisition" in result.stdout
        assert "crawler" in result.stdout

    def test_list_specs_json_output(self) -> None:
        """Test that list-specs --output json returns valid JSON."""
        result = runner.invoke(app, ["list-specs", "--output", "json"])
        assert result.exit_code == 0
        data = json.loads(result.stdout)
        assert isinstance(data, list)
        assert len(data) > 0
        # Check for known agent
        ids = [spec["id"] for spec in data]
        assert "datalayer-ai/crawler" in ids


class TestServeValidation:
    """Tests for serve command argument validation."""

    def test_agent_name_requires_agent_id(self) -> None:
        """Test that --agent-name without --agent-id fails."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["serve", "--agent-name", "my-agent"])
            assert result.exit_code == 1
            # uvicorn should not be called
            mock_run.assert_not_called()

    def test_invalid_agent_id(self) -> None:
        """Test that an invalid --agent-id fails."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["serve", "--agent-id", "nonexistent-agent"])
            assert result.exit_code == 1

    def test_valid_agent_id(self) -> None:
        """Test that a valid --agent-id is accepted."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(
                app, ["serve", "--agent-id", "codemode-paper/data-acquisition"]
            )
            assert result.exit_code == 0
            # Check environment variable was set
            assert (
                os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT")
                == "codemode-paper/data-acquisition"
            )
            mock_run.assert_called_once()

    def test_valid_agent_id_with_custom_name(self) -> None:
        """Test that a valid --agent-id with --agent-name is accepted."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(
                app,
                [
                    "serve",
                    "--agent-id",
                    "datalayer-ai/crawler",
                    "--agent-name",
                    "my-crawler",
                ],
            )
            assert result.exit_code == 0
            assert (
                os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "datalayer-ai/crawler"
            )
            assert os.environ.get("AGENT_RUNTIMES_AGENT_NAME") == "my-crawler"
            mock_run.assert_called_once()


class TestServeEnvironmentVariables:
    """Tests for serve command environment variable setting."""

    def test_no_config_mcp_servers_flag_sets_env_var(self) -> None:
        """Test that --no-config-mcp-servers sets the environment variable."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["serve", "--no-config-mcp-servers"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS") == "true"

    def test_env_var_sets_no_config_mcp_servers(self) -> None:
        """Test that AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS env var sets the flag via Typer."""
        # When env var is set, Typer should use it as default
        with patch.dict(
            os.environ, {"AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS": "true"}, clear=False
        ):
            with patch("uvicorn.run"):
                result = runner.invoke(app, ["serve"])
                assert result.exit_code == 0
                # The env var should remain set (Typer reads it)
                assert os.environ.get("AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS") == "true"


class TestTyperEnvVarDefaults:
    """Tests for Typer's envvar feature - env vars as defaults for CLI options."""

    def test_env_var_port(self) -> None:
        """Test AGENT_RUNTIMES_PORT env var sets default port."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_PORT": "9090"}, clear=False):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, ["serve"])
                assert result.exit_code == 0
                call_kwargs = mock_run.call_args[1]
                assert call_kwargs["port"] == 9090

    def test_env_var_host(self) -> None:
        """Test AGENT_RUNTIMES_HOST env var sets default host."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_HOST": "0.0.0.0"}, clear=False):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, ["serve"])
                assert result.exit_code == 0
                call_kwargs = mock_run.call_args[1]
                assert call_kwargs["host"] == "0.0.0.0"

    def test_env_var_workers(self) -> None:
        """Test AGENT_RUNTIMES_WORKERS env var sets default workers."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_WORKERS": "4"}, clear=False):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, ["serve"])
                assert result.exit_code == 0
                call_kwargs = mock_run.call_args[1]
                assert call_kwargs["workers"] == 4

    def test_env_var_log_level(self) -> None:
        """Test AGENT_RUNTIMES_LOG_LEVEL env var sets default log level."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_LOG_LEVEL": "debug"}, clear=False):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, ["serve"])
                assert result.exit_code == 0
                call_kwargs = mock_run.call_args[1]
                assert call_kwargs["log_level"] == "debug"

    def test_env_var_agent_id(self) -> None:
        """Test AGENT_RUNTIMES_DEFAULT_AGENT env var sets default agent."""
        with patch.dict(
            os.environ,
            {"AGENT_RUNTIMES_DEFAULT_AGENT": "datalayer-ai/crawler"},
            clear=False,
        ):
            with patch("uvicorn.run"):
                result = runner.invoke(app, ["serve"])
                assert result.exit_code == 0
                # The CLI should accept the env var via Typer
                assert (
                    os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT")
                    == "datalayer-ai/crawler"
                )

    def test_cli_overrides_env_var(self) -> None:
        """Test that CLI arguments override env var defaults."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_PORT": "9090"}, clear=False):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, ["serve", "--port", "8888"])
                assert result.exit_code == 0
                call_kwargs = mock_run.call_args[1]
                # CLI should override env var
                assert call_kwargs["port"] == 8888


class TestServeUvicornOptions:
    """Tests for serve command uvicorn configuration."""

    def test_default_host_and_port(self) -> None:
        """Test default host and port values."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["serve"])
            assert result.exit_code == 0
            mock_run.assert_called_once()
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["host"] == "127.0.0.1"
            assert call_kwargs["port"] == 8000

    def test_custom_host_and_port(self) -> None:
        """Test custom host and port values."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(
                app, ["serve", "--host", "0.0.0.0", "--port", "8080"]
            )
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["host"] == "0.0.0.0"
            assert call_kwargs["port"] == 8080

    def test_reload_flag(self) -> None:
        """Test --reload flag."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["serve", "--reload"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["reload"] is True
            # When reload is enabled, workers should be 1
            assert call_kwargs["workers"] == 1

    def test_workers_without_reload(self) -> None:
        """Test --workers without --reload."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["serve", "--workers", "4"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["workers"] == 4

    def test_log_level(self) -> None:
        """Test --log-level option."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["serve", "--log-level", "debug"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["log_level"] == "debug"


class TestLogLevel:
    """Tests for LogLevel enum."""

    def test_log_level_values(self) -> None:
        """Test that all expected log levels are defined."""
        assert LogLevel.debug.value == "debug"
        assert LogLevel.info.value == "info"
        assert LogLevel.warning.value == "warning"
        assert LogLevel.error.value == "error"
        assert LogLevel.critical.value == "critical"


class TestOutputFormat:
    """Tests for OutputFormat enum."""

    def test_output_format_values(self) -> None:
        """Test that all expected output formats are defined."""
        assert OutputFormat.table.value == "table"
        assert OutputFormat.json.value == "json"


class TestShortOptions:
    """Tests for CLI short option aliases."""

    def test_short_host_option(self) -> None:
        """Test -h short option for --host."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["serve", "-h", "0.0.0.0"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["host"] == "0.0.0.0"

    def test_short_port_option(self) -> None:
        """Test -p short option for --port."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["serve", "-p", "9000"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["port"] == 9000

    def test_short_agent_id_option(self) -> None:
        """Test -a short option for --agent-id."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["serve", "-a", "datalayer-ai/crawler"])
            assert result.exit_code == 0
            assert (
                os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "datalayer-ai/crawler"
            )

    def test_short_agent_name_option(self) -> None:
        """Test -n short option for --agent-name."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app, ["serve", "-a", "datalayer-ai/crawler", "-n", "my-crawler"]
            )
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_AGENT_NAME") == "my-crawler"

    def test_short_reload_option(self) -> None:
        """Test -r short option for --reload."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["serve", "-r"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["reload"] is True

    def test_short_debug_option(self) -> None:
        """Test -d short option for --debug."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["serve", "-d"])
            assert result.exit_code == 0

    def test_short_workers_option(self) -> None:
        """Test -w short option for --workers."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["serve", "-w", "2"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["workers"] == 2

    def test_short_log_level_option(self) -> None:
        """Test -l short option for --log-level."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["serve", "-l", "warning"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["log_level"] == "warning"

    def test_short_codemode_option(self) -> None:
        """Test -c short option for --codemode."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["serve", "-c"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"

    def test_short_skills_option(self) -> None:
        """Test -s short option for --skills (requires --codemode)."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app, ["serve", "-c", "-s", "web_search,github_lookup"]
            )
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_SKILLS") == "web_search,github_lookup"


class TestCodeModeOptions:
    """Tests for Code Mode CLI options."""

    def test_codemode_flag_sets_env_var(self) -> None:
        """Test that --codemode sets the environment variable."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["serve", "--codemode"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"

    def test_env_var_sets_codemode(self) -> None:
        """Test that AGENT_RUNTIMES_CODEMODE env var sets the flag via Typer."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_CODEMODE": "true"}, clear=False):
            with patch("uvicorn.run"):
                result = runner.invoke(app, ["serve"])
                assert result.exit_code == 0
                assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"

    def test_skills_requires_codemode(self) -> None:
        """Test that --skills without --codemode fails."""
        # Ensure AGENT_RUNTIMES_CODEMODE is not set (Typer's envvar feature would use it)
        env_without_codemode = {
            k: v for k, v in os.environ.items() if k != "AGENT_RUNTIMES_CODEMODE"
        }
        with patch.dict(os.environ, env_without_codemode, clear=True):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, ["serve", "--skills", "web_search"])
                assert result.exit_code == 1
                mock_run.assert_not_called()

    def test_skills_with_codemode(self) -> None:
        """Test that --skills with --codemode is accepted."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app, ["serve", "--codemode", "--skills", "web_search,github_lookup"]
            )
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"
            assert os.environ.get("AGENT_RUNTIMES_SKILLS") == "web_search,github_lookup"

    def test_codemode_with_agent_id(self) -> None:
        """Test --codemode combined with --agent-id."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app, ["serve", "--agent-id", "datalayer-ai/crawler", "--codemode"]
            )
            assert result.exit_code == 0
            assert (
                os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "datalayer-ai/crawler"
            )
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"

    def test_codemode_with_skills_and_agent_id(self) -> None:
        """Test --codemode with --skills and --agent-id."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app,
                [
                    "serve",
                    "--agent-id",
                    "datalayer-ai/crawler",
                    "--codemode",
                    "--skills",
                    "write-code,edit-code",
                ],
            )
            assert result.exit_code == 0
            assert (
                os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "datalayer-ai/crawler"
            )
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"
            assert os.environ.get("AGENT_RUNTIMES_SKILLS") == "write-code,edit-code"


class TestMcpServersOption:
    """Tests for the --mcp-servers CLI option."""

    def test_mcp_servers_sets_env_var(self) -> None:
        """Test that --mcp-servers sets the environment variable."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["serve", "--mcp-servers", "tavily,github"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "tavily,github"

    def test_env_var_sets_mcp_servers(self) -> None:
        """Test that AGENT_RUNTIMES_MCP_SERVERS env var sets the option via Typer."""
        with patch.dict(
            os.environ, {"AGENT_RUNTIMES_MCP_SERVERS": "tavily,github"}, clear=False
        ):
            with patch("uvicorn.run"):
                result = runner.invoke(app, ["serve"])
                assert result.exit_code == 0
                assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "tavily,github"

    def test_mcp_servers_with_codemode(self) -> None:
        """Test --mcp-servers with --codemode sets both env vars."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app, ["serve", "--codemode", "--mcp-servers", "tavily,github"]
            )
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "tavily,github"
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"

    def test_mcp_servers_with_agent_id(self) -> None:
        """Test --mcp-servers combined with --agent-id."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app,
                [
                    "serve",
                    "--agent-id",
                    "datalayer-ai/crawler",
                    "--mcp-servers",
                    "filesystem",
                ],
            )
            assert result.exit_code == 0
            assert (
                os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "datalayer-ai/crawler"
            )
            assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "filesystem"

    def test_short_mcp_servers_option(self) -> None:
        """Test -m short option for --mcp-servers."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["serve", "-m", "tavily,github"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "tavily,github"

    def test_mcp_servers_with_codemode_and_skills(self) -> None:
        """Test --mcp-servers with --codemode and --skills."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app,
                [
                    "serve",
                    "--codemode",
                    "--mcp-servers",
                    "tavily",
                    "--skills",
                    "web_search",
                ],
            )
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "tavily"
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"
            assert os.environ.get("AGENT_RUNTIMES_SKILLS") == "web_search"


class TestListAgentsCommand:
    """Tests for the list-agents command."""

    def test_list_agents_connection_error(self) -> None:
        """Test list-agents when server is not running."""
        result = runner.invoke(app, ["list-agents", "--port", "59999"])
        assert result.exit_code == 1
        # Error message can be in stdout or stderr depending on typer output handling
        output = result.stdout + (result.output if hasattr(result, "output") else "")
        assert (
            "Could not connect" in output or "Error" in output or result.exit_code == 1
        )

    def test_list_agents_with_mock(self) -> None:
        """Test list-agents with mocked HTTP response."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "agents": [{"id": "test-agent", "name": "Test Agent", "status": "running"}]
        }
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.Client") as mock_client_class:
            mock_client = MagicMock()
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client.get.return_value = mock_response
            mock_client_class.return_value = mock_client

            result = runner.invoke(app, ["list-agents"])
            assert result.exit_code == 0
            assert "test-agent" in result.stdout

    def test_list_agents_json_output_with_mock(self) -> None:
        """Test list-agents --output json with mocked HTTP response."""
        mock_response = MagicMock()
        mock_data = {
            "agents": [{"id": "test-agent", "name": "Test Agent", "status": "running"}]
        }
        mock_response.json.return_value = mock_data
        mock_response.raise_for_status = MagicMock()

        with patch("httpx.Client") as mock_client_class:
            mock_client = MagicMock()
            mock_client.__enter__ = MagicMock(return_value=mock_client)
            mock_client.__exit__ = MagicMock(return_value=False)
            mock_client.get.return_value = mock_response
            mock_client_class.return_value = mock_client

            result = runner.invoke(app, ["list-agents", "--output", "json"])
            assert result.exit_code == 0
            data = json.loads(result.stdout)
            assert "agents" in data


class TestParseMcpServers:
    """Tests for the parse_mcp_servers helper function."""

    def test_parse_empty_string(self) -> None:
        """Test parsing empty string returns empty list."""
        assert parse_mcp_servers("") == []
        assert parse_mcp_servers(None) == []

    def test_parse_single_server(self) -> None:
        """Test parsing a single MCP server."""
        assert parse_mcp_servers("tavily") == ["tavily"]

    def test_parse_multiple_servers(self) -> None:
        """Test parsing multiple comma-separated MCP servers."""
        assert parse_mcp_servers("tavily,github,filesystem") == [
            "tavily",
            "github",
            "filesystem",
        ]

    def test_parse_servers_with_spaces(self) -> None:
        """Test parsing MCP servers with spaces around commas."""
        assert parse_mcp_servers("tavily , github , filesystem") == [
            "tavily",
            "github",
            "filesystem",
        ]

    def test_parse_servers_with_empty_entries(self) -> None:
        """Test parsing MCP servers ignores empty entries."""
        assert parse_mcp_servers("tavily,,github") == ["tavily", "github"]


class TestParseSkills:
    """Tests for the parse_skills helper function."""

    def test_parse_empty_string(self) -> None:
        """Test parsing empty string returns empty list."""
        assert parse_skills("") == []
        assert parse_skills(None) == []

    def test_parse_single_skill(self) -> None:
        """Test parsing a single skill."""
        assert parse_skills("web_search") == ["web_search"]

    def test_parse_multiple_skills(self) -> None:
        """Test parsing multiple comma-separated skills."""
        assert parse_skills("web_search,github_lookup,file_read") == [
            "web_search",
            "github_lookup",
            "file_read",
        ]

    def test_parse_skills_with_spaces(self) -> None:
        """Test parsing skills with spaces around commas."""
        assert parse_skills("web_search , github_lookup , file_read") == [
            "web_search",
            "github_lookup",
            "file_read",
        ]

    def test_parse_skills_with_empty_entries(self) -> None:
        """Test parsing skills ignores empty entries."""
        assert parse_skills("web_search,,github_lookup") == [
            "web_search",
            "github_lookup",
        ]
