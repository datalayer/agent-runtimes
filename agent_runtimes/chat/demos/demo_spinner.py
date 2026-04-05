#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Demo script showing Agent Runtimes Chat spinner behavior in realistic scenarios.
This simulates different operation durations to showcase the spinner animation.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from agent_runtimes.chat.cli import (
    BOLD,
    CYAN,
    GREEN,
    MAGENTA,
    RESET,
    YELLOW,
    Spinner,
)


async def simulate_ai_query(duration: float) -> str:
    """Simulate an AI query taking some time."""
    await asyncio.sleep(duration)
    return "✓ Query processed successfully!"


async def demo_scenario(title: str, message: str, duration: float, style: str = "growing") -> None:
    """Run a single demo scenario."""
    print(f"\n{CYAN}{BOLD}{title}{RESET}")
    print(f"{YELLOW}{'─' * 50}{RESET}")
    
    spinner = Spinner(message, style=style)
    spinner.start()
    
    result = await simulate_ai_query(duration)
    
    spinner.stop()
    print(f"{GREEN}{result}{RESET}")


async def main() -> None:
    """Run all demo scenarios."""
    print(f"\n{MAGENTA}{BOLD}╔════════════════════════════════════════════════╗")
    print(f"║  Agent Runtimes Chat Spinner Demo               ║")
    print(f"╚════════════════════════════════════════════════╝{RESET}\n")
    
    # Different realistic scenarios
    scenarios = [
        ("Quick Query", "Analyzing code snippet", 1.5, "growing"),
        ("Medium Query", "Generating documentation", 3.0, "growing"),
        ("Complex Query", "Refactoring code structure", 4.5, "growing"),
        ("Data Processing", "Analyzing dataset", 2.5, "pulse"),
        ("Model Inference", "Running AI model", 3.5, "circle"),
    ]
    
    for title, message, duration, style in scenarios:
        await demo_scenario(title, message, duration, style)
    
    print(f"\n{GREEN}{BOLD}✨ Demo complete!{RESET}")
    print(f"{CYAN}The spinner provides smooth visual feedback during operations.{RESET}")
    print(f"{YELLOW}Try it yourself: {RESET}{BOLD}agent-runtimes chat \"What is Python?\"{RESET}\n")


if __name__ == "__main__":
    asyncio.run(main())
