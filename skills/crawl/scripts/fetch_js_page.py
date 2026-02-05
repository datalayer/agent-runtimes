# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Fetch a JavaScript-rendered page using Playwright.

Usage: python fetch_js_page.py <url> [--output <file>] [--wait <ms>]

Arguments:
    url         The URL of the webpage to fetch
    --output    Optional output file path
    --wait      Additional wait time in milliseconds after page load (default: 0)
    --selector  Wait for a specific CSS selector to appear
"""

import argparse
import sys

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Error: playwright is not installed.", file=sys.stderr)
    print(
        "Install it with: pip install playwright && playwright install chromium",
        file=sys.stderr,
    )
    sys.exit(1)

from bs4 import BeautifulSoup


def fetch_js_page(
    url: str,
    wait_ms: int = 0,
    wait_selector: str | None = None,
    timeout: int = 30000,
) -> dict:
    """
    Fetch a JavaScript-rendered webpage.

    Args:
        url: The URL to fetch.
        wait_ms: Additional wait time in milliseconds.
        wait_selector: CSS selector to wait for.
        timeout: Page load timeout in milliseconds.

    Returns:
        Dictionary with title, text, and HTML content.
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Navigate to page
            page.goto(url, wait_until="networkidle", timeout=timeout)

            # Wait for selector if specified
            if wait_selector:
                page.wait_for_selector(wait_selector, timeout=timeout)

            # Additional wait if specified
            if wait_ms > 0:
                page.wait_for_timeout(wait_ms)

            # Get the rendered HTML
            html = page.content()

            # Get the final URL (after redirects)
            final_url = page.url

        finally:
            browser.close()

    # Parse the rendered HTML
    soup = BeautifulSoup(html, "html.parser")

    # Remove non-content elements
    for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
        element.decompose()

    # Extract title
    title = soup.title.string.strip() if soup.title and soup.title.string else ""

    # Extract text
    text = soup.get_text(separator="\n", strip=True)

    return {
        "url": final_url,
        "title": title,
        "text": text,
        "html": html,
    }


def main():
    parser = argparse.ArgumentParser(description="Fetch a JavaScript-rendered webpage.")
    parser.add_argument("url", help="The URL of the webpage to fetch")
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument(
        "--wait",
        "-w",
        type=int,
        default=0,
        help="Additional wait time in milliseconds after page load",
    )
    parser.add_argument(
        "--selector", "-s", help="Wait for a specific CSS selector to appear"
    )
    parser.add_argument(
        "--timeout",
        "-t",
        type=int,
        default=30000,
        help="Page load timeout in milliseconds (default: 30000)",
    )
    parser.add_argument(
        "--html", action="store_true", help="Output raw HTML instead of text"
    )

    args = parser.parse_args()

    try:
        result = fetch_js_page(
            args.url,
            wait_ms=args.wait,
            wait_selector=args.selector,
            timeout=args.timeout,
        )

        if args.html:
            output = result["html"]
        else:
            output = f"""URL: {result["url"]}
Title: {result["title"]}

--- Content ---
{result["text"]}
"""

        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output)
            print(f"Content saved to {args.output}")
        else:
            print(output)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
