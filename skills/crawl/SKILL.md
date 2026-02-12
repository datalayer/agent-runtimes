---
name: crawl
description: Web crawling and scraping toolkit for fetching webpage content, extracting text, links, and structured data from HTML. Use when you need to retrieve information from websites, follow links, or extract specific elements from web pages.
license: Proprietary. LICENSE.txt has complete terms
version: 1.0.0
tags:
  - web
  - scraping
  - crawling
  - http
author: Datalayer
---

# Web Crawling Guide

## Overview

This guide covers essential web crawling and scraping operations using Python libraries. For simple fetching, use `httpx`. For HTML parsing and data extraction, use `beautifulsoup4`. For JavaScript-rendered pages, consider `playwright`.

## Quick Start

```python
import httpx
from bs4 import BeautifulSoup

# Fetch and parse a webpage
response = httpx.get("https://example.com")
soup = BeautifulSoup(response.text, "html.parser")

# Extract title
title = soup.title.string if soup.title else "No title"
print(f"Title: {title}")

# Extract all text
text = soup.get_text(separator="\n", strip=True)
print(text)
```

## Python Libraries

### httpx - HTTP Client

#### Basic GET Request
```python
import httpx

response = httpx.get("https://example.com")
print(f"Status: {response.status_code}")
print(f"Content-Type: {response.headers.get('content-type')}")
print(response.text)
```

#### GET with Headers and Parameters
```python
headers = {
    "User-Agent": "Mozilla/5.0 (compatible; DataBot/1.0)",
    "Accept": "text/html,application/xhtml+xml",
}
params = {"q": "search query", "page": 1}

response = httpx.get(
    "https://example.com/search",
    headers=headers,
    params=params,
    timeout=30.0,
)
```

#### Handle Redirects and Errors
```python
import httpx

try:
    response = httpx.get(
        "https://example.com",
        follow_redirects=True,
        timeout=30.0,
    )
    response.raise_for_status()
    print(response.text)
except httpx.HTTPStatusError as e:
    print(f"HTTP error: {e.response.status_code}")
except httpx.RequestError as e:
    print(f"Request failed: {e}")
```

#### Async Requests
```python
import httpx
import asyncio

async def fetch_pages(urls: list[str]) -> list[str]:
    async with httpx.AsyncClient() as client:
        tasks = [client.get(url) for url in urls]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        return [r.text if isinstance(r, httpx.Response) else str(r) for r in responses]

# Usage
urls = ["https://example.com/page1", "https://example.com/page2"]
results = asyncio.run(fetch_pages(urls))
```

### BeautifulSoup - HTML Parsing

#### Parse HTML and Extract Elements
```python
from bs4 import BeautifulSoup

html = """
<html>
  <head><title>Example Page</title></head>
  <body>
    <h1>Welcome</h1>
    <p class="intro">This is an introduction.</p>
    <a href="/page1">Link 1</a>
    <a href="/page2">Link 2</a>
  </body>
</html>
"""

soup = BeautifulSoup(html, "html.parser")

# Find elements
title = soup.title.string
h1 = soup.find("h1").text
intro = soup.find("p", class_="intro").text

# Find all links
links = [(a.text, a.get("href")) for a in soup.find_all("a")]
```

#### Extract Text Content
```python
from bs4 import BeautifulSoup

soup = BeautifulSoup(html, "html.parser")

# Get all text, separated by newlines
text = soup.get_text(separator="\n", strip=True)

# Get text from specific sections
main_content = soup.find("main")
if main_content:
    content_text = main_content.get_text(separator=" ", strip=True)
```

#### Extract Links with Absolute URLs
```python
from urllib.parse import urljoin
from bs4 import BeautifulSoup

base_url = "https://example.com"
soup = BeautifulSoup(html, "html.parser")

links = []
for a in soup.find_all("a", href=True):
    href = a.get("href")
    absolute_url = urljoin(base_url, href)
    links.append({
        "text": a.get_text(strip=True),
        "url": absolute_url,
    })
```

#### Extract Tables
```python
from bs4 import BeautifulSoup

soup = BeautifulSoup(html, "html.parser")

tables = []
for table in soup.find_all("table"):
    rows = []
    for tr in table.find_all("tr"):
        cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
        rows.append(cells)
    tables.append(rows)
```

#### CSS Selectors
```python
from bs4 import BeautifulSoup

soup = BeautifulSoup(html, "html.parser")

# Use CSS selectors
articles = soup.select("article.post")
headers = soup.select("h1, h2, h3")
nav_links = soup.select("nav a[href]")
first_para = soup.select_one("p")
```

