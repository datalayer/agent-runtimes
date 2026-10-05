/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A voice chat with the floating assistant (VOICE.md V1).
 *
 * Hold the microphone (or `Ctrl`+`Space`), speak, let go: what you said is
 * heard in this page — Moonshine for English, Whisper for French, Silero VAD
 * keeping only the speech — and put in the composer, marked as said. Send
 * it, and the answer is read aloud as it is written, sentence by sentence,
 * by Datalayer's speech service (Kokoro, on ai-agents), the assistant's
 * mouth moving with the sound and its balloon showing the sentence said.
 *
 * Three places, each named in the address when it is not this machine's:
 * - `?agentRuntimesUrl=` — the agent-runtimes server and its `assistant`
 *   agent (http://127.0.0.1:8765);
 * - `?voiceModelsUrl=` — the browser's models, as pinned
 *   (`scripts/voice/serve_store.py`, http://127.0.0.1:8770);
 * - `?speechUrl=` — ai-agents' speech service (http://127.0.0.1:4401).
 */

import React, { useMemo, useState } from 'react';
import { Heading, Link, SegmentedControl, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { ThemedProvider } from './utils/themedProvider';
import { ChatFloating } from '../chat';
import { VOICE_CATALOGUE, voiceFor } from '../specs/voices';
import type { ChatVoice, VoiceEngines } from '../voice';

function fromAddress(name: string, otherwise: string): string {
  return (
    (typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get(name)) || otherwise
  ).replace(/\/+$/, '');
}

const SERVER = fromAddress('agentRuntimesUrl', 'http://127.0.0.1:8765');
const MODELS = fromAddress('voiceModelsUrl', 'http://127.0.0.1:8770');
const SPEECH = fromAddress('speechUrl', 'http://127.0.0.1:4401');

/** The packages that hear, loaded the first time the microphone is used. */
const ENGINES: VoiceEngines = {
  transformers: () => import('@huggingface/transformers'),
  vad: () => import('@ricky0123/vad-web'),
};

const LANGUAGES = [
  { tag: 'en-US', label: 'English' },
  { tag: 'fr-FR', label: 'Français' },
] as const;

const VoiceChatExample: React.FC = () => {
  const { token } = useSimpleAuthStore();
  const [language, setLanguage] = useState<string>('en-US');
  const voiceSpec = voiceFor(language) ?? VOICE_CATALOGUE['kokoro-af-heart'];
  const voice: ChatVoice = useMemo(
    () => ({
      language,
      input: 'push_to_talk',
      output: 'always',
      voice: voiceSpec.id,
      modelsUrl: MODELS,
      engines: ENGINES,
      speechUrl: SPEECH,
      token: token || undefined,
      consentKey: 'voice-chat-example',
    }),
    [language, voiceSpec.id, token],
  );
  return (
    <ThemedProvider>
      <Box sx={{ minHeight: '100vh', bg: 'canvas.default', p: 4 }}>
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
          <Heading as="h1" sx={{ mb: 2 }}>
            Voice chat
          </Heading>
          <Text as="p" sx={{ color: 'fg.muted', mb: 3 }}>
            Talk to the assistant instead of typing: hold the microphone in its
            composer, or <kbd>Ctrl</kbd>+<kbd>Space</kbd>, speak, and let go.
            What you say is heard in this page and never leaves it; the words go
            in the message box for you to send. Its answers are read aloud as
            they are written, by Datalayer&rsquo;s speech service, and not kept.{' '}
            <kbd>Esc</kbd> stops its voice.
          </Text>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 3 }}>
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
          description="Hello! Hold the microphone and ask me anything."
          position="bottom-right"
          useStore={false}
          voice={voice}
        />
      </Box>
    </ThemedProvider>
  );
};

export default VoiceChatExample;
