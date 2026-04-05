# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Banner and animation utilities for the Agent Runtimes Chat assistant."""

import io
import random
import sys
import time
from typing import Any

try:
    import requests
    from PIL import Image

    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# ANSI color codes - Datalayer brand colors
# Using True Color (24-bit) for precise color matching
#
# Brand color reference (from BRAND_MANUAL.md):
# - Green brand #16A085 (dark) - Brand accent, icons, dividers, headings
# - Green accent #1ABC9C (medium) - Icons, charts, highlights on dark surfaces
# - Green text #117A65 - Accessible green for text & buttons (AA+ on white)
# - Green bright #2ECC71 (light) - Highlights and glow on dark backgrounds
# - Green tint #E9F7F1 - Soft background for success / callouts
# - Gray #59595C - Supporting text, hints, metadata (AA on white)
# - Black #000000 - Primary text
# - White #FFFFFF - Primary app background
#
# For dark terminal backgrounds, use brighter greens (#1ABC9C, #2ECC71) for visibility
GREEN_DARK = "\033[38;2;22;160;133m"  # #16A085 - Green brand
GREEN_MEDIUM = "\033[38;2;26;188;156m"  # #1ABC9C - Green accent
GREEN_LIGHT = "\033[38;2;46;204;113m"  # #2ECC71 - Green bright
GREEN_TEXT = "\033[38;2;17;122;101m"  # #117A65 - Accessible green text
RED = "\033[38;2;231;76;60m"  # #E74C3C - Error / missing
GRAY = "\033[38;2;89;89;92m"  # #59595C - Secondary text
WHITE = "\033[38;2;255;255;255m"  # #FFFFFF - Primary text (dark mode)

# Legacy color codes for compatibility
BLUE = "\033[0;34m"
CYAN = "\033[0;36m"
GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
MAGENTA = "\033[0;35m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

# Goodbye message displayed on exit
GOODBYE_MESSAGE = "✨ Thank you for using Agent Runtimes Chat. See you soon!"

# ASCII Art Banner with Datalayer brand colors
BANNER = f"""
{GREEN_DARK}{BOLD}╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   {GREEN_LIGHT}AG CHAT{WHITE}                                                       {GREEN_DARK}║
║   {WHITE}AI-Powered Data Assistant                                   {GREEN_DARK}║
║   {WHITE}Cheaper • Faster • Collaborative                            {GREEN_DARK}║
║                                                               ║
║   {GREEN_DARK}✨ Data Analysis  {GREEN_MEDIUM}📊 Data Science  {GREEN_LIGHT}📓 Software Development  {GREEN_DARK}║
║                                                               ║
║   {GRAY}Type /exit to quit  •  Type / for commands                  {GREEN_DARK}║
╚═══════════════════════════════════════════════════════════════╝{RESET}
"""

# Matrix-style characters for the rain effect
MATRIX_CHARS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789@#$%&*"


