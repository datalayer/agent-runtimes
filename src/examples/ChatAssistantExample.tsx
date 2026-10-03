/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating assistant (LOOP T-21 to T-27): the chat as a character on the
 * page, after the Office Assistant — Datalayer's own characters, chosen
 * here, acting out what the agent does and speaking in a balloon.
 */

import React, { useState } from 'react';
import { Button, Heading, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { ChatFloating } from '../chat';
import { ASSISTANT_CHARACTERS } from '../chat/assistant/characters';

const ChatAssistantExample: React.FC = () => {
  const [character, setCharacter] = useState(ASSISTANT_CHARACTERS[0].id);
  return (
    <ThemedProvider>
      <Box sx={{ minHeight: '100vh', bg: 'canvas.default', p: 4 }}>
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
          <Heading as="h1" sx={{ mb: 2 }}>
            Floating assistant
          </Heading>
          <Text as="p" sx={{ color: 'fg.muted', mb: 3 }}>
            The chat as a character on the page. It greets you, acts out what
            the agent is doing, and says the agent&rsquo;s words in a balloon
            while the conversation is closed. Click it to talk, drag it to move
            it, hover it to send it away.
          </Text>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {ASSISTANT_CHARACTERS.map(option => (
              <Button
                key={option.id}
                variant={option.id === character ? 'primary' : 'default'}
                onClick={() => setCharacter(option.id)}
                aria-pressed={option.id === character}
              >
                {option.name}
              </Button>
            ))}
          </Box>
        </Box>
        <ChatFloating
          key={character}
          defaultViewMode="assistant"
          assistantCharacter={character}
          protocol="vercel-ai"
          endpoint="http://127.0.0.1:8765/api/v1/vercel-ai/assistant"
          title="Assistant"
          description="Hello! Ask me anything about this page."
          position="bottom-right"
          useStore={false}
        />
      </Box>
    </ThemedProvider>
  );
};

export default ChatAssistantExample;
