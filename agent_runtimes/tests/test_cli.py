# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the Typer-based CLI."""

import os
from unittest.mock import MagicMock, patch

import pytest
from typer.testing import CliRunner

from agent_runtimes.__main__ import app, LogLevel, list_agents_callback


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
        assert "--no-mcp-servers" in result.stdout

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

    def test_no_mcp_servers_flag_sets_env_var(self):
        """Test that --no-mcp-servers sets the environment variable."""
        with patch("uvicorn.run"):
            result = runner.invoke(
                app, ["--agent-id", "data-acquisition", "--no-mcp-servers"]
            )
            assert result.exit_code == 0
            assert os.environ.get("AGENT_RUNTIMES_NO_MCP_SERVERS") == "true"

    def test_without_no_mcp_servers_flag_clears_env_var(self):
        """Test that without --no-mcp-servers, the env var is cleared."""
        # First set it
        os.environ["AGENT_RUNTIMES_NO_MCP_SERVERS"] = "true"
        
        with patch("uvicorn.run"):
            result = runner.invoke(app, ["--agent-id", "crawler"])
            assert result.exit_code == 0
            # Should be cleared (not "true")
            assert os.environ.get("AGENT_RUNTIMES_NO_MCP_SERVERS") != "true"


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
