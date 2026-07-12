[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# Agent Runtimes Examples

## Integration Example

### Integration Example (`skill_codemode_example.py`)

Demonstrates how to integrate `agent-codemode` and `agent-skills` with `agent-runtimes`.

```bash
python examples/skill_codemode_example.py
```

Features demonstrated:

- Setting up the CodemodeIntegration
- Code execution via integration
- Tool and skill search
- Complete agent workflows
- MCP server integration

## Related Examples

- MCP Codemode examples: [ai/agent-codemode/examples/codemode_example.py](ai/agent-codemode/examples/codemode_example.py), [ai/agent-codemode/examples/codemode_patterns_example.py](ai/agent-codemode/examples/codemode_patterns_example.py)
- Agent Skills examples: [ai/agent-skills/examples/skills_example.py](ai/agent-skills/examples/skills_example.py), [ai/agent-skills/examples/skills/SKILL.md](ai/agent-skills/examples/skills/SKILL.md)

## Datalayer Client Examples

These examples demonstrate the Datalayer Client and runtime workflows.

- 🧪 [Simple Runtime Quickstart](./simple/README.md): minimal runtime execution quickstarts (`runtime_quickstart.py`, `runtime_quickstart_nocontext.py`).
- 🎭 [Datalayer Decorator](./decorator/README.md): the `@datalayer` decorator for remote function execution.
- 🚀 [FastAPI + Scikit-learn](./fastapi/README.md): REST API serving ML models on Datalayer runtimes.
- 📊 [Streamlit + Scikit-learn](./streamlit/README.md): interactive ML inference app.
- ⚛️ [Next.js + Datalayer Notebook](./nextjs/README.md): Next.js app integrating Jupyter notebooks with cloud runtimes.
- ⚡ [PyTorch GPU Workloads](./pytorch/README.md): CPU vs GPU benchmarks on Datalayer runtimes.

## Additional Examples

### Python Examples

For comprehensive Python usage examples, see this `examples/` directory, including:

- OpenTelemetry observability: traces and metrics instrumentation with a visualization UI
- FastAPI + scikit-learn
- Streamlit + scikit-learn
- PyTorch GPU workloads
- `@datalayer` decorator patterns
- Next.js integration

### TypeScript/React Examples

Run the interactive examples from the repository root:

```bash
# Install dependencies
npm install

# Set your Datalayer API token in .env
echo "VITE_DATALAYER_API_KEY=your-api-key-here" > .env

# Start the examples server
npm run examples
```

Available at http://localhost:3000/:

- DatalayerNotebookExample: full integration with Datalayer services and collaboration
- NotebookExample: basic Jupyter notebook in React
- CellExample: individual code cell execution
- ReactRouterAdvancedExample: comprehensive navigation demo with React Router integration
- ReactRouterNavigationExample: basic navigation with route parameters
- NativeNavigationExample: browser-native navigation fallback

### Next.js Application Example

See [Next.js + Datalayer Notebook](./nextjs/README.md).

## Key Concepts

### Code Mode

Instead of calling tools one-by-one through LLM inference, Code Mode allows agents to write Python code that orchestrates multiple tool calls. Benefits include:

- Reduced LLM calls for multi-step operations
- Better error handling with try/except
- Parallel execution with asyncio.gather
- Complex logic with loops and conditionals

Based on [Cloudflare's Code Mode](https://blog.cloudflare.com/introducing-code-mode).

### Skills

Skills are reusable, code-based tool compositions that agents can:

- Discover based on context
- Activate when needed
- Execute with parameters
- Share and version

Compatible with [Claude Code SKILL.md format](https://docs.anthropic.com/en/docs/claude-code/skills).

### Programmatic Tool Calling

Tools can be marked for programmatic calling with:

- `defer_loading: true` - Load tool definition on-demand
- `allowed_callers: ["code_execution"]` - Allow code-based invocation

Based on [Anthropic's Programmatic Tool Calling](https://www.anthropic.com/engineering/programmatic-tool-calling-beta).

## Installation

```bash
# Install agent-runtimes with optional dependencies
pip install agent-runtimes

# Install agent-codemode and agent-skills
pip install agent-codemode agent-skills
```
