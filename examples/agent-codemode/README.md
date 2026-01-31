# Agent CLI

Interactive CLI agent that connects to MCP servers with configurable tools.

## Configuration

Before running the agent, create a configuration file to specify which MCP servers to use:

1. Copy the example config:

   ```bash
   cp examples/agent-codemode/agent_cli_config.example.json examples/agent-codemode/agent_cli_config.json
   ```

2. Edit `agent_cli_config.json` to configure your MCP servers:
   ```json
   {
     "mcp_servers": [
       {
         "name": "example_mcp_server",
         "command": "python",
         "args": ["./example_mcp_server.py"],
         "timeout": 300
       }
     ]
   }
   ```

Each server can have:

- `name` - Friendly name for the server
- `command` - Executable to run (e.g., `"python"`, `"node"`, `"npx"`)
- `args` - Array of arguments (relative paths are resolved from the config file's directory)
- `timeout` - Optional timeout in seconds (default: 300)
- `env` - Optional environment variables object

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

## MCP Servers

The agent CLI can connect to any MCP server. Configure servers in `agent_cli_config.json`.

### Example MCP Server

An example MCP server (`example_mcp_server.py`) is included for demonstration. It provides these tools:

- `generate_random_text(word_count, seed)` - Generate random text
- `write_text_file(path, content)` - Write content to a file
- `read_text_file(path, include_content, max_chars)` - Read a file
- `read_text_file_many(path, times, include_content, max_chars)` - Read a file multiple times

### Using Other MCP Servers

You can configure any MCP server in `agent_cli_config.json`. For example:

```json
{
  "mcp_servers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/directory"
      ],
      "timeout": 60
    },
    {
      "name": "my_custom_server",
      "command": "python",
      "args": ["/path/to/my_server.py"],
      "env": { "API_KEY": "your-key" }
    }
  ]
}
```

## Generated content

Generated code is now written to the repo root (generated/) instead of under examples/.

It’s created only after tool discovery runs.

If you don’t see it, run a prompt that triggers tool discovery (or call `/list_tool_names` or `/search_tools`).
