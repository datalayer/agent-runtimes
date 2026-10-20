/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Voice: agents that listen and speak.
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
export * from './keptSound';
export * from './pinned';
export * from './capture';
export * from './hearing';
export * from './serverHearing';
export * from './sayAloud';
export * from './handsFree';
export { HandsFree, type HandsFreeProps } from './HandsFree';
export * from './speaker';
export * from './consent';
export * from './settings';
export * from './choices';
export { useVoiceSettings } from './useVoiceSettings';
export { VoiceMenu } from './VoiceMenu';
export type { VoiceMenuProps } from './VoiceMenu';
export * from './useSpokenAnswers';
export { VoiceInput } from './VoiceInput';
export type { VoiceInputProps, ListeningState } from './VoiceInput';
export { ReadAloud, readAloud, readsAloud } from './ReadAloud';
export type { ReadAloudProps, ReadableMessage, ReadingSink } from './ReadAloud';
export {
  DATALAYER_SPEECH_MODELS_URL,
  DATALAYER_VOICE_ENGINES,
  chatVoiceOf,
  settledVoice,
} from './chatVoice';
export type { ChatVoicePlace, SettledVoice } from './chatVoice';
export { useVoiceSpeaker } from './useVoiceSpeaker';
export { ComposerVoice, spokenOf } from './ComposerVoice';
export type { ComposerVoiceProps } from './ComposerVoice';
export type { VoiceSpeaker } from './useVoiceSpeaker';

/**
 * A chat's voice: what a host gives `ChatBase`, `ChatFloating` or an
 * application's workspace to let a person talk to the agent and hear it —
 * the Appspec's `interface.voice` (`chatVoiceOf`), with where the models and
 * the speech service are.
 *
 * The least is `{ language: 'en-US', input: 'push_to_talk' }`: a microphone
 * in the composer — click it and speak, the words written in the box as
 * they are heard, stopped by a second click or when you stop speaking; or
 * hold it, and let go — heard in the browser by the models on Datalayer's
 * CDN. Add `output` and `speechUrl` for the answers to be heard.
 */
export interface ChatVoice {
  /** The language listened to and spoken, BCP 47. */
  language: string;
  /**
   * `push_to_talk`: the microphone in the composer; `hands_free`: that, and
   * *Talk with it* beside it — a conversation by voice (VO-12, VO-13);
   * `off`: none.
   */
  input: 'off' | 'push_to_talk' | 'hands_free';
  /** The silence after speech that ends a hands-free turn, in ms (VO-12): 500 when unsaid. */
  turnSilenceMs?: number;
  /**
   * When answers are heard: `always`, as they are written; `on_request`, a
   * *Read aloud* under each answer (VO-21); or `off`, the default.
   */
  output?: 'off' | 'on_request' | 'always';
  /** The voice of the catalogue answers are spoken with; the language's first when unsaid. */
  voice?: string;
  /** The origin of the browser's models, the pinned store: Datalayer's CDN when unsaid. */
  modelsUrl?: string;
  /** The packages that hear, loaded when voice is first used: transformers.js and vad-web when unsaid. */
  engines?: VoiceEngines;
  /**
   * How long a silence, after speech, stops a microphone clicked on, in ms
   * (VO-10, VO-69): 1,500 when unsaid; longer for a person who pauses.
   */
  silenceMs?: number;
  /** ai-agents, whose speech service says the answers, and hears where the browser does not. */
  speechUrl?: string;
  /**
   * Where what is said is heard: `device`, the browser; `server`,
   * Datalayer's speech service; `auto`, the default, the browser where a
   * model there hears the language, else the server. The Appspec's
   * `interface.voice.where`.
   */
  where?: 'auto' | 'device' | 'server';
  /** The person asked for their language to be found by Whisper on the server (VO-14). */
  detect?: boolean;
  /** The token the speech service is asked with. */
  token?: string;
  /**
   * The days the application keeps what is said as sound (VO-63), when its
   * record keeps `audio`: asked in the microphone's first sentence, each
   * turn's recording sent with its words. Never for a visitor.
   */
  keepsAudio?: number;
  /** Send what is said at once, rather than put it in the composer. */
  sendWhatISay?: boolean;
  /**
   * How fast the voice speaks, as a multiplier of its own pace (VO-25,
   * VO-30). The speech service has no speed of its own, so this is applied
   * where the sound is played.
   */
  rate?: number;
  /** How loud it is, 0 to 1 (VO-25, VO-30). */
  volume?: number;
  /** The microphone to listen with, a `MediaDeviceInfo.deviceId` (VO-30). */
  microphoneId?: string;
  /** Whose consent to the microphone is remembered: the application's id. */
  consentKey?: string;
}
