# Agent Specifications

YAML-based specifications with automatic code generation for Python and TypeScript.

## Overview

Specifications are defined in YAML format and automatically code-generated into Python and TypeScript:

### Specification Types
- **Agent Specs** (`specs/agents/`) - Agent configurations with MCP servers and skills
- **MCP Server Specs** (`specs/mcp-servers/`) - MCP server commands and environment variables
- **Skill Specs** (`specs/skills/`) - Agent skills with dependencies and env vars

All specs provide:
- **Type Safety**: Pydantic models (Python) and TypeScript interfaces
- **Consistency**: Same structure and validation across languages
- **Single Source of Truth**: YAML files are authoritative
- **Easy Maintenance**: Update one file to change both backend and frontend

## Directory Structure

```
specs/
├── agents/                          # Agent specifications
│   ├── data-acquisition.yaml
│   ├── crawler.yaml
│   ├── github-agent.yaml
│   ├── financial-viz.yaml
│   └── information-routing.yaml
├── mcp-servers/                     # MCP server specifications
│   ├── kaggle.yaml
│   ├── github.yaml
│   ├── filesystem.yaml
│   └── ...
├── skills/                          # Skill specifications
│   ├── data-analysis.yaml
│   └── ...
├── agent-spec.schema.yaml           # JSON Schema for validation
└── README.md                        # This file

Related files:
├── scripts/codegen/
│   ├── generate_agents.py           # Agent code generator
│   ├── generate_mcp_servers.py      # MCP server code generator
│   └── generate_skills.py           # Skills code generator
├── agent_runtimes/
│   ├── config/
│   │   ├── agents.py                # Generated agent specs
│   │   └── skills.py                # Generated skill specs
│   ├── mcp/
│   │   └── catalog_mcp_servers.py   # Generated MCP server specs
│   └── types/types.py               # Type definitions
└── src/
    ├── config/
    │   ├── agents.ts                # Generated agent specs (TS)
    │   ├── mcpServers.ts            # Generated MCP server specs (TS)
    │   └── skills.ts                # Generated skill specs (TS)
    └── types.ts                     # TypeScript type definitions
```

## Quick Start

### Generate All Specs
```bash
make specs
```

This single command generates Python and TypeScript code for:
- Agent specifications
- MCP server specifications
- Skill specifications

### Legacy Command
```bash
make agentspecs-generate  # Still works, alias for 'make specs'
```

## Agent Specifications

### Required Fields
- **`id`** (string): Unique identifier (kebab-case)
- **`name`** (string): Display name
- **`description`** (string): Agent capabilities description

### Optional Fields
- **`tags`** (list): Categorization tags
- **`enabled`** (boolean): Whether agent is active (default: `true`)
- **`mcp_servers`** (list): MCP server IDs to use
- **`skills`** (list): Agent skills
- **`environment_name`** (string): Runtime environment (default: `"ai-agents"`)
- **`icon`** (string): UI icon identifier
- **`color`** (string): Hex color code (e.g., `"#3B82F6"`)
- **`suggestions`** (list): Chat examples
- **`welcome_message`** (string): Greeting message
- **`welcome_notebook`** (string): Jupyter notebook path
- **`welcome_document`** (string): Lexical document path

### Example
```yaml
id: data-acquisition
name: Data Acquisition Agent
description: >
  Acquires and manages data from various sources including Kaggle datasets
  and local filesystem operations.

tags:
  - data
  - acquisition

enabled: true

mcp_servers:
  - kaggle
  - filesystem

environment_name: ai-agents

icon: database
color: "#3B82F6"

suggestions:
  - Find popular machine learning datasets on Kaggle
  - List available files in my workspace
```

## MCP Server Specifications

### Required Fields
- **`id`** (string): Unique identifier (kebab-case)
- **`name`** (string): Display name
- **`description`** (string): Server capabilities description
- **`command`** (string): Executable command (e.g., `"npx"`, `"python"`)
- **`args`** (list): Command arguments

### Optional Fields
- **`transport`** (string): Transport protocol (`"stdio"`, `"remote"`)
- **`required_env_vars`** (list): Environment variables that must be set
- **`env`** (dict): Environment variables to set for the server process
- **`tags`** (list): Categorization tags

### Environment Variables
Use `${VAR_NAME}` syntax in args for environment variable expansion:
```yaml
args:
  - "-m"
  - "mcp_remote"
  - "--Authorization"
  - "Bearer ${KAGGLE_TOKEN}"
```

