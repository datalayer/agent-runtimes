/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * ChatStandaloneExample
 *
 * Demonstrates the ChatStandalone component which provides a floating
 * chat popup with props-based message handling. This is perfect for custom
 * integrations where you want full control over the inference logic.
 *
 * Unlike ChatFloating (which uses protocol adapters like AG-UI), this component
 * lets you provide your own message handler function.
 *
 * This example simulates an AI assistant that can respond to various queries.
 */

import React, { useCallback } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { ChatStandalone, type MessageHandler } from '../components/chat';

/**
 * Simulated AI responses for demo purposes.
 * In a real application, this would call your AI backend.
 */
const simulateAIResponse = async (
  message: string,
  onChunk?: (chunk: string) => void,
): Promise<string> => {
  const lowerMessage = message.toLowerCase();

  // Determine response based on message content
  let response: string;

  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    response =
      "Hello! I'm a demo assistant powered by ChatStandalone. I can help you with various questions. Try asking me about the weather, time, or just chat!";
  } else if (lowerMessage.includes('weather')) {
    response =
      "I'm a demo assistant, so I can't fetch real weather data. But in a real implementation, you could connect me to a weather API! The ChatStandalone component lets you implement any custom logic you need.";
  } else if (lowerMessage.includes('time')) {
    const now = new Date();
    response = `The current time is ${now.toLocaleTimeString()} on ${now.toLocaleDateString()}. This is a real response from your browser!`;
  } else if (
    lowerMessage.includes('help') ||
    lowerMessage.includes('what can you do')
  ) {
    response = `I'm a demo assistant showcasing ChatStandalone. Here's what makes this component special:

• **Props-based**: You provide your own message handler
• **Full control**: Implement any AI backend or logic
• **Streaming support**: I'm simulating streaming right now!
• **Customizable**: Brand colors, icons, positions, and more

Try asking me about the time, weather, or just say hello!`;
  } else if (lowerMessage.includes('joke')) {
    response =
      'Why do programmers prefer dark mode? Because light attracts bugs! 🐛';
  } else {
    response = `You said: "${message}"

I'm a demo assistant, so I have limited responses. In a real implementation, you would connect ChatStandalone to your preferred AI service (OpenAI, Anthropic, local LLM, etc.) by implementing the \`onSendMessage\` handler.

Try asking me for the time, a joke, or what I can do!`;
  }

  // Simulate streaming by sending chunks
  if (onChunk) {
    const words = response.split(' ');
    for (let i = 0; i < words.length; i++) {
      await new Promise(resolve =>
        setTimeout(resolve, 30 + Math.random() * 20),
      );
      onChunk(words.slice(0, i + 1).join(' '));
    }
  } else {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return response;
};

/**
 * AgentRuntimePopupStandaloneExample Component
 *
 * Demonstrates a standalone floating chat popup with custom message handling.
 * Perfect for integrations where you want full control over the AI logic.
 */
