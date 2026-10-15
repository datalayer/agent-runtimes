/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hearing on Datalayer's servers (VOICE.md VO-34, VO-14, §5): where a chat's
 * voice hears, the recording the speech service is sent, what comes back,
 * and the person's choice to have their language detected.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatVoice } from '../index';
import { HEARING_RATE } from '../capture';
import { consentKeyFor } from '../consent';
import {
  SERVER_HEARING_MODEL,
  ServerHearing,
  TRANSCRIPTIONS_PATH,
  hearingPlace,
  wavOf,
  type SpeechFinder,
} from '../serverHearing';
import { saneVoiceSettings, voiceForPerson } from '../settings';

/** The browser's VAD, as `DeviceHearing` offers it: here, all of it is speech. */
class AllSpeech implements SpeechFinder {
  readied = 0;
  async readyToFindSpeech(progress?: (loaded: number, total: number) => void) {
    this.readied += 1;
    progress?.(1, 1);
  }
  async findSpeech(audio: Float32Array) {
    return { speech: audio, silentMs: 400 };
  }
}

const second = (seconds = 1) =>
  Float32Array.from({ length: HEARING_RATE * seconds }, (_, i) =>
    Math.sin(i / 7),
  );

afterEach(() => vi.unstubAllGlobals());

describe('Where a chat hears', () => {
  const url = 'https://r1.example';
  it('in the browser unless the server is named and asked for (§5)', () => {
    expect(hearingPlace({ language: 'en-US' })).toBe('device');
    expect(hearingPlace({ language: 'en-US', speechUrl: url })).toBe('device');
    expect(
      hearingPlace({ language: 'en-US', speechUrl: url, where: 'server' }),
    ).toBe('server');
    expect(
      hearingPlace({ language: 'de-DE', speechUrl: url, where: 'device' }),
    ).toBe('device');
    // auto: a language no model in the browser hears goes to the server.
    expect(hearingPlace({ language: 'de-DE', speechUrl: url })).toBe('server');
    expect(hearingPlace({ language: 'de-DE' })).toBe('device');
    // The person asked for their language to be detected (VO-14).
    expect(
      hearingPlace({ language: 'en-US', speechUrl: url, detect: true }),
    ).toBe('server');
  });

  it('asks consent for the server apart from the device (VO-61)', () => {
    expect(consentKeyFor('desk', 'device')).toBe('desk');
    expect(consentKeyFor('desk', 'server')).toBe('desk:server');
  });

  it('detects only when the person asked, and never once speech stays on the device', () => {
    const app: ChatVoice = {
      language: 'en-US',
      input: 'push_to_talk',
      speechUrl: 'https://r1.example',
      where: 'auto',
    };
    expect(saneVoiceSettings({ detectLanguage: 'yes' as never })).toEqual({});
    expect(voiceForPerson(app, { detectLanguage: true }).detect).toBe(true);
    const kept = voiceForPerson(app, {
      detectLanguage: true,
      onDeviceOnly: true,
    });
    expect(kept).toMatchObject({ detect: false, where: 'device' });
    expect(kept.speechUrl).toBeUndefined();
    expect(hearingPlace(kept)).toBe('device');
  });
});

describe('A recording heard on the server (VO-34)', () => {
  it('is a 16-bit mono WAV at 16 kHz', () => {
    const wav = new DataView(wavOf(Float32Array.from([0, 1, -1, 0.5])));
    const text = (at: number) =>
      String.fromCharCode(...[0, 1, 2, 3].map(i => wav.getUint8(at + i)));
    expect([text(0), text(8), text(12), text(36)]).toEqual([
      'RIFF',
      'WAVE',
      'fmt ',
      'data',
    ]);
    expect(wav.getUint16(22, true)).toBe(1);
    expect(wav.getUint32(24, true)).toBe(16000);
    expect(wav.getUint16(34, true)).toBe(16);
    expect(wav.getUint32(40, true)).toBe(8);
    expect([wav.getInt16(46, true), wav.getInt16(48, true)]).toEqual([
      32767, -32768,
    ]);
  });

  it('loads only the VAD in the page, and sends the speech with the conversation’s token', async () => {
    const finder = new AllSpeech();
    const asked: Array<{ url: string; init: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      asked.push({ url, init });
      return new Response(
        JSON.stringify({
          text: ' What is the weather like in Paris today? ',
          language: 'en-US',
          duration_s: 1,
          segments: [],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const hearing = new ServerHearing(finder, {
      speechUrl: 'https://r1.example/',
      token: 'visitor-token',
      fetcher,
    });
    expect(hearing.where).toBe('server');
    await hearing.ready('en-US');
    expect(finder.readied).toBe(1);
    // While it listens, no words: a clip model writes them at the end (VO-11).
    expect(await hearing.hearSoFar(second())).toEqual({
      text: '',
      spoke: true,
      silentMs: 400,
    });
    const heard = await hearing.hear(second(), 'en-US');
    expect(asked[0].url).toBe(
      `https://r1.example${TRANSCRIPTIONS_PATH}?language=en-US`,
    );
    const headers = new Headers(asked[0].init.headers);
    expect(headers.get('Authorization')).toBe('Bearer visitor-token');
    expect(headers.get('Content-Type')).toBe('audio/wav');
    expect((asked[0].init.body as ArrayBuffer).byteLength).toBe(
      44 + HEARING_RATE * 2,
    );
    expect(heard).toMatchObject({
      text: 'What is the weather like in Paris today?',
      metadata: {
        input: 'voice',
        language: 'en-US',
        engine: SERVER_HEARING_MODEL,
        where: 'server',
      },
      seconds: 1,
    });
  });

  it('lets Whisper find the language when the person asked (VO-14)', async () => {
    let url = '';
    const hearing = new ServerHearing(new AllSpeech(), {
      speechUrl: 'https://r1.example',
      detect: true,
      fetcher: (async (asked: string) => {
        url = asked;
        return new Response(
          JSON.stringify({ text: 'Quel temps fait-il ?', language: 'fr' }),
        );
      }) as unknown as typeof fetch,
    });
    const heard = await hearing.hear(second(), 'en-US');
    expect(url).toBe(`https://r1.example${TRANSCRIPTIONS_PATH}`);
    expect(heard?.metadata.language).toBe('fr');
  });

  it('says the service’s sentence when it refuses, and nothing for silence', async () => {
    const refusing = new ServerHearing(new AllSpeech(), {
      speechUrl: 'https://r1.example',
      fetcher: (async () =>
        new Response(
          JSON.stringify({
            detail:
              'You have used all the speech offered without an account today: sign in to be heard on Datalayer’s servers, or be heard in this browser.',
          }),
          { status: 429 },
        )) as unknown as typeof fetch,
    });
    await expect(refusing.hear(second(), 'en-US')).rejects.toThrow(
      'You have used all the speech offered without an account today',
    );
    const fetcher = vi.fn();
    const silent = new ServerHearing(
      {
        readyToFindSpeech: async () => undefined,
        findSpeech: async () => ({ speech: new Float32Array(0), silentMs: 0 }),
      },
      {
        speechUrl: 'https://r1.example',
        fetcher: fetcher as unknown as typeof fetch,
      },
    );
    expect(await silent.hear(second(), 'en-US')).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