### Example
```yaml
id: kaggle
name: Kaggle MCP Server
description: Access Kaggle datasets, competitions, and kernels

command: python
args:
  - "-m"
  - "mcp_remote"
  - "--Authorization"
  - "Bearer ${KAGGLE_TOKEN}"
  - "--accept"
  - "application/json"
  - "--"
  - "https://mcp.kaggle.com"

transport: remote

required_env_vars:
  - KAGGLE_TOKEN

tags:
  - data
  - kaggle
  - datasets
```

## Skill Specifications

### Required Fields
- **`id`** (string): Unique identifier (kebab-case)
- **`name`** (string): Display name
- **`description`** (string): Skill capabilities description
- **`module`** (string): Python module path (e.g., `"agent_skills.data_analysis"`)

### Optional Fields
- **`required_env_vars`** (list): Environment variables that must be set
- **`optional_env_vars`** (list): Optional environment variables
- **`dependencies`** (list): Required Python packages
- **`tags`** (list): Categorization tags

### Example
```yaml
id: data-analysis
name: Data Analysis Skill
description: Perform statistical analysis and data visualization

module: agent_skills.data_analysis

required_env_vars:
  - OPENAI_API_KEY

optional_env_vars:
  - PLOT_DPI
  - CHART_THEME

dependencies:
  - pandas>=2.0.0
  - matplotlib>=3.7.0
  - seaborn>=0.12.0
  - numpy>=1.24.0

tags:
  - data
  - analysis
  - visualization
```

## Generated Code

### Python

**Agents**: `agent_runtimes/config/agents.py`
- `AgentSpec`: Pydantic model for agent specifications
- `AGENT_SPECS`: Dictionary of all agent specs
- `get_agent_spec(agent_id: str)`: Retrieve spec by ID

**MCP Servers**: `agent_runtimes/mcp/catalog_mcp_servers.py`
- `MCPServerSpec`: Pydantic model for MCP server specifications
- `MCP_SERVER_CATALOG`: Dictionary of all MCP server specs
- `get_mcp_server_spec(server_id: str)`: Retrieve spec by ID

**Skills**: `agent_runtimes/config/skills.py`
- `SkillSpec`: Pydantic model for skill specifications
- `SKILL_SPECS`: Dictionary of all skill specs
- `get_skill_spec(skill_id: str)`: Retrieve spec by ID

### TypeScript

**Agents**: `src/config/agents.ts`
- `AgentSpec`: TypeScript interface
- `AGENT_SPECS`: Record of all agent specs
- `getAgentSpec(agentId: string)`: Retrieve spec by ID

**MCP Servers**: `src/config/mcpServers.ts`
- `MCPServerSpec`: TypeScript interface
- `MCP_SERVER_SPECS`: Record of all MCP server specs
- `getMCPServerSpec(serverId: string)`: Retrieve spec by ID

**Skills**: `src/config/skills.ts`
- `SkillSpec`: TypeScript interface
- `SKILL_SPECS`: Record of all skill specs
- `getSkillSpec(skillId: string)`: Retrieve spec by ID

## Usage

### Python
```python
from agent_runtimes.config.agents import get_agent_spec, AGENT_SPECS
from agent_runtimes.mcp.catalog_mcp_servers import get_mcp_server_spec
from agent_runtimes.config.skills import get_skill_spec

# Get specific agent
agent = get_agent_spec("data-acquisition")
print(agent.name)  # "Data Acquisition Agent"
print(agent.mcp_servers)  # ["kaggle", "filesystem"]

# List all agents
for agent_id, agent in AGENT_SPECS.items():
    print(f"{agent_id}: {agent.name}")

# Get MCP server configuration
server = get_mcp_server_spec("kaggle")
print(server.command)  # "python"
print(server.required_env_vars)  # ["KAGGLE_TOKEN"]

# Get skill
skill = get_skill_spec("data-analysis")
print(skill.module)  # "agent_skills.data_analysis"
print(skill.dependencies)  # ["pandas>=2.0.0", ...]
```

### TypeScript
```typescript
import { getAgentSpec, AGENT_SPECS } from './config/agents';
import { getMCPServerSpec } from './config/mcpServers';
import { getSkillSpec } from './config/skills';

// Get specific agent
const agent = getAgentSpec('data-acquisition');
console.log(agent?.name);  // "Data Acquisition Agent"
console.log(agent?.mcpServers);  // ["kaggle", "filesystem"]

// List all agents
Object.entries(AGENT_SPECS).forEach(([id, spec]) => {
  console.log(`${id}: ${spec.name}`);
});

// Get MCP server configuration
const server = getMCPServerSpec('kaggle');
console.log(server?.command);  // "python"
console.log(server?.requiredEnvVars);  // ["KAGGLE_TOKEN"]

// Get skill
const skill = getSkillSpec('data-analysis');
console.log(skill?.module);  // "agent_skills.data_analysis"
console.log(skill?.dependencies);  // ["pandas>=2.0.0", ...]
```