const AgentRuntimePopupStandaloneExample: React.FC = () => {
  // Message handler - this is where you implement your AI logic
  // The handler receives: message, messages (conversation history), and streaming options
  const handleSendMessage: MessageHandler = useCallback(
    async (message, _messages, options) => {
      try {
        const response = await simulateAIResponse(message, options?.onChunk);
        options?.onComplete?.(response);
        return response;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        options?.onError?.(err);
        throw err;
      }
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
            Agent Runtime Standalone Example
          </Text>
          <Text
            as="p"
            sx={{
              fontSize: 2,
              color: 'fg.muted',
              marginBottom: 4,
            }}
          >
            A standalone floating chat popup with props-based message handling.
            Click the chat button in the bottom-right corner to start!
          </Text>

          {/* Features section */}
          <Box
            sx={{
              padding: 4,
              backgroundColor: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
              marginBottom: 4,
            }}
          >
            <Text
              as="h2"
              sx={{ fontSize: 2, fontWeight: 'semibold', marginBottom: 2 }}
            >
              Key Features
            </Text>
            <Box as="ul" sx={{ paddingLeft: 3 }}>
              <Box as="li" sx={{ marginBottom: 2 }}>
                <Text sx={{ fontWeight: 'semibold' }}>Props-based Handler</Text>
                <Text sx={{ fontSize: 1, color: 'fg.muted', display: 'block' }}>
                  Implement your own <code>onSendMessage</code> function to
                  connect to any AI backend
                </Text>
              </Box>
              <Box as="li" sx={{ marginBottom: 2 }}>
                <Text sx={{ fontWeight: 'semibold' }}>Streaming Support</Text>
                <Text sx={{ fontSize: 1, color: 'fg.muted', display: 'block' }}>
                  Use the <code>onChunk</code> callback for real-time streaming
                  responses
                </Text>
              </Box>
              <Box as="li" sx={{ marginBottom: 2 }}>
                <Text sx={{ fontWeight: 'semibold' }}>Full Customization</Text>
                <Text sx={{ fontSize: 1, color: 'fg.muted', display: 'block' }}>
                  Brand colors, icons, position, keyboard shortcuts, and more
                </Text>
              </Box>
              <Box as="li" sx={{ marginBottom: 2 }}>
                <Text sx={{ fontWeight: 'semibold' }}>No Backend Required</Text>
                <Text sx={{ fontSize: 1, color: 'fg.muted', display: 'block' }}>
                  Unlike AG-UI examples, this works without a server (demo mode)
                </Text>
              </Box>
            </Box>
          </Box>

          {/* Code example */}
          <Box
            sx={{
              padding: 4,
              backgroundColor: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
              marginBottom: 4,
            }}
          >
            <Text
              as="h2"
              sx={{ fontSize: 2, fontWeight: 'semibold', marginBottom: 2 }}
            >
              Usage Example
            </Text>
            <Box
              as="pre"
              sx={{
                backgroundColor: 'neutral.emphasisPlus',
                color: 'fg.onEmphasis',
                padding: 3,
                borderRadius: 2,
                overflow: 'auto',
                fontSize: 0,
              }}
            >
              <code>{`<ChatStandalone
  title="My Assistant"
  onSendMessage={async (message, options) => {
    // Your custom AI logic here
    const response = await myAI.chat(message);
    
    // Support streaming with onChunk
    options?.onChunk?.(response);
    options?.onComplete?.(response);
    
    return response;
  }}
  brandColor="#7c3aed"
  position="bottom-right"
/>`}</code>
            </Box>
          </Box>

          {/* When to use section */}
          <Box
            sx={{
              padding: 4,
              backgroundColor: 'attention.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'attention.muted',
            }}
          >
            <Text
              as="h2"
              sx={{ fontSize: 2, fontWeight: 'semibold', marginBottom: 2 }}
            >
              When to Use
            </Text>
            <Text as="p" sx={{ fontSize: 1, marginBottom: 2 }}>
              Use <strong>ChatStandalone</strong> when:
            </Text>
            <Box as="ul" sx={{ paddingLeft: 3, fontSize: 1 }}>
              <li>You have a custom AI backend that does not use AG-UI/ACP</li>
              <li>You want full control over the message handling logic</li>
              <li>You need to integrate with a specific API (OpenAI, etc.)</li>
              <li>You want a quick demo without setting up a backend server</li>
            </Box>
            <Text as="p" sx={{ fontSize: 1, marginTop: 2 }}>
              Use <strong>ChatFloating</strong> instead when:
            </Text>
            <Box as="ul" sx={{ paddingLeft: 3, fontSize: 1 }}>
              <li>You have an AG-UI compatible backend</li>
              <li>You need built-in tool rendering support</li>
              <li>You want automatic protocol handling</li>
            </Box>
          </Box>
        </Box>

        {/* The standalone chat popup */}
        <ChatStandalone
          title="Demo Assistant"
          onSendMessage={handleSendMessage}
          position="bottom-right"
          brandColor="#7c3aed"
          enableStreaming={true}
          emptyStateMessage="Hi! I'm a demo assistant. Try asking me for the time, a joke, or what I can do!"
          buttonTooltip="Chat with Demo Assistant"
          showPoweredBy={true}
        />
      </Box>
    </DatalayerThemeProvider>
  );
};

export default AgentRuntimePopupStandaloneExample;
