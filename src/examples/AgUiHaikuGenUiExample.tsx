/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgUiHaikuGenUiExample
 *
 * Demonstrates tool-based generative UI where the agent generates haiku
 * poetry that is rendered:
 * 1. INLINE in the chat conversation
 * 2. In a main display area (carousel) for a richer experience
 *
 * This follows the AG-UI Dojo pattern where tool results are rendered
 * as UI components in both locations.
 *
 * Backend: managed AG-UI agent runtime (agentspec: example-haiku-generative-ui)
 */
import React, {
  useState,
  useMemo,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider, useThemeBrandColor } from './utils/themedProvider';
import { ChatFloating } from '../chat';
import {
  InlineHaikuCard,
  HaikuDisplay,
  type HaikuResult,
} from './components/haiku';
import { uniqueAgentId } from './utils/agentId';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';
import {
  useSpecRenderToolResult,
  specRendererClassName,
  type SpecRenderer,
} from './hooks/useSpecRenderToolResult';

/**
 * Ref handle for haiku state synchronization between chat and main display
 */
export interface HaikuDisplayHandle {
  /** Add a new haiku to the display */
  addHaiku: (haiku: HaikuResult) => void;
  /** Get current haikus */
  getHaikus: () => HaikuResult[];
  /** Clear all haikus */
  clearHaikus: () => void;
}

/**
 * Props for the HaikuDisplayWithRef component
 */
interface HaikuDisplayWithRefProps {
  title?: string;
}

/**
 * HaikuDisplayWithRef - A display component that exposes a ref for external control.
 *
 * This allows the chat's tool rendering to update the main display
 * when new haikus are generated.
 */
const HaikuDisplayWithRef = forwardRef<
  HaikuDisplayHandle,
  HaikuDisplayWithRefProps
>(({ title }, ref) => {
  const [haikus, setHaikus] = useState<HaikuResult[]>([]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    addHaiku: (haiku: HaikuResult) => {
      setHaikus(prev => [haiku, ...prev]); // Newest first
    },
    getHaikus: () => haikus,
    clearHaikus: () => setHaikus([]),
  }));

  return <HaikuDisplay haikus={haikus} title={title} />;
});

HaikuDisplayWithRef.displayName = 'HaikuDisplayWithRef';

/**
 * AgUiHaikuGenUiExample Component
 *
 * Demonstrates tool-based generative UI with haiku generation.
 * The agent has a `generate_haiku` tool that returns structured
 * haiku data. This data is rendered:
 * - INLINE in the chat as a haiku card
 * - In the main view as part of a carousel
 *
 * Features demonstrated:
 * - Tool-based generative UI
 * - Ref-based state synchronization between chat and main view
 * - Carousel display for multiple haikus
 * - Dynamic gradient backgrounds
 * - Japanese/English text rendering
 */
const AGENT_NAME = 'ag-ui-haiku';
const AGENTSPEC_ID = 'example-haiku-generative-ui';

