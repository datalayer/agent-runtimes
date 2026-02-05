# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Extract tables from a webpage.

Usage: python extract_tables.py <url> [--output <file>] [--format csv|json]

Arguments:
    url         The URL of the webpage to extract tables from
    --output    Optional output file path
    --format    Output format: csv or json (default: json)
"""

import argparse
import csv
import json
import sys
from io import StringIO

import httpx
from bs4 import BeautifulSoup


def extract_tables(url: str, timeout: float = 30.0) -> list[list[list[str]]]:
    """
    Extract all tables from a webpage.

    Args:
        url: The URL to fetch.
        timeout: Request timeout in seconds.

    Returns:
        List of tables, where each table is a list of rows,
        and each row is a list of cell values.
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

    tables = []

    for table in soup.find_all("table"):
        rows = []
        for tr in table.find_all("tr"):
            cells = []
            for cell in tr.find_all(["td", "th"]):
                text = cell.get_text(strip=True)
                cells.append(text)
            if cells:
                rows.append(cells)
        if rows:
            tables.append(rows)

    return tables


def table_to_csv(table: list[list[str]]) -> str:
    """
    Convert a table to CSV format.
    """
    output = StringIO()
    writer = csv.writer(output)
    for row in table:
        writer.writerow(row)
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description="Extract tables from a webpage.")
    parser.add_argument("url", help="The URL of the webpage")
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument(
        "--format",
        "-f",
        choices=["csv", "json"],
        default="json",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "--timeout", "-t", type=float, default=30.0, help="Request timeout in seconds"
    )

    args = parser.parse_args()

    try:
        tables = extract_tables(args.url, timeout=args.timeout)

        if not tables:
            print("No tables found on the page.", file=sys.stderr)
            sys.exit(0)

        print(f"Found {len(tables)} table(s)")

        if args.format == "json":
            output = json.dumps(tables, indent=2)
        else:
            # CSV format - output each table separated by blank line
            outputs = []
            for i, table in enumerate(tables):
                outputs.append(f"# Table {i + 1}")
                outputs.append(table_to_csv(table))
            output = "\n".join(outputs)

        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(output)
            print(f"Tables saved to {args.output}")
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
