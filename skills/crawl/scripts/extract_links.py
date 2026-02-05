# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Extract all links from a webpage.

Usage: python extract_links.py <url> [--output <file>] [--absolute]

Arguments:
    url         The URL of the webpage to extract links from
    --output    Optional output file path (prints to stdout if not specified)
    --absolute  Convert relative URLs to absolute URLs
    --filter    Filter links by pattern (e.g., "/docs")
"""

import argparse
import json
import sys
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup


def extract_links(
    url: str,
    absolute: bool = True,
    filter_pattern: str | None = None,
    timeout: float = 30.0,
) -> list[dict]:
    """
    Extract all links from a webpage.

    Args:
        url: The URL to fetch.
        absolute: Convert relative URLs to absolute.
        filter_pattern: Only include links containing this pattern.
        timeout: Request timeout in seconds.

    Returns:
        List of link dictionaries with text and url.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; DataBot/1.0)",
    }

    response = httpx.get(
        url,
        headers=headers,
        timeout=timeout,
        follow_redirects=True,
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    base_url = str(response.url)

    links = []
    seen_urls = set()

    for a in soup.find_all("a", href=True):
        href = a.get("href", "").strip()

        # Skip empty, anchors, javascript, mailto
        if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue

        # Convert to absolute URL if requested
        if absolute:
            href = urljoin(base_url, href)

        # Apply filter if specified
        if filter_pattern and filter_pattern not in href:
            continue

        # Skip duplicates
        if href in seen_urls:
            continue
        seen_urls.add(href)

        text = a.get_text(strip=True) or "[No text]"

        links.append(
            {
                "text": text,
                "url": href,
            }
        )

    return links


def main():
    parser = argparse.ArgumentParser(description="Extract all links from a webpage.")
    parser.add_argument("url", help="The URL of the webpage")
    parser.add_argument("--output", "-o", help="Output file path (JSON format)")
    parser.add_argument(
        "--absolute",
        "-a",
        action="store_true",
        default=True,
        help="Convert relative URLs to absolute (default: True)",
    )
    parser.add_argument(
        "--filter", "-f", help="Only include links containing this pattern"
    )
    parser.add_argument(
        "--timeout", "-t", type=float, default=30.0, help="Request timeout in seconds"
    )

    args = parser.parse_args()

    try:
        links = extract_links(
            args.url,
            absolute=args.absolute,
            filter_pattern=args.filter,
            timeout=args.timeout,
        )

        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(links, f, indent=2)
            print(f"Found {len(links)} links, saved to {args.output}")
        else:
            print(f"Found {len(links)} links:\n")
            for link in links:
                print(f"  [{link['text'][:50]}] -> {link['url']}")

    except httpx.HTTPStatusError as e:
        print(f"HTTP error: {e.response.status_code}", file=sys.stderr)
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
