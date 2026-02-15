/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UiRestaurantExample
 *
 * Demonstrates A2UI (Agent-to-UI) protocol integration with a pydantic-ai
 * restaurant finder agent. The agent generates A2UI JSON messages that are
 * rendered into React components.
 *
 * Features:
 * - A2UI protocol message processing
 * - Dynamic UI generation from agent responses
 * - Restaurant search and booking interface
 * - Dark/light theme support
 *
 * Backend: /api/v1/a2ui/restaurant/
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { Text, Spinner, TextInput, Button } from '@primer/react';
import { A2UIProvider, A2UIRenderer, useA2UI, Types } from '../renderers/a2ui';

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
 * Type for A2A server response parts
 * Note: Python SDK wraps parts in a `root` property, JS SDK does not
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
 * Custom hook for A2UI restaurant client communication.
 */
function useA2UIRestaurantClient() {
  const { surfaces, processMessages, clearSurfaces, sendAction } = useA2UI();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Send a message to the A2UI backend and process the response.
   */
  const makeRequest = useCallback(
    async (message: string) => {
      let messages: Types.ServerToClientMessage[];

      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(A2UI_RESTAURANT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: message }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Request failed');
        }

        const data = (await response.json()) as A2AServerPayload;

        if ('error' in data) {
          throw new Error(data.error);
        }

        messages = [];
        for (const item of data) {
          // Handle both Python SDK (with root wrapper) and JS SDK (direct) formats
          const part = item.root || item;
          if (part.kind === 'text') continue;
          if (part.data) {
            messages.push(part.data);
          }
        }

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

  /**
   * Handle A2UI actions (button clicks, form submissions, etc.)
   */
  const handleAction = useCallback(
    async (action: { actionId: string; context: Record<string, unknown> }) => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(A2UI_RESTAURANT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: action.actionId,
            context: action.context,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Action failed');
        }

        const data = (await response.json()) as A2AServerPayload;

        if ('error' in data) {
          throw new Error(data.error);
        }

        const messages: Types.ServerToClientMessage[] = [];
        for (const item of data) {
          const part = item.root || item;
          if (part.kind === 'text') continue;
          if (part.data) {
            messages.push(part.data);
          }
        }

        clearSurfaces();
        processMessages(messages);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        console.error('A2UI action error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [processMessages, clearSurfaces],
  );

  return {
    surfaces,
    isLoading,
    error,
    makeRequest,
    handleAction,
    sendAction,
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
          background: 'linear-gradient(135deg, #117A65 0%, #1ABC9C 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 2,
        }}
      >
        <Text
          sx={{
            fontSize: '4rem',
          }}
        >
          🍽️
        </Text>
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

      <Text
        sx={{
          color: 'fg.muted',
          textAlign: 'center',
          marginBottom: 3,
        }}
      >
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
  surfaces,
  onBack,
}: {
  surfaces: ReadonlyMap<string, Types.Surface>;
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
        {Array.from(surfaces.entries()).map(([surfaceId]) => (
          <A2UIRenderer
            key={surfaceId}
            surfaceId={surfaceId}
            className="a2ui-surface"
          />
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
 * Main A2UI Restaurant content component
 * (needs to be inside A2UIProvider to use hooks)
 */
function A2UIRestaurantContent() {
  const { surfaces, isLoading, error, makeRequest } = useA2UIRestaurantClient();
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

  // Show error state
  if (error && !isLoading) {
    return <ErrorDisplay error={error} onRetry={handleRetry} />;
  }

  // Show loading state
  if (isLoading) {
    return <LoadingState />;
  }

  // Show search or results
  if (!hasData) {
    return <RestaurantSearch onSearch={handleSearch} isLoading={isLoading} />;
  }

  return <ResultsDisplay surfaces={surfaces} onBack={handleBack} />;
}

/**
 * A2UiRestaurantExample - Main example component
 *
 * Demonstrates A2UI protocol integration with pydantic-ai.
 * The agent generates A2UI JSON messages for restaurant search,
 * display, and booking functionality.
 */
const A2UiRestaurantExample: React.FC = () => {
  // Handle A2UI actions globally
  const handleAction = useCallback(
    (action: {
      type: string;
      actionId: string;
      context: Record<string, unknown>;
    }) => {
      console.log('A2UI Action:', action);
      // Actions are handled in the content component
    },
    [],
  );

  return (
    <DatalayerThemeProvider>
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
              pydantic-ai agent with A2UI protocol rendering
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
    </DatalayerThemeProvider>
  );
};

export default A2UiRestaurantExample;
