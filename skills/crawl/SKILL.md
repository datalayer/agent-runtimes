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

## Scripts

This skill includes ready-to-use scripts in the `scripts/` folder:

| Script | Description |
|--------|-------------|
| `fetch_page.py` | Fetch a single webpage and extract text content |
| `extract_links.py` | Extract all links from a webpage with filtering |
| `extract_tables.py` | Extract HTML tables as JSON or CSV |
| `crawl_site.py` | Multi-page crawler with depth control |
| `check_robots.py` | Check if URL is allowed by robots.txt |
| `fetch_js_page.py` | Fetch JavaScript-rendered pages using Playwright |

### Usage Examples

```bash
# Fetch a page and extract text
python scripts/fetch_page.py https://example.com

# Extract all links from a page
python scripts/extract_links.py https://example.com --output links.json

# Extract tables as CSV
python scripts/extract_tables.py https://example.com --format csv

# Crawl a site (max 10 pages, depth 2)
python scripts/crawl_site.py https://example.com --max-pages 10 --max-depth 2

# Check robots.txt permissions
python scripts/check_robots.py https://example.com/page

# Fetch JavaScript-rendered page
python scripts/fetch_js_page.py https://example.com --wait 1000
```

## Dependencies

Install required packages:

```bash
pip install httpx beautifulsoup4 lxml
# For JavaScript rendering:
pip install playwright && playwright install chromium
```
