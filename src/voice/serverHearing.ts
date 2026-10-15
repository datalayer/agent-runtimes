/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hearing on Datalayer's servers (VOICE.md VO-34, VO-14, §5): what was said
 * in one press, kept to its speech by Silero VAD in the page, then sent as a
 * WAV recording to the speech service's `POST /speech/transcriptions`, where
 * Whisper large-v3-turbo hears it — in any language it knows, and finding
 * the language itself when the person asks for that (detection, VO-14). The
 * sound is held in the request only: the service keeps neither it nor the
 * words (VO-60).
 *
 * Used where the application's voice says `where: server`, where it says
 * `auto` and no model in the browser hears the language, and where the
 * person asked for their language to be detected — never when they chose to
 * keep speech on the device. A clip model: its words come at the end, not
 * while the person speaks (VO-11).
 *
 * @module voice/serverHearing
 */

import { transcriberFor } from '../specs/voices';
import { HEARING_RATE } from './capture';
import type { Hearing, HearingProgress, HeardSoFar } from './hearing';
import type { Transcript } from './types';

/** Where the speech service hears a recording, on ai-agents' host. */
export const TRANSCRIPTIONS_PATH = '/api/ai-agents/v1/speech/transcriptions';

/** The model the speech service hears with (agentspecs' catalogue). */
export const SERVER_HEARING_MODEL = 'whisper-large-v3-turbo';

/** The shortest speech worth hearing, in samples: a word said alone. */
const SHORTEST = HEARING_RATE * 0.2;

/** Where a chat's voice hears: in the browser, or on Datalayer's servers. */
export type HearingPlace = 'device' | 'server';

/** What decides where a chat's voice hears. */
export interface HearingAsked {
  language: string;
  /** The application's `interface.voice.where`; `auto` when unsaid. */
  where?: 'auto' | 'device' | 'server';
  /** The person asked for their language to be detected (VO-14). */
  detect?: boolean;
  /** The speech service; none, and everything is heard in the browser. */
  speechUrl?: string;
}

/**
 * Where a chat's voice hears (§5): in the browser unless the speech service
 * is named and the person asked for detection, the application says
 * `server`, or it says `auto` and no model in the browser hears the language.
 */
export function hearingPlace(voice: HearingAsked): HearingPlace {
  if (!voice.speechUrl) {
    return 'device';
  }
  if (voice.detect || voice.where === 'server') {
    return 'server';
  }
  if (voice.where === 'device') {
    return 'device';
  }
  return transcriberFor(voice.language) ? 'device' : 'server';
}

/** Mono samples at 16 kHz as a 16-bit PCM WAV file: what the service reads. */
export function wavOf(samples: Float32Array, rate = HEARING_RATE): ArrayBuffer {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(at + i, value.charCodeAt(i));
    }
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      44 + i * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return bytes;
}

/** What finds the speech in what was heard: the browser's VAD (`DeviceHearing`). */
export interface SpeechFinder {
  readyToFindSpeech(progress?: HearingProgress): Promise<void>;
  findSpeech(
    audio: Float32Array,
  ): Promise<{ speech: Float32Array; silentMs: number }>;
}

export interface ServerHearingOptions {
  /** ai-agents' origin, where the speech service is. */
  speechUrl: string;
  /** The token the conversation speaks with: the person's, a visitor's, an embed's. */
  token?: string;
  /** Let Whisper find the language (VO-14), rather than tell it. */
  detect?: boolean;
  fetcher?: typeof fetch;
}

/**
 * Hears on Datalayer's servers: the browser's VAD finds the speech and when
 * it stopped; Whisper, on the speech service, writes it.
 */
export class ServerHearing implements Hearing {
  readonly where = 'server' as const;

  constructor(
    private readonly finder: SpeechFinder,
    private readonly options: ServerHearingOptions,
  ) {}

  /** Only the VAD loads in the page: the words are written on the server. */
  ready(_language: string, progress?: HearingProgress): Promise<void> {
    return this.finder.readyToFindSpeech(progress);
  }

  /** Whether speech was found and how long it has been silent; its words come at the end. */
  async hearSoFar(audio: Float32Array): Promise<HeardSoFar> {
    const { speech, silentMs } = await this.finder.findSpeech(audio);
    return { text: '', spoke: speech.length >= SHORTEST, silentMs };
  }

  async hear(
    audio: Float32Array,
    language: string,
  ): Promise<Transcript | undefined> {
    const started = performance.now();
    const { speech } = await this.finder.findSpeech(audio);
    if (speech.length < SHORTEST) {
      return undefined;
    }
    const { speechUrl, token, detect, fetcher = fetch } = this.options;
    const query = detect ? '' : `?language=${encodeURIComponent(language)}`;
    const answered = await fetcher(
      `${speechUrl.replace(/\/+$/, '')}${TRANSCRIPTIONS_PATH}${query}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: wavOf(speech),
      },
    );
    const body = (await answered.json().catch(() => ({}))) as {
      text?: unknown;
      language?: unknown;
      detail?: unknown;
    };
    if (!answered.ok) {
      throw new Error(
        typeof body.detail === 'string' && body.detail
          ? body.detail
          : `What you said could not be heard on Datalayer's servers (${answered.status}).`,
      );
    }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return undefined;
    }
    return {
      text,
      metadata: {
        input: 'voice',
        language:
          typeof body.language === 'string' && body.language
            ? body.language
            : language,
        engine: SERVER_HEARING_MODEL,
        where: 'server',
      },
      seconds: speech.length / HEARING_RATE,
      ms: Math.round(performance.now() - started),
    };
  }
}