## Complete Crawling Example

### Single Page Crawler
```python
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from dataclasses import dataclass

@dataclass
class PageContent:
    url: str
    title: str
    text: str
    links: list[dict]

def crawl_page(url: str, timeout: float = 30.0) -> PageContent:
    """Crawl a single webpage and extract its content."""
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; DataBot/1.0)",
    }

    response = httpx.get(url, headers=headers, timeout=timeout, follow_redirects=True)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # Remove script and style elements
    for element in soup(["script", "style", "nav", "footer"]):
        element.decompose()

    # Extract title
    title = soup.title.string if soup.title else ""

    # Extract text
    text = soup.get_text(separator="\n", strip=True)

    # Extract links
    links = []
    for a in soup.find_all("a", href=True):
        href = a.get("href")
        if href and not href.startswith(("#", "javascript:", "mailto:")):
            links.append({
                "text": a.get_text(strip=True),
                "url": urljoin(url, href),
            })

    return PageContent(url=url, title=title, text=text, links=links)

# Usage
page = crawl_page("https://example.com")
print(f"Title: {page.title}")
print(f"Links found: {len(page.links)}")
```

### Multi-Page Crawler with Depth Control
```python
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from collections import deque

def crawl_site(
    start_url: str,
    max_pages: int = 10,
    max_depth: int = 2,
    same_domain_only: bool = True,
) -> dict[str, dict]:
    """Crawl multiple pages starting from a URL."""

    visited = {}
    queue = deque([(start_url, 0)])  # (url, depth)
    start_domain = urlparse(start_url).netloc

    headers = {"User-Agent": "Mozilla/5.0 (compatible; DataBot/1.0)"}

    with httpx.Client(headers=headers, timeout=30.0, follow_redirects=True) as client:
        while queue and len(visited) < max_pages:
            url, depth = queue.popleft()

            if url in visited:
                continue

            if depth > max_depth:
                continue

            try:
                response = client.get(url)
                response.raise_for_status()

                soup = BeautifulSoup(response.text, "html.parser")

                # Remove non-content elements
                for element in soup(["script", "style"]):
                    element.decompose()

                visited[url] = {
                    "title": soup.title.string if soup.title else "",
                    "text": soup.get_text(separator="\n", strip=True)[:5000],
                    "depth": depth,
                }

                # Find new links to crawl
                if depth < max_depth:
                    for a in soup.find_all("a", href=True):
                        href = a.get("href")
                        if href and not href.startswith(("#", "javascript:")):
                            next_url = urljoin(url, href)
                            next_domain = urlparse(next_url).netloc

                            if same_domain_only and next_domain != start_domain:
                                continue

                            if next_url not in visited:
                                queue.append((next_url, depth + 1))

            except Exception as e:
                visited[url] = {"error": str(e), "depth": depth}

    return visited

# Usage
pages = crawl_site("https://example.com", max_pages=5, max_depth=1)
for url, data in pages.items():
    print(f"{url}: {data.get('title', 'Error')}")
```

## Handling Special Cases

### JavaScript-Rendered Pages
For pages that require JavaScript execution, use Playwright:

```python
from playwright.sync_api import sync_playwright

def crawl_js_page(url: str) -> str:
    """Crawl a JavaScript-rendered page."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until="networkidle")
        content = page.content()
        browser.close()
        return content
```

### Respecting robots.txt
```python
from urllib.robotparser import RobotFileParser
from urllib.parse import urljoin

def can_crawl(url: str, user_agent: str = "*") -> bool:
    """Check if crawling is allowed by robots.txt."""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"

    rp = RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
        return rp.can_fetch(user_agent, url)
    except Exception:
        return True  # Allow if robots.txt cannot be read
```

### Rate Limiting
```python
import time
import httpx
from collections import defaultdict

class RateLimitedClient:
    def __init__(self, requests_per_second: float = 1.0):
        self.client = httpx.Client(timeout=30.0, follow_redirects=True)
        self.delay = 1.0 / requests_per_second
        self.last_request = defaultdict(float)

    def get(self, url: str) -> httpx.Response:
        from urllib.parse import urlparse
        domain = urlparse(url).netloc

        elapsed = time.time() - self.last_request[domain]
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)

        response = self.client.get(url)
        self.last_request[domain] = time.time()
        return response
```

## Script Reference

This skill includes ready-to-use scripts in the `scripts/` folder.

### `fetch_page.py`

