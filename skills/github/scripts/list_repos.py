# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
List all repositories for the authenticated GitHub user.

Usage: python list_repos.py [--visibility all|public|private] [--format table|json] [--sort updated|created|pushed|full_name]

Arguments:
    --visibility  Filter by visibility: 'all', 'public', or 'private' (default: all)
    --format      Output format: 'table' or 'json' (default: table)
    --sort        Sort by: 'updated', 'created', 'pushed', or 'full_name' (default: updated)
    --limit       Maximum number of repos to display (default: all)

Environment:
    GITHUB_TOKEN  Required. GitHub Personal Access Token with 'repo' scope for private repos.
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
        print("\nTo create a token:", file=sys.stderr)
        print("1. Go to https://github.com/settings/tokens", file=sys.stderr)
        print("2. Generate a new token with 'repo' scope", file=sys.stderr)
        print("3. Set: export GITHUB_TOKEN='your_token_here'", file=sys.stderr)
        sys.exit(1)
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def list_repos(
    visibility: str = "all",
    sort: str = "updated",
    per_page: int = 100,
) -> list[dict]:
    """List repositories for the authenticated user.
    
    Args:
        visibility: Filter by visibility - 'all', 'public', or 'private'
        sort: Sort by 'created', 'updated', 'pushed', or 'full_name'
        per_page: Number of results per page (max 100)
        
    Returns:
        List of repository dictionaries.
    """
    headers = get_github_headers()
    repos = []
    page = 1
    
    while True:
        response = httpx.get(
            "https://api.github.com/user/repos",
            headers=headers,
            params={
                "visibility": visibility,
                "sort": sort,
                "per_page": per_page,
                "page": page,
            },
            timeout=30.0,
        )
        
        if response.status_code == 401:
            print("Error: Invalid or expired GITHUB_TOKEN", file=sys.stderr)
            sys.exit(1)
        elif response.status_code == 403:
            print("Error: Rate limit exceeded or insufficient permissions", file=sys.stderr)
            sys.exit(1)
            
        response.raise_for_status()
        page_repos = response.json()
        
        if not page_repos:
            break
            
        repos.extend(page_repos)
        page += 1
        
    return repos


def format_table(repos: list[dict]) -> str:
    """Format repositories as a table."""
    if not repos:
        return "No repositories found."
    
    lines = []
    lines.append(f"{'Visibility':<10} {'Name':<50} {'Language':<15} {'Stars':<8} {'Updated':<12}")
    lines.append("-" * 95)
    
    for repo in repos:
        visibility = "🔒 Private" if repo["private"] else "🌐 Public"
        name = repo["full_name"][:48]
        language = (repo.get("language") or "-")[:13]
        stars = str(repo.get("stargazers_count", 0))
        updated = repo.get("updated_at", "")[:10]
        
        lines.append(f"{visibility:<10} {name:<50} {language:<15} {stars:<8} {updated:<12}")
    
    lines.append("-" * 95)
    lines.append(f"Total: {len(repos)} repositories")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="List all repositories for the authenticated GitHub user."
    )
    parser.add_argument(
        "--visibility",
        choices=["all", "public", "private"],
        default="all",
        help="Filter by visibility (default: all)",
    )
    parser.add_argument(
        "--format",
        choices=["table", "json"],
        default="table",
        help="Output format (default: table)",
    )
    parser.add_argument(
        "--sort",
        choices=["updated", "created", "pushed", "full_name"],
        default="updated",
        help="Sort order (default: updated)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of repos to display",
    )
    
    args = parser.parse_args()
    
    try:
        repos = list_repos(visibility=args.visibility, sort=args.sort)
        
        if args.limit:
            repos = repos[:args.limit]
        
        if args.format == "json":
            # Output simplified JSON
            simplified = [
                {
                    "name": r["full_name"],
                    "private": r["private"],
                    "language": r.get("language"),
                    "stars": r.get("stargazers_count", 0),
                    "forks": r.get("forks_count", 0),
                    "url": r["html_url"],
                    "description": r.get("description"),
                    "updated_at": r.get("updated_at"),
                }
                for r in repos
            ]
            print(json.dumps(simplified, indent=2))
        else:
            print(format_table(repos))
            
    except httpx.HTTPStatusError as e:
        print(f"HTTP error: {e.response.status_code}", file=sys.stderr)
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
