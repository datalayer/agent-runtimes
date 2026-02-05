# Protocol Switching Implementation Summary

## Overview
Successfully implemented protocol switching functionality for the Agent Runtimes example, allowing users to select between ACP, AG-UI, and Vercel AI protocols with appropriate UI components and hooks.

## New Files Created

### Hooks
1. **`src/hooks/useVercelChat.tsx`**
   - Wraps Vercel AI SDK's `useChat` for agent-runtimes Vercel AI endpoint
   - Endpoint: `/api/v1/vercel-ai/chat`
   - Features: SSE streaming, automatic message management, callbacks
   - Exports: `useVercelChat` hook and `Message` type

2. **`src/hooks/useAGUI.tsx`**
   - Provides interface to AG-UI protocol endpoint
   - Endpoint: `/api/v1/ag-ui/{agent_id}/`
   - Implementation: Iframe-based integration with Pydantic AI's AGUIApp
   - Exports: `useAGUI` hook and `Message` type

### Components
1. **`src/components/chat/VercelChatComponent.tsx`**
   - Chat UI component using Vercel AI SDK protocol
   - Features: Message display, input handling, streaming indicators
   - Props: baseUrl, agentId, callbacks, customization options

2. **`src/components/chat/AGUIChatComponent.tsx`**
   - Iframe-based AG-UI protocol component
   - Embeds full native Pydantic AI UI
   - Props: baseUrl, agentId, autoConnect, customization options

## Modified Files

### Hooks Index
- **`src/hooks/index.ts`**: Added exports for `useAGUI` and `useVercelChat`

### Components Index
- **`src/components/chat/index.ts`**: Added exports for `AGUIChatComponent` and `VercelChatComponent`

### Example Component
- **`src/examples/AgentRuntimExample.tsx`**:
  - Added Vercel AI to protocol options
  - Added `baseUrl` state for HTTP-based protocols
  - Updated URL input to switch between WebSocket URL (ACP) and Base URL (AG-UI/Vercel AI)
  - Implemented conditional rendering based on protocol selection:
    - `acp`: renders `ACPChatComponent`
    - `ag-ui`: renders `AGUIChatComponent`
    - `vercel-ai`: renders `VercelChatComponent`
    - `a2a`: shows placeholder message
  - Updated endpoint display to show correct URLs for each protocol

## Protocol Details

### ACP (Agent Client Protocol)
- **Transport**: WebSocket
- **URL**: `ws://localhost:8000/api/v1/acp/ws`
- **Component**: `ACPChatComponent`
- **Hook**: `useAcp` (existing)

### AG-UI
- **Transport**: HTTP/ASGI (iframe)
- **URL**: `http://localhost:8000/api/v1/ag-ui/{agent_id}/`
- **Component**: `AGUIChatComponent`
- **Hook**: `useAGUI`
- **Implementation**: Full Pydantic AI native UI via iframe

### Vercel AI SDK
- **Transport**: HTTP/SSE
- **URL**: `http://localhost:8000/api/v1/vercel-ai/chat`
- **Component**: `VercelChatComponent`
- **Hook**: `useVercelChat`
- **Implementation**: Streaming responses using Vercel AI SDK

### A2A (Agent-to-Agent)
- **Status**: Placeholder (UI coming soon)
- **Backend**: Implemented but no frontend component yet

## Key Features

### Protocol Selection
- Dropdown allows runtime switching between protocols
- Form validation ensures correct configuration per protocol
- Dynamic endpoint URL display based on protocol selection

### Hook Architecture
- **`useVercelChat`**:
  - Uses `@ai-sdk/react` and `ai` packages
  - Wraps `useChat` with custom transport configuration
  - Sends messages via SSE streaming
  - Status: `submitting`, `streaming`, `ready`, `error`

- **`useAGUI`**:
  - Simple iframe URL generator
  - Connection state tracking
  - Placeholder for future fetch-based implementation

### Component Features
- **Consistent UI**: All components use Primer React design system
- **Message Display**: Role-based styling (user vs assistant)
- **Loading States**: Spinners and status indicators during processing
- **Auto-scroll**: Messages automatically scroll to bottom
- **Clear Chat**: Ability to reset conversation history

## Usage

```tsx
// Select protocol in UI dropdown
// Configure URL:
// - ACP: ws://localhost:8000/api/v1/acp/ws
// - AG-UI: http://localhost:8000
// - Vercel AI: http://localhost:8000

// Click "Connect to Agent"
// Start chatting!
```

## Technical Notes

### Vercel AI SDK Integration
- Uses `DefaultChatTransport` with custom API endpoint
- Message structure: `{ role, parts: [{ type: 'text', text }] }`
- Status values different from expected: uses `submitted`, `ready` instead of `loading`

### AG-UI Integration
- Iframe-based for simplicity and full native UI support
- Future enhancement: fetch-based API for custom UI
- Pydantic AI's AGUIApp handles all protocol details

### Message Type Mapping
- SDK types (`UIMessage`) mapped to simplified `Message` interface
- Content extraction handles both string and parts-based formats
- Type-safe with proper TypeScript generics

## Testing Status
- ✅ Hooks created and exported
- ✅ Components created and exported
- ✅ Example component updated with protocol switching
- ✅ No TypeScript errors
- ⏳ Runtime testing pending (requires running server)

## Next Steps
1. Test with running server
2. Verify all protocols work end-to-end
3. Add error handling and retry logic
4. Implement A2A UI component
5. Add protocol-specific configuration options
6. Consider adding protocol auto-detection
