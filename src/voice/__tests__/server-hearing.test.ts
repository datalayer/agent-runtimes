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
  STREAM_IDLE_MS,
  TRANSCRIPTIONS_PATH,
  TRANSCRIPTION_STREAM_PATH,
  hearingPlace,
  pcm16Of,
  streamUrlOf,
  type SpeechSocket,
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
    // A press heard with no look before it is sent whole, as a recording.
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

/** A WebSocket as the speech service answers it: what the page sent, and the service's words. */
class FakeSocket implements SpeechSocket {
  static opened: FakeSocket[] = [];
  readyState = 0;
  binaryType = 'blob';
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: Array<string | ArrayBuffer> = [];
  closed = false;
  constructor(readonly url: string) {
    FakeSocket.opened.push(this);
  }
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
    if (typeof data === 'string' && JSON.parse(data).type === 'end') {
      this.ended?.();
    }
  }
  close() {
    this.closed = true;
  }
  ended?: () => void;
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  say(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  first() {
    return JSON.parse(this.sent[0] as string);
  }
  sound() {
    return this.sent
      .filter((d): d is ArrayBuffer => typeof d !== 'string')
      .reduce((n, d) => n + d.byteLength, 0);
  }
}

describe('Speech heard on the server as it is said (VO-11, VO-34)', () => {
  const socket = (url: string) => new FakeSocket(url);
  afterEach(() => {
    FakeSocket.opened = [];
    vi.useRealTimers();
  });

  it('streams 16-bit PCM at 16 kHz to the stream on ai-agents’ origin', () => {
    expect(streamUrlOf('https://r1.example/')).toBe(
      `wss://r1.example${TRANSCRIPTION_STREAM_PATH}`,
    );
    expect(streamUrlOf('http://localhost:4401')).toBe(
      `ws://localhost:4401${TRANSCRIPTION_STREAM_PATH}`,
    );
    const pcm = new DataView(pcm16Of(Float32Array.from([1, -1, 0])));
    expect(pcm.byteLength).toBe(6);
    expect([pcm.getInt16(0, true), pcm.getInt16(2, true)]).toEqual([
      32767, -32768,
    ]);
  });

  it('greys the service’s partial words while the person speaks, and takes its final words', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const hearing = new ServerHearing(new AllSpeech(), {
      speechUrl: 'https://r1.example',
      token: 'person-token',
      fetcher,
      socket,
    });
    // The first look opens the stream; the token goes in its first message.
    expect(await hearing.hearSoFar(second(1), 'en-US')).toEqual({
      text: '',
      spoke: true,
      silentMs: 400,
    });
    const [ws] = FakeSocket.opened;
    expect(ws.url).toBe(`wss://r1.example${TRANSCRIPTION_STREAM_PATH}`);
    expect(ws.url).not.toContain('token');
    ws.open();
    expect(ws.first()).toEqual({
      token: 'person-token',
      language: 'en-US',
      format: 'pcm16',
    });
    // Sound captured before the service is ready waits for it, then goes once.
    expect(ws.sound()).toBe(0);
    ws.say({ type: 'ready', seconds_left: 1800 });
    expect(ws.sound()).toBe(HEARING_RATE * 2);
    ws.say({ type: 'partial', text: ' What is the weather like in ' });
    // Only what the press added since is sent; the words are the partial's.
    expect(await hearing.hearSoFar(second(2), 'en-US')).toMatchObject({
      text: 'What is the weather like in',
      spoke: true,
    });
    expect(ws.sound()).toBe(HEARING_RATE * 4);
    expect(FakeSocket.opened).toHaveLength(1);
    // The end of the press: the rest sent, `end` said, the final awaited.
    ws.ended = () =>
      ws.say({
        type: 'final',
        text: 'What is the weather like in Paris today?',
        language: 'en',
        why: 'end',
      });
    const heard = await hearing.hear(second(3), 'en-US');
    expect(ws.sound()).toBe(HEARING_RATE * 6);
    expect(heard).toMatchObject({
      text: 'What is the weather like in Paris today?',
      metadata: { input: 'voice', language: 'en', where: 'server' },
      seconds: 3,
    });
    expect(ws.closed).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('asks the stream for no language when the person asked for detection (VO-14)', async () => {
    const hearing = new ServerHearing(new AllSpeech(), {
      speechUrl: 'https://r1.example',
      detect: true,
      socket,
    });
    await hearing.hearSoFar(second(1), 'fr-FR');
    FakeSocket.opened[0].open();
    expect(FakeSocket.opened[0].first()).toMatchObject({ language: '' });
  });

  it('says the stream’s refusal in its sentence, and shows no words for silence', async () => {
    const hearing = new ServerHearing(new AllSpeech(), {
      speechUrl: 'https://r1.example',
      socket,
    });
    await hearing.hearSoFar(second(1), 'en-US');
    const ws = FakeSocket.opened[0];
    ws.open();
    ws.say({
      type: 'refused',
      detail:
        'You have used all the listening offered on Datalayer’s servers for now: you are still heard in this browser.',
    });
    await expect(hearing.hear(second(2), 'en-US')).rejects.toThrow(
      /all the listening offered/,
    );
    const quiet = new ServerHearing(
      {
        readyToFindSpeech: async () => undefined,
        findSpeech: async () => ({ speech: new Float32Array(0), silentMs: 0 }),
      },
      { speechUrl: 'https://r1.example', socket },
    );
    expect(await quiet.hearSoFar(second(1), 'en-US')).toMatchObject({
      text: '',
      spoke: false,
    });
    const silent = FakeSocket.opened[1];
    silent.open();
    silent.say({ type: 'ready' });
    silent.say({ type: 'partial', text: 'Thank you.' });
    // Whisper's words for silence are never shown, nor sent.
    expect(await quiet.hearSoFar(second(2), 'en-US')).toMatchObject({
      text: '',
    });
    expect(await quiet.hear(second(2), 'en-US')).toBeUndefined();
    expect(silent.closed).toBe(true);
  });

  it('opens a new stream for a new press, and closes one a cancelled press left', async () => {
    vi.useFakeTimers();
    const hearing = new ServerHearing(new AllSpeech(), {
      speechUrl: 'https://r1.example',
      socket,
    });
    await hearing.hearSoFar(second(2), 'en-US');
    // A shorter sound is a new press: the old stream is closed.
    await hearing.hearSoFar(second(1), 'en-US');
    expect(FakeSocket.opened).toHaveLength(2);
    expect(FakeSocket.opened[0].closed).toBe(true);
    // Nothing looked at or heard for a while: the press was cancelled.
    vi.advanceTimersByTime(STREAM_IDLE_MS + 1);
    expect(FakeSocket.opened[1].closed).toBe(true);
  });
});
