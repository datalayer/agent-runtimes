/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What is said kept as sound, on the page (VO-63): only for an application
 * whose record keeps `audio`, 30 days at most, asked apart from being heard,
 * each turn a WAV sent with its words.
 */

import { describe, expect, it } from 'vitest';
import { HEARING_RATE } from '../capture';
import { chatVoiceOf } from '../chatVoice';
import { consentKeyFor } from '../consent';
import {
  AUDIO_KEPT_DAYS_AT_MOST,
  keptAudioDays,
  keptAudioSentence,
  soundOf,
} from '../keptSound';

describe('what is said, kept as sound (VO-63)', () => {
  it('is kept only when the record names audio, 30 days at most', () => {
    expect(keptAudioDays(undefined)).toBeUndefined();
    expect(
      keptAudioDays({ include: ['conversations'], retentionDays: 30 }),
    ).toBeUndefined();
    expect(keptAudioDays({ include: ['audio'], retentionDays: 7 })).toBe(7);
    expect(keptAudioDays({ include: ['audio'], retentionDays: 365 })).toBe(
      AUDIO_KEPT_DAYS_AT_MOST,
    );
    expect(keptAudioDays({ include: ['audio'] })).toBe(30);
  });

  it('is asked apart: a yes to being heard is not a yes to being kept', () => {
    expect(consentKeyFor('desk', 'device')).toBe('desk');
    expect(consentKeyFor('desk', 'device', 30)).toBe('desk:kept');
    expect(consentKeyFor('desk', 'server', 7)).toBe('desk:server:kept');
    expect(keptAudioSentence(7)).toContain('for 7 days at most');
    expect(keptAudioSentence(1)).toContain('for 1 day at most');
    expect(keptAudioSentence(30)).toContain('deleted with the conversation');
  });

  it('is said on the chat’s voice only when it listens', () => {
    const place = { speechUrl: 'https://r1.example', consentKey: 'desk' };
    const voice = {
      enabled: true,
      input: 'push_to_talk',
      output: 'on_request',
      voice: '',
      language: 'en-US',
      where: 'auto',
    } as const;
    expect(chatVoiceOf(voice, place, 30)?.keepsAudio).toBe(30);
    expect(chatVoiceOf(voice, place)?.keepsAudio).toBeUndefined();
    expect(
      chatVoiceOf({ ...voice, input: 'off' }, place, 30)?.keepsAudio,
    ).toBeUndefined();
  });

  it('is a 16-bit mono WAV at 16 kHz, a minute at most', () => {
    const audio = new Float32Array(HEARING_RATE / 2).map((_, k) =>
      Math.sin(k / 10),
    );
    const sound = soundOf(audio);
    expect(sound.type).toBe('audio/wav');
    expect(sound.seconds).toBe(0.5);
    const bytes = Uint8Array.from(atob(sound.data), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.subarray(8, 12))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(HEARING_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(audio.length * 2);
    expect(bytes.length).toBe(44 + audio.length * 2);
    const long = soundOf(new Float32Array(HEARING_RATE * 61));
    expect(long.seconds).toBe(60);
  });
});
