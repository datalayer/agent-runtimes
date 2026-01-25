# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
List issues for a GitHub repository.

Usage: python list_issues.py <owner/repo> [--state open|closed|all] [--format table|json]

Arguments:
    owner/repo    Repository in format 'owner/repo'
    --state       Issue state: 'open', 'closed', or 'all' (default: open)
    --format      Output format: 'table' or 'json' (default: table)
    --limit       Maximum number of issues to display (default: 50)

Environment:
    GITHUB_TOKEN  Required. GitHub Personal Access Token.
"""

import argparse
import json
import os
import sys

import httpx


def get_github_headers() -> dict:
    """Get headers for GitHub API requests."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("Error: GITHUB_TOKEN environment variable is required", file=sys.stderr)
        sys.exit(1)
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def list_issues(
    owner: str,
    repo: str,
    state: str = "open",
    per_page: int = 100,
) -> list[dict]:
    """List issues for a repository.
    
    Args:
        owner: Repository owner
        repo: Repository name
        state: Issue state - 'open', 'closed', or 'all'
        per_page: Number of results per page
        
    Returns:
        List of issue dictionaries (excluding pull requests).
    """
    headers = get_github_headers()
    issues = []
    page = 1
    
    while True:
        response = httpx.get(
            f"https://api.github.com/repos/{owner}/{repo}/issues",
            headers=headers,
            params={
                "state": state,
                "per_page": per_page,
                "page": page,
            },
            timeout=30.0,
        )
        
        if response.status_code == 401:
            print("Error: Invalid or expired GITHUB_TOKEN", file=sys.stderr)
            sys.exit(1)
        elif response.status_code == 404:
            print(f"Error: Repository '{owner}/{repo}' not found", file=sys.stderr)
            sys.exit(1)
            
        response.raise_for_status()
        page_issues = response.json()
        
        if not page_issues:
            break
        
        # Filter out pull requests (they appear in issues API too)
        real_issues = [i for i in page_issues if "pull_request" not in i]
        issues.extend(real_issues)
        page += 1
        
    return issues


def format_table(issues: list[dict]) -> str:
    """Format issues as a table."""
    if not issues:
        return "No issues found."
    
    lines = []
    lines.append(f"{'#':<7} {'State':<8} {'Title':<55} {'Author':<15} {'Created':<12}")
    lines.append("-" * 100)
    
    for issue in issues:
        number = f"#{issue['number']}"
        state = "🟢 Open" if issue["state"] == "open" else "🔴 Closed"
        title = issue["title"][:53]
        author = (issue.get("user", {}).get("login") or "-")[:13]
        created = issue.get("created_at", "")[:10]
        
        lines.append(f"{number:<7} {state:<8} {title:<55} {author:<15} {created:<12}")
    
    lines.append("-" * 100)
    lines.append(f"Total: {len(issues)} issues")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="List issues for a GitHub repository."
    )
    parser.add_argument(
        "repo",
        help="Repository in format 'owner/repo'",
    )
    parser.add_argument(
        "--state",
        choices=["open", "closed", "all"],
        default="open",
        help="Issue state (default: open)",
    )
    parser.add_argument(
        "--format",
        choices=["table", "json"],
        default="table",
        help="Output format (default: table)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="Maximum number of issues to display (default: 50)",
    )
    
    args = parser.parse_args()
    
    # Parse owner/repo
    if "/" not in args.repo:
        print("Error: Repository must be in format 'owner/repo'", file=sys.stderr)
        sys.exit(1)
    
    owner, repo = args.repo.split("/", 1)
    
    try:
        issues = list_issues(owner, repo, state=args.state)
        
        if args.limit:
            issues = issues[:args.limit]
        
        if args.format == "json":
            simplified = [
                {
                    "number": i["number"],
                    "title": i["title"],
                    "state": i["state"],
                    "author": i.get("user", {}).get("login"),
                    "labels": [l["name"] for l in i.get("labels", [])],
                    "url": i["html_url"],
                    "created_at": i.get("created_at"),
                    "updated_at": i.get("updated_at"),
                    "comments": i.get("comments", 0),
                }
                for i in issues
            ]
            print(json.dumps(simplified, indent=2))
        else:
            print(format_table(issues))
            
    except httpx.HTTPStatusError as e:
        print(f"HTTP error: {e.response.status_code}", file=sys.stderr)
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
