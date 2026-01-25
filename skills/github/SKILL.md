---
name: github
description: GitHub API toolkit for listing repositories, managing issues, pull requests, and interacting with GitHub resources. Requires a GITHUB_TOKEN environment variable for authentication.
license: Proprietary. LICENSE.txt has complete terms
version: 1.0.0
tags:
  - github
  - api
  - repositories
  - git
author: Datalayer
---

# GitHub API Guide

## Overview

This skill provides tools to interact with the GitHub API using Python. It enables listing repositories (public and private), retrieving repository details, and more.

## Authentication

### OAuth Authentication (Recommended)

This skill uses GitHub OAuth authentication through the Datalayer identity system. When you connect your GitHub account via the **"Connect GitHub"** button in the agent configuration form, the OAuth token is automatically available to this skill.

**How it works:**
1. Click the **GitHub** connect button in the Agent Configuration form
2. Complete the OAuth authorization flow
3. Your GitHub access token is securely stored and automatically provided to skill scripts

The token is retrieved from the identity store and made available as the `GITHUB_TOKEN` environment variable when scripts are executed.

#### Required OAuth Scopes

When connecting your GitHub account, ensure the following scopes are granted:
- `repo` - Full control of private repositories (required for private repos)
- `read:user` - Read user profile data  
- `read:org` - Read organization data (if listing org repos)

### Manual Token (Fallback)

If not using OAuth, you can set the `GITHUB_TOKEN` environment variable manually:

```bash
export GITHUB_TOKEN="ghp_your_token_here"
```

To create a Personal Access Token:
1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click **"Generate new token"** (classic)
3. Select the scopes listed above
4. Generate and copy the token

### Token Permissions

| Scope | Description | Required For |
|-------|-------------|--------------|
| `repo` | Full control of private repositories | Private repos, creating issues/PRs |
| `public_repo` | Access public repositories only | Public repos only (limited) |
| `read:user` | Read user profile data | User information |
| `read:org` | Read org membership | Organization repos |

> **Note:** The OAuth flow requests `repo`, `read:user`, and `read:org` scopes by default.

## Quick Start

```python
import os
import httpx

token = os.environ.get("GITHUB_TOKEN")
headers = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

# List your repositories
response = httpx.get(
    "https://api.github.com/user/repos",
    headers=headers,
    params={"per_page": 100, "type": "all"},
)
repos = response.json()

for repo in repos:
    visibility = "🔒" if repo["private"] else "🌐"
    print(f"{visibility} {repo['full_name']}")
```

## Python Libraries

### httpx - GitHub API Client

#### List All User Repositories
```python
import os
import httpx

def get_github_headers() -> dict:
    """Get headers for GitHub API requests."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise ValueError("GITHUB_TOKEN environment variable is required")
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
        response.raise_for_status()
        page_repos = response.json()
        
        if not page_repos:
            break
            
        repos.extend(page_repos)
        page += 1
        
    return repos
```

#### Get Repository Details
```python
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
    response.raise_for_status()
    return response.json()
```

#### List Organization Repositories
```python
def list_org_repos(org: str, type: str = "all") -> list[dict]:
    """List repositories for an organization.
    
    Args:
        org: Organization name
        type: Filter by type - 'all', 'public', 'private', 'forks', 'sources', 'member'
        
    Returns:
        List of repository dictionaries.
    """
    headers = get_github_headers()
    repos = []
    page = 1
    
    while True:
        response = httpx.get(
            f"https://api.github.com/orgs/{org}/repos",
            headers=headers,
            params={"type": type, "per_page": 100, "page": page},
            timeout=30.0,
        )
        response.raise_for_status()
        page_repos = response.json()
        
        if not page_repos:
            break
            
        repos.extend(page_repos)
        page += 1
        
    return repos
```

### Working with Issues

#### List Repository Issues
```python
def list_issues(owner: str, repo: str, state: str = "open") -> list[dict]:
    """List issues for a repository.
    
    Args:
        owner: Repository owner
        repo: Repository name
        state: Issue state - 'open', 'closed', or 'all'
        
    Returns:
        List of issue dictionaries.
    """
    headers = get_github_headers()
    response = httpx.get(
        f"https://api.github.com/repos/{owner}/{repo}/issues",
        headers=headers,
        params={"state": state, "per_page": 100},
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()
```

