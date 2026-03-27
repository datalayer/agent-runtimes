---
name: jokes
description: Return a random joke from predefined categories. Use when the user asks for a quick joke or light humor.
license: BSD-3-Clause
version: 0.0.1
tags:
  - fun
  - humor
  - demo
author: Datalayer
---

# Jokes Skill

## Environment

- None required.

## Script Inventory

### `scripts/random_joke.py`

- Method: `random_joke(category: str = "any") -> str`
- Required CLI params: none
- Optional CLI params:
- `--category <any|tech|dad|data>`

## Usage Examples

```bash
python skills/jokes/scripts/random_joke.py
python skills/jokes/scripts/random_joke.py --category tech
```
