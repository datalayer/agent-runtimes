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
import {
  readAcsCharacter,
  readClippyCharacter,
  type AssistantCharacterData,
} from '../chat/assistant/formats';

/**
 * A character file a person picked, read in the page (T-26): one `.acs`, or
 * a clippy.js character's `agent.js` and `map.png` (and its sounds file).
 */
async function readPicked(files: File[]): Promise<AssistantCharacterData> {
  const acs = files.find(file => file.name.toLowerCase().endsWith('.acs'));
  if (acs) {
    return readAcsCharacter(await acs.arrayBuffer());
  }
  const agentJs = files.find(file => file.name.toLowerCase() === 'agent.js');
  const mapPng = files.find(file => /\.(png|gif|webp|jpe?g)$/i.test(file.name));
  const soundsJs = files.find(file => /^sounds-.*\.js$/i.test(file.name));
  if (!agentJs || !mapPng) {
    throw new Error(
      'Pick one .acs file, or a clippy.js character: its agent.js and its map image (and a sounds file if you have one).',
    );
  }
  return readClippyCharacter({
    agentJs: await agentJs.text(),
    mapPng,
    soundsJs: soundsJs ? await soundsJs.text() : undefined,
  });
}

const ChatAssistantExample: React.FC = () => {
  const [character, setCharacter] = useState<string | AssistantCharacterData>(
    ASSISTANT_CHARACTERS[0].id,
  );
  const [loadError, setLoadError] = useState<string | undefined>();
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
                onClick={() => {
                  setCharacter(option.id);
                  setLoadError(undefined);
                }}
                aria-pressed={option.id === character}
              >
                {option.name}
              </Button>
            ))}
          </Box>
          <Box as="section" sx={{ mt: 4 }}>
            <Heading as="h2" sx={{ fontSize: 2, mb: 1 }}>
              A character you bring
            </Heading>
            <Text as="p" sx={{ color: 'fg.muted', mb: 2 }}>
              The characters of Microsoft Office — Clippy, Merlin, Links and the
              others — are Microsoft&rsquo;s. Load only a character file you
              have the right to use: a Microsoft Agent <code>.acs</code> file,
              or a clippy.js character&rsquo;s <code>agent.js</code> and map
              image. It is read in this page and sent nowhere.
            </Text>
            <input
              type="file"
              multiple
              accept=".acs,.js,.png,.gif,.webp,.jpg,.jpeg"
              aria-label="Character files"
              onChange={async event => {
                const files = Array.from(event.target.files ?? []);
                if (!files.length) {
                  return;
                }
                try {
                  setCharacter(await readPicked(files));
                  setLoadError(undefined);
                } catch (error) {
                  setLoadError(
                    error instanceof Error ? error.message : String(error),
                  );
                }
              }}
            />
            {loadError && (
              <Text as="p" role="alert" sx={{ color: 'danger.fg', mt: 2 }}>
                {loadError}
              </Text>
            )}
            {typeof character !== 'string' && (
              <Text as="p" sx={{ mt: 2 }}>
                Playing {character.name}.
              </Text>
            )}
          </Box>
        </Box>
        <ChatFloating
          key={typeof character === 'string' ? character : character.sprite}
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
