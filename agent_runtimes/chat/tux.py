# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Terminal UX (TUX) for the Agent Runtimes Chat assistant."""

import asyncio
import getpass
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from .commands import SlashCommand, build_commands

import httpx
from prompt_toolkit import PromptSession
from prompt_toolkit.completion import Completer, Completion
from prompt_toolkit.cursor_shapes import CursorShape
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.styles import Style as PTStyle
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from rich.columns import Columns
from rich.live import Live
from rich.style import Style
from rich.box import ROUNDED

from .banner import (
    GOODBYE_MESSAGE,
)

# Rich styles matching Datalayer brand
# Brand color reference (from BRAND_MANUAL.md):
# - Green brand #16A085 (dark) - Brand accent, icons, dividers, headings
# - Green accent #1ABC9C (medium) - Icons, charts, highlights on dark surfaces
# - Green text #117A65 - Accessible green for text & buttons
# - Green bright #2ECC71 (light) - Highlights and glow on dark backgrounds
# - Gray #59595C - Supporting text, hints, metadata
#
# For dark terminal backgrounds, use brighter greens (#1ABC9C, #2ECC71) for visibility
STYLE_PRIMARY = Style(color="rgb(26,188,156)")  # Green accent #1ABC9C - primary accent in dark mode
STYLE_SECONDARY = Style(color="rgb(22,160,133)")  # Green brand #16A085 - secondary accent
STYLE_ACCENT = Style(color="rgb(46,204,113)")  # Green bright #2ECC71 - highlights
STYLE_MUTED = Style(color="rgb(89,89,92)")  # Gray #59595C - supporting text
STYLE_WHITE = Style(color="white")  # Primary text in dark mode
STYLE_ERROR = Style(color="red")  # Error states
STYLE_WARNING = Style(color="yellow")  # Warning states

# Context grid symbols
SYMBOL_SYSTEM = "⛁"
SYMBOL_TOOLS = "⛀"
SYMBOL_MESSAGES = "⛁"
SYMBOL_FREE = "⛶"
SYMBOL_BUFFER = "⛝"


class SlashCommandCompleter(Completer):
    """Completer for slash commands with menu-style display."""

    def __init__(self, commands: dict[str, "SlashCommand"]):
        self.commands = commands

    def get_completions(self, document: Any, complete_event: Any) -> Any:
        """Yield completions for slash commands."""
        text = document.text_before_cursor

        # Only show completions when input starts with /
        if not text.startswith("/"):
            return

        # Get the partial command (without the leading /)
        partial = text[1:].lower()

        # Track which commands we've shown (to avoid duplicates from aliases)
        shown = set()

        for name, cmd in sorted(self.commands.items()):
            # Only show primary command names, not aliases
            if cmd.name in shown:
                continue

            # Match if partial matches start of command name or is empty
            if name.startswith(partial) and cmd.name == name:
                shown.add(cmd.name)

                # Truncate description to fit in menu
                desc = cmd.description
                if len(desc) > 70:
                    desc = desc[:67] + "..."

                yield Completion(
                    text=f"/{cmd.name}",
                    start_position=-len(text),
                    display=HTML(f"<ansicyan>/{cmd.name}</ansicyan>"),
                    display_meta=HTML(f"<ansibrightblack>{desc}</ansibrightblack>"),
                )


@dataclass
class ToolCallInfo:
    """Information about a tool call."""
    tool_call_id: str
    tool_name: str
    args_json: str = ""
    result: Optional[str] = None
    status: str = "in_progress"  # in_progress, complete, error
    expanded: bool = False

    def format_args(self, max_value_len: int = 40) -> str:
        """Format arguments for display."""
        if not self.args_json:
            return ""
        try:
            args = json.loads(self.args_json)
            if isinstance(args, dict):
                # Show key=value pairs with truncated values
                items = list(args.items())[:3]
                parts = []
                for k, v in items:
                    val_str = str(v).replace("\n", " ")
                    if len(val_str) > max_value_len:
                        val_str = val_str[:max_value_len - 3] + "..."
                    parts.append(f"{k}={val_str}")
                summary = ", ".join(parts)
                if len(args) > 3:
                    summary += f" (+{len(args) - 3} more)"
                return summary
            return self.args_json[:60] + "..." if len(self.args_json) > 60 else self.args_json
        except json.JSONDecodeError:
            return self.args_json[:60] + "..." if len(self.args_json) > 60 else self.args_json


