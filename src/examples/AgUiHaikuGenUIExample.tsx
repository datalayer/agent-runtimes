/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgUiHaikuGenUIExample
 *
 * Demonstrates tool-based generative UI where the agent generates haiku
 * poetry that is rendered:
 * 1. INLINE in the chat conversation
 * 2. In a main display area (carousel) for a richer experience
 *
 * This follows the AG-UI Dojo pattern where tool results are rendered
 * as UI components in both locations.
 *
 * Backend: /api/v1/examples/haiku_generative_ui/
 */

import React, {
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { ChatFloating, type ToolCallRenderContext } from '../components/chat';
import { InlineHaikuCard, HaikuDisplay, type HaikuResult } from './ag-ui/haiku';

// AG-UI endpoint for haiku generative UI example
const HAIKU_ENDPOINT =
  'http://localhost:8765/api/v1/examples/haiku_generative_ui/';

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
 * AgUiHaikuGenUIExample Component
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
const AgUiHaikuGenUIExample: React.FC = () => {
  // Ref to the main display for adding haikus
  const displayRef = useRef<HaikuDisplayHandle>(null);

  // Track processed tool call IDs to avoid duplicates
  const processedToolCallIds = useRef<Set<string>>(new Set());

  /**
   * Render function for tool results - renders haiku cards inline in chat
   * and also updates the main display
   */
  const renderHaikuToolResult = useCallback(
    (context: ToolCallRenderContext) => {
      // Only render for the generate_haiku tool
      if (context.toolName !== 'generate_haiku') {
        return null;
      }

      // Extract haiku data from args (the tool's parameters are what we render)
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
        <InlineHaikuCard
          haiku={haiku}
          status={context.status}
          error={context.error}
        />
      );
    },
    [],
  );

  return (
    <DatalayerThemeProvider>
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
              backgroundColor: 'canvas.subtle',
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
              backgroundColor: 'canvas.subtle',
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

        {/* Floating chat with haiku tool rendering */}
        <ChatFloating
          endpoint={HAIKU_ENDPOINT}
          title="Haiku Generator"
          description="Ask me to write haiku poetry about any topic!"
          position="bottom-right"
          brandColor="#667eea"
          defaultOpen={true}
          renderToolResult={renderHaikuToolResult}
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
    </DatalayerThemeProvider>
  );
};

export default AgUiHaikuGenUIExample;
