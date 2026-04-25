/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, getCardGradient } from '@datalayer/primer-addons';
import { Text, Spinner, TextInput, Button } from '@primer/react';
import { A2uiSurface } from '@a2ui/react/v0_9';
import type { A2uiClientAction, A2uiMessage } from '@a2ui/web_core/v0_9';
import { ThemedProvider } from './utils/themedProvider';
import { A2uiMarkdownProvider } from './utils/a2uiMarkdownProvider';
import { useExampleThemeStore } from './utils/themeStore';
import { useA2uiProcessor } from './utils/a2ui';

const A2UI_RESTAURANT_ENDPOINT =
  'http://localhost:8765/api/v1/a2ui/restaurant/';

const LOADING_TEXT_LINES = [
  'Finding the best spots for you...',
  'Checking reviews...',
  'Looking for open tables...',
  'Almost there...',
];

type A2AServerPayloadPart = {
  kind?: 'text' | 'data';
  text?: string;
  data?: Record<string, unknown>;
  root?: {
    kind: 'text' | 'data';
    text?: string;
    data?: Record<string, unknown>;
  };
};

type A2AServerPayload = A2AServerPayloadPart[] | { error: string };

const extractV09Messages = (data: A2AServerPayloadPart[]): A2uiMessage[] => {
  const messages: A2uiMessage[] = [];

  data.forEach(item => {
    const part = item.root ?? item;
    if (part.kind !== 'data' || !part.data) {
      return;
    }

    const message = part.data as Record<string, unknown>;
    if (message.version === 'v0.9') {
      messages.push(message as unknown as A2uiMessage);
    }
  });

  return messages;
};

function RestaurantSearch({
  onSearch,
  isLoading,
}: {
  onSearch: (query: string) => void;
  isLoading: boolean;
}) {
  const [inputValue, setInputValue] = useState(
    'Top 5 Chinese restaurants in New York',
  );
  const { theme, colorMode } = useExampleThemeStore();
  const gradient = getCardGradient(theme, colorMode);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!inputValue.trim() || isLoading) {
        return;
      }
      onSearch(inputValue.trim());
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
        p: 4,
        maxWidth: 640,
        mx: 'auto',
      }}
    >
      <Box
        sx={{
          width: '100%',
          height: 200,
          borderRadius: 2,
          background: `linear-gradient(135deg, ${gradient.from} 0%, ${gradient.to} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text sx={{ fontSize: '4rem' }}>🍽️</Text>
      </Box>

      <Text
        as="h1"
        sx={{ fontSize: '2rem', fontWeight: 'bold', textAlign: 'center' }}
      >
        Restaurant Finder
      </Text>
      <Text sx={{ color: 'fg.muted', textAlign: 'center' }}>
        A2UI renderer connected to a live agent backend.
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

const A2UiRestaurantExample: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);

  const sendPayloadRef = useRef<
    | ((payload: {
        query?: string;
        action?: string;
        context?: Record<string, unknown>;
      }) => Promise<void>)
    | null
  >(null);

  const handleAction = useCallback(async (action: A2uiClientAction) => {
    if (!sendPayloadRef.current) {
      return;
    }
    await sendPayloadRef.current({
      action: action.name,
      context: action.context,
    });
  }, []);

  const { surfaces, processMessages, resetSurfaces } =
    useA2uiProcessor(handleAction);

  useEffect(() => {
    if (!isLoading) {
      return;
    }
    const interval = window.setInterval(() => {
      setLoadingTextIndex(prev => (prev + 1) % LOADING_TEXT_LINES.length);
    }, 1800);
    return () => {
      clearInterval(interval);
    };
  }, [isLoading]);

  const sendPayload = useCallback(
    async (payload: {
      query?: string;
      action?: string;
      context?: Record<string, unknown>;
    }) => {
      try {
        setIsLoading(true);
        setError(null);
        setLoadingTextIndex(0);

        const response = await fetch(A2UI_RESTAURANT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = (await response.json()) as { detail?: string };
          throw new Error(errorData.detail || 'Request failed');
        }

        const data = (await response.json()) as A2AServerPayload;
        if (!Array.isArray(data)) {
          throw new Error(data.error || 'Invalid server payload');
        }

        const v09Messages = extractV09Messages(data);
        if (v09Messages.length === 0) {
          throw new Error('No A2UI messages returned by backend');
        }

        resetSurfaces();
        processMessages(v09Messages);
        setHasData(true);
      } catch (requestError) {
        const message =
          requestError instanceof Error
            ? requestError.message
            : 'Unknown error';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [processMessages, resetSurfaces],
  );

  useEffect(() => {
    sendPayloadRef.current = sendPayload;
  }, [sendPayload]);

  const handleSearch = useCallback(
    async (query: string) => {
      setLastQuery(query);
      await sendPayload({ query });
    },
    [sendPayload],
  );

  const handleRetry = useCallback(async () => {
    if (!lastQuery) {
      return;
    }
    await sendPayload({ query: lastQuery });
  }, [lastQuery, sendPayload]);

  return (
    <ThemedProvider>
      <A2uiMarkdownProvider>
        <Box
          sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
        >
          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
              backgroundColor: 'canvas.subtle',
            }}
          >
            <Text as="h1" sx={{ fontSize: '1.25rem', fontWeight: 'bold' }}>
              🤖 A2UI Restaurant Example
            </Text>
            <Text sx={{ fontSize: '0.875rem', color: 'fg.muted' }}>
              Uses MessageProcessor and A2uiSurface with native A2UI backend
              messages.
            </Text>
          </Box>

          <Box sx={{ flex: 1, p: 3 }}>
            {!hasData && !isLoading && !error && (
              <RestaurantSearch onSearch={handleSearch} isLoading={isLoading} />
            )}

            {isLoading && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 280,
                  gap: 3,
                }}
              >
                <Spinner size="large" />
                <Text sx={{ color: 'fg.muted' }}>
                  {LOADING_TEXT_LINES[loadingTextIndex]}
                </Text>
              </Box>
            )}

            {error && !isLoading && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  p: 4,
                }}
              >
                <Text sx={{ color: 'danger.fg' }}>⚠️ {error}</Text>
                <Button onClick={handleRetry} disabled={!lastQuery}>
                  Retry
                </Button>
              </Box>
            )}

            {!isLoading && hasData && !error && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Button
                  variant="invisible"
                  sx={{ alignSelf: 'flex-start' }}
                  onClick={() => setHasData(false)}
                >
                  ← New Search
                </Button>
                {surfaces.map(surface => (
                  <Box
                    key={surface.id}
                    sx={{
                      border: '1px solid',
                      borderColor: 'border.default',
                      borderRadius: 1,
                      p: 3,
                    }}
                  >
                    <A2uiSurface surface={surface} />
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          <Box
            sx={{
              p: 2,
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
      </A2uiMarkdownProvider>
    </ThemedProvider>
  );
};

export default A2UiRestaurantExample;