def matrix_rain_banner(
    width: int = 60,
    height: int = 12,
    duration: float = 2.0,
    fps: int = 15,
    start_row: int = 0,
) -> None:
    """Display an animated Matrix-style digital rain effect.

    Args:
        width: Width of the rain display in characters
        height: Height of the rain display in rows
        duration: How long to show the animation in seconds
        fps: Frames per second for the animation
        start_row: Row to start drawing from (to preserve content above)
    """
    if not sys.stdout.isatty():
        return

    # Initialize columns with random starting positions and speeds
    columns: list[dict[str, Any]] = []
    for x in range(width):
        columns.append(
            {
                "y": random.randint(-height, 0),  # nosec B311
                "speed": random.uniform(0.3, 1.0),  # nosec B311
                "chars": [
                    random.choice(MATRIX_CHARS)  # nosec B311
                    for _ in range(height + 5)
                ],
                "length": random.randint(4, 10),  # nosec B311
            }
        )

    # Hide cursor, move to start position (don't clear screen to preserve banner)
    sys.stdout.write("\033[?25l")  # Hide cursor
    sys.stdout.write(f"\033[{start_row + 1};1H")  # Move to start row
    sys.stdout.flush()

    frame_delay = 1.0 / fps
    frames = int(duration * fps)

    try:
        for frame in range(frames):
            # Build the frame
            screen = [[" " for _ in range(width)] for _ in range(height)]
            colors = [["" for _ in range(width)] for _ in range(height)]

            for x, col in enumerate(columns):
                head_y = int(col["y"])

                # Draw the trail
                for i in range(col["length"]):
                    y = head_y - i
                    if 0 <= y < height:
                        char_idx = (y + frame) % len(col["chars"])
                        screen[y][x] = col["chars"][char_idx]

                        # Head is bright white-green, tail fades to dark green
                        if i == 0:
                            colors[y][x] = "\033[1;97m"  # Bright white (head)
                        elif i == 1:
                            colors[y][x] = "\033[1;92m"  # Bright green
                        elif i < 4:
                            colors[y][x] = "\033[0;32m"  # Normal green
                        else:
                            colors[y][x] = "\033[2;32m"  # Dim green

                # Move column down
                col["y"] += col["speed"]

                # Reset column when it goes off screen
                if head_y - col["length"] > height:
                    col["y"] = random.randint(-10, -1)  # nosec B311
                    col["speed"] = random.uniform(0.3, 1.0)  # nosec B311
                    col["length"] = random.randint(4, 10)  # nosec B311
                    col["chars"] = [
                        random.choice(MATRIX_CHARS)  # nosec B311
                        for _ in range(height + 5)
                    ]  # nosec B311

            # Render frame
            output = []
            for y in range(height):
                row = ""
                for x in range(width):
                    if colors[y][x]:
                        row += colors[y][x] + screen[y][x] + RESET
                    else:
                        row += screen[y][x]
                output.append(row)

            # Move cursor to start position and draw
            sys.stdout.write(f"\033[{start_row + 1};1H")  # Move to start row
            sys.stdout.write("\n".join(output))
            sys.stdout.write("\n")
            sys.stdout.flush()

            time.sleep(frame_delay)

        # Fade out effect - gradually reduce characters
        for fade_frame in range(5):
            sys.stdout.write(f"\033[{start_row + 1};1H")  # Move to start row
            for y in range(height):
                row = ""
                for x in range(width):
                    if random.random() > (fade_frame + 1) / 6:  # nosec B311
                        row += f"\033[2;32m{random.choice(MATRIX_CHARS)}{RESET}"  # nosec B311
                    else:
                        row += " "
                sys.stdout.write(row + "\n")
            sys.stdout.flush()
            time.sleep(0.05)

    finally:
        # Show cursor and clear just the animation area
        sys.stdout.write("\033[?25h")  # Show cursor
        # Clear the animation area by writing spaces
        sys.stdout.write(f"\033[{start_row + 1};1H")  # Move to start row
        for _ in range(height + 1):
            sys.stdout.write(" " * width + "\n")
        sys.stdout.write(f"\033[{start_row + 1};1H")  # Move back to start row
        sys.stdout.flush()


