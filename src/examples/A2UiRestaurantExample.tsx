/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UiRestaurantExample
 *
 * Demonstrates A2UI (Agent-to-UI) protocol integration with a pydantic-ai
 * restaurant finder agent using the official @a2ui/react renderer.
 *
 * The agent generates A2UI JSON messages that are rendered into
 * interactive React components via A2UIProvider + A2UIRenderer.
 *
 * Features:
 * - A2UI protocol message processing via @a2ui/react
 * - Dynamic UI generation from agent responses
 * - Restaurant search and booking interface
 * - Action handling for interactive components (buttons, forms)
 * - Dark/light theme support
 *
 * Backend: /api/v1/a2ui/restaurant/
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, getCardGradient } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { useExampleThemeStore } from './utils/themeStore';
import { Text, Spinner, TextInput, Button } from '@primer/react';
import type { Types } from '@a2ui/react';
import {
  A2UIProvider,
  A2UIRenderer,
  useA2UIActions,
  initializeDefaultCatalog,
} from '@a2ui/react';

// Initialize the A2UI default component catalog (buttons, cards, text, etc.)
// This must be called once before any A2UI rendering occurs.
initializeDefaultCatalog();

// A2UI endpoint for pydantic-ai restaurant agent
const A2UI_RESTAURANT_ENDPOINT =
  'http://localhost:8765/api/v1/a2ui/restaurant/';

const LOADING_TEXT_LINES = [
  'Finding the best spots for you...',
  'Checking reviews...',
  'Looking for open tables...',
  'Almost there...',
];

/**
 * Type for A2A server response parts.
 * Note: Python SDK wraps parts in a `root` property, JS SDK does not.
 */
interface A2AServerPayloadPart {
  kind?: 'text' | 'data';
  text?: string;
  data?: Types.ServerToClientMessage;
  root?: {
    kind: 'text' | 'data';
    text?: string;
    data?: Types.ServerToClientMessage;
  };
}

type A2AServerPayload = A2AServerPayloadPart[] | { error: string };

/**
 * Extract ServerToClientMessage[] from A2A server payload,
 * handling both Python SDK (root wrapper) and JS SDK (direct) formats.
 */
function extractMessages(
  data: A2AServerPayloadPart[],
): Types.ServerToClientMessage[] {
  const messages: Types.ServerToClientMessage[] = [];
  for (const item of data) {
    const part = item.root || item;
    if (part.kind === 'text') continue;
    if (part.data) {
      messages.push(part.data);
    }
  }
  return messages;
}

/**
 * Custom hook for A2UI restaurant client communication.
 * Uses useA2UIActions() from @a2ui/react for message processing.
 */
function useA2UIRestaurantClient() {
  const { processMessages, clearSurfaces, getSurfaces } = useA2UIActions();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const makeRequest = useCallback(
    async (message: string) => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(A2UI_RESTAURANT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: message }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Request failed');
        }

        const data = (await response.json()) as A2AServerPayload;
        if ('error' in data) throw new Error(data.error);

        const messages = extractMessages(data);
        clearSurfaces();
        processMessages(messages);
        return messages;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        console.error('A2UI request error:', err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [processMessages, clearSurfaces],
  );

  return {
    getSurfaces,
    isLoading,
    error,
    makeRequest,
  };
}

/**
 * Restaurant search interface component
 */
