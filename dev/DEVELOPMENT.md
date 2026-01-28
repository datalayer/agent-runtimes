# Development Guide - @datalayer/agent-runtimes

This document provides comprehensive information for developers working on the `@datalayer/agent-runtimes` package.

## Prerequisites

- Node.js >= 20.0.0
- npm (not yarn)
- Python 3.11+ (for Python components)

## Setup

```bash
# Install dependencies
npm install

# Build library
npm run build:lib

# Watch for changes (development)
npm run watch:lib

# Run type checking
npm run type-check

# Start Storybook
npm run storybook
```

## Working with Jupyter Packages

The `@datalayer/agent-runtimes` package depends on `@datalayer/jupyter-lexical` and `@datalayer/jupyter-react` from the jupyter-ui monorepo. During development, you may need to sync changes from those packages.

### Recent API Simplifications (January 2025)

The Lexical tools API has been simplified for better usability:

#### 1. Metadata Field Standardization

- All block operations now use `metadata` field (aligned with Jupyter Notebook format)
- Previously used "properties" - now consistently "metadata" throughout all tools
- Example: `insertBlock({ type: 'code', source: 'print("hello")', metadata: { language: 'python' } })`

#### 2. Collapsible Title Simplification

- Collapsible blocks now only accept title from the `source` field
- Removed redundant `metadata.title` alternative
- Example: `insertBlock({ type: 'collapsible', source: 'Section Title', metadata: { open: true } })`

#### 3. Category Removal

- Removed category concept from `listAvailableBlocks` to prevent confusion
- Operation now always returns all available block types
- No more filtering by category - use block `type` directly for insertion

### Development Scripts

```bash
# Sync latest changes from jupyter-ui packages
npm run sync:jupyter
# Builds jupyter-lexical and jupyter-react, copies lib/ to node_modules

# Watch mode - auto-sync on file changes
npm run sync:jupyter:watch
# Monitors src/ folders and automatically rebuilds/syncs when files change

# Create patches for modified packages
npm run create:patches
# Auto-syncs first, then generates patch files in patches/

# Apply patches manually (if needed)
npm run apply:patches
# Normally runs automatically via postinstall hook
```

### Workflow

1. **Make changes** in `../jupyter-ui/packages/lexical` or `../jupyter-ui/packages/react`
2. **Option A - Manual sync**: `npm run sync:jupyter` when ready to test
3. **Option B - Auto sync**: `npm run sync:jupyter:watch` in a separate terminal for live updates
4. **Test changes**: Run Storybook or build examples (`npm run storybook` or `npm run examples`)
5. **Create patches**: `npm run create:patches` (when ready to commit)

The patches in `patches/` directory are automatically applied when anyone runs `npm install`, ensuring all contributors get your modifications.

## Working with Core Library

The `@datalayer/agent-runtimes` package depends on `@datalayer/core` from the core repository. During development, you may need to sync changes from the core library.

### Sync Script

```bash
# Sync latest changes from core library
./dev/sh/sync-core.sh
# Copies built lib/ from core to node_modules/@datalayer/core
```

### Workflow

1. **Make changes** in `/Users/goanpeca/Desktop/develop/datalayer/core/src`
2. **Build core library**: `cd ../core && npm run build:lib`
3. **Sync to agent-runtimes**: `./dev/sh/sync-core.sh`
4. **Clear Vite cache**: `rm -rf node_modules/.vite` (important for dev server changes)
5. **Test changes**: Run examples (`npm run examples`)

**Important**: Always clear the Vite cache after syncing core changes, as Vite caches module resolutions aggressively.

## Code Quality & Validation

The project enforces strict quality standards.

### Validation Commands

```bash
# Type checking (TypeScript compilation)
npm run type-check
# Runs: tsc --noEmit

# Type check all workspaces
npm run type-check:all

# Build types
npm run build:types
# Compiles TypeScript to .d.ts files

# Linting (ESLint)
npm run lint
# Checks code style

# Lint all workspaces
npm run lint:all

# Auto-fix linting issues
npm run lint:fix
npm run lint:fix:all  # All workspaces

# Format code
npm run format
# Uses Prettier to format code

# Format all workspaces
npm run format:all

# Check formatting
npm run format:check
npm run format:check:all  # All workspaces

# Run all checks
npm run check
# Equivalent to: format:check + lint:all + type-check:all

# Auto-fix all issues
npm run check:fix
# Equivalent to: format:all + lint:fix + type-check:all
```

## Project Structure

```
@datalayer/agent-runtimes/
├── src/                    # TypeScript source files
│   ├── components/        # React components (ChatBase, ChatSidebar, etc.)
│   ├── runtime/           # Runtime management (Zustand store, hooks)
│   ├── tools/             # Tool integrations (MCP, custom tools)
│   └── utils/             # Utility functions
├── lib/                    # Compiled JavaScript (git-ignored)
├── dist/                   # Vite build output (git-ignored)
├── patches/               # patch-package patches for dependencies
├── scripts/               # Build and development scripts
│   ├── sync-jupyter.sh    # Sync jupyter-ui packages
│   ├── create-patches.sh  # Generate patches
│   └── apply-patches.sh   # Apply patches
├── examples/              # Example applications
│   └── nextjs-notebook-example/  # Next.js example
├── agent_runtimes/        # Python server
├── dev/                   # Developer documentation
│   └── DEVELOPMENT.md     # This file
└── .storybook/           # Storybook configuration
```