def spinning_animation(
    width: int = 70, height: int = 20, duration: float = 3.0, fps: int = 10
) -> None:
    """Display an animated black hole GIF converted to ASCII art.

    Downloads a spinning black hole GIF and renders it as animated ASCII art
    using PIL for image processing.

    Args:
        width: Width of the display in characters
        height: Height of the display in rows
        duration: How long to show the animation in seconds
        fps: Frames per second for the animation
    """
    if not sys.stdout.isatty() or not HAS_PIL:
        return

    # ASCII characters from dark to bright
    ASCII_CHARS = " .:-=+*#%@"

    GIF_URL = "https://images.steamusercontent.com/ugc/480020637383985059/4AF1AFCA793CFFD924E6F880918F0DD181593552/"

    try:
        # Download the GIF
        response = requests.get(GIF_URL, timeout=5)
        response.raise_for_status()
        gif_data = io.BytesIO(response.content)

        # Open with PIL
        gif = Image.open(gif_data)

        # Extract frames
        frames = []
        try:
            while True:
                # Convert frame to RGB then to grayscale
                frame = gif.convert("RGB")

                # Resize to fit terminal (width x height, accounting for char aspect ratio)
                frame = frame.resize((width, height), Image.Resampling.LANCZOS)

                # Convert to ASCII
                ascii_frame = []
                for y in range(height):
                    row = ""
                    for x in range(width):
                        pixel = frame.getpixel((x, y))
                        # Calculate brightness
                        brightness = (
                            pixel[0] * 0.299 + pixel[1] * 0.587 + pixel[2] * 0.114
                        ) / 255
                        char_idx = int(brightness * (len(ASCII_CHARS) - 1))
                        char = ASCII_CHARS[char_idx]

                        # Add color based on pixel RGB (orange/red tones for black hole)
                        r, g, b = pixel
                        if brightness > 0.1:
                            # Use 256-color mode for better gradients
                            color_code = (
                                16
                                + (36 * min(5, r // 51))
                                + (6 * min(5, g // 51))
                                + min(5, b // 51)
                            )
                            row += f"\033[38;5;{color_code}m{char}\033[0m"
                        else:
                            row += " "
                    ascii_frame.append(row)

                frames.append(ascii_frame)
                gif.seek(gif.tell() + 1)
        except EOFError:
            pass  # End of frames

        if not frames:
            return

        # Hide cursor and clear screen
        sys.stdout.write("\033[?25l")
        sys.stdout.write("\033[2J")
        sys.stdout.write("\033[H")
        sys.stdout.flush()

        # Calculate how many times to loop
        frame_delay = 1.0 / fps
        total_frames = int(duration * fps)

        # Play animation
        for i in range(total_frames):
            frame_idx = i % len(frames)
            sys.stdout.write("\033[H")
            sys.stdout.write("\n".join(frames[frame_idx]))
            sys.stdout.flush()
            time.sleep(frame_delay)

    except Exception:
        # If anything fails, skip silently
        pass

    finally:
        # Show cursor and clear screen
        sys.stdout.write("\033[?25h")
        sys.stdout.write("\033[2J")
        sys.stdout.write("\033[H")
        sys.stdout.flush()


# Number of lines in the ASCII banner (for positioning animations below it)
BANNER_HEIGHT = BANNER.count("\n") + 2  # +2 for the "Powered by" line and extra newline


def show_banner(splash: bool = False, splash_all: bool = False) -> None:
    """Display the Agent Runtimes Chat welcome banner with optional animations.

    Args:
        splash: If True, show Matrix rain animation before banner.
        splash_all: If True, show both Matrix rain and black hole animations before banner.
    """
    # Only show banner if stdout is a TTY (interactive terminal)
    if sys.stdout.isatty():
        if splash or splash_all:
            # Clear screen and show Matrix rain animation first
            sys.stdout.write("\033[2J")  # Clear screen
            sys.stdout.write("\033[H")  # Move to top-left
            sys.stdout.flush()
            try:
                matrix_rain_banner(
                    width=80, height=20, duration=1.5, fps=12, start_row=0
                )
            except Exception:
                pass  # Skip animation if terminal doesn't support it

        if splash_all:
            # Show spinning black hole animation
            try:
                spinning_animation(width=70, height=18, duration=2.5, fps=12)
            except Exception:
                pass  # Skip animation if terminal doesn't support it

        # Clear screen and show ASCII banner after animations
        if splash or splash_all:
            sys.stdout.write("\033[2J")  # Clear screen
            sys.stdout.write("\033[H")  # Move to top-left
            sys.stdout.flush()

        print(BANNER)
        print(
            f"{DIM}Powered by Datalayer  •  \033]8;;https://datalayer.ai\033\\https://datalayer.ai\033]8;;\033\\{RESET}\n"
        )
