/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A voice chat with the floating assistant (V1).
 *
 * Click the microphone and speak: the words are written in the composer as
 * they are heard — Moonshine for English, Whisper for French, Silero VAD
 * keeping only the speech — and it stops at a second click or when you stop
 * speaking; or hold it (or `Ctrl`+`Space`) and let go. Edit what was heard,
 * marked as said, and send it, and the answer is read aloud as it is written, sentence by sentence,
 * by Datalayer's speech service (Kokoro, on ai-agents), the assistant's
 * mouth moving with the sound and its balloon showing the sentence said.
 *
 * Three places, each named in the address when it is not this machine's:
 * - `?agentRuntimesUrl=` — the agent-runtimes server and its `assistant`
 *   agent (http://127.0.0.1:8765);
 * - `?voiceModelsUrl=` — the browser's models, as pinned: Datalayer's CDN
 *   (https://models-speech.datalayer.tech), or this machine's store
 *   (`scripts/voice/serve_store.py`, http://127.0.0.1:8770);
 * - `?speechUrl=` — Datalayer's speech service, datalayer-speech on r1
 *   (https://r1.datalayer.run), asked with the signed-in person's token.
 */

import React, { useMemo, useState } from 'react';
import { Heading, Link, SegmentedControl, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { ThemedProvider } from './utils/themedProvider';
import { ChatFloating } from '../chat';
import { VOICE_CATALOGUE, voiceFor } from '../specs/voices';
import { DATALAYER_SPEECH_MODELS_URL, type ChatVoice } from '../voice';

function fromAddress(name: string, otherwise: string): string {
  return (
    (typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get(name)) || otherwise
  ).replace(/\/+$/, '');
}

const SERVER = fromAddress('agentRuntimesUrl', 'http://127.0.0.1:8765');
const MODELS = fromAddress('voiceModelsUrl', DATALAYER_SPEECH_MODELS_URL);
const SPEECH = fromAddress('speechUrl', 'https://r1.datalayer.run');

const LANGUAGES = [
  { tag: 'en-US', label: 'English' },
  { tag: 'fr-FR', label: 'Français' },
] as const;

/** When answers are heard (VO-21): on request is the Appspec's default. */
const OUTPUTS = [
  { output: 'on_request', label: 'Read aloud on request' },
  { output: 'always', label: 'Always read aloud' },
] as const;

const VoiceChatExample: React.FC = () => {
  const { token } = useSimpleAuthStore();
  const [language, setLanguage] = useState<string>('en-US');
  const [output, setOutput] = useState<ChatVoice['output']>('on_request');
  const voiceSpec = voiceFor(language) ?? VOICE_CATALOGUE['kokoro-af-heart'];
  const voice: ChatVoice = useMemo(
    () => ({
      language,
      input: 'push_to_talk',
      output,
      voice: voiceSpec.id,
      modelsUrl: MODELS,
      speechUrl: SPEECH,
      token: token || undefined,
      consentKey: 'voice-chat-example',
    }),
    [language, output, voiceSpec.id, token],
  );
  return (
    <ThemedProvider>
      <Box minHeight="100vh" bg="canvas.default" p={4}>
        <Box maxWidth={720} mx="auto">
          <Heading as="h1" sx={{ mb: 2 }}>
            Voice chat
          </Heading>
          <Text as="p" sx={{ color: 'fg.muted', mb: 3 }}>
            Talk to the assistant instead of typing: click the microphone in its
            composer and speak — the words are written in the message box as
            they are heard, and it stops when you click again or stop speaking.
            Or hold it, or <kbd>Ctrl</kbd>+<kbd>Space</kbd>, and let go. What
            you say is heard in this page and never leaves it; edit the words,
            then send them. Its answers are read aloud by Datalayer&rsquo;s
            speech service, and not kept: on request, with <em>Read aloud</em>{' '}
            under an answer, or always, as they are written. <kbd>Esc</kbd>{' '}
            stops its voice.
          </Text>
          <Box
            display="flex"
            alignItems="center"
            gap={3}
            mb={3}
            flexWrap="wrap"
          >
            <SegmentedControl aria-label="Language">
              {LANGUAGES.map(option => (
                <SegmentedControl.Button
                  key={option.tag}
                  selected={language === option.tag}
                  onClick={() => setLanguage(option.tag)}
                  data-voice-language={option.tag}
                >
                  {option.label}
                </SegmentedControl.Button>
              ))}
            </SegmentedControl>
            <SegmentedControl aria-label="When answers are heard">
              {OUTPUTS.map(option => (
                <SegmentedControl.Button
                  key={option.output}
                  selected={output === option.output}
                  onClick={() => setOutput(option.output)}
                  data-voice-output={option.output}
                >
                  {option.label}
                </SegmentedControl.Button>
              ))}
            </SegmentedControl>
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
              Voice: {voiceSpec.name}
            </Text>
          </Box>
          {voiceSpec.attribution && (
            <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mb: 3 }}>
              {voiceSpec.attribution}
            </Text>
          )}
          <Text as="p" sx={{ fontSize: 0, color: 'fg.muted' }}>
            Models from {MODELS}, speech from {SPEECH}, the agent at {SERVER}.
            See{' '}
            <Link href="https://agent-runtimes.datalayer.tech/chat/voice">
              Voice
            </Link>{' '}
            for how to run each.
          </Text>
        </Box>
        <ChatFloating
          defaultViewMode="assistant"
          assistantCharacter="paperclip"
          protocol="vercel-ai"
          endpoint={`${SERVER}/api/v1/vercel-ai/assistant`}
          title="Assistant"
          description="Hello! Click the microphone and ask me anything."
          position="bottom-right"
          useStore={false}
          voice={voice}
        />
      </Box>
    </ThemedProvider>
  );
};

export default VoiceChatExample;
