# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Search GitHub repositories.

Usage: python search_repos.py <query> [--language python] [--sort stars|forks|updated] [--format table|json]

Arguments:
    query         Search query (e.g., 'machine learning', 'jupyter notebook')
    --language    Filter by programming language
    --sort        Sort by: 'stars', 'forks', 'updated', or 'best-match' (default: best-match)
    --format      Output format: 'table' or 'json' (default: table)
    --limit       Maximum number of results (default: 20)
    --user        Filter by user/owner
    --org         Filter by organization

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


def search_repos(
    query: str,
    language: str = None,
    user: str = None,
    org: str = None,
    sort: str = None,
    per_page: int = 30,
) -> list[dict]:
    """Search GitHub repositories.
    
    Args:
        query: Search query
        language: Filter by programming language
        user: Filter by user
        org: Filter by organization
        sort: Sort by 'stars', 'forks', or 'updated'
        per_page: Number of results per page
        
    Returns:
        List of repository dictionaries.
    """
    headers = get_github_headers()
    
    # Build search query with qualifiers
    q_parts = [query]
    if language:
        q_parts.append(f"language:{language}")
    if user:
        q_parts.append(f"user:{user}")
    if org:
        q_parts.append(f"org:{org}")
    
    full_query = " ".join(q_parts)
    
    params = {"q": full_query, "per_page": per_page}
    if sort and sort != "best-match":
        params["sort"] = sort
        params["order"] = "desc"
    
    response = httpx.get(
        "https://api.github.com/search/repositories",
        headers=headers,
        params=params,
        timeout=30.0,
    )
    
    if response.status_code == 401:
        print("Error: Invalid or expired GITHUB_TOKEN", file=sys.stderr)
        sys.exit(1)
    elif response.status_code == 403:
        print("Error: Rate limit exceeded", file=sys.stderr)
        sys.exit(1)
    elif response.status_code == 422:
        print("Error: Invalid search query", file=sys.stderr)
        sys.exit(1)
        
    response.raise_for_status()
    data = response.json()
    
    return data.get("items", []), data.get("total_count", 0)


def format_table(repos: list[dict], total: int) -> str:
    """Format search results as a table."""
    if not repos:
        return "No repositories found."
    
    lines = []
    lines.append(f"Found {total} repositories (showing {len(repos)})")
    lines.append("")
    lines.append(f"{'Name':<45} {'Language':<12} {'⭐ Stars':<10} {'🍴 Forks':<10} {'Updated':<12}")
    lines.append("-" * 95)
    
    for repo in repos:
        name = repo["full_name"][:43]
        language = (repo.get("language") or "-")[:10]
        stars = str(repo.get("stargazers_count", 0))
        forks = str(repo.get("forks_count", 0))
        updated = repo.get("updated_at", "")[:10]
        
        lines.append(f"{name:<45} {language:<12} {stars:<10} {forks:<10} {updated:<12}")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Search GitHub repositories."
    )
    parser.add_argument(
        "query",
        help="Search query",
    )
    parser.add_argument(
        "--language",
        help="Filter by programming language",
    )
    parser.add_argument(
        "--user",
        help="Filter by user/owner",
    )
    parser.add_argument(
        "--org",
        help="Filter by organization",
    )
    parser.add_argument(
        "--sort",
        choices=["stars", "forks", "updated", "best-match"],
        default="best-match",
        help="Sort order (default: best-match)",
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
        default=20,
        help="Maximum number of results (default: 20)",
    )
    
    args = parser.parse_args()
    
    try:
        repos, total = search_repos(
            query=args.query,
            language=args.language,
            user=args.user,
            org=args.org,
            sort=args.sort,
            per_page=args.limit,
        )
        
        if args.format == "json":
            simplified = [
                {
                    "name": r["full_name"],
                    "description": r.get("description"),
                    "language": r.get("language"),
                    "stars": r.get("stargazers_count", 0),
                    "forks": r.get("forks_count", 0),
                    "url": r["html_url"],
                    "topics": r.get("topics", []),
                    "updated_at": r.get("updated_at"),
                }
                for r in repos
            ]
            output = {"total_count": total, "items": simplified}
            print(json.dumps(output, indent=2))
        else:
            print(format_table(repos, total))
            
    except httpx.HTTPStatusError as e:
        print(f"HTTP error: {e.response.status_code}", file=sys.stderr)
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
