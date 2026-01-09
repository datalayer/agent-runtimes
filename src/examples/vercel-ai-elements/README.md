# Vercel AI Elements Showcase

This showcase demonstrates all available Vercel AI Elements components in a static, visual format.

## Quick Start

### Step 1: Install Vercel AI Elements Components

Before running the showcase, install the AI Elements components using one of these methods:

**Option A: Install all components at once (recommended)**

```bash
npx ai-elements@latest
```

**Option B: Install specific components**

```bash
npx ai-elements@latest add message
npx ai-elements@latest add conversation
npx ai-elements@latest add code-block
npx ai-elements@latest add suggestion
npx ai-elements@latest add loader
npx ai-elements@latest add shimmer
npx ai-elements@latest add artifact
npx ai-elements@latest add sources
npx ai-elements@latest add reasoning
npx ai-elements@latest add tool
npx ai-elements@latest add prompt-input
npx ai-elements@latest add model-selector
```

**Option C: Using shadcn CLI**

```bash
npx shadcn@latest add https://registry.ai-sdk.dev/all.json
```

### Step 2: Run the Showcase

After installing the components, start the showcase server:

```bash
npm run showcase:vercel-ai
```

This will open the showcase at `http://localhost:3100`

## What You'll See

The showcase displays all Vercel AI Elements components with interactive examples:

### Core Chat Components

- **Message** - Chat messages with actions, branches, and attachments
- **Conversation** - Scrollable conversation container
- **Prompt Input** - Advanced input with file attachments and actions

### UI Components

- **Model Selector** - AI model selection dropdown with search
- **Artifact** - Display code or documents with actions
- **Code Block** - Syntax-highlighted code with copy functionality
- **Suggestions** - Interactive suggestion chips
- **Sources** - Expandable source citations

### AI-Specific Components

- **Reasoning** - Collapsible AI reasoning/chain-of-thought display
- **Tool** - Tool call visualization with input/output
- **Loader** - Loading states in various sizes
- **Shimmer** - Animated shimmer effect for emphasis

## Prerequisites

Before using this showcase, ensure your project has:

- ✅ Node.js 18 or later
- ✅ shadcn/ui initialized (`npx shadcn@latest init`)
- ✅ Tailwind CSS configured
- ✅ React 19+ installed

## Troubleshooting

### Components Not Found

If you see import errors, make sure you've installed the components:

```bash
npx ai-elements@latest
```

### Styling Issues

Ensure your `tailwind.config.js` includes the components directory:

```js
content: [
  "./src/**/*.{js,ts,jsx,tsx}",
  "./components/**/*.{js,ts,jsx,tsx}",
],
```

### Port Already in Use

If port 3100 is in use, modify `vite.showcase.config.ts`:

```ts
server: {
  port: 3200, // Change to your preferred port
}
```

## Structure

```
vercel-ai/
├── README.md                     # This file
├── VercelAiShowcase.tsx         # Main showcase component
├── main.tsx                      # Entry point
├── index.html                    # HTML template
└── components/                   # Individual component showcases
    ├── MessageShowcase.tsx
    ├── ConversationShowcase.tsx
    ├── PromptInputShowcase.tsx
    ├── ModelSelectorShowcase.tsx
    ├── ArtifactShowcase.tsx
    ├── CodeBlockShowcase.tsx
    ├── SuggestionShowcase.tsx
    ├── SourcesShowcase.tsx
    ├── ReasoningShowcase.tsx
    ├── ToolShowcase.tsx
    ├── LoaderShowcase.tsx
    └── ShimmerShowcase.tsx
```

## References

- [AI Elements Documentation](https://ai-sdk.dev/elements)
- [GitHub Repository](https://github.com/vercel/ai-elements)
- [shadcn/ui](https://ui.shadcn.com/)
