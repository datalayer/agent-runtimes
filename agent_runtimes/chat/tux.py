# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Terminal UX (TUX) for the Agent Runtimes Chat assistant."""

import asyncio
import getpass
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from prompt_toolkit import PromptSession
from prompt_toolkit.completion import Completer, Completion
from prompt_toolkit.cursor_shapes import CursorShape
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.styles import Style as PTStyle
from rich.box import ROUNDED
from rich.columns import Columns
from rich.console import Console, Group
from rich.panel import Panel
from rich.style import Style
from rich.text import Text

from .commands import SlashCommand, build_commands

# Rich styles matching Datalayer brand
# Brand color reference (from BRAND_MANUAL.md):
# - Green brand #16A085 (dark) - Brand accent, icons, dividers, headings
# - Green accent #1ABC9C (medium) - Icons, charts, highlights on dark surfaces
# - Green text #117A65 - Accessible green for text & buttons
# - Green bright #2ECC71 (light) - Highlights and glow on dark backgrounds
# - Gray #59595C - Supporting text, hints, metadata
#
# For dark terminal backgrounds, use brighter greens (#1ABC9C, #2ECC71) for visibility
STYLE_PRIMARY = Style(
    color="rgb(26,188,156)"
)  # Green accent 0x1ABC9C - primary accent in dark mode
STYLE_SECONDARY = Style(
    color="rgb(22,160,133)"
)  # Green brand 0x16A085 - secondary accent
STYLE_ACCENT = Style(color="rgb(46,204,113)")  # Green bright 0x2ECC71 - highlights
STYLE_MUTED = Style(color="rgb(89,89,92)")  # Gray 0x59595C - supporting text
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
                        val_str = val_str[: max_value_len - 3] + "..."
                    parts.append(f"{k}={val_str}")
                summary = ", ".join(parts)
                if len(args) > 3:
                    summary += f" (+{len(args) - 3} more)"
                return summary
            return (
                self.args_json[:60] + "..."
                if len(self.args_json) > 60
                else self.args_json
            )
        except json.JSONDecodeError:
            return (
                self.args_json[:60] + "..."
                if len(self.args_json) > 60
                else self.args_json
            )


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
        self._agui_client: Optional[Any] = (
            None  # Persistent AG-UI client for conversation history
        )

        # Initialize slash commands
        self.commands: dict[str, SlashCommand] = build_commands(
            self, eggs=eggs, jupyter_url=jupyter_url
        )

        # Initialize prompt session with slash command completer
        # Style for the completion menu matching Datalayer brand colors
        self.prompt_style = PTStyle.from_dict(
            {
                "prompt": "#1ABC9C bold",  # Green accent
                "completion-menu.completion": "bg:#2d2d2d #ffffff",
                "completion-menu.completion.current": "bg:#16A085 #ffffff bold",
                "completion-menu.meta.completion": "bg:#2d2d2d #59595C",
                "completion-menu.meta.completion.current": "bg:#16A085 #ffffff",
                "scrollbar.background": "bg:#444444",
                "scrollbar.button": "bg:#16A085",
            }
        )
        self.prompt_session: Optional[PromptSession] = None

    def _format_tokens(self, tokens: int) -> str:
        """Format token count with K suffix for thousands."""
        if tokens >= 1000:
            return f"{tokens / 1000:.1f}k"
        return str(tokens)

    async def _animate_waiting_dot(self, stop_event: asyncio.Event) -> None:
        """Animate a pulsing green activity dot until ``stop_event`` is set.

        Uses Rich ``Live`` so the color/redraw is handled reliably across
        terminals (manual ``\\r`` reprints could drop the color escape and
        render as plain text on light backgrounds).
        """
        from rich.live import Live
        from rich.text import Text

        # Glyph size + brightness pulse for a clear fade in/out. Kept on the
        # bright end of the palette so it stays visible on light themes.
        frames: list[tuple[str, str]] = [
            ("·", "rgb(22,160,133)"),
            ("•", "rgb(26,188,156)"),
            ("●", "rgb(46,204,113)"),
            ("⬤", "bold rgb(46,204,113)"),
            ("●", "rgb(46,204,113)"),
            ("•", "rgb(26,188,156)"),
        ]
        frame_idx = 0
        try:
            with Live(
                console=self.console,
                refresh_per_second=16,
                transient=True,
            ) as live:
                while not stop_event.is_set():
                    glyph, style = frames[frame_idx]
                    live.update(Text(f"  {glyph}", style=style))
                    frame_idx = (frame_idx + 1) % len(frames)
                    await asyncio.sleep(0.12)
        except Exception:
            # Never let the indicator break the response flow.
            pass

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

    @staticmethod
    def _truncate_middle(text: str, max_len: int) -> str:
        """Truncate ``text`` to ``max_len`` chars, keeping both ends."""
        if max_len <= 1 or len(text) <= max_len:
            return text
        keep = max_len - 1  # room for the ellipsis
        head = (keep + 1) // 2
        tail = keep - head
        return f"{text[:head]}…{text[-tail:]}" if tail else f"{text[:keep]}…"

    @staticmethod
    def _extract_tokens_from_payload(payload: Any) -> tuple[Optional[int], Optional[int]]:
        """Best-effort extraction of input/output tokens from AG-UI event payloads.

        Handles snake_case/camelCase fields and common nesting patterns like
        ``usage`` and ``contextSnapshot.turnUsage``.
        """

        def _as_int(value: Any) -> Optional[int]:
            try:
                if value is None:
                    return None
                return int(value)
            except Exception:
                return None

        def _from_dict(d: dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
            # Direct fields
            in_tok = _as_int(d.get("input_tokens"))
            out_tok = _as_int(d.get("output_tokens"))
            if in_tok is None:
                in_tok = _as_int(d.get("inputTokens"))
            if out_tok is None:
                out_tok = _as_int(d.get("outputTokens"))

            # Nested usage objects
            usage = d.get("usage")
            if isinstance(usage, dict):
                if in_tok is None:
                    in_tok = _as_int(usage.get("input_tokens"))
                if out_tok is None:
                    out_tok = _as_int(usage.get("output_tokens"))
                if in_tok is None:
                    in_tok = _as_int(usage.get("inputTokens"))
                if out_tok is None:
                    out_tok = _as_int(usage.get("outputTokens"))

            # Snapshot/delta path used by monitoring payloads
            context_snapshot = d.get("contextSnapshot")
            if isinstance(context_snapshot, dict):
                turn_usage = context_snapshot.get("turnUsage")
                if isinstance(turn_usage, dict):
                    if in_tok is None:
                        in_tok = _as_int(turn_usage.get("inputTokens"))
                    if out_tok is None:
                        out_tok = _as_int(turn_usage.get("outputTokens"))

            # Also support top-level turnUsage payloads
            turn_usage = d.get("turnUsage")
            if isinstance(turn_usage, dict):
                if in_tok is None:
                    in_tok = _as_int(turn_usage.get("inputTokens"))
                if out_tok is None:
                    out_tok = _as_int(turn_usage.get("outputTokens"))

            return in_tok, out_tok

        if isinstance(payload, dict):
            return _from_dict(payload)
        return None, None

    def _get_display_name(self) -> str:
        """Resolve a friendly display name for the welcome banner.

        Best-effort: prefers the authenticated Datalayer profile's full name,
        otherwise falls back to a friendly form of the OS username. The lookup
        is time-bounded so it never noticeably blocks startup.
        """
        from datalayer_core.utils.handles import format_friendly_handle

        name = self._resolve_datalayer_name()
        if name:
            return name
        return format_friendly_handle(self._get_username())

    def _resolve_datalayer_name(self) -> Optional[str]:
        """Look up the logged-in Datalayer user's display name (best-effort)."""
        import concurrent.futures

        def _lookup() -> Optional[str]:
            try:
                from datalayer_core.client.client import DatalayerClient
                from datalayer_core.utils.handles import format_display_name

                profile = DatalayerClient()._get_profile()
                if not isinstance(profile, dict):
                    return None
                user = profile.get("profile")
                if not isinstance(user, dict):
                    user = profile
                name = format_display_name(
                    user.get("first_name_t") or user.get("first_name"),
                    user.get("last_name_t") or user.get("last_name"),
                    user.get("handle_s") or user.get("handle"),
                )
                return name if name and name != "unknown" else None
            except Exception:
                return None

        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                return executor.submit(_lookup).result(timeout=1.5)
        except Exception:
            return None

    def show_welcome(self) -> None:
        """Display the welcome banner."""
        display_name = self._get_display_name()
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
        left_content.append(logo)
        left_content.append("\n", style=STYLE_MUTED)
        left_content.append(f"  Welcome back {display_name}!\n", style=STYLE_WHITE)
        left_content.append(
            "  https://datalayer.ai\n",
            style=Style(color="rgb(26,188,156)", underline=True, link="https://datalayer.ai"),
        )

        # Right panel content - tips
        right_content = Text()
        right_content.append("Tips for getting started\n", style=STYLE_WHITE)
        right_content.append("Type ", style=STYLE_MUTED)
        right_content.append("/", style=STYLE_PRIMARY)
        right_content.append(" to see all commands\n", style=STYLE_MUTED)
        right_content.append("─" * 40 + "\n", style=STYLE_MUTED)

        def _append_tip(command: str, description: str, is_last: bool = False) -> None:
            right_content.append(f"{command:<9}", style=STYLE_PRIMARY)
            if is_last:
                right_content.append(f"- {description}", style=STYLE_MUTED)
            else:
                right_content.append(f"- {description}\n", style=STYLE_MUTED)

        _append_tip("/context", "View context usage")
        _append_tip("/status", "Check connection status")
        _append_tip("/clear", "Start fresh conversation")
        _append_tip("/exit", "Exit from loop", is_last=True)

        # Create side-by-side layout
        inner_panel_height = 10
        left_panel = Panel(
            left_content,
            border_style=STYLE_SECONDARY,
            width=40,
            height=inner_panel_height,
        )
        right_panel = Panel(
            right_content,
            border_style=STYLE_SECONDARY,
            width=50,
            height=inner_panel_height,
        )

        # Footer row beneath the two inner panels.
        footer_left = Text(" AI-Powered Data Assistant", style=STYLE_MUTED)
        footer_right = Text(" Cheaper • Faster • Collaborative", style=STYLE_MUTED)

        # Create the main panel
        title = f" LOOP ⟳ {version} "

        content = Group(
            Columns([left_panel, right_panel], equal=False, expand=True),
            Columns([footer_left, footer_right], equal=False, expand=True),
        )

        main_panel = Panel(
            content,
            title=title,
            title_align="left",
            border_style=STYLE_PRIMARY,
            box=ROUNDED,
        )

        self.console.print(main_panel)
        # Current working directory, shown full-width beneath the box and
        # truncated (keeping both ends) only if it overflows the terminal.
        path_line = self._truncate_middle(cwd, max(10, self.console.width - 2))
        self.console.print(f" {path_line}", style=STYLE_MUTED)
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
            return (
                await self.prompt_session.prompt_async(
                    HTML("<ansicyan>❯ </ansicyan>"),
                    complete_while_typing=True,
                )
            ).strip()
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
            self.console.print(
                "/help to see available commands, or start typing / to see suggestions.",
                style=STYLE_MUTED,
            )
            return ""  # Handled (error shown)

    async def send_message(self, message: str) -> None:
        """Send a message to the agent and stream the response."""
        from ag_ui.core import EventType

        from agent_runtimes.transports.clients import AGUIClient

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
            waiting_stop = asyncio.Event()
            waiting_task = asyncio.create_task(self._animate_waiting_dot(waiting_stop))
            waiting_cleared = False

            async def _clear_waiting_indicator(show_bullet: bool = False) -> None:
                nonlocal waiting_cleared
                if waiting_cleared:
                    return
                waiting_stop.set()
                try:
                    await waiting_task
                except Exception:
                    pass
                waiting_cleared = True
                if show_bullet:
                    self.console.print("● ", style=STYLE_PRIMARY, end="")

            response_text = ""
            turn_input_tokens = 0
            turn_output_tokens = 0
            stream_input_tokens: Optional[int] = None
            stream_output_tokens: Optional[int] = None
            run_finished = False

            async for event in client.run(message):
                # Extract token usage directly from AG-UI events when available.
                in_tok, out_tok = self._extract_tokens_from_payload(event.data)
                if in_tok is not None:
                    stream_input_tokens = in_tok
                if out_tok is not None:
                    stream_output_tokens = out_tok

                # The server appends an authoritative ``usage`` event (derived
                # from pydantic-ai's ``result.usage()``) *after* RUN_FINISHED.
                # Once that trailing event has been consumed, stop reading.
                if run_finished and (in_tok is not None or out_tok is not None):
                    break

                if event.type == EventType.TEXT_MESSAGE_CONTENT:
                    await _clear_waiting_indicator(show_bullet=True)
                    content = event.delta or ""
                    response_text += content
                    self.console.print(content, end="", markup=False)

                elif event.type == EventType.TOOL_CALL_START:
                    await _clear_waiting_indicator(show_bullet=False)
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
                    self.console.print(
                        f"  ⚙ [{tool_num}] {tool_name}", style=STYLE_SECONDARY, end=""
                    )

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
                            self.console.print(
                                f"({args_summary})", style=STYLE_MUTED, end=""
                            )
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
                            result_preview = (
                                tc.result[:80] + "..."
                                if len(tc.result) > 80
                                else tc.result
                            )
                            result_preview = result_preview.replace("\n", " ")
                            self.console.print(
                                f"    ✓ {result_preview}", style=STYLE_ACCENT
                            )
                            break
                    current_tool_call = None

                elif event.type == EventType.RUN_FINISHED:
                    await _clear_waiting_indicator(show_bullet=False)
                    # Do not break immediately: the server emits a trailing
                    # ``usage`` event (authoritative pydantic-ai
                    # ``result.usage()``) right after RUN_FINISHED. Mark the run
                    # finished and keep draining so that event is consumed. The
                    # loop stops once the usage tokens are captured (see the
                    # top of the loop) or the SSE stream closes.
                    run_finished = True
                    continue

                elif event.type == EventType.RUN_ERROR:
                    await _clear_waiting_indicator(show_bullet=False)
                    if current_tool_call:
                        current_tool_call.status = "error"
                    self.console.print(f"\n[red]Error: {event.error}[/red]")
                    break

            await _clear_waiting_indicator(show_bullet=False)

            self.console.print()

            # Show tool calls summary if any occurred
            if self.tool_calls:
                self._show_tool_calls_summary()

            # Fetch updated usage stats
            try:
                from agent_runtimes.context.session import get_agent_context_snapshot

                def _to_int(value: Any, default: int = 0) -> int:
                    try:
                        if value is None:
                            return default
                        return int(value)
                    except Exception:
                        return default

                snapshot = get_agent_context_snapshot(self.agent_id)
                if snapshot is not None:
                    data = snapshot.to_dict()
                    turn_usage = data.get("turnUsage") or {}
                    session_usage = data.get("sessionUsage") or {}

                    # Prefer explicit per-turn usage (most accurate for the footer).
                    turn_input_tokens = _to_int(turn_usage.get("inputTokens"), 0)
                    turn_output_tokens = _to_int(turn_usage.get("outputTokens"), 0)

                    # Highest-priority source: stream events from this exact turn.
                    if stream_input_tokens is not None:
                        turn_input_tokens = stream_input_tokens
                    if stream_output_tokens is not None:
                        turn_output_tokens = stream_output_tokens

                    # Session totals for /status and aggregate tracking.
                    sum_input_tokens = _to_int(data.get("sumResponseInputTokens"), 0)
                    sum_output_tokens = _to_int(data.get("sumResponseOutputTokens"), 0)
                    if sum_input_tokens == 0 and sum_output_tokens == 0:
                        sum_input_tokens = _to_int(
                            session_usage.get("inputTokens"), self.stats.total_input_tokens
                        )
                        sum_output_tokens = _to_int(
                            session_usage.get("outputTokens"), self.stats.total_output_tokens
                        )

                    # Fallbacks when turnUsage is not populated by the provider.
                    if turn_input_tokens == 0 and turn_output_tokens == 0:
                        model_input_tokens = _to_int(data.get("modelInputTokens"), 0)
                        model_output_tokens = _to_int(data.get("modelOutputTokens"), 0)
                        if model_input_tokens > 0 or model_output_tokens > 0:
                            turn_input_tokens = model_input_tokens
                            turn_output_tokens = model_output_tokens
                        else:
                            turn_input_tokens = max(
                                0, sum_input_tokens - self.stats.total_input_tokens
                            )
                            turn_output_tokens = max(
                                0, sum_output_tokens - self.stats.total_output_tokens
                            )

                    input_tokens = sum_input_tokens
                    output_tokens = sum_output_tokens
                    self.model_name = (
                        data.get("modelName", self.model_name) or self.model_name
                    )
                    self.context_window = data.get("contextWindow", self.context_window)
                else:
                    input_tokens = self.stats.total_input_tokens
                    output_tokens = self.stats.total_output_tokens
            except Exception:
                input_tokens = self.stats.total_input_tokens
                output_tokens = self.stats.total_output_tokens

            # Final stream fallback if snapshot retrieval failed or was stale.
            if stream_input_tokens is not None:
                turn_input_tokens = stream_input_tokens
            if stream_output_tokens is not None:
                turn_output_tokens = stream_output_tokens

            # Update stats
            self.stats.total_input_tokens = input_tokens
            self.stats.total_output_tokens = output_tokens

            # Show token usage line
            usage_line = Text()
            usage_line.append("─" * 80, style=STYLE_MUTED)
            self.console.print(usage_line)

            total = turn_input_tokens + turn_output_tokens
            elapsed = time.monotonic() - turn_start
            if elapsed < 60:
                time_str = f"{elapsed:.1f}s"
            else:
                minutes, secs = divmod(elapsed, 60)
                time_str = f"{int(minutes)}m {secs:.0f}s"
            self.console.print(
                f"  {self._format_tokens(total)} tokens used · "
                f"{self._format_tokens(turn_input_tokens)} in / {self._format_tokens(turn_output_tokens)} out · "
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
            end="",
        )
        self.console.print(
            "\\[/tools-last for details]",
            style=Style(color="rgb(89,89,92)", italic=True),
        )

    async def run(self) -> None:
        """Run the main TUX loop."""
        self.running = True

        # Fetch initial model info
        try:
            from agent_runtimes.context.session import get_agent_context_snapshot

            snapshot = get_agent_context_snapshot(self.agent_id)
            if snapshot is not None:
                data = snapshot.to_dict()
                model_name = data.get("modelName")
                if model_name:
                    self.model_name = model_name
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
    tux = CliTux(
        agent_url,
        server_url,
        agent_id,
        eggs=eggs,
        jupyter_url=jupyter_url,
        extra_suggestions=extra_suggestions,
    )
    await tux.run()