const AgUiHaikuGenUiExample: React.FC = () => {
  const brandColor = useThemeBrandColor();
  const agentName = useMemo(() => uniqueAgentId(AGENT_NAME), []);
  const { agentId, baseUrl } = useExampleAgentRuntime({
    exampleId: 'AgUiHaikuGenUiExample',
    agentName,
    specId: AGENTSPEC_ID,
    agentConfig: {
      protocol: 'ag-ui',
      agentSpecId: AGENTSPEC_ID,
    },
  });
  const haikuGenUiEndpoint =
    agentId != null ? `${baseUrl}/api/v1/ag-ui/${agentId}/` : undefined;
  // Ref to the main display for adding haikus
  const displayRef = useRef<HaikuDisplayHandle>(null);

  // Track processed tool call IDs to avoid duplicates
  const processedToolCallIds = useRef<Set<string>>(new Set());

  /**
   * Renderers keyed by the spec's renderer id. The tool name to match and the
   * CSS file to load come from the agent spec, not from this file.
   */
  const haikuRenderers = useMemo<Record<string, SpecRenderer>>(
    () => ({
      'haiku-card': (context, binding) => {
        // Extract haiku data from args (the tool parameters are what we render)
        const args = context.args as {
          japanese?: string[];
          english?: string[];
          gradient?: string;
        };

        // Build haiku result from args
        const haiku: HaikuResult | undefined =
          args.japanese && args.english
            ? {
                japanese: args.japanese,
                english: args.english,
                gradient:
                  args.gradient ||
                  'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              }
            : undefined;

        // When tool completes successfully, add to main display (deduplicated)
        if (
          context.status === 'complete' &&
          haiku &&
          displayRef.current &&
          context.toolCallId &&
          !processedToolCallIds.current.has(context.toolCallId)
        ) {
          processedToolCallIds.current.add(context.toolCallId);
          displayRef.current.addHaiku(haiku);
        }

        return (
          <div className={specRendererClassName(binding)}>
            <InlineHaikuCard
              haiku={haiku}
              status={context.status}
              error={context.error}
            />
          </div>
        );
      },
    }),
    [],
  );

  // Tool name to match and CSS file to load are read from the agent spec.
  const renderToolResult = useSpecRenderToolResult(
    AGENTSPEC_ID,
    haikuRenderers,
  );

  return (
    <ThemedProvider>
      <Box
        sx={{
          minHeight: '100vh',
          backgroundColor: 'canvas.default',
          padding: 4,
        }}
      >
        {/* Page content */}
        <Box
          sx={{
            maxWidth: '800px',
            margin: '0 auto',
          }}
        >
          <Text
            as="h1"
            sx={{
              fontSize: 4,
              fontWeight: 'bold',
              marginBottom: 2,
            }}
          >
            AG-UI: Haiku Generative UI
          </Text>
          <Text
            as="p"
            sx={{
              fontSize: 2,
              color: 'fg.muted',
              marginBottom: 4,
            }}
          >
            Ask the assistant to generate haiku poetry. Haikus appear both in
            the chat and in the display area below!
          </Text>

          {/* Main haiku display area */}
          <Box
            sx={{
              padding: 5,
              backgroundColor: 'canvas.default',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
              marginBottom: 4,
            }}
          >
            <HaikuDisplayWithRef
              ref={displayRef}
              title="Your Haiku Collection"
            />
          </Box>

          {/* About section */}
          <Box
            sx={{
              padding: 4,
              backgroundColor: 'canvas.default',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Text
              as="h2"
              sx={{ fontSize: 2, fontWeight: 'semibold', marginBottom: 2 }}
            >
              About This Example
            </Text>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted' }}>
              This demonstrates <strong>tool-based generative UI</strong> with
              AG-UI. When the agent generates a haiku using the{' '}
              <code>generate_haiku</code> tool, it&apos;s rendered as a
              beautiful card both in the chat and in the main display area
              above.
            </Text>
            <Box sx={{ marginTop: 3 }}>
              <Text sx={{ fontSize: 1, fontWeight: 'medium' }}>Features:</Text>
              <Box
                as="ul"
                sx={{
                  paddingLeft: 3,
                  marginTop: 1,
                  fontSize: 1,
                  color: 'fg.muted',
                }}
              >
                <li>🎨 Beautiful gradient backgrounds matching mood</li>
                <li>🇯🇵 Japanese text with English translation</li>
                <li>📚 Carousel to browse your haiku collection</li>
                <li>🔄 Real-time rendering as the tool executes</li>
                <li>✨ Synchronized display between chat and main view</li>
              </Box>
            </Box>
            <Box sx={{ marginTop: 3 }}>
              <Text sx={{ fontSize: 1, fontWeight: 'medium' }}>
                Try these prompts:
              </Text>
              <Box
                as="ul"
                sx={{
                  paddingLeft: 3,
                  marginTop: 1,
                  fontSize: 1,
                  color: 'fg.muted',
                }}
              >
                <li>&quot;Write me a haiku about cherry blossoms&quot;</li>
                <li>&quot;Create a haiku about coding late at night&quot;</li>
                <li>&quot;Generate a haiku about the ocean&quot;</li>
                <li>&quot;Write a haiku about autumn leaves&quot;</li>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Floating chat with haiku tool rendering. Rendered immediately with a
            launching state so the chat appears instantly while the managed
            agent runtime is still starting. */}
        <ChatFloating
          kernelIndicatorPlacement="right"
          protocol="ag-ui"
          endpoint={haikuGenUiEndpoint}
          launching={!haikuGenUiEndpoint}
          launchingMessage="Starting the haiku agent runtime…"
          title="Haiku Generator"
          description="Ask me to write haiku poetry about any topic!"
          position="bottom-right"
          brandColor={brandColor}
          defaultOpen={true}
          renderToolResult={renderToolResult}
          hideMessagesAfterToolUI={true}
          suggestions={[
            {
              title: 'Cherry blossoms',
              message: 'Write me a haiku about cherry blossoms in spring.',
            },
            {
              title: 'Night coding',
              message: 'Create a haiku about coding late at night.',
            },
            {
              title: 'Mountain path',
              message: 'Generate a haiku about hiking a mountain trail.',
            },
          ]}
        />
      </Box>
    </ThemedProvider>
  );
};

export default AgUiHaikuGenUiExample;
