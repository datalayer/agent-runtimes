# Datalayer Core TypeScript/React Examples

This directory contains interactive examples demonstrating how to use Datalayer Core's TypeScript/React components and services.

## Getting Started

### Prerequisites

1. **Datalayer API Key**: Get your key from [Datalayer Platform](https://datalayer.ai)
2. **Node.js**: Version 18+ recommended
3. **npm**: Comes with Node.js

### Setup

1. Install dependencies:

```bash
npm install
```

2. Configure your environment:

```bash
# Create .env file with your local configuration
echo "VITE_DATALAYER_API_KEY=$DATALAYER_API_KEY" > .env
echo "VITE_DATALAYER_URL=$DATALAYER_URL" >> .env
```

3. Start the examples server:

```bash
npm run examples
```

4. Open http://localhost:3000/ in your browser

## Available Examples

### DatalayerNotebookExample

**File**: `DatalayerNotebookExample.tsx`

Demonstrates full integration with Datalayer services:

- **DatalayerServiceManager**: Connects to Datalayer infrastructure for kernel management
- **DatalayerCollaborationProvider**: Enables real-time collaboration
- **Runtime creation**: Automatically provisions compute resources
- **Graceful fallback**: Works with limited functionality when credentials are missing

Key features:

- Toggle collaboration on/off
- Switch between read-only and edit modes
- Automatic kernel provisioning with Datalayer credits
- WebSocket connections for real-time updates

### NotebookExample

**File**: `NotebookExample.tsx`

Basic Jupyter notebook implementation:

- Standard notebook interface
- Local or remote kernel support
- Cell execution and output display
- Markdown and code cell support

### CellExample

**File**: `CellExample.tsx`

Individual code cell execution:

- Standalone cell component
- Syntax highlighting
- Output rendering
- Error handling

## Configuration

### Selecting an Example

Edit `vite.examples.config.ts` to choose which example to run:

```typescript
const EXAMPLE =
  // 'CellExample';
  'DatalayerNotebookExample'; // Current selection
// 'NotebookExample';
```

### Environment Variables

The examples support these environment variables:

- `VITE_DATALAYER_API_KEY`: Your Datalayer authentication token (required for full functionality)
- `VITE_DATALAYER_URL`: The Datalayer RUN server.
- `EXAMPLE`: Override the selected example via command line

### Vite Configuration

The `vite.examples.config.ts` file includes:

- Proxy configuration for CORS handling
- Environment variable injection
- Hot module replacement
- TypeScript/React support

## Architecture

### Services

**DatalayerServiceManager** (`src/services/DatalayerServiceManager.ts`)

- Creates and manages Jupyter service connections
- Handles runtime provisioning via Datalayer API
- Manages authentication and token handling
- Returns configured ServiceManager for notebook use

**DatalayerCollaborationProvider** (`src/collaboration/DatalayerCollaborationProvider.ts`)

- Implements real-time collaboration using WebSockets
- Manages shared document state
- Handles user presence and cursors
- Integrates with Jupyter's collaboration framework

### State Management

Uses Zustand for state management:

- `DatalayerState`: Main application state
- `datalayerConfig`: Configuration including tokens and URLs
- `serviceManager`: Active service connections

### API Integration

The examples use the Datalayer Runtime API:

- Endpoint: `/api/runtimes/v1/runtimes`
- Authentication: Bearer token in Authorization header
- Creates compute runtimes with specified resources
- Returns ingress URLs for kernel connections

## Troubleshooting

### CORS Issues

The Vite dev server includes a proxy configuration to handle CORS:

```javascript
proxy: {
  '/api': {
    target: 'https://prod1.datalayer.run',
    changeOrigin: true,
    secure: true,
  },
}
```

### Missing Token

If you see "Datalayer configuration is missing" warning:

1. Check your `.env` file has `VITE_DATALAYER_API_KEY` set
2. Restart the dev server after adding the token
3. Verify the token is valid at [Datalayer Platform](https://datalayer.ai/)

### Server Errors

If you get 500 errors from the API:

- Check the Datalayer platform status
- Verify your token has sufficient permissions
- Ensure you have available credits
- Try a different environment (e.g., `ai-agents-env`)

## Development

### Adding a New Example

1. Create a new component in `src/examples/`
2. Import and register it in `main.tsx`
3. Add to the example selector in `vite.examples.config.ts`
4. Update this README with documentation

### Testing

Run the test suite:

```bash
npm run test
```

Type checking:

```bash
npm run type-check
```

Linting:

```bash
npm run lint
```

## Resources

- [Datalayer Documentation](https://datalayer.ai/docs/)
- [Jupyter React Components](https://jupyter-react.datalayer.tech/)
- [TypeScript API Reference](https://core.datalayer.tech/typescript/)
- [Platform API Reference](https://prod1.datalayer.run/api/runtimes/v1/ui/)
