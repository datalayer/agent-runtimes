# Exec Command (Migrated)

The `exec` command is now owned by the `agent-runtimes` CLI and executes Python files and Jupyter notebooks on Datalayer code sandboxes.

## Commands

### `agent-runtimes exec`

Execute a Python file or Jupyter notebook on a Datalayer code sandbox.

**Usage:**
```bash
agent-runtimes exec <filename> [options]
agent-runtimes exec --example-py [options]
agent-runtimes exec --example-notebook [options]
```

**Arguments:**
- `filename`: Path to the Python file (.py) or Jupyter notebook (.ipynb) to execute (optional when using `--example-py` or `--example-notebook`)

**Options:**
- `--sandbox, -s`: Name of the code sandbox to execute on (optional)
- `--verbose, -v`: Show all cell outputs (default: false, outputs are suppressed)
- `--timeout, -t`: Execution timeout for each cell in seconds
- `--raise`: Stop executing if an exception occurs (default: continue on errors)
- `--example-py`: Create and execute a temporary example Python file
- `--example-notebook`: Create and execute a temporary example notebook

**Examples:**
```bash
# Execute a Python script on a code sandbox
agent-runtimes exec script.py --sandbox my-sandbox

# Execute an auto-generated Python example
agent-runtimes exec --example-py --sandbox my-sandbox

# Execute an auto-generated notebook example
agent-runtimes exec --example-notebook

# Execute a Jupyter notebook with verbose output
agent-runtimes exec notebook.ipynb --sandbox my-sandbox --verbose

# Execute with timeout and stop on errors
agent-runtimes exec script.py --sandbox my-sandbox --timeout 30 --raise
```

## File Support

The exec module supports:

- **Python files (.py)**: The entire file content is executed as a single cell
- **Jupyter notebooks (.ipynb)**: Each code cell is executed sequentially, markdown cells are skipped

## Code Sandbox Connection

The exec module uses the modern `DatalayerClient` and `RuntimeManager` to:

1. Connect to the specified code sandbox
2. Start a kernel session
3. Execute cells sequentially
4. Handle interrupts (Ctrl+C) gracefully
5. Clean up resources after execution

## Error Handling

- File validation (existence, readability)
- Code sandbox connection errors
- Cell execution errors (can continue or stop based on `--raise` flag)
- Proper cleanup on interruption or failure

## Implementation

The exec functionality is implemented in:
- `agent_runtimes/commands/exec.py`: Main Typer-based CLI commands
- Uses `agent_runtimes/utils/notebook_utils.get_cells()` for file parsing
- Uses `agent_runtimes/console/manager.RuntimeManager` for code sandbox connection
- Integrates with the main CLI via `agent_runtimes/__main__.py`
