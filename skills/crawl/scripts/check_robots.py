# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Check if a URL is allowed by robots.txt.

Usage: python check_robots.py <url> [--user-agent <agent>]

Arguments:
    url             The URL to check
    --user-agent    User agent to check permissions for (default: *)
"""

import argparse
import sys
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser


def check_robots(url: str, user_agent: str = "*") -> dict:
    """
    Check if crawling is allowed by robots.txt.

    Args:
        url: The URL to check.
        user_agent: The user agent to check permissions for.

    Returns:
        Dictionary with robots.txt check results.
    """
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"

    rp = RobotFileParser()
    rp.set_url(robots_url)

    try:
        rp.read()
        can_fetch = rp.can_fetch(user_agent, url)
        crawl_delay = rp.crawl_delay(user_agent)

        return {
            "url": url,
            "robots_url": robots_url,
            "user_agent": user_agent,
            "allowed": can_fetch,
            "crawl_delay": crawl_delay,
            "error": None,
        }
    except Exception as e:
        return {
            "url": url,
            "robots_url": robots_url,
            "user_agent": user_agent,
            "allowed": True,  # Allow if robots.txt cannot be read
            "crawl_delay": None,
            "error": str(e),
        }


def main():
    parser = argparse.ArgumentParser(
        description="Check if a URL is allowed by robots.txt."
    )
    parser.add_argument("url", help="The URL to check")
    parser.add_argument(
        "--user-agent",
        "-u",
        default="*",
        help="User agent to check permissions for (default: *)",
    )

    args = parser.parse_args()

    result = check_robots(args.url, args.user_agent)

    if result["error"]:
        print(f"Warning: Could not read robots.txt: {result['error']}")
        print("Assuming crawling is allowed.")

    if result["allowed"]:
        print(f"✓ Crawling allowed for URL: {result['url']}")
    else:
        print(f"✗ Crawling NOT allowed for URL: {result['url']}")
        sys.exit(1)

    if result["crawl_delay"]:
        print(f"  Crawl delay: {result['crawl_delay']} seconds")


if __name__ == "__main__":
    main()
