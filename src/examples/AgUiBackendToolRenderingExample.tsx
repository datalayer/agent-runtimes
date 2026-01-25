/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgUiBackendToolRenderingExample
 *
 * Demonstrates backend tool rendering where tools execute on the server
 * and return structured data that the frontend renders INLINE in the chat.
 *
 * This example shows a weather assistant that fetches real weather data
 * and renders beautiful weather cards directly in the chat conversation,
 * similar to the AG-UI Dojo implementation.
 *
 * Backend: /api/v1/examples/backend_tool_rendering/
 */

import React, { useCallback } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { ChatFloating, type ToolCallRenderContext } from '../components/chat';
import { InlineWeatherCard, type WeatherResult } from './ag-ui/weather';

// AG-UI endpoint for backend tool rendering example
const BACKEND_TOOL_RENDERING_ENDPOINT =
  'http://localhost:8765/api/v1/examples/backend_tool_rendering/';

/**
 * Render function for tool results - renders weather cards inline in chat
 */
const renderWeatherToolResult = (context: ToolCallRenderContext) => {
  // Only render for the get_weather tool
  if (context.toolName !== 'get_weather') {
    return null;
  }

  // Extract location from args
  const location = (context.args as { location?: string })?.location;

  // Cast result to WeatherResult if available
  const weatherResult = context.result as WeatherResult | undefined;

  return (
    <InlineWeatherCard
      location={location}
      result={weatherResult}
      status={context.status}
      error={context.error}
    />
  );
};

/**
 * AgUiBackendToolRenderingExample Component
 *
 * Demonstrates backend tool rendering with AG-UI.
 * The agent has a `get_weather` tool that calls the Open-Meteo API
 * and returns weather data. This data is rendered INLINE in the chat
 * as a beautiful weather card with dynamic theming.
 *
 * Features demonstrated:
 * - Backend tool execution
 * - Real API integration (Open-Meteo)
 * - INLINE rendering of tool results in chat
 * - Dynamic theming based on weather conditions
 * - Loading states while fetching data
 */
const AgUiBackendToolRenderingExample: React.FC = () => {
  // Optional: still track weather for sidebar display if needed
  const handleStateUpdate = useCallback((_state: unknown) => {
    // State updates are still available if needed for other purposes
    // Uncomment to debug: console.log('[WeatherExample] State update:', _state);
  }, []);

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
            AG-UI: Backend Tool Rendering (Inline)
          </Text>
          <Text
            as="p"
            sx={{
              fontSize: 2,
              color: 'fg.muted',
              marginBottom: 4,
            }}
          >
            Ask about the weather anywhere in the world. Weather cards are
            rendered <strong>inline in the chat</strong> with dynamic theming!
          </Text>

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
              This demonstrates <strong>inline backend tool rendering</strong>{' '}
              with AG-UI. When the agent calls the <code>get_weather</code>{' '}
              tool, the result is rendered as a beautiful weather card directly
              in the chat conversation, similar to the AG-UI Dojo
              implementation.
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
                <li>
                  🌤️ Dynamic background colors based on weather conditions
                </li>
                <li>🎨 Weather icons (sun, rain, cloud)</li>
                <li>🌡️ Temperature in both Celsius and Fahrenheit</li>
                <li>💨 Humidity, wind speed, and feels-like stats</li>
                <li>⏳ Loading spinner while fetching data</li>
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
                <li>&quot;What&apos;s the weather in New York?&quot;</li>
                <li>&quot;Weather in London and Paris&quot;</li>
                <li>&quot;Is it sunny in Sydney?&quot;</li>
                <li>&quot;How&apos;s the weather in Tokyo today?&quot;</li>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Floating chat with inline tool rendering */}
        <ChatFloating
          endpoint={BACKEND_TOOL_RENDERING_ENDPOINT}
          title="Weather Assistant"
          description="Ask me about the weather anywhere in the world!"
          position="bottom-right"
          brandColor="#667eea"
          onStateUpdate={handleStateUpdate}
          renderToolResult={renderWeatherToolResult}
          suggestions={[
            {
              title: 'Paris weather',
              message: "What's the weather like in Paris?",
            },
            {
              title: 'Tokyo forecast',
              message: 'Show me the weather forecast for Tokyo.',
            },
          ]}
        />
      </Box>
    </DatalayerThemeProvider>
  );
};

export default AgUiBackendToolRenderingExample;
