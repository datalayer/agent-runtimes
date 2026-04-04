# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Matrix rain animation for Agent Runtimes Chat TUX."""

import asyncio
import random
import shutil
import time

from rich.console import Console
from rich.live import Live
from rich.text import Text

from .utils import raw_terminal, check_escape_pressed


async def rain_animation(console: Console) -> None:
    """Display Matrix rain animation (5 seconds).
    
    Args:
        console: Rich Console instance for output.
    """
    # Get terminal size
    term_size = shutil.get_terminal_size()
    width = term_size.columns
    height = term_size.lines - 2
    
    # Matrix characters
    chars = "ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ01234567890"
    
    # Columns state: each column has (position, speed, char_list)
    columns = []
    for _ in range(width):
        # Random start position (negative = delayed start)
        pos = random.randint(-height, 0)
        speed = random.randint(1, 3)
        trail_len = random.randint(5, 15)
        columns.append({"pos": pos, "speed": speed, "trail": trail_len})
    
    console.print()
    
    # Run for 5 seconds
    start_time = time.time()
    duration = 5.0
    
    try:
        with raw_terminal(), Live(console=console, refresh_per_second=15, transient=True) as live:
            while time.time() - start_time < duration:
                if check_escape_pressed():
                    break
                
                # Build frame
                grid = [[" " for _ in range(width)] for _ in range(height)]
                
                for col_idx, col in enumerate(columns):
                    head_pos = col["pos"]
                    trail_len = col["trail"]
                    
                    for i in range(trail_len):
                        row = head_pos - i
                        if 0 <= row < height:
                            char = random.choice(chars)
                            grid[row][col_idx] = char
                    
                    # Move column down
                    col["pos"] += col["speed"]
                    
                    # Reset when off screen
                    if col["pos"] - col["trail"] > height:
                        col["pos"] = random.randint(-10, 0)
                        col["speed"] = random.randint(1, 3)
                        col["trail"] = random.randint(5, 15)
                
                # Render with colors
                text = Text()
                for row_idx, row in enumerate(grid):
                    for col_idx, char in enumerate(row):
                        if char != " ":
                            # Brightest at head, dimmer down trail
                            col = columns[col_idx]
                            dist_from_head = col["pos"] - row_idx
                            if dist_from_head <= 1:
                                text.append(char, style="bold bright_green")
                            elif dist_from_head <= 3:
                                text.append(char, style="green")
                            elif dist_from_head <= 6:
                                text.append(char, style="dark_green")
                            else:
                                text.append(char, style="dim green")
                        else:
                            text.append(" ")
                    text.append("\n")
                
                live.update(text)
                await asyncio.sleep(0.066)  # ~15 fps
    except KeyboardInterrupt:
        pass
    
    console.print()
