/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Voice: agents that listen and speak (VOICE.md).
 *
 * Push-to-talk heard on the device (Moonshine, Whisper, Silero VAD, from
 * Datalayer's origin and as pinned), answers spoken by Datalayer's speech
 * service (Kokoro on ai-agents), the assistant's mouth moving with them.
 *
 * @module voice
 */

import type { VoiceEngines } from './types';

export * from './types';
export * from './sentences';
export * from './pinned';
export * from './capture';
export * from './hearing';
export * from './speaker';
export * from './consent';
export * from './useSpokenAnswers';
export { VoiceInput } from './VoiceInput';
export type { VoiceInputProps, ListeningState } from './VoiceInput';

/**
 * A chat's voice: what a host gives `ChatBase` and `ChatFloating` to let a
 * person talk to the agent and hear it — the Appspec's `interface.voice`,
 * with where the models and the speech service are.
 */
export interface ChatVoice {
  /** The language listened to and spoken, BCP 47. */
  language: string;
  /** `push_to_talk`, or `off`. Hands-free is Phase V3. */
  input: 'off' | 'push_to_talk';
  /** When answers are heard: `always`, or `off`. */
  output: 'off' | 'always';
  /** The voice of the catalogue answers are spoken with. */
  voice: string;
  /** Datalayer's origin for the browser's models: the pinned store. */
  modelsUrl: string;
  /** The packages that hear, loaded when voice is first used. */
  engines: VoiceEngines;
  /** ai-agents, whose speech service says the answers. */
  speechUrl?: string;
  /** The token the speech service is asked with. */
  token?: string;
  /** Send what is said at once, rather than put it in the composer. */
  sendWhatISay?: boolean;
  /** Whose consent to the microphone is remembered: the application's id. */
  consentKey?: string;
}
