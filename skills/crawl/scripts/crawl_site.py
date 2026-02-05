# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Crawl a website starting from a URL.

Usage: python crawl_site.py <url> [options]

Arguments:
    url             The starting URL to crawl
    --max-pages     Maximum number of pages to crawl (default: 10)
    --max-depth     Maximum depth to follow links (default: 2)
    --same-domain   Only crawl pages on the same domain (default: True)
    --output        Output file path (JSON format)
"""

import argparse
import json
import sys
from collections import deque
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup


def crawl_site(
    start_url: str,
    max_pages: int = 10,
    max_depth: int = 2,
    same_domain_only: bool = True,
    timeout: float = 30.0,
) -> dict[str, dict]:
    """
    Crawl multiple pages starting from a URL.

    Args:
        start_url: The URL to start crawling from.
        max_pages: Maximum number of pages to crawl.
        max_depth: Maximum depth to follow links.
        same_domain_only: Only crawl pages on the same domain.
        timeout: Request timeout in seconds.

    Returns:
        Dictionary mapping URLs to their content and metadata.
    """
    visited = {}
    queue = deque([(start_url, 0)])  # (url, depth)
    start_domain = urlparse(start_url).netloc

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; DataBot/1.0)",
    }

    with httpx.Client(
        headers=headers, timeout=timeout, follow_redirects=True
    ) as client:
        while queue and len(visited) < max_pages:
            url, depth = queue.popleft()

            # Skip if already visited
            if url in visited:
                continue

            # Skip if too deep
            if depth > max_depth:
                continue

            print(f"Crawling ({depth}): {url}", file=sys.stderr)

            try:
                response = client.get(url)
                response.raise_for_status()

                # Only process HTML content
                content_type = response.headers.get("content-type", "")
                if "text/html" not in content_type:
                    visited[url] = {
                        "error": f"Not HTML: {content_type}",
                        "depth": depth,
                    }
                    continue

                soup = BeautifulSoup(response.text, "html.parser")

                # Remove non-content elements
                for element in soup(["script", "style", "nav", "footer"]):
                    element.decompose()

                # Extract title
                title = (
                    soup.title.string.strip()
                    if soup.title and soup.title.string
                    else ""
                )

                # Extract text (limit to first 5000 chars for efficiency)
                text = soup.get_text(separator="\n", strip=True)[:5000]

                visited[url] = {
                    "title": title,
                    "text": text,
                    "depth": depth,
                    "status_code": response.status_code,
                }

                # Find new links to crawl (only if not at max depth)
                if depth < max_depth:
                    for a in soup.find_all("a", href=True):
                        href = a.get("href", "").strip()

                        # Skip empty, anchors, javascript, etc.
                        if not href or href.startswith(
                            ("#", "javascript:", "mailto:", "tel:")
                        ):
                            continue

                        next_url = urljoin(url, href)
                        next_domain = urlparse(next_url).netloc

                        # Filter by domain if requested
                        if same_domain_only and next_domain != start_domain:
                            continue

                        # Skip if already visited or queued
                        if next_url not in visited:
                            queue.append((next_url, depth + 1))

            except httpx.HTTPStatusError as e:
                visited[url] = {
                    "error": f"HTTP {e.response.status_code}",
                    "depth": depth,
                }
            except Exception as e:
                visited[url] = {
                    "error": str(e),
                    "depth": depth,
                }

    return visited


def main():
    parser = argparse.ArgumentParser(description="Crawl a website starting from a URL.")
    parser.add_argument("url", help="The starting URL to crawl")
    parser.add_argument(
        "--max-pages",
        "-p",
        type=int,
        default=10,
        help="Maximum number of pages to crawl (default: 10)",
    )
    parser.add_argument(
        "--max-depth",
        "-d",
        type=int,
        default=2,
        help="Maximum depth to follow links (default: 2)",
    )
    parser.add_argument(
        "--same-domain",
        "-s",
        action="store_true",
        default=True,
        help="Only crawl pages on the same domain (default: True)",
    )
    parser.add_argument("--output", "-o", help="Output file path (JSON format)")
    parser.add_argument(
        "--timeout", "-t", type=float, default=30.0, help="Request timeout in seconds"
    )

    args = parser.parse_args()

    try:
        pages = crawl_site(
            args.url,
            max_pages=args.max_pages,
            max_depth=args.max_depth,
            same_domain_only=args.same_domain,
            timeout=args.timeout,
        )

        print(f"\nCrawled {len(pages)} pages", file=sys.stderr)

        # Prepare output
        output = json.dumps(pages, indent=2)

        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output)
            print(f"Results saved to {args.output}")
        else:
            print(output)

    except Exception as e:
        print(f"Crawl failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
