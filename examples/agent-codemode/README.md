# Agent CLI

Interactive CLI agent that talks to a local MCP stdio server with file read/write tools.

## Run

```bash
python examples/agent/agent_cli.py
```

Codemode variant (code-first tool composition):

```bash
python examples/agent/agent_cli.py --codemode
```

Make targets:

```bash
make agent
make agent-codemode
```

## MCP Server

The agent CLI spawns this stdio MCP server automatically. It provides:

- `generate_random_text(word_count, seed)`
- `write_text_file(path, content)`
- `read_text_file(path, include_content, max_chars)`
- `read_text_file_many(path, times, include_content, max_chars)`

## Generated content

Generated code is now written to the repo root (generated/) instead of under examples/.

It’s created only after tool discovery runs.

If you don’t see it, run a prompt that triggers tool discovery (or call `/list_tool_names` or `/search_tools`).
