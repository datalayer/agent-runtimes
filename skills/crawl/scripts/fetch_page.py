# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Fetch a webpage and extract its text content.

Usage: python fetch_page.py <url> [--output <file>]

Arguments:
    url         The URL of the webpage to fetch
    --output    Optional output file path (prints to stdout if not specified)
    --timeout   Request timeout in seconds (default: 30)
"""

import argparse
import sys

import httpx
from bs4 import BeautifulSoup


def fetch_page(url: str, timeout: float = 30.0) -> dict:
    """
    Fetch a webpage and extract its content.

    Args:
        url: The URL to fetch.
        timeout: Request timeout in seconds.

    Returns:
        Dictionary with title, text, and metadata.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; DataBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    response = httpx.get(
        url,
        headers=headers,
        timeout=timeout,
        follow_redirects=True,
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # Remove non-content elements
    for element in soup(["script", "style", "nav", "footer", "header", "aside"]):
        element.decompose()

    # Extract title
    title = soup.title.string.strip() if soup.title and soup.title.string else ""

    # Extract meta description
    meta_desc = ""
    meta_tag = soup.find("meta", attrs={"name": "description"})
    if meta_tag and meta_tag.get("content"):
        meta_desc = meta_tag["content"]

    # Extract main text content
    text = soup.get_text(separator="\n", strip=True)

    return {
        "url": str(response.url),
        "status_code": response.status_code,
        "title": title,
        "description": meta_desc,
        "text": text,
        "content_type": response.headers.get("content-type", ""),
    }


def main():
    parser = argparse.ArgumentParser(
        description="Fetch a webpage and extract its text content."
    )
    parser.add_argument("url", help="The URL of the webpage to fetch")
    parser.add_argument(
        "--output", "-o", help="Output file path (prints to stdout if not specified)"
    )
    parser.add_argument(
        "--timeout", "-t", type=float, default=30.0, help="Request timeout in seconds"
    )

    args = parser.parse_args()

    try:
        result = fetch_page(args.url, timeout=args.timeout)

        output = f"""URL: {result["url"]}
Title: {result["title"]}
Description: {result["description"]}

--- Content ---
{result["text"]}
"""

        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output)
            print(f"Content saved to {args.output}")
        else:
            print(output)

    except httpx.HTTPStatusError as e:
        print(f"HTTP error: {e.response.status_code}", file=sys.stderr)
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