function RestaurantSearch({
  onSearch,
  isLoading,
  defaultValue = 'Top 5 Chinese restaurants in New York',
}: {
  onSearch: (query: string) => void;
  isLoading: boolean;
  defaultValue?: string;
}) {
  const [inputValue, setInputValue] = useState(defaultValue);
  const { theme, colorMode } = useExampleThemeStore();
  const gradient = getCardGradient(theme, colorMode);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (inputValue.trim() && !isLoading) {
        onSearch(inputValue.trim());
      }
    },
    [inputValue, isLoading, onSearch],
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: 4,
        maxWidth: '600px',
        margin: '0 auto',
      }}
    >
      <Box
        sx={{
          width: '100%',
          height: '200px',
          borderRadius: '12px',
          background: `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 2,
        }}
      >
        <Text sx={{ fontSize: '4rem' }}>🍽️</Text>
      </Box>

      <Text
        as="h1"
        sx={{
          fontSize: '2rem',
          fontWeight: 'bold',
          textAlign: 'center',
          marginBottom: 2,
        }}
      >
        Restaurant Finder
      </Text>

      <Text sx={{ color: 'fg.muted', textAlign: 'center', marginBottom: 3 }}>
        Powered by A2UI protocol and pydantic-ai
      </Text>

      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextInput
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Search for restaurants..."
            disabled={isLoading}
            sx={{ flex: 1 }}
            block
          />
          <Button type="submit" disabled={isLoading || !inputValue.trim()}>
            {isLoading ? <Spinner size="small" /> : 'Search'}
          </Button>
        </Box>
      </form>
    </Box>
  );
}

/**
 * Loading state component with animated text
 */
function LoadingState() {
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);
  const loadingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    loadingIntervalRef.current = window.setInterval(() => {
      setLoadingTextIndex(prev => (prev + 1) % LOADING_TEXT_LINES.length);
    }, 2000);
    return () => {
      if (loadingIntervalRef.current) {
        clearInterval(loadingIntervalRef.current);
      }
    };
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '300px',
        gap: 3,
      }}
    >
      <Spinner size="large" />
      <Text sx={{ color: 'fg.muted', fontSize: '1.1rem' }}>
        {LOADING_TEXT_LINES[loadingTextIndex]}
      </Text>
    </Box>
  );
}

/**
 * Results display component with A2UI renderer
 */
function ResultsDisplay({
  surfaceEntries,
  onBack,
}: {
  surfaceEntries: [string, unknown][];
  onBack: () => void;
}) {
  return (
    <Box sx={{ padding: 3 }}>
      <Box
        sx={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 3 }}
      >
        <Button variant="invisible" onClick={onBack}>
          ← New Search
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {surfaceEntries.map(([surfaceId]) => (
          <A2UIRenderer key={surfaceId} surfaceId={surfaceId} />
        ))}
      </Box>
    </Box>
  );
}

/**
 * Error display component
 */
function ErrorDisplay({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
        gap: 3,
      }}
    >
      <Text sx={{ color: 'danger.fg', fontSize: '1.2rem' }}>⚠️ {error}</Text>
      <Button onClick={onRetry}>Try Again</Button>
    </Box>
  );
}

/**
 * Main A2UI Restaurant content component.
 * Must be rendered inside A2UIProvider to access hooks.
 */
function A2UIRestaurantContent() {
  const { getSurfaces, isLoading, error, makeRequest } =
    useA2UIRestaurantClient();
  const [hasData, setHasData] = useState(false);
  const [lastQuery, setLastQuery] = useState('');

  const handleSearch = useCallback(
    async (query: string) => {
      setLastQuery(query);
      try {
        await makeRequest(query);
        setHasData(true);
      } catch {
        // Error is already set in the hook
      }
    },
    [makeRequest],
  );

  const handleBack = useCallback(() => {
    setHasData(false);
  }, []);

  const handleRetry = useCallback(() => {
    if (lastQuery) {
      handleSearch(lastQuery);
    }
  }, [lastQuery, handleSearch]);

  if (error && !isLoading) {
    return <ErrorDisplay error={error} onRetry={handleRetry} />;
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (!hasData) {
    return <RestaurantSearch onSearch={handleSearch} isLoading={isLoading} />;
  }

  const surfaces = getSurfaces();
  const surfaceEntries = Array.from(surfaces.entries());

  return <ResultsDisplay surfaceEntries={surfaceEntries} onBack={handleBack} />;
}

/**
 * A2UiRestaurantExample - Main example component
 *
 * Demonstrates A2UI protocol integration with pydantic-ai.
 * The agent generates A2UI JSON messages for restaurant search,
 * display, and booking functionality.
 *
 * Uses @a2ui/react's two-context architecture:
 * - A2UIProvider wraps the app, receives an onAction callback
 * - useA2UIActions() provides processMessages/clearSurfaces/getSurfaces
 * - A2UIRenderer renders surfaces by ID
 */
const A2UiRestaurantExample: React.FC = () => {
  // Handle A2UI actions (button clicks, form submissions, etc.)
  const handleAction = useCallback(
    (actionMessage: Types.A2UIClientEventMessage) => {
      console.log('A2UI Action:', actionMessage);
      // Send action back to the agent for processing
      fetch(A2UI_RESTAURANT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actionMessage),
      }).catch(err => console.error('Action send error:', err));
    },
    [],
  );

  return (
    <ThemedProvider>
      <A2UIProvider onAction={handleAction}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            backgroundColor: 'canvas.default',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              padding: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
              backgroundColor: 'canvas.subtle',
            }}
          >
            <Text
              as="h1"
              sx={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              🤖 A2UI Restaurant Example
            </Text>
            <Text sx={{ fontSize: '0.875rem', color: 'fg.muted' }}>
              pydantic-ai agent with A2UI protocol rendering (@a2ui/react)
            </Text>
          </Box>

          {/* Main Content */}
          <Box sx={{ flex: 1, padding: 3 }}>
            <A2UIRestaurantContent />
          </Box>

          {/* Footer */}
          <Box
            sx={{
              padding: 2,
              borderTop: '1px solid',
              borderColor: 'border.default',
              backgroundColor: 'canvas.subtle',
              textAlign: 'center',
            }}
          >
            <Text sx={{ fontSize: '0.75rem', color: 'fg.muted' }}>
              Backend: {A2UI_RESTAURANT_ENDPOINT}
            </Text>
          </Box>
        </Box>
      </A2UIProvider>
    </ThemedProvider>
  );
};

export default A2UiRestaurantExample;
