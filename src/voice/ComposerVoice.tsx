/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The microphone of a composer whose text its host holds (VOICE.md VO-10,
 * VO-11): `ChatBase`'s own, and the workspace's (an application's page,
 * whose composer is a plugin of its own). What the box held when the
 * microphone opened stays; the words heard go after it as they come, and the
 * whole of what was heard replaces them once it stops. Put there for the
 * person to edit and send — or sent at once with *Send what I say*.
 *
 * @module voice/ComposerVoice
 */

import type { JSX } from 'react';
import { useMemo, useRef } from 'react';
import { DeviceHearing } from './hearing';
import { VoiceInput } from './VoiceInput';
import type { SettledVoice } from './chatVoice';
import type { SpokenMetadata, Transcript } from './types';

export interface ComposerVoiceProps {
  /** The chat's voice, settled (`settledVoice`). */
  voice: SettledVoice;
  /** What the composer holds now. */
  input: string;
  setInput: (text: string) => void;
  /** What was heard is in the box: how it was heard, for when it is sent (VO-27). */
  onSpoken: (metadata: SpokenMetadata) => void;
  /** *Send what I say*: what was heard, sent at once. */
  send: (text: string, metadata: SpokenMetadata) => void;
  disabled?: boolean;
  /** The agent is speaking: the composer offers *Stop speaking*. */
  speaking?: boolean;
  /** Stops the agent's voice, also when the microphone opens (VO-13). */
  onStopSpeaking?: () => void;
}

/** Whether something rides on a run as a spoken message's metadata (VO-27). */
export function spokenOf(value: unknown): SpokenMetadata | undefined {
  const said = value as Partial<SpokenMetadata> | undefined;
  return said?.input === 'voice' &&
    typeof said.language === 'string' &&
    typeof said.engine === 'string' &&
    (said.where === 'device' || said.where === 'server')
    ? (said as SpokenMetadata)
    : undefined;
}

export function ComposerVoice({
  voice,
  input,
  setInput,
  onSpoken,
  send,
  disabled = false,
  speaking = false,
  onStopSpeaking,
}: ComposerVoiceProps): JSX.Element | null {
  const hearing = useMemo(
    () =>
      voice.input !== 'off'
        ? new DeviceHearing(voice.modelsUrl, voice.engines)
        : undefined,
    [voice.input, voice.modelsUrl, voice.engines],
  );
  // What the box held when the microphone opened: the words heard go after it.
  const base = useRef('');
  const afterBase = (words: string) =>
    [base.current, words].filter(Boolean).join(' ');
  if (!hearing) {
    return null;
  }
  return (
    <VoiceInput
      hearing={hearing}
      language={voice.language}
      consentKey={voice.consentKey ?? 'chat'}
      silenceMs={voice.silenceMs}
      microphoneId={voice.microphoneId}
      disabled={disabled}
      speaking={speaking}
      onStopSpeaking={onStopSpeaking}
      onListen={() => {
        base.current = input.trim();
        onStopSpeaking?.();
      }}
      // The words as they are heard, in the box (VO-11); '' gives it back.
      onInterim={(words: string) => setInput(afterBase(words))}
      onTranscript={(transcript: Transcript) => {
        if (voice.sendWhatISay) {
          setInput(base.current);
          send(transcript.text, transcript.metadata);
          return;
        }
        // In the box, for the person to edit and send: never sent here.
        onSpoken(transcript.metadata);
        setInput(afterBase(transcript.text));
      }}
    />
  );
}

export default ComposerVoice;