## Development Workflow

### Adding a New Agent
1. Create `specs/agents/my-agent.yaml`
2. Run `make specs`
3. Import from `agent_runtimes.config.agents` or `src/config/agents.ts`

### Adding a New MCP Server
1. Create `specs/mcp-servers/my-server.yaml`
2. Run `make specs`
3. Import from `agent_runtimes.mcp.catalog_mcp_servers` or `src/config/mcpServers.ts`

### Adding a New Skill
1. Create `specs/skills/my-skill.yaml`
2. Run `make specs`
3. Import from `agent_runtimes.config.skills` or `src/config/skills.ts`

### Validation
The JSON Schema (`agent-spec.schema.yaml`) validates:
- Required fields are present
- ID format (kebab-case)
- Color format (hex codes)
- List and object structures

## Testing

Run the test suite:
```bash
npm test
```

Tests validate:
- All YAML files parse correctly
- Generated Python code imports successfully
- Generated TypeScript compiles without errors
- All specs are accessible via lookup functions
- Pydantic models validate correctly

## Environment Variables

MCP servers and skills support environment variable requirements:

- **`required_env_vars`**: Must be set before server/skill can run
- **`optional_env_vars`**: Optional configuration
- **`env`**: Variables to set for the server process
- **Variable Expansion**: Use `${VAR_NAME}` in args for runtime expansion

Example:
```yaml
# MCP server with auth token
args:
  - "--Authorization"
  - "Bearer ${KAGGLE_TOKEN}"

required_env_vars:
  - KAGGLE_TOKEN
```

The lifecycle manager automatically expands `${KAGGLE_TOKEN}` from environment.

## Best Practices

1. **Naming**: Use kebab-case for IDs (`data-acquisition`, not `data_acquisition`)
2. **Descriptions**: Be specific about capabilities and use cases
3. **Tags**: Use consistent tags across related specs
4. **Environment Variables**: Document all required env vars
5. **Dependencies**: Pin major versions for skills (`pandas>=2.0.0`)
6. **Colors**: Use design system colors for consistency
7. **Suggestions**: Provide 3-5 clear example prompts
8. **Testing**: Always run `make specs` and test after changes

## Troubleshooting

### Generation Fails
```bash
# Verbose output
python scripts/codegen/generate_agents.py
python scripts/codegen/generate_mcp_servers.py
python scripts/codegen/generate_skills.py
```

### Invalid YAML
- Validate against schema: `agent-spec.schema.yaml`
- Check indentation (use 2 spaces)
- Ensure all required fields are present

### Import Errors
```bash
# Verify generated files exist
ls agent_runtimes/config/agents.py
ls agent_runtimes/mcp/catalog_mcp_servers.py
ls agent_runtimes/config/skills.py
ls src/config/agents.ts
ls src/config/mcpServers.ts
ls src/config/skills.ts
```

### TypeScript Compilation Errors
```bash
npm run build  # Check for type errors
```

## Contributing

When adding new specs:
1. Follow the YAML schema format
2. Add appropriate tags
3. Document all environment variables
4. Run `make specs` to generate code
5. Test the generated code
6. Update this README if adding new patterns

### Create New Agent
1. Create `specs/agents/my-agent.yaml`
2. Define specification following the schema above
3. Run `make agentspecs-generate`

### Test
```bash
# Python
python -c "from agent_runtimes.config.agents import AGENT_SPECS; print(f'{len(AGENT_SPECS)} agents')"

# TypeScript
npx tsc --noEmit src/config/agents.ts
```

## Code Generation

Running `make agentspecs-generate` executes `scripts/codegen/generate_agents.py`, which:
1. Loads all YAML files from `specs/agents/`
2. Generates `agent_runtimes/config/agents.py`
3. Generates `src/config/agents.ts`

### Generated Output

**Python**:
- Agent spec constants (e.g., `DATA_ACQUISITION_AGENT_SPEC`)
- `AGENT_SPECS` dictionary
- Helper functions: `get_agent_spec()`, `list_agent_specs()`

