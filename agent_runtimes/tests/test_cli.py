# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the Typer-based CLI."""

import os
from unittest.mock import MagicMock, patch

import pytest
from typer.testing import CliRunner

from agent_runtimes.__main__ import app, LogLevel, list_agents_callback, parse_skills, parse_mcp_servers


runner = CliRunner()


class TestCLIHelp:
    """Tests for CLI help and basic functionality."""

    def test_help_flag(self):
        """Test that --help returns usage information."""
        result = runner.invoke(app, ["--help"])
        assert result.exit_code == 0
        assert "Run the agent-runtimes server" in result.stdout
        assert "--host" in result.stdout
        assert "--port" in result.stdout
        assert "--agent-id" in result.stdout
        assert "--agent-name" in result.stdout
        assert "--no-config-mcp-servers" in result.stdout
        assert "--mcp-servers" in result.stdout
        assert "--codemode" in result.stdout
        assert "--skills" in result.stdout

    def test_list_agents_flag(self):
        """Test that --list-agents lists available agents."""
        result = runner.invoke(app, ["--list-agents"])
        assert result.exit_code == 0
        assert "Available Agent Specs" in result.stdout
        # Check for known agent specs
        assert "data-acquisition" in result.stdout
        assert "crawler" in result.stdout


class TestCLIValidation:
    """Tests for CLI argument validation."""

    def test_agent_name_requires_agent_id(self):
        """Test that --agent-name without --agent-id fails."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["--agent-name", "my-agent"])
            assert result.exit_code == 1
            # uvicorn should not be called
            mock_run.assert_not_called()

    def test_invalid_agent_id(self):
        """Test that an invalid --agent-id fails."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["--agent-id", "nonexistent-agent"])
            assert result.exit_code == 1

    def test_valid_agent_id(self):
        """Test that a valid --agent-id is accepted."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["--agent-id", "data-acquisition"])
            assert result.exit_code == 0
            # Check environment variable was set
            assert os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "data-acquisition"
            mock_run.assert_called_once()

    def test_valid_agent_id_with_custom_name(self):
        """Test that a valid --agent-id with --agent-name is accepted."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(
                app, ["--agent-id", "crawler", "--agent-name", "my-crawler"]
            )
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "crawler"
            assert os.environ.get("AGENT_RUNTIMES_AGENT_NAME") == "my-crawler"
            mock_run.assert_called_once()


class TestCLIEnvironmentVariables:
    """Tests for CLI environment variable setting."""

    def test_no_config_mcp_servers_flag_sets_env_var(self):
        """Test that --no-config-mcp-servers sets the environment variable."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app, ["--no-config-mcp-servers"]
            )
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS") == "true"

    def test_env_var_sets_no_config_mcp_servers(self):
        """Test that AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS env var sets the flag via Typer."""
        # When env var is set, Typer should use it as default
        with patch.dict(os.environ, {"AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS": "true"}, clear=False):
            with patch("uvicorn.run"):
                result = runner.invoke(app, [])
                assert result.exit_code == 0
                # The env var should remain set (Typer reads it)
                assert os.environ.get("AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS") == "true"


class TestTyperEnvVarDefaults:
    """Tests for Typer's envvar feature - env vars as defaults for CLI options."""

    def test_env_var_port(self):
        """Test AGENT_RUNTIMES_PORT env var sets default port."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_PORT": "9090"}, clear=False):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, [])
                assert result.exit_code == 0
                call_kwargs = mock_run.call_args[1]
                assert call_kwargs["port"] == 9090

    def test_env_var_host(self):
        """Test AGENT_RUNTIMES_HOST env var sets default host."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_HOST": "0.0.0.0"}, clear=False):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, [])
                assert result.exit_code == 0
                call_kwargs = mock_run.call_args[1]
                assert call_kwargs["host"] == "0.0.0.0"

    def test_env_var_workers(self):
        """Test AGENT_RUNTIMES_WORKERS env var sets default workers."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_WORKERS": "4"}, clear=False):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, [])
                assert result.exit_code == 0
                call_kwargs = mock_run.call_args[1]
                assert call_kwargs["workers"] == 4

    def test_env_var_log_level(self):
        """Test AGENT_RUNTIMES_LOG_LEVEL env var sets default log level."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_LOG_LEVEL": "debug"}, clear=False):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, [])
                assert result.exit_code == 0
                call_kwargs = mock_run.call_args[1]
                assert call_kwargs["log_level"] == "debug"

    def test_env_var_agent_id(self):
        """Test AGENT_RUNTIMES_DEFAULT_AGENT env var sets default agent."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_DEFAULT_AGENT": "crawler"}, clear=False):
            with patch("uvicorn.run"):
                result = runner.invoke(app, [])
                assert result.exit_code == 0
                # The CLI should accept the env var via Typer
                assert os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "crawler"

    def test_cli_overrides_env_var(self):
        """Test that CLI arguments override env var defaults."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_PORT": "9090"}, clear=False):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, ["--port", "8888"])
                assert result.exit_code == 0
                call_kwargs = mock_run.call_args[1]
                # CLI should override env var
                assert call_kwargs["port"] == 8888