@dataclass
class SessionStats:
    """Session statistics for token tracking."""
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_requests: int = 0
    messages: int = 0
    tool_calls: int = 0

    @property
    def total_tokens(self) -> int:
        return self.total_input_tokens + self.total_output_tokens


class CliTux:
    """Terminal UX for the Agent Runtimes Chat assistant."""

    def __init__(
        self,
        agent_url: str,
        server_url: str = "http://127.0.0.1:8000",
        agent_id: str = "chat",
        eggs: bool = False,
        jupyter_url: Optional[str] = None,
        extra_suggestions: Optional[list[str]] = None,
    ):
        """Initialize the TUX.

        Args:
            agent_url: URL of the AG-UI agent endpoint
            server_url: Base URL of the agent-runtimes server
            agent_id: Agent ID for API calls
            eggs: Enable Easter egg commands
            jupyter_url: Jupyter server URL (only set when sandbox is jupyter)
            extra_suggestions: Additional suggestions provided via --suggestions flag
        """
        self.agent_url = agent_url
        self.server_url = server_url.rstrip("/")
        self.agent_id = agent_id
        self.eggs = eggs
        self.jupyter_url = jupyter_url
        self.extra_suggestions: list[str] = extra_suggestions or []
        self.console = Console()
        self.stats = SessionStats()
        self.running = False
        self.model_name: str = "unknown"
        self.context_window: int = 128000
        self.tool_calls: list[ToolCallInfo] = []  # Track tool calls from last response
        self._agui_client: Optional[Any] = None  # Persistent AG-UI client for conversation history

        # Initialize slash commands
        self.commands: dict[str, SlashCommand] = build_commands(
            self, eggs=eggs, jupyter_url=jupyter_url
        )

        # Initialize prompt session with slash command completer
        # Style for the completion menu matching Datalayer brand colors
        self.prompt_style = PTStyle.from_dict({
            "prompt": "#1ABC9C bold",  # Green accent
            "completion-menu.completion": "bg:#2d2d2d #ffffff",
            "completion-menu.completion.current": "bg:#16A085 #ffffff bold",
            "completion-menu.meta.completion": "bg:#2d2d2d #59595C",
            "completion-menu.meta.completion.current": "bg:#16A085 #ffffff",
            "scrollbar.background": "bg:#444444",
            "scrollbar.button": "bg:#16A085",
        })
        self.prompt_session: Optional[PromptSession] = None

    def _format_tokens(self, tokens: int) -> str:
        """Format token count with K suffix for thousands."""
        if tokens >= 1000:
            return f"{tokens / 1000:.1f}k"
        return str(tokens)

    def _get_username(self) -> str:
        """Get the current username."""
        return getpass.getuser()

    def _get_cwd(self) -> str:
        """Get current working directory, shortened if needed."""
        cwd = Path.cwd()
        home = Path.home()
        try:
            return f"~/{cwd.relative_to(home)}"
        except ValueError:
            return str(cwd)

    def show_welcome(self) -> None:
        """Display the welcome banner."""
        username = self._get_username()
        cwd = self._get_cwd()

        from . import __version__
        version = __version__.__version__

        # ASCII art logo - Datalayer inspired (3 horizontal bars + feet)
        # Compact version: 6 chars wide
        # Row 1: short (2) + long (4) = 6 total
        # Row 2: equal (3 + 3) = 6 total
        # Row 3: long (4) + short (2) = 6 total
        # Row 4: feet - one char on each side
        logo = Text()
        logo.append("   ▄▄", style=STYLE_ACCENT)
        logo.append("▄▄▄▄\n", style=STYLE_SECONDARY)
        logo.append("   ▄▄▄", style=STYLE_ACCENT)
        logo.append("▄▄▄\n", style=STYLE_SECONDARY)
        logo.append("   ▄▄▄▄", style=STYLE_ACCENT)
        logo.append("▄▄\n", style=STYLE_SECONDARY)
        logo.append("   ▀", style=STYLE_ACCENT)
        logo.append("    ▀\n", style=STYLE_SECONDARY)

        # Left panel content
        left_content = Text()
        left_content.append(f"\n  Welcome back {username}!\n\n", style=STYLE_WHITE)
        left_content.append(logo)
        left_content.append(f"\n  agent-runtimes chat\n", style=STYLE_MUTED)
        left_content.append(f"  {cwd}\n", style=STYLE_MUTED)

        # Right panel content - tips
        right_content = Text()
        right_content.append("Tips for getting started\n", style=STYLE_WHITE)
        right_content.append("Type ", style=STYLE_MUTED)
        right_content.append("/", style=STYLE_PRIMARY)
        right_content.append(" to see all commands\n", style=STYLE_MUTED)
        right_content.append("─" * 40 + "\n", style=STYLE_MUTED)
        right_content.append("Slash Commands\n", style=STYLE_WHITE)
        right_content.append("/context - View context usage\n", style=STYLE_MUTED)
        right_content.append("/status - Check connection status\n", style=STYLE_MUTED)
        right_content.append("/clear - Start fresh conversation\n", style=STYLE_MUTED)
        right_content.append("/exit - Exit from agent-runtimes chat\n", style=STYLE_MUTED)

        # Create side-by-side layout
        left_panel = Panel(
            left_content,
            border_style=STYLE_SECONDARY,
            width=40,
        )
        right_panel = Panel(
            right_content,
            border_style=STYLE_SECONDARY,
            width=50,
        )

        # Create the main panel
        title = f" Agent Runtimes Chat {version} "

        main_panel = Panel(
            Columns([left_panel, right_panel], equal=False, expand=True),
            title=title,
            title_align="left",
            border_style=STYLE_PRIMARY,
            box=ROUNDED,
        )

        self.console.print(main_panel)
        self.console.print()

    def _create_key_bindings(self) -> KeyBindings:
        """Create keyboard shortcuts for slash commands.

        Uses Meta/Alt key combinations (e.g., 'escape', 'x' for Alt+X).
        """
        kb = KeyBindings()

        # Map shortcuts to command names
        # Shortcuts are stored as tuples for multi-key sequences
        shortcut_map: dict[tuple[str, ...], str] = {}
        for cmd in self.commands.values():
            if cmd.shortcut and cmd.name not in shortcut_map.values():
                # Parse shortcut string into tuple (e.g., "escape x" -> ("escape", "x"))
                keys = tuple(cmd.shortcut.split())
                shortcut_map[keys] = cmd.name

        # Create a handler that returns the command string
        def make_handler(cmd_name: str) -> Any:
            async def handler(event: Any) -> None:
                # Set the buffer to the command and accept it
                event.current_buffer.text = f"/{cmd_name}"
                event.current_buffer.validate_and_handle()
            return handler

        # Register each shortcut - unpack tuple as separate arguments
        for keys, cmd_name in shortcut_map.items():
            kb.add(*keys)(make_handler(cmd_name))

        return kb

    async def show_prompt(self) -> str:
        """Display the prompt and get user input with slash command completion."""
        # Initialize prompt session lazily (after commands are registered)
        if self.prompt_session is None:
            completer = SlashCommandCompleter(self.commands)
            key_bindings = self._create_key_bindings()
            self.prompt_session = PromptSession(
                completer=completer,
                style=self.prompt_style,
                complete_while_typing=True,
                complete_in_thread=True,
                key_bindings=key_bindings,
                cursor=CursorShape.BLINKING_BLOCK,
            )

        try:
            # Use prompt_toolkit's async prompt method
            return (await self.prompt_session.prompt_async(
                HTML("<ansicyan>❯ </ansicyan>"),
                complete_while_typing=True,
            )).strip()
        except EOFError:
            return "/exit"
        except KeyboardInterrupt:
            return ""

    async def handle_command(self, user_input: str) -> Optional[str]:
        """Handle a slash command.

        Returns:
            None if no command matched or the command produced no follow-up.
            A non-empty string when a command returns a prompt to send to the agent
            (e.g. /suggestions returns the chosen suggestion text).
            The empty string "" signals the command was handled but has no follow-up.
        """
        if not user_input.startswith("/"):
            return None

        parts = user_input[1:].split(maxsplit=1)
        cmd_name = parts[0].lower() if parts else ""
        # args = parts[1] if len(parts) > 1 else ""

        if cmd_name in self.commands:
            cmd = self.commands[cmd_name]
            if cmd.handler:
                result = await cmd.handler()
                # Commands may return a string to use as the next prompt
                if result:
                    return result
            return ""  # Command handled, no follow-up
        else:
            # Unknown command - show error with hint
            self.console.print(f"Unknown command: /{cmd_name}", style=STYLE_ERROR)
            self.console.print("Type /help to see available commands, or start typing / to see suggestions.", style=STYLE_MUTED)
            return ""  # Handled (error shown)

    async def send_message(self, message: str) -> None:
        """Send a message to the agent and stream the response."""
        from agent_runtimes.transports.clients import AGUIClient
        from ag_ui.core import EventType

        self.stats.messages += 1
        self.tool_calls = []  # Reset tool calls for this response
        current_tool_call: Optional[ToolCallInfo] = None
        turn_start = time.monotonic()

        try:
            # Create or reuse the AG-UI client for conversation history
            if self._agui_client is None:
                self._agui_client = AGUIClient(self.agent_url)
                await self._agui_client.connect()

            client = self._agui_client

            # Show thinking indicator
            with self.console.status("[bold green]Thinking...", spinner="dots"):
                # Small delay to let status appear
                await asyncio.sleep(0.1)

            self.console.print()
            # Use a colored bullet (blink doesn't work in most terminals)
            self.console.print("● ", style=STYLE_PRIMARY, end="")

            response_text = ""
            input_tokens = 0
            output_tokens = 0

            async for event in client.run(message):
                if event.type == EventType.TEXT_MESSAGE_CONTENT:
                    content = event.delta or ""
                    response_text += content
                    self.console.print(content, end="", markup=False)

                elif event.type == EventType.TOOL_CALL_START:
                    # Start of a new tool call
                    # Use event properties which handle both camelCase and snake_case
                    tool_call_id = event.tool_call_id or ""
                    tool_name = event.tool_name or "tool"
                    current_tool_call = ToolCallInfo(
                        tool_call_id=tool_call_id,
                        tool_name=tool_name,
                        status="in_progress",
                    )
                    self.tool_calls.append(current_tool_call)
                    tool_num = len(self.tool_calls)
                    self.stats.tool_calls += 1
                    # Show tool call indicator inline with number
                    self.console.print()
                    self.console.print(f"  ⚙ [{tool_num}] {tool_name}", style=STYLE_SECONDARY, end="")

                elif event.type == EventType.TOOL_CALL_ARGS:
                    # Accumulate tool arguments
                    if current_tool_call:
                        delta = event.tool_args or ""
                        current_tool_call.args_json += delta

                elif event.type == EventType.TOOL_CALL_END:
                    # Tool call arguments complete, now executing
                    if current_tool_call:
                        args_summary = current_tool_call.format_args(max_value_len=50)
                        if args_summary:
                            self.console.print(f"({args_summary})", style=STYLE_MUTED, end="")
                        self.console.print(" ...", style=STYLE_MUTED)

                elif event.type == EventType.TOOL_CALL_RESULT:
                    # Tool execution result
                    tool_call_id = event.tool_call_id or ""
                    result = event.tool_result or ""
                    # Find the matching tool call
                    for tc in self.tool_calls:
                        if tc.tool_call_id == tool_call_id:
                            tc.result = str(result) if result else ""
                            tc.status = "complete"
                            # Show completion
                            result_preview = tc.result[:80] + "..." if len(tc.result) > 80 else tc.result
                            result_preview = result_preview.replace("\n", " ")
                            self.console.print(f"    ✓ {result_preview}", style=STYLE_ACCENT)
                            break
                    current_tool_call = None

                elif event.type == EventType.RUN_FINISHED:
                    break

                elif event.type == EventType.RUN_ERROR:
                    if current_tool_call:
                        current_tool_call.status = "error"
                    self.console.print(f"\n[red]Error: {event.error}[/red]")
                    break

            self.console.print()

            # Show tool calls summary if any occurred
            if self.tool_calls:
                self._show_tool_calls_summary()

            # Fetch updated usage stats
            try:
                async with httpx.AsyncClient() as http_client:
                    url = f"{self.server_url}/api/v1/configure/agents/{self.agent_id}/context-snapshot"
                    resp = await http_client.get(url, timeout=5.0)
                    if resp.status_code == 200:
                        data = resp.json()
                        input_tokens = data.get("sumResponseInputTokens", 0)
                        output_tokens = data.get("sumResponseOutputTokens", 0)
                        self.model_name = data.get("modelName", self.model_name) or self.model_name
                        self.context_window = data.get("contextWindow", self.context_window)
            except Exception:
                pass

            # Update stats
            self.stats.total_input_tokens = input_tokens
            self.stats.total_output_tokens = output_tokens

            # Show token usage line
            usage_line = Text()
            usage_line.append("─" * 80, style=STYLE_MUTED)
            self.console.print(usage_line)

            total = input_tokens + output_tokens
            elapsed = time.monotonic() - turn_start
            if elapsed < 60:
                time_str = f"{elapsed:.1f}s"
            else:
                minutes, secs = divmod(elapsed, 60)
                time_str = f"{int(minutes)}m {secs:.0f}s"
            self.console.print(
                f"  {self._format_tokens(total)} tokens used · "
                f"{self._format_tokens(input_tokens)} in / {self._format_tokens(output_tokens)} out · "
                f"{time_str}",
                style=STYLE_MUTED,
            )
            self.console.print()

        except ConnectionRefusedError:
            self.console.print("[red]Error: Could not connect to agent server[/red]")
        except Exception as e:
            self.console.print(f"[red]Error: {e}[/red]")

    def _show_tool_calls_summary(self) -> None:
        """Show a brief summary line of tool calls made."""
        if not self.tool_calls:
            return

        completed = sum(1 for tc in self.tool_calls if tc.status == "complete")
        total = len(self.tool_calls)
        tool_names = [tc.tool_name for tc in self.tool_calls[:3]]
        tools_str = ", ".join(tool_names)
        if len(self.tool_calls) > 3:
            tools_str += f" (+{len(self.tool_calls) - 3} more)"

        self.console.print(
            f"  ⚙ {completed}/{total} tools executed: {tools_str}  ",
            style=STYLE_MUTED,
            end=""
        )
        self.console.print("\\[/tools-last for details]", style=Style(color="rgb(89,89,92)", italic=True))

    async def run(self) -> None:
        """Run the main TUX loop."""
        self.running = True

        # Fetch initial model info
        try:
            async with httpx.AsyncClient() as client:
                url = f"{self.server_url}/api/v1/configure/agents/{self.agent_id}/context-snapshot"
                response = await client.get(url, timeout=5.0)
                if response.status_code == 200:
                    data = response.json()
                    # Try to get model name from various sources
                    self.model_name = data.get("modelName") or "claude-sonnet-4"
                    self.context_window = data.get("contextWindow", 128000)
        except Exception:
            pass

        self.show_welcome()

        while self.running:
            try:
                user_input = await self.show_prompt()

                if not user_input:
                    continue

                # Check for slash commands
                if user_input.startswith("/"):
                    result = await self.handle_command(user_input)
                    # If a command returned a prompt string, send it to the agent
                    if result:
                        await self.send_message(result)
                else:
                    await self.send_message(user_input)

            except KeyboardInterrupt:
                self.console.print()
                from .commands import exit as _exit_cmd
                await _exit_cmd.execute(self)
            except EOFError:
                from .commands import exit as _exit_cmd
                await _exit_cmd.execute(self)


async def run_tux(
    agent_url: str,
    server_url: str = "http://127.0.0.1:8000",
    agent_id: str = "chat",
    eggs: bool = False,
    jupyter_url: Optional[str] = None,
    extra_suggestions: Optional[list[str]] = None,
) -> None:
    """Run the Agent Runtimes Chat assistant TUX.

    Args:
        agent_url: URL of the AG-UI agent endpoint
        server_url: Base URL of the agent-runtimes server
        agent_id: Agent ID for API calls
        eggs: Enable Easter egg commands
        jupyter_url: Jupyter server URL (only set when sandbox is jupyter)
        extra_suggestions: Additional suggestions provided via --suggestions flag
    """
    tux = CliTux(agent_url, server_url, agent_id, eggs=eggs, jupyter_url=jupyter_url, extra_suggestions=extra_suggestions)
    await tux.run()