## Building

### Library Build

```bash
# Clean and full build (lib + dist)
npm run build

# Build only lib/ (faster for development)
npm run build:lib

# Build only types
npm run build:types

# Clean build artifacts
npm run clean
npm run clean:lib
npm run clean:dist
```

### Watch Mode

```bash
# Watch lib/ (TypeScript compilation + resources)
npm run watch:lib

# Watch only TypeScript compilation
npm run watch:lib:src

# Watch only resources
npm run watch:lib:res
```

## Testing

```bash
# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run all tests
npm run test:all

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Storybook

```bash
# Start Storybook development server
npm run storybook

# Build Storybook for deployment
npm run build-storybook
```

## Examples

### Vite Example

```bash
# Run example with Vite
npm run examples

# Run example with fresh Vite cache (recommended after patches)
npm run examples:fresh
```

### Next.js Example

```bash
# Run Next.js example (development)
npm run examples:nextjs

# Build Next.js example
npm run build:nextjs
```

### Cache Management

Vite caches compiled modules in `node_modules/.vite`, which can cause issues when testing patches or modified dependencies.

```bash
# Clear Vite cache only
npm run clean:cache

# Run example with fresh cache (clears cache first)
npm run examples:fresh

# Nuclear option: rebuild everything with fresh cache
npm run rebuild:fresh
# This does: create:patches → npm install → build → clean:cache
```

**When to clear cache:**
- After creating/applying patches
- After modifying jupyter-ui dependencies
- When tool operations aren't reflecting in browser
- When you see stale compiled code

**Quick workflow after jupyter-ui changes:**
```bash
# Full rebuild with fresh cache
npm run rebuild:fresh

# Then start example
npm run examples
```

## Python Server

The agent-runtimes Python server provides protocol adapters for AI agents.

### Development

```bash
# Start server with auto-reload and debug logging
npm run server:start

# Or run directly with Python
python -m agent_runtimes --port 8765 --reload --debug
```

### Jupyter Server

For examples that require a Jupyter server:

```bash
# Start Jupyter server
npm run jupyter:start
```

### ACP (Agent Client Protocol) Example

```bash
# Start both Python server and Vite dev server with ACP WebSocket
npm run start:acp

# Or for production Python server
npm run start:acp:prod
```

## Patch Management

### Why Patches?

The agent-runtimes package uses `patch-package` to maintain local modifications to `@datalayer/jupyter-lexical` and `@datalayer/jupyter-react`. This allows us to:

1. Test changes from jupyter-ui packages before they're published
2. Maintain custom modifications if needed
3. Ensure all developers have the same package versions with modifications

### Creating Patches

After modifying jupyter-ui packages and syncing them:

```bash
# This will:
# 1. Build and sync latest jupyter-ui packages
# 2. Generate patch files in patches/
npm run create:patches
```

### Applying Patches

Patches are automatically applied during `npm install` via the postinstall hook. To manually apply:

```bash
npm run apply:patches
```

### Patch Files

Patches are stored in `patches/` directory:
- `@datalayer+jupyter-lexical+<version>.patch`
- `@datalayer+jupyter-react+<version>.patch`

**Important**: Commit patch files to the repository so all developers get the same modifications.

## TypeScript Configuration

The project uses multiple TypeScript configurations:

- `tsconfig.json` - Base configuration
- Different workspaces may have their own tsconfig files

## Documentation

```bash
# Generate TypeScript API documentation
npm run typedoc
```

Documentation is generated to `docs/docs/typescript_api/`.

## Showcase Examples

```bash
# Run Vercel AI Elements showcase
npm run showcase:vercel-ai-elements
```

## Common Issues

### Issue: Changes in jupyter-ui not reflected

**Solution**: Run `npm run sync:jupyter` to rebuild and copy latest changes.

### Issue: Patch application fails

**Solution**:

1. Delete `node_modules/` and `package-lock.json`
2. Run `npm install` again
3. If still failing, regenerate patches with `npm run create:patches`

### Issue: Type errors in imported packages

**Solution**: Ensure jupyter-ui packages are built with `npm run sync:jupyter`.

### Issue: Vite cache showing stale code

**Solution**: Clear Vite cache with `npm run clean:cache` or `npm run examples:fresh`.

### Issue: Python server not starting

**Solution**:

1. Verify Python 3.11+ is installed: `python --version`
2. Check if port 8765 is already in use
3. Try killing existing processes: `npm run kill`

### Issue: WebSocket connection errors in examples

**Solution**:

1. Ensure Python server is running: `npm run server:start`
2. Check that ACP WebSocket URL matches in both server and client
3. Default URL: `ws://localhost:8765/api/v1/acp/ws`

## Contributing

1. Make your changes in the appropriate directory
2. Run validation: `npm run check`
3. Fix any issues: `npm run check:fix`
4. Test your changes: `npm run test`
5. If modifying jupyter-ui dependencies: `npm run create:patches`
6. Commit your changes including patch files

## Resources

- [Main Repository](https://github.com/datalayer/agent-runtimes)
- [Jupyter UI Repository](https://github.com/datalayer/jupyter-ui)
- [Storybook Documentation](https://storybook.js.org/)
- [patch-package Documentation](https://github.com/ds300/patch-package)
- [Pydantic AI](https://ai.pydantic.dev/)
- [ACP Protocol](https://github.com/agentclientprotocol/acp)

---

*Last Updated: January 2025*
