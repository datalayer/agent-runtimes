# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""GIF animation (black hole) for Agent Runtimes Chat TUX."""

import asyncio
import shutil
import time

from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.style import Style
from rich.text import Text

from .utils import raw_terminal, check_escape_pressed


# Primary accent color (matches tux.py)
STYLE_PRIMARY = Style(color="rgb(26,188,156)")


async def gif_animation(console: Console) -> None:
    """Display black hole spinning animation (5 seconds).
    
    Args:
        console: Rich Console instance for output.
    """
    try:
        from PIL import Image
        import requests
    except ImportError:
        console.print()
        console.print("[yellow]This animation requires PIL and requests packages.[/yellow]")
        console.print("[dim]Install with: pip install pillow requests[/dim]")
        console.print()
        return
    
    import io
    
    # ASCII characters from dark to bright
    ASCII_CHARS = ' .:-=+*#%@'
    GIF_URL = "https://images.steamusercontent.com/ugc/480020637383985059/4AF1AFCA793CFFD924E6F880918F0DD181593552/"
    
    console.print()
    console.print("[dim]Loading black hole animation...[/dim]")
    
    try:
        # Download the GIF
        response = requests.get(GIF_URL, timeout=10)
        response.raise_for_status()
        gif_data = io.BytesIO(response.content)
        
        # Open with PIL
        gif = Image.open(gif_data)
        
        # Get terminal size
        term_size = shutil.get_terminal_size()
        width = min(70, term_size.columns - 4)
        height = min(18, term_size.lines - 4)
        
        # Extract frames
        frames = []
        try:
            while True:
                # Convert frame to RGB
                frame = gif.convert('RGB')
                
                # Resize to fit terminal
                frame = frame.resize((width, height), Image.Resampling.LANCZOS)
                
                # Convert to Rich Text with colors
                text = Text()
                for y in range(height):
                    for x in range(width):
                        pixel = frame.getpixel((x, y))
                        r, g, b = pixel
                        # Calculate brightness
                        brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255
                        char_idx = int(brightness * (len(ASCII_CHARS) - 1))
                        char = ASCII_CHARS[char_idx]
                        
                        if brightness > 0.1:
                            # Use RGB color
                            text.append(char, style=f"rgb({r},{g},{b})")
                        else:
                            text.append(" ")
                    text.append("\n")
                
                frames.append(text)
                gif.seek(gif.tell() + 1)
        except EOFError:
            pass  # End of frames
        
        if not frames:
            console.print("[red]Could not extract frames from GIF[/red]")
            return
        
        console.print()
        
        # Run for 5 seconds
        start_time = time.time()
        duration = 5.0
        
        with raw_terminal(), Live(console=console, refresh_per_second=12, transient=True) as live:
            while time.time() - start_time < duration:
                if check_escape_pressed():
                    break
                for i, frame in enumerate(frames):
                    if check_escape_pressed():
                        break
                    if time.time() - start_time >= duration:
                        break
                    live.update(Panel(frame, border_style=STYLE_PRIMARY, title=" Black Hole "))
                    await asyncio.sleep(0.083)  # ~12 fps
                    
    except Exception as e:
        # Handle requests.RequestException and other errors
        if "requests" in str(type(e).__module__):
            console.print(f"[red]Could not download animation: {e}[/red]")
        else:
            console.print(f"[red]Animation error: {e}[/red]")
    except KeyboardInterrupt:
        pass
    
    console.print()
