/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A chat's voice, from what an application or an agent says of it (VO-41, VO-49):
 * the `voice` a host gives `ChatBase`, `ChatFloating` or an
 * application's workspace, with Datalayer's places filled in — the browser's
 * models from Datalayer's CDN, the packages that hear loaded on first use.
 *
 * @module voice/chatVoice
 */

import { voiceFor } from '../specs/voices';
import type { AppVoiceSpec } from '../types/agentspecs';
import type { VoiceEngines } from './types';
import { TURN_SILENCE_MS } from './handsFree';
import {
  heldVoiceSettings,
  saneVoiceSettings,
  voiceForPerson,
  type VoiceSettings,
} from './settings';
import type { ChatVoice } from './index';

/**
 * Datalayer's origin for the browser's speech models, as pinned
 * (`s3://datalayer-models-speech` behind its CDN; VO-48, VO-49): each model
 * at `<provider>/<model id>/<path>`, onnxruntime-web's own files at
 * `onnxruntime-web/<version>/`.
 */
export const DATALAYER_SPEECH_MODELS_URL =
  'https://models-speech.datalayer.tech';

/**
 * The packages that hear — transformers.js for Moonshine and Whisper,
 * vad-web for Silero VAD — each loaded only the first time the microphone
 * is used: a page whose chat has no voice never fetches them.
 */
export const DATALAYER_VOICE_ENGINES: VoiceEngines = {
  transformers: () => import('@huggingface/transformers'),
  vad: () => import('@ricky0123/vad-web'),
};

/** Where a chat's voice runs, as its host knows it. */
export interface ChatVoicePlace {
  /** ai-agents' origin, whose speech service says the answers (`https://r1.datalayer.run`). */
  speechUrl?: string;
  /** The token the speech service is asked with: the person's, or the application's. */
  token?: string;
  /** The browser's models; Datalayer's CDN when unsaid. */
  modelsUrl?: string;
  /** Whose consent to the microphone is remembered: the application's id. */
  consentKey: string;
  /** The language the person reads in, when the spec says none; English when neither does. */
  language?: string;
}

/**
 * The chat's voice an application's `interface.voice` (or an agent spec's
 * `voice:`) asks for, or `undefined` when it has none: off unless said.
 *
 * - **Listening**: a microphone in the composer — click it and speak, the
 *   words written in the box as they are heard, stopped by a second click
 *   or when the person stops speaking; or held, and let go (VO-10, VO-11).
 *   `hands_free` (VO-12): the microphone, and *Talk with it* beside it; it
 *   implies answers said as they are written.
 * - **Speaking**: its answers said by Datalayer's speech service, on request
 *   or always (VO-20, VO-21); refused here when its host says no service.
 */
export function chatVoiceOf(
  spec: AppVoiceSpec | undefined,
  place: ChatVoicePlace,
): ChatVoice | undefined {
  if (!spec?.enabled || (spec.input === 'off' && spec.output === 'off')) {
    return undefined;
  }
  if (spec.output !== 'off' && !place.speechUrl) {
    throw new Error(
      'Its answers are said by Datalayer’s speech service, and its host gave no address for it.',
    );
  }
  const language = spec.language || place.language || 'en-US';
  return {
    language,
    input: spec.input,
    // Hands-free implies the answers heard as they are written (VO-12).
    output: spec.input === 'hands_free' ? 'always' : spec.output,
    voice: spec.voice || voiceFor(language)?.id || '',
    modelsUrl: place.modelsUrl || DATALAYER_SPEECH_MODELS_URL,
    engines: DATALAYER_VOICE_ENGINES,
    speechUrl: place.speechUrl,
    token: place.token,
    consentKey: place.consentKey,
    where: spec.where ?? 'auto',
  };
}

/**
 * A chat's voice asked of the speech service as the chat itself speaks to
 * its runtime (VO-37, VO-19): the token its host gave, else the chat's own —
 * a visitor's token minted from ai-inference, an embed's token, or the
 * person's. One token for the conversation and its voice, never a second.
 * An embed's deployment is the one its token names: the page
 * says none.
 */
export function voiceAskedAs(
  voice: ChatVoice | undefined,
  token: string | undefined,
): ChatVoice | undefined {
  if (!voice) {
    return undefined;
  }
  const asked = voice.token || token;
  return asked ? { ...voice, token: asked } : { ...voice };
}

/** A chat's voice with every place said: what the chat reads. */
export type SettledVoice = Required<
  Pick<
    ChatVoice,
    | 'language'
    | 'input'
    | 'output'
    | 'voice'
    | 'modelsUrl'
    | 'engines'
    | 'silenceMs'
  >
> &
  Omit<
    ChatVoice,
    | 'language'
    | 'input'
    | 'output'
    | 'voice'
    | 'modelsUrl'
    | 'engines'
    | 'silenceMs'
  >;

/** How long a silence after speech stops a microphone clicked on, when unsaid (VO-10). */
export const SILENCE_MS = 1500;

/**
 * A chat's voice as the person hears it, with what it leaves unsaid filled
 * in: the person's own settings first where they made some (`voiceForPerson`:
 * their language, voice, rate, volume, microphone; VO-14, VO-25, VO-30),
 * else the host's; answers not heard, the language's first voice,
 * Datalayer's models and packages, a silence of 1.5 s. A person who pauses
 * longer before they are done has both silences — the one that stops a
 * microphone clicked on, and the one that ends a hands-free turn — made
 * longer by their choice (`pause`, VO-69). Answers heard need the speech
 * service's address: refused without.
 */
export function settledVoice(
  given: ChatVoice,
  person: VoiceSettings = heldVoiceSettings(),
): SettledVoice {
  const voice = voiceForPerson(given, person);
  const pause = saneVoiceSettings(person).pause ?? 1;
  const output = voice.output ?? 'off';
  if (output !== 'off' && !voice.speechUrl) {
    throw new Error(
      `A chat whose answers are heard (${output}) names the speech service: its speechUrl is missing.`,
    );
  }
  return {
    ...voice,
    output,
    voice: voice.voice || voiceFor(voice.language)?.id || '',
    modelsUrl: voice.modelsUrl || DATALAYER_SPEECH_MODELS_URL,
    engines: voice.engines ?? DATALAYER_VOICE_ENGINES,
    silenceMs: Math.round((voice.silenceMs ?? SILENCE_MS) * pause),
    turnSilenceMs: Math.round((voice.turnSilenceMs ?? TURN_SILENCE_MS) * pause),
  };
}