class TestCLIUvicornOptions:
    """Tests for CLI uvicorn configuration."""

    def test_default_host_and_port(self):
        """Test default host and port values."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, [])
            assert result.exit_code == 0
            mock_run.assert_called_once()
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["host"] == "127.0.0.1"
            assert call_kwargs["port"] == 8000

    def test_custom_host_and_port(self):
        """Test custom host and port values."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["--host", "0.0.0.0", "--port", "8080"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["host"] == "0.0.0.0"
            assert call_kwargs["port"] == 8080

    def test_reload_flag(self):
        """Test --reload flag."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["--reload"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["reload"] is True
            # When reload is enabled, workers should be 1
            assert call_kwargs["workers"] == 1

    def test_workers_without_reload(self):
        """Test --workers without --reload."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["--workers", "4"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["workers"] == 4

    def test_log_level(self):
        """Test --log-level option."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["--log-level", "debug"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["log_level"] == "debug"


class TestLogLevel:
    """Tests for LogLevel enum."""

    def test_log_level_values(self):
        """Test that all expected log levels are defined."""
        assert LogLevel.debug.value == "debug"
        assert LogLevel.info.value == "info"
        assert LogLevel.warning.value == "warning"
        assert LogLevel.error.value == "error"
        assert LogLevel.critical.value == "critical"


class TestListAgentsCallback:
    """Tests for the list_agents_callback function."""

    def test_callback_with_false_value(self):
        """Test callback does nothing when value is False."""
        # Should not raise
        list_agents_callback(False)

    def test_callback_with_true_value(self):
        """Test callback raises Exit when value is True."""
        import typer
        with pytest.raises(typer.Exit) as exc_info:
            list_agents_callback(True)
        assert exc_info.value.exit_code == 0


class TestShortOptions:
    """Tests for CLI short option aliases."""

    def test_short_host_option(self):
        """Test -h short option for --host."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["-h", "0.0.0.0"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["host"] == "0.0.0.0"

    def test_short_port_option(self):
        """Test -p short option for --port."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["-p", "9000"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["port"] == 9000

    def test_short_agent_id_option(self):
        """Test -a short option for --agent-id."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["-a", "crawler"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "crawler"

    def test_short_agent_name_option(self):
        """Test -n short option for --agent-name."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["-a", "crawler", "-n", "my-crawler"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_AGENT_NAME") == "my-crawler"

    def test_short_reload_option(self):
        """Test -r short option for --reload."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["-r"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["reload"] is True

    def test_short_debug_option(self):
        """Test -d short option for --debug."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["-d"])
            assert result.exit_code == 0

    def test_short_workers_option(self):
        """Test -w short option for --workers."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["-w", "2"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["workers"] == 2

    def test_short_log_level_option(self):
        """Test -l short option for --log-level."""
        with patch("uvicorn.run") as mock_run:
            result = runner.invoke(app, ["-l", "warning"])
            assert result.exit_code == 0
            call_kwargs = mock_run.call_args[1]
            assert call_kwargs["log_level"] == "warning"

    def test_short_codemode_option(self):
        """Test -c short option for --codemode."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["-c"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"

    def test_short_skills_option(self):
        """Test -s short option for --skills (requires --codemode)."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["-c", "-s", "web_search,github_lookup"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_SKILLS") == "web_search,github_lookup"


