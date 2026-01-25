# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Get details for a specific GitHub repository.

Usage: python get_repo.py <owner/repo> [--format table|json]

Arguments:
    owner/repo    Repository in format 'owner/repo' (e.g., 'datalayer/jupyter-ui')
    --format      Output format: 'table' or 'json' (default: table)

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
        sys.exit(1)
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def get_repo(owner: str, repo: str) -> dict:
    """Get details for a specific repository.
    
    Args:
        owner: Repository owner (username or organization)
        repo: Repository name
        
    Returns:
        Repository details dictionary.
    """
    headers = get_github_headers()
    response = httpx.get(
        f"https://api.github.com/repos/{owner}/{repo}",
        headers=headers,
        timeout=30.0,
    )
    
    if response.status_code == 401:
        print("Error: Invalid or expired GITHUB_TOKEN", file=sys.stderr)
        sys.exit(1)
    elif response.status_code == 403:
        print("Error: Rate limit exceeded or insufficient permissions", file=sys.stderr)
        sys.exit(1)
    elif response.status_code == 404:
        print(f"Error: Repository '{owner}/{repo}' not found", file=sys.stderr)
        print("(Check if you have access and the token has 'repo' scope)", file=sys.stderr)
        sys.exit(1)
        
    response.raise_for_status()
    return response.json()


def format_repo_details(repo: dict) -> str:
    """Format repository details as readable text."""
    lines = []
    
    visibility = "🔒 Private" if repo["private"] else "🌐 Public"
    
    lines.append(f"Repository: {repo['full_name']} ({visibility})")
    lines.append("=" * 60)
    
    if repo.get("description"):
        lines.append(f"Description: {repo['description']}")
    
    lines.append(f"URL: {repo['html_url']}")
    lines.append(f"Clone: {repo['clone_url']}")
    
    if repo.get("homepage"):
        lines.append(f"Homepage: {repo['homepage']}")
    
    lines.append("")
    lines.append("Statistics:")
    lines.append(f"  ⭐ Stars: {repo.get('stargazers_count', 0)}")
    lines.append(f"  🍴 Forks: {repo.get('forks_count', 0)}")
    lines.append(f"  👀 Watchers: {repo.get('watchers_count', 0)}")
    lines.append(f"  🐛 Open Issues: {repo.get('open_issues_count', 0)}")
    
    lines.append("")
    lines.append("Details:")
    lines.append(f"  Language: {repo.get('language') or 'Not specified'}")
    lines.append(f"  Default Branch: {repo.get('default_branch', 'main')}")
    lines.append(f"  License: {repo.get('license', {}).get('name') or 'Not specified'}")
    
    lines.append("")
    lines.append("Dates:")
    lines.append(f"  Created: {repo.get('created_at', '')[:10]}")
    lines.append(f"  Updated: {repo.get('updated_at', '')[:10]}")
    lines.append(f"  Pushed: {repo.get('pushed_at', '')[:10]}")
    
    # Topics/tags
    if repo.get("topics"):
        lines.append("")
        lines.append(f"Topics: {', '.join(repo['topics'])}")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Get details for a specific GitHub repository."
    )
    parser.add_argument(
        "repo",
        help="Repository in format 'owner/repo' (e.g., 'datalayer/jupyter-ui')",
    )
    parser.add_argument(
        "--format",
        choices=["table", "json"],
        default="table",
        help="Output format (default: table)",
    )
    
    args = parser.parse_args()
    
    # Parse owner/repo
    if "/" not in args.repo:
        print("Error: Repository must be in format 'owner/repo'", file=sys.stderr)
        sys.exit(1)
    
    owner, repo = args.repo.split("/", 1)
    
    try:
        repo_data = get_repo(owner, repo)
        
        if args.format == "json":
            # Output simplified JSON
            simplified = {
                "name": repo_data["full_name"],
                "private": repo_data["private"],
                "description": repo_data.get("description"),
                "language": repo_data.get("language"),
                "stars": repo_data.get("stargazers_count", 0),
                "forks": repo_data.get("forks_count", 0),
                "watchers": repo_data.get("watchers_count", 0),
                "open_issues": repo_data.get("open_issues_count", 0),
                "default_branch": repo_data.get("default_branch"),
                "topics": repo_data.get("topics", []),
                "license": repo_data.get("license", {}).get("name"),
                "url": repo_data["html_url"],
                "clone_url": repo_data["clone_url"],
                "created_at": repo_data.get("created_at"),
                "updated_at": repo_data.get("updated_at"),
                "pushed_at": repo_data.get("pushed_at"),
            }
            print(json.dumps(simplified, indent=2))
        else:
            print(format_repo_details(repo_data))
            
    except httpx.HTTPStatusError as e:
        print(f"HTTP error: {e.response.status_code}", file=sys.stderr)
        sys.exit(1)
    except httpx.RequestError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