Fetch a single webpage and extract its text content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `str` | **Yes** | The URL to fetch (positional) |
| `--output` | `str` | No | Output file path (prints to stdout if omitted) |
| `--timeout` | `float` | No | Request timeout in seconds (default: `30`) |

**Output:** Formatted text with:
- `url` (str): Final URL after redirects
- `status_code` (int): HTTP status code
- `title` (str): Page title
- `description` (str): Meta description
- `text` (str): Extracted page text (scripts/styles/nav removed)
- `content_type` (str): Response Content-Type header

**Usage:** `python fetch_page.py https://example.com --output page.txt`

---

### `extract_links.py`

Extract all links from a webpage with optional filtering.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `str` | **Yes** | The URL of the webpage (positional) |
| `--output` | `str` | No | Output file path (JSON format) |
| `--absolute` | `flag` | No | Convert relative URLs to absolute (default: `True`) |
| `--filter` | `str` | No | Only include links containing this pattern |
| `--timeout` | `float` | No | Request timeout in seconds (default: `30`) |

**Output (JSON format):** Array of objects, each with:
- `text` (str): Link text
- `url` (str): Link URL (absolute if `--absolute`)

**Usage:** `python extract_links.py https://example.com --filter /docs --output links.json`

---

### `extract_tables.py`

Extract HTML tables from a webpage as JSON or CSV.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `str` | **Yes** | The URL of the webpage (positional) |
| `--output` | `str` | No | Output file path |
| `--format` | `str` | No | Output format: `json` or `csv` (default: `json`) |
| `--timeout` | `float` | No | Request timeout in seconds (default: `30`) |

**Output (JSON format):** Array of tables, where each table is:
- `list[list[str]]`: A list of rows, each row a list of cell text values

**Usage:** `python extract_tables.py https://example.com/data --format csv --output tables.csv`

---

### `crawl_site.py`

Crawl multiple pages starting from a URL, following links with depth control.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `str` | **Yes** | The starting URL to crawl (positional) |
| `--max-pages` | `int` | No | Maximum number of pages to crawl (default: `10`) |
| `--max-depth` | `int` | No | Maximum depth to follow links (default: `2`) |
| `--same-domain` | `flag` | No | Only crawl same-domain pages (default: `True`) |
| `--output` | `str` | No | Output file path (JSON format) |
| `--timeout` | `float` | No | Request timeout in seconds (default: `30`) |

**Output (JSON format):** Object mapping URL → page data, each with:
- `title` (str): Page title
- `text` (str): Extracted text (max 5000 chars)
- `depth` (int): Crawl depth from start URL
- `status_code` (int): HTTP status code
- `error` (str, optional): Error message if the page could not be fetched

**Usage:** `python crawl_site.py https://example.com --max-pages 5 --max-depth 1 --output site.json`

---

### `check_robots.py`

Check if a URL is allowed by the site's `robots.txt`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `str` | **Yes** | The URL to check (positional) |
| `--user-agent` | `str` | No | User agent to check permissions for (default: `*`) |

**Output:** Printed status message, plus structured result with:
- `url` (str): The checked URL
- `robots_url` (str): URL of the robots.txt file
- `user_agent` (str): User agent checked
- `allowed` (bool): Whether crawling is allowed
- `crawl_delay` (float, optional): Crawl delay in seconds
- `error` (str, optional): Error message if robots.txt could not be read

**Usage:** `python check_robots.py https://example.com/private-page --user-agent DataBot`

---

### `fetch_js_page.py`

Fetch a JavaScript-rendered page using Playwright (requires `playwright` and Chromium).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `str` | **Yes** | The URL to fetch (positional) |
| `--output` | `str` | No | Output file path |
| `--wait` | `int` | No | Additional wait time in ms after page load (default: `0`) |
| `--selector` | `str` | No | Wait for a specific CSS selector to appear |
| `--timeout` | `int` | No | Page load timeout in ms (default: `30000`) |
| `--html` | `flag` | No | Output raw HTML instead of extracted text |

**Output:** Formatted text (or raw HTML with `--html`), with fields:
- `url` (str): Final URL after redirects
- `title` (str): Page title
- `text` (str): Extracted text (scripts/styles/nav removed)
- `html` (str): Full rendered HTML (with `--html` flag)

**Usage:** `python fetch_js_page.py https://example.com/spa --wait 2000 --selector "#content"`

## Dependencies

Install required packages:

```bash
pip install httpx beautifulsoup4 lxml
# For JavaScript rendering:
pip install playwright && playwright install chromium
```
