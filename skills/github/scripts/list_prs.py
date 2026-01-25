# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
List pull requests for a GitHub repository.

Usage: python list_prs.py <owner/repo> [--state open|closed|all] [--format table|json]

Arguments:
    owner/repo    Repository in format 'owner/repo'
    --state       PR state: 'open', 'closed', or 'all' (default: open)
    --format      Output format: 'table' or 'json' (default: table)
    --limit       Maximum number of PRs to display (default: 50)

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


def list_pull_requests(
    owner: str,
    repo: str,
    state: str = "open",
    per_page: int = 100,
) -> list[dict]:
    """List pull requests for a repository.
    
    Args:
        owner: Repository owner
        repo: Repository name
        state: PR state - 'open', 'closed', or 'all'
        per_page: Number of results per page
        
    Returns:
        List of pull request dictionaries.
    """
    headers = get_github_headers()
    prs = []
    page = 1
    
    while True:
        response = httpx.get(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
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
        page_prs = response.json()
        
        if not page_prs:
            break
        
        prs.extend(page_prs)
        page += 1
        
    return prs


def format_table(prs: list[dict]) -> str:
    """Format pull requests as a table."""
    if not prs:
        return "No pull requests found."
    
    lines = []
    lines.append(f"{'#':<7} {'State':<10} {'Title':<50} {'Author':<15} {'Branch':<20}")
    lines.append("-" * 105)
    
    for pr in prs:
        number = f"#{pr['number']}"
        if pr["state"] == "open":
            if pr.get("draft"):
                state = "📝 Draft"
            else:
                state = "🟢 Open"
        else:
            if pr.get("merged_at"):
                state = "🟣 Merged"
            else:
                state = "🔴 Closed"
        title = pr["title"][:48]
        author = (pr.get("user", {}).get("login") or "-")[:13]
        branch = pr.get("head", {}).get("ref", "-")[:18]
        
        lines.append(f"{number:<7} {state:<10} {title:<50} {author:<15} {branch:<20}")
    
    lines.append("-" * 105)
    lines.append(f"Total: {len(prs)} pull requests")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="List pull requests for a GitHub repository."
    )
    parser.add_argument(
        "repo",
        help="Repository in format 'owner/repo'",
    )
    parser.add_argument(
        "--state",
        choices=["open", "closed", "all"],
        default="open",
        help="PR state (default: open)",
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
        help="Maximum number of PRs to display (default: 50)",
    )
    
    args = parser.parse_args()
    
    # Parse owner/repo
    if "/" not in args.repo:
        print("Error: Repository must be in format 'owner/repo'", file=sys.stderr)
        sys.exit(1)
    
    owner, repo = args.repo.split("/", 1)
    
    try:
        prs = list_pull_requests(owner, repo, state=args.state)
        
        if args.limit:
            prs = prs[:args.limit]
        
        if args.format == "json":
            simplified = [
                {
                    "number": pr["number"],
                    "title": pr["title"],
                    "state": pr["state"],
                    "draft": pr.get("draft", False),
                    "merged": pr.get("merged_at") is not None,
                    "author": pr.get("user", {}).get("login"),
                    "head_branch": pr.get("head", {}).get("ref"),
                    "base_branch": pr.get("base", {}).get("ref"),
                    "url": pr["html_url"],
                    "created_at": pr.get("created_at"),
                    "updated_at": pr.get("updated_at"),
                }
                for pr in prs
            ]
            print(json.dumps(simplified, indent=2))
        else:
            print(format_table(prs))
            
    except httpx.HTTPStatusError as e:
        print(f"HTTP error: {e.response.status_code}", file=sys.stderr)
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