#### Create an Issue
```python
def create_issue(
    owner: str,
    repo: str,
    title: str,
    body: str = "",
    labels: list[str] = None,
) -> dict:
    """Create a new issue.
    
    Args:
        owner: Repository owner
        repo: Repository name
        title: Issue title
        body: Issue body (markdown)
        labels: List of label names
        
    Returns:
        Created issue dictionary.
    """
    headers = get_github_headers()
    data = {"title": title, "body": body}
    if labels:
        data["labels"] = labels
        
    response = httpx.post(
        f"https://api.github.com/repos/{owner}/{repo}/issues",
        headers=headers,
        json=data,
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()
```

### Working with Pull Requests

#### List Pull Requests
```python
def list_pull_requests(
    owner: str,
    repo: str,
    state: str = "open",
) -> list[dict]:
    """List pull requests for a repository.
    
    Args:
        owner: Repository owner
        repo: Repository name
        state: PR state - 'open', 'closed', or 'all'
        
    Returns:
        List of pull request dictionaries.
    """
    headers = get_github_headers()
    response = httpx.get(
        f"https://api.github.com/repos/{owner}/{repo}/pulls",
        headers=headers,
        params={"state": state, "per_page": 100},
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()
```

### Error Handling

```python
import httpx

def safe_github_request(url: str, headers: dict) -> dict | None:
    """Make a GitHub API request with error handling."""
    try:
        response = httpx.get(url, headers=headers, timeout=30.0)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            print("Error: Invalid or expired GITHUB_TOKEN")
        elif e.response.status_code == 403:
            print("Error: Rate limit exceeded or insufficient permissions")
        elif e.response.status_code == 404:
            print("Error: Resource not found")
        else:
            print(f"HTTP error: {e.response.status_code}")
        return None
    except httpx.RequestError as e:
        print(f"Request failed: {e}")
        return None
```

## Rate Limiting

GitHub API has rate limits:
- **Authenticated requests**: 5,000 requests per hour
- **Unauthenticated requests**: 60 requests per hour

Check your rate limit status:

```python
def check_rate_limit() -> dict:
    """Check GitHub API rate limit status."""
    headers = get_github_headers()
    response = httpx.get(
        "https://api.github.com/rate_limit",
        headers=headers,
        timeout=30.0,
    )
    response.raise_for_status()
    return response.json()
```

## Common Patterns

### Filter Repositories by Language
```python
def list_repos_by_language(language: str) -> list[dict]:
    """List user repositories filtered by primary language."""
    repos = list_repos()
    return [r for r in repos if r.get("language") == language]
```

### Get Recent Activity
```python
def get_recent_repos(days: int = 30) -> list[dict]:
    """Get repositories updated in the last N days."""
    from datetime import datetime, timedelta
    
    cutoff = datetime.now() - timedelta(days=days)
    repos = list_repos(sort="updated")
    
    recent = []
    for repo in repos:
        updated = datetime.fromisoformat(repo["updated_at"].replace("Z", "+00:00"))
        if updated.replace(tzinfo=None) > cutoff:
            recent.append(repo)
    return recent
```

## Scripts

This skill includes the following executable scripts in the `scripts/` directory:

| Script | Description | Usage |
|--------|-------------|-------|
| `list_repos.py` | List all repositories for the authenticated user | `python list_repos.py [--visibility all\|public\|private] [--format table\|json]` |
| `get_repo.py` | Get details for a specific repository | `python get_repo.py <owner>/<repo>` |
| `list_issues.py` | List issues for a repository | `python list_issues.py <owner>/<repo> [--state open\|closed\|all]` |
| `list_prs.py` | List pull requests for a repository | `python list_prs.py <owner>/<repo> [--state open\|closed\|all]` |
| `search_repos.py` | Search GitHub repositories | `python search_repos.py <query> [--language python]` |

## Troubleshooting

### "Bad credentials" Error
- Ensure `GITHUB_TOKEN` is set correctly
- Check if the token has expired
- Verify the token has required scopes

### "Not Found" Error for Private Repos
- The token needs `repo` scope for private repository access
- Verify you have access to the repository

### Rate Limit Exceeded
- Wait for the rate limit to reset (check `X-RateLimit-Reset` header)
- Use conditional requests with `If-None-Match` header
- Consider using GraphQL API for complex queries (higher limits)
