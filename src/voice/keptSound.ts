/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the person said, kept as sound (VO-63): an application whose record
 * keeps `audio` (`record.include`), and a person who agreed in the
 * microphone's first sentence, send each turn's recording with its words —
 * `forwardedProps.voice.sound`, a 16-bit mono WAV at 16 kHz — and its
 * runtime gives it to ai-agents to keep, 30 days at most, deleted with the
 * conversation. Never for a visitor without an account.
 *
 * @module voice/keptSound
 */

import { HEARING_RATE } from './capture';
import type { SpokenSound } from './types';

/** The longest a sound is kept, whatever the record keeps (decision 10). */
export const AUDIO_KEPT_DAYS_AT_MOST = 30;

/** The most of a turn kept: a minute. */
const KEPT_SECONDS_AT_MOST = 60;

/**
 * How many days an application keeps what is said as sound: `undefined`
 * when its record does not keep `audio`, else its record's days, 30 at most.
 */
export function keptAudioDays(record?: {
  include?: readonly string[];
  retentionDays?: number;
}): number | undefined {
  if (!record?.include?.includes('audio')) {
    return undefined;
  }
  const days = record.retentionDays || AUDIO_KEPT_DAYS_AT_MOST;
  return Math.max(1, Math.min(days, AUDIO_KEPT_DAYS_AT_MOST));
}

/** The sentence added to the microphone's first one when the sound is kept (VO-61). */
export const keptAudioSentence = (days: number): string =>
  `This application also keeps what you say as sound, with this conversation, for ${days} ${
    days === 1 ? 'day' : 'days'
  } at most: its owner can listen to it, and it is deleted with the conversation. Not now, and you type instead.`;

/** A turn's samples (mono, 16 kHz, -1 to 1) as a WAV, base64, to keep. */
export function soundOf(audio: Float32Array): SpokenSound {
  const samples = audio.subarray(0, HEARING_RATE * KEPT_SECONDS_AT_MOST);
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => {
    for (let k = 0; k < value.length; k++) {
      view.setUint8(at + k, value.charCodeAt(k));
    }
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, HEARING_RATE, true);
  view.setUint32(28, HEARING_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let k = 0; k < samples.length; k++) {
    const sample = Math.max(-1, Math.min(1, samples[k]));
    view.setInt16(
      44 + k * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  let binary = '';
  for (let k = 0; k < bytes.length; k += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  }
  return {
    data: btoa(binary),
    type: 'audio/wav',
    seconds: Math.round((samples.length / HEARING_RATE) * 100) / 100,
  };
}