**TypeScript**:
- Agent spec constants
- `AGENT_SPECS` record
- Helper functions: `getAgentSpecs()`, `listAgentSpecs()`

## Available MCP Servers

Reference these server IDs in the `mcp_servers` field:

- `tavily` - Web search via Tavily API
- `filesystem` - Local filesystem operations
- `github` - GitHub repository operations
- `google-workspace` - Google Workspace integration
- `slack` - Slack messaging
- `kaggle` - Kaggle datasets and competitions
- `alphavantage` - Financial market data
- `chart` - Chart generation
- `linkedin` - LinkedIn profile operations
- `gmail` - Gmail operations
- `gdrive` - Google Drive operations

List all with status: `agent-runtimes mcp-servers-catalog`

## Best Practices

### Naming
- **ID**: kebab-case (`data-acquisition`)
- **Name**: Title Case with "Agent" suffix
- **Constants**: Auto-generated as `SCREAMING_SNAKE_CASE_AGENT_SPEC`

### Colors
- **Blue** (`#3B82F6`): Data and information
- **Green** (`#10B981`): Web and networking
- **Indigo** (`#6366F1`): Development and code
- **Amber** (`#F59E0B`): Finance and analytics
- **Pink** (`#EC4899`): Communication and workflow

### Content Guidelines
- **Descriptions**: 1-2 sentences, present tense
- **Suggestions**: 3-5 concrete examples with action verbs
- **Tags**: 2-5 relevant categorization keywords

## Architecture

Design principles:
1. **Single Source of Truth**: YAML files are authoritative
2. **Code Generation**: Python and TypeScript auto-generated
3. **Type Safety**: Pydantic models + TypeScript interfaces
4. **Consistency**: Same structure across languages
5. **Extensibility**: Easy to add new fields

### System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      YAML Specifications (Single Source of Truth)            │
│                                                                              │
│  specs/agents/*.yaml        specs/mcp-servers/*.yaml      specs/skills/*.yaml│
│  • Agent configurations     • MCP server commands         • Skill modules    │
│  • MCP server references    • Environment variables       • Dependencies     │
│  • Skill references         • Transport protocols         • Env vars         │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     │ make specs
                                     │
                     ┌───────────────┴───────────────┐
                     │                               │
                     ▼                               ▼
┌────────────────────────────────┐   ┌────────────────────────────────┐
│      Python Generated          │   │     TypeScript Generated       │
│                                │   │                                │
│  agent_runtimes/config/        │   │  src/config/                   │
│    • agents.py                 │   │    • agents.ts                 │
│                                │   │    • mcpServers.ts             │
│  agent_runtimes/mcp/           │   │    • skills.ts                 │
│    • catalog_mcp_servers.py    │   │                                │
│                                │   │                                │
│                                │   │                                │
│  agent_runtimes/config/        │   │                                │
│    • skills.py                 │   │                                │
└────────────────┬───────────────┘   └────────────────┬───────────────┘
                 │                                    │
                 ▼                                    ▼
┌────────────────────────────────┐   ┌────────────────────────────────┐
│     Backend / FastAPI          │   │     Frontend / React           │
│  • Agent Runtimes Server       │   │  • Chat Components             │
│  • MCP Server Lifecycle        │   │  • Runtime Management          │
│  • Tool Composition            │   │  • Agent Configuration         │
└────────────────────────────────┘   └────────────────────────────────┘
```

## Development

### Modifying Agents
1. Edit YAML file in `specs/agents/`
2. Run `make agentspecs-generate`
3. Test changes

### Adding Fields
1. Update `specs/agent-spec.schema.yaml`
2. Add to `agent_runtimes/types/types.py` and `src/types.ts`
3. Update `scripts/codegen/generate_agents.py`
4. Run `make agentspecs-generate`

### Testing
```bash
# Python
python -c "from agent_runtimes.config.agents import AGENT_SPECS; print(len(AGENT_SPECS))"

# TypeScript
npx tsc --noEmit src/config/agents.ts

# Full test suite
npm test
```

## Validation

Multiple validation layers:
- JSON Schema (`agent-spec.schema.yaml`)
- Pydantic models (Python)
- TypeScript type checking
- Import/compile tests

## Future Enhancements

- YAML schema validation in CI/CD
- Auto-generated API documentation
- Visual agent designer UI
- Agent templates library
- Skills system integration

## License

Copyright (c) 2025-2026 Datalayer, Inc.
Distributed under the terms of the Modified BSD License.