class TestCodeModeOptions:
    """Tests for Code Mode CLI options."""

    def test_codemode_flag_sets_env_var(self):
        """Test that --codemode sets the environment variable."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["--codemode"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"

    def test_env_var_sets_codemode(self):
        """Test that AGENT_RUNTIMES_CODEMODE env var sets the flag via Typer."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_CODEMODE": "true"}, clear=False):
            with patch("uvicorn.run"):
                result = runner.invoke(app, [])
                assert result.exit_code == 0
                assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"

    def test_skills_requires_codemode(self):
        """Test that --skills without --codemode fails."""
        # Ensure AGENT_RUNTIMES_CODEMODE is not set (Typer's envvar feature would use it)
        env_without_codemode = {k: v for k, v in os.environ.items() if k != "AGENT_RUNTIMES_CODEMODE"}
        with patch.dict(os.environ, env_without_codemode, clear=True):
            with patch("uvicorn.run") as mock_run:
                result = runner.invoke(app, ["--skills", "web_search"])
                assert result.exit_code == 1
                mock_run.assert_not_called()

    def test_skills_with_codemode(self):
        """Test that --skills with --codemode is accepted."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["--codemode", "--skills", "web_search,github_lookup"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"
            assert os.environ.get("AGENT_RUNTIMES_SKILLS") == "web_search,github_lookup"

    def test_codemode_with_agent_id(self):
        """Test --codemode combined with --agent-id."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["--agent-id", "crawler", "--codemode"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "crawler"
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"

    def test_codemode_with_skills_and_agent_id(self):
        """Test --codemode with --skills and --agent-id."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app, 
                ["--agent-id", "crawler", "--codemode", "--skills", "web_search"]
            )
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "crawler"
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"
            assert os.environ.get("AGENT_RUNTIMES_SKILLS") == "web_search"


class TestMcpServersOption:
    """Tests for the --mcp-servers CLI option."""

    def test_mcp_servers_sets_env_var(self):
        """Test that --mcp-servers sets the environment variable."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["--mcp-servers", "tavily,github"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "tavily,github"

    def test_env_var_sets_mcp_servers(self):
        """Test that AGENT_RUNTIMES_MCP_SERVERS env var sets the option via Typer."""
        with patch.dict(os.environ, {"AGENT_RUNTIMES_MCP_SERVERS": "tavily,github"}, clear=False):
            with patch("uvicorn.run"):
                result = runner.invoke(app, [])
                assert result.exit_code == 0
                assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "tavily,github"

    def test_mcp_servers_with_codemode(self):
        """Test --mcp-servers with --codemode sets both env vars."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["--codemode", "--mcp-servers", "tavily,github"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "tavily,github"
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"

    def test_mcp_servers_with_agent_id(self):
        """Test --mcp-servers combined with --agent-id."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["--agent-id", "crawler", "--mcp-servers", "filesystem"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT") == "crawler"
            assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "filesystem"

    def test_short_mcp_servers_option(self):
        """Test -m short option for --mcp-servers."""
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["-m", "tavily,github"])
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "tavily,github"

    def test_mcp_servers_with_codemode_and_skills(self):
        """Test --mcp-servers with --codemode and --skills."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app, 
                ["--codemode", "--mcp-servers", "tavily", "--skills", "web_search"]
            )
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_MCP_SERVERS") == "tavily"
            assert os.environ.get("AGENT_RUNTIMES_CODEMODE") == "true"
            assert os.environ.get("AGENT_RUNTIMES_SKILLS") == "web_search"


class TestParseMcpServers:
    """Tests for the parse_mcp_servers helper function."""

    def test_parse_empty_string(self):
        """Test parsing empty string returns empty list."""
        assert parse_mcp_servers("") == []
        assert parse_mcp_servers(None) == []

    def test_parse_single_server(self):
        """Test parsing a single MCP server."""
        assert parse_mcp_servers("tavily") == ["tavily"]

    def test_parse_multiple_servers(self):
        """Test parsing multiple comma-separated MCP servers."""
        assert parse_mcp_servers("tavily,github,filesystem") == [
            "tavily", "github", "filesystem"
        ]

    def test_parse_servers_with_spaces(self):
        """Test parsing MCP servers with spaces around commas."""
        assert parse_mcp_servers("tavily , github , filesystem") == [
            "tavily", "github", "filesystem"
        ]

    def test_parse_servers_with_empty_entries(self):
        """Test parsing MCP servers ignores empty entries."""
        assert parse_mcp_servers("tavily,,github") == ["tavily", "github"]


class TestParseSkills:
    """Tests for the parse_skills helper function."""

    def test_parse_empty_string(self):
        """Test parsing empty string returns empty list."""
        assert parse_skills("") == []
        assert parse_skills(None) == []

    def test_parse_single_skill(self):
        """Test parsing a single skill."""
        assert parse_skills("web_search") == ["web_search"]

    def test_parse_multiple_skills(self):
        """Test parsing multiple comma-separated skills."""
        assert parse_skills("web_search,github_lookup,file_read") == [
            "web_search", "github_lookup", "file_read"
        ]

    def test_parse_skills_with_spaces(self):
        """Test parsing skills with spaces around commas."""
        assert parse_skills("web_search , github_lookup , file_read") == [
            "web_search", "github_lookup", "file_read"
        ]

    def test_parse_skills_with_empty_entries(self):
        """Test parsing skills ignores empty entries."""
        assert parse_skills("web_search,,github_lookup") == ["web_search", "github_lookup"]
