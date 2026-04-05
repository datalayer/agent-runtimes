# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""About/logo animation for Agent Runtimes Chat TUX."""

import asyncio
import time

from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.style import Style
from rich.text import Text

from .utils import check_escape_pressed, raw_terminal

# Primary accent color (matches tux.py)
STYLE_PRIMARY = Style(color="rgb(26,188,156)")


async def about_animation(console: Console) -> None:
    """Display About Datalayer animation with walking logo.

    Args:
        console: Rich Console instance for output.
    """
    # Simple Datalayer logo animation frames with tagline
    tagline = "[bold white]AI Agents for Data Analysis[/bold white]\n[dim]Cheaper • Faster • Collaborative[/dim]"
    frames = [
        # Frame 1
        Text.from_markup(f"""
   [cyan]▄▄▄▄▄▄[/cyan]
   [cyan]▄▄▄▄▄▄[/cyan]
   [cyan]▄▄▄▄▄▄[/cyan]
   [cyan]▀    ▀[/cyan]

{tagline}
"""),
        # Frame 2
        Text.from_markup(f"""
   [green]▄▄[/green][cyan]▄▄▄▄[/cyan]
   [green]▄▄▄[/green][cyan]▄▄▄[/cyan]
   [green]▄▄▄▄[/green][cyan]▄▄[/cyan]
   [green]▀[/green]    [cyan]▀[/cyan]

{tagline}
"""),
        # Frame 3
        Text.from_markup(f"""
   [bright_green]▄▄[/bright_green][green]▄▄▄▄[/green]
   [bright_green]▄▄▄[/bright_green][green]▄▄▄[/green]
   [bright_green]▄▄▄▄[/bright_green][green]▄▄[/green]
   [bright_green]▀[/bright_green]    [green]▀[/green]

{tagline}
"""),
        # Frame 4 - pulse
        Text.from_markup(f"""
   [bold bright_green]▄▄[/bold bright_green][bright_green]▄▄▄▄[/bright_green]
   [bold bright_green]▄▄▄[/bold bright_green][bright_green]▄▄▄[/bright_green]
   [bold bright_green]▄▄▄▄[/bold bright_green][bright_green]▄▄[/bright_green]
   [bold bright_green]▀[/bold bright_green]    [bright_green]▀[/bright_green]

{tagline}
"""),
        # Frame 5
        Text.from_markup(f"""
   [bright_green]▄▄[/bright_green][green]▄▄▄▄[/green]
   [bright_green]▄▄▄[/bright_green][green]▄▄▄[/green]
   [bright_green]▄▄▄▄[/bright_green][green]▄▄[/green]
   [bright_green]▀[/bright_green]    [green]▀[/green]

{tagline}
"""),
        # Frame 6
        Text.from_markup(f"""
   [green]▄▄[/green][cyan]▄▄▄▄[/cyan]
   [green]▄▄▄[/green][cyan]▄▄▄[/cyan]
   [green]▄▄▄▄[/green][cyan]▄▄[/cyan]
   [green]▀[/green]    [cyan]▀[/cyan]

{tagline}
"""),
    ]

    console.print()

    console.print()

    try:
        with (
            raw_terminal(),
            Live(console=console, refresh_per_second=8, transient=True) as live,
        ):
            # Phase 1: Blinking for 2 seconds
            start_time = time.time()
            duration = 2.0

            while time.time() - start_time < duration:
                if check_escape_pressed():
                    return
                for frame in frames:
                    if check_escape_pressed():
                        return
                    if time.time() - start_time >= duration:
                        break
                    live.update(
                        Panel(
                            frame,
                            border_style=STYLE_PRIMARY,
                            title=" Datalayer ",
                            subtitle="[link=https://datalayer.ai]datalayer.ai[/link]",
                        )
                    )
                    await asyncio.sleep(0.15)

            # Phase 2: Walking animation - logo moves right
            # Each step: feet move, then layer 3, then layer 2, then layer 1
            # Logo layers (from top to bottom):
            # Line 1: ▄▄▄▄▄▄
            # Line 2: ▄▄▄▄▄▄
            # Line 3: ▄▄▄▄▄▄
            # Line 4: ▀    ▀  (feet)

            base_offset = 3  # Starting offset (spaces before logo)

            for step in range(22):  # 22 steps to the right
                if check_escape_pressed():
                    return
                offset = base_offset + step

                # Sub-frame 1: Feet move first
                frame = Text.from_markup(f"""
{" " * offset}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * offset}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * offset}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * (offset + 1)}[bright_green]▀    ▀[/bright_green]

{tagline}
""")
                live.update(
                    Panel(
                        frame,
                        border_style=STYLE_PRIMARY,
                        title=" Datalayer ",
                        subtitle="[link=https://datalayer.ai]datalayer.ai[/link]",
                    )
                )
                await asyncio.sleep(0.08)

                # Sub-frame 2: Layer 3 moves
                frame = Text.from_markup(f"""
{" " * offset}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * offset}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * (offset + 1)}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * (offset + 1)}[bright_green]▀    ▀[/bright_green]

{tagline}
""")
                live.update(
                    Panel(
                        frame,
                        border_style=STYLE_PRIMARY,
                        title=" Datalayer ",
                        subtitle="[link=https://datalayer.ai]datalayer.ai[/link]",
                    )
                )
                await asyncio.sleep(0.08)

                # Sub-frame 3: Layer 2 moves
                frame = Text.from_markup(f"""
{" " * offset}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * (offset + 1)}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * (offset + 1)}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * (offset + 1)}[bright_green]▀    ▀[/bright_green]

{tagline}
""")
                live.update(
                    Panel(
                        frame,
                        border_style=STYLE_PRIMARY,
                        title=" Datalayer ",
                        subtitle="[link=https://datalayer.ai]datalayer.ai[/link]",
                    )
                )
                await asyncio.sleep(0.08)

                # Sub-frame 4: Layer 1 (top) moves - logo fully shifted
                frame = Text.from_markup(f"""
{" " * (offset + 1)}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * (offset + 1)}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * (offset + 1)}[bright_green]▄▄▄▄▄▄[/bright_green]
{" " * (offset + 1)}[bright_green]▀    ▀[/bright_green]

{tagline}
""")
                live.update(
                    Panel(
                        frame,
                        border_style=STYLE_PRIMARY,
                        title=" Datalayer ",
                        subtitle="[link=https://datalayer.ai]datalayer.ai[/link]",
                    )
                )
                await asyncio.sleep(0.08)

            # Phase 3: Blinking for 2 seconds at final position
            final_offset = base_offset + 22
            start_time = time.time()
            duration = 2.0

            # Create frames at the final position
            final_frames = [
                Text.from_markup(f"""
{" " * final_offset}[cyan]▄▄▄▄▄▄[/cyan]
{" " * final_offset}[cyan]▄▄▄▄▄▄[/cyan]
{" " * final_offset}[cyan]▄▄▄▄▄▄[/cyan]
{" " * final_offset}[cyan]▀    ▀[/cyan]

{tagline}
"""),
                Text.from_markup(f"""
{" " * final_offset}[green]▄▄[/green][cyan]▄▄▄▄[/cyan]
{" " * final_offset}[green]▄▄▄[/green][cyan]▄▄▄[/cyan]
{" " * final_offset}[green]▄▄▄▄[/green][cyan]▄▄[/cyan]
{" " * final_offset}[green]▀[/green]    [cyan]▀[/cyan]

{tagline}
"""),
                Text.from_markup(f"""
{" " * final_offset}[bright_green]▄▄[/bright_green][green]▄▄▄▄[/green]
{" " * final_offset}[bright_green]▄▄▄[/bright_green][green]▄▄▄[/green]
{" " * final_offset}[bright_green]▄▄▄▄[/bright_green][green]▄▄[/green]
{" " * final_offset}[bright_green]▀[/bright_green]    [green]▀[/green]

{tagline}
"""),
                Text.from_markup(f"""
{" " * final_offset}[bold bright_green]▄▄[/bold bright_green][bright_green]▄▄▄▄[/bright_green]
{" " * final_offset}[bold bright_green]▄▄▄[/bold bright_green][bright_green]▄▄▄[/bright_green]
{" " * final_offset}[bold bright_green]▄▄▄▄[/bold bright_green][bright_green]▄▄[/bright_green]
{" " * final_offset}[bold bright_green]▀[/bold bright_green]    [bright_green]▀[/bright_green]

{tagline}
"""),
                Text.from_markup(f"""
{" " * final_offset}[bright_green]▄▄[/bright_green][green]▄▄▄▄[/green]
{" " * final_offset}[bright_green]▄▄▄[/bright_green][green]▄▄▄[/green]
{" " * final_offset}[bright_green]▄▄▄▄[/bright_green][green]▄▄[/green]
{" " * final_offset}[bright_green]▀[/bright_green]    [green]▀[/green]

{tagline}
"""),
                Text.from_markup(f"""
{" " * final_offset}[green]▄▄[/green][cyan]▄▄▄▄[/cyan]
{" " * final_offset}[green]▄▄▄[/green][cyan]▄▄▄[/cyan]
{" " * final_offset}[green]▄▄▄▄[/green][cyan]▄▄[/cyan]
{" " * final_offset}[green]▀[/green]    [cyan]▀[/cyan]

{tagline}
"""),
            ]

            while time.time() - start_time < duration:
                if check_escape_pressed():
                    return
                for frame in final_frames:
                    if check_escape_pressed():
                        return
                    if time.time() - start_time >= duration:
                        break
                    live.update(
                        Panel(
                            frame,
                            border_style=STYLE_PRIMARY,
                            title=" Datalayer ",
                            subtitle="[link=https://datalayer.ai]datalayer.ai[/link]",
                        )
                    )
                    await asyncio.sleep(0.15)

    except KeyboardInterrupt:
        pass

    console.print()
