/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Voice in the page (V1): answers cut into what is said, models
 * read only as pinned, hearing with a stand-in built on the real packages'
 * shapes, the speaker's refusals, and the assistant speaking with its voice.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { SentenceCutter, plainWords } from '../sentences';
import {
  PinRefused,
  modelFolder,
  pinOf,
  pinnedFetch,
  sha256Hex,
} from '../pinned';
import { DeviceHearing, joinSegments, runtimeFiles } from '../hearing';
import { resample } from '../capture';
import {
  FIRST_CLAUSE_SPLIT_CHARS,
  SENTENCES_AHEAD,
  ServerSpeaker,
  SYNTHESES_PATH,
  firstClause,
} from '../speaker';
import { answerText, useSpokenAnswers } from '../useSpokenAnswers';
import { assistantStateOf } from '../../chat/assistant/state';
import { mouthOpening } from '../../chat/assistant/AssistantStage';
import {
  SPEECH_MODEL_CATALOGUE,
  transcriberFor,
  voiceFor,
} from '../../specs/voices';
import type { TransformersModule, VadModule } from '../types';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('an answer, as it is heard (VO-20)', () => {
  it('is read as plain words', () => {
    expect(
      plainWords(
        '## Result\n\nSee [the report](https://x.io/r) and **this**:\n\n```py\nprint(1)\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nDone.',
      ),
    ).toBe('Result. See the report and this: A code block. A table. Done.');
    // A rule between parts is not said; a list's dash still goes (H-21).
    expect(plainWords('Found it.\n\n---\n\n- one\n\n***\nDone.')).toBe(
      'Found it. one Done.',
    );
  });

  it('is cut into sentences as it is written, never in the middle of a number', () => {
    const cutter = new SentenceCutter();
    expect(cutter.feed('The total is 3')).toEqual([]);
    expect(cutter.feed('The total is 3.5 million dollars')).toEqual([]);
    expect(
      cutter.feed('The total is 3.5 million dollars. It grew. Next'),
    ).toEqual(['The total is 3.5 million dollars.']);
    // A short sentence waits to be said with the next.
    expect(
      cutter.feed(
        'The total is 3.5 million dollars. It grew. Next year it shrinks. Then',
      ),
    ).toEqual(['It grew. Next year it shrinks.']);
    expect(
      cutter.end(
        'The total is 3.5 million dollars. It grew. Next year it shrinks. Then bye',
      ),
    ).toEqual(['Then bye']);
  });
});

describe('the models, from Datalayer’s origin and as pinned (VO-49)', () => {
  const base = 'https://models.example/speech';
  const pin = SPEECH_MODEL_CATALOGUE['silero-vad'].files[0];

  it('knows the pin of a model’s file under the origin', () => {
    // Kept under its provider, as Datalayer's storage keeps it (VO-48).
    expect(pinOf(base, `${base}/snakers4/silero-vad/${pin.path}`)).toEqual(pin);
    expect(modelFolder('kokoro-82m')).toBe('hexgrad/kokoro-82m');
    // Without its provider, or under another, it is no pinned file.
    expect(pinOf(base, `${base}/silero-vad/${pin.path}`)).toBeUndefined();
    expect(
      pinOf(base, `${base}/openai/silero-vad/${pin.path}`),
    ).toBeUndefined();
    expect(
      pinOf(base, `${base}/onnxruntime-web/1.30.0/ort.wasm`),
    ).toBeUndefined();
  });

  it('refuses another origin, and a file whose hash is not the pin', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const fetchPinned = pinnedFetch(base, fetcher as unknown as typeof fetch);
    await expect(
      fetchPinned('https://huggingface.co/x/config.json'),
    ).rejects.toBeInstanceOf(PinRefused);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      fetchPinned(`${base}/snakers4/silero-vad/${pin.path}`),
    ).rejects.toThrow('not the file the voice catalogue pins');
    // The runtime's own files are under the origin and pinned by version.
    expect(
      (await fetchPinned(`${base}/onnxruntime-web/1.30.0/x.wasm`)).ok,
    ).toBe(true);
  });

  it('answers transformers.js’s first-byte probe, and refuses any other part of a file', async () => {
    // Seen on :3063, 14 October 2026: transformers.js 4 asks `bytes=0-0` of
    // each file before reading it, and the 206 was refused as a bad pin.
    const fetcher = vi.fn(
      async () =>
        new Response(new Uint8Array([123]), {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-0/1290' },
        }),
    );
    const fetchPinned = pinnedFetch(base, fetcher as unknown as typeof fetch);
    const url = `${base}/snakers4/silero-vad/${pin.path}`;
    const probe = await fetchPinned(url, {
      headers: { Range: 'bytes=0-0' },
    });
    expect(probe.status).toBe(206);
    expect(probe.headers.get('Content-Range')).toBe('bytes 0-0/1290');
    await expect(
      fetchPinned(url, { headers: { Range: 'bytes=0-1000' } }),
    ).rejects.toThrow('read whole and checked');
  });

  it('answers a file whose hash is the pin', async () => {
    const bytes = new TextEncoder().encode('{"a":1}');
    const hash = await sha256Hex(bytes.buffer as ArrayBuffer);
    const model = SPEECH_MODEL_CATALOGUE['whisper-base'];
    const file = model.files[0];
    const original = { ...file };
    Object.assign(file, { sha256: hash, size: bytes.byteLength });
    try {
      const answered = await pinnedFetch(
        base,
        (async () => new Response(bytes)) as unknown as typeof fetch,
      )(`${base}/openai/whisper-base/${file.path}`);
      expect(await answered.text()).toBe('{"a":1}');
    } finally {
      Object.assign(file, original);
    }
  });

  it('serves onnxruntime’s own files beside the models, in its version’s folder', () => {
    // A folder: each build of onnxruntime-web names its own file there —
    // transformers.js's asyncify, vad-web's jsep.
    expect(runtimeFiles(`${base}/`, '1.31.0')).toBe(
      `${base}/onnxruntime-web/1.31.0/`,
    );
  });
});

/** A stand-in for transformers.js and vad-web, of their published shapes. */
function engines(heard: string) {
  const env: TransformersModule['env'] = {
    allowLocalModels: true,
    allowRemoteModels: false,
    remoteHost: 'https://huggingface.co/',
    remotePathTemplate: '{model}/resolve/{revision}/',
    useBrowserCache: false,
    fetch: async () => new Response(''),
    backends: { onnx: { versions: { web: '1.31.0' }, wasm: {} } },
  };
  const asked: Array<{
    model: string;
    options: Record<string, unknown> | undefined;
  }> = [];
  const transformers: TransformersModule = {
    env,
    pipeline:
      async (_task, model) =>
      async (_audio: Float32Array, options?: Record<string, unknown>) => {
        asked.push({ model, options });
        return { text: ` ${heard} ` };
      },
  };
  const vadUrls: string[] = [];
  const vad: VadModule = {
    NonRealTimeVAD: {
      new: async options => {
        vadUrls.push(options.modelURL);
        return {
          run: async function* (audio: Float32Array) {
            // Speech in the middle of what was heard, silence around it.
            yield {
              audio: audio.slice(1600, audio.length - 1600),
              start: 100,
              end: 900,
            };
          },
        };
      },
    },
  };
  return {
    engines: { transformers: async () => transformers, vad: async () => vad },
    env,
    asked,
    vadUrls,
  };
}

describe('hearing on the device (VO-10, VO-14)', () => {
  it('chooses Moonshine for English and Whisper for French', () => {
    expect(transcriberFor('en-US')?.id).toBe('moonshine-tiny-en');
    expect(transcriberFor('fr-FR')?.id).toBe('whisper-base');
    expect(transcriberFor('de-DE')).toBeUndefined();
    expect(voiceFor('fr-FR')?.id).toBe('kokoro-ff-siwis');
  });

  it('reads its models from Datalayer’s origin, and marks what it heard as said on the device', async () => {
    const stand = engines('Open the notebook.');
    const hearing = new DeviceHearing(
      'https://models.example/speech',
      stand.engines,
    );
    const transcript = await hearing.hear(new Float32Array(16000), 'en-US');
    expect(stand.env.remoteHost).toBe('https://models.example/speech/');
    expect(stand.env.remotePathTemplate).toBe('{model}/');
    expect(stand.env.allowLocalModels).toBe(false);
    expect(stand.env.backends.onnx.wasm?.wasmPaths).toEqual(
      runtimeFiles('https://models.example/speech', '1.31.0'),
    );
    expect(transcript?.text).toBe('Open the notebook.');
    // Each model read under its provider, as the store keeps it (VO-48).
    expect(stand.asked[0].model).toBe('usefulsensors/moonshine-tiny-en');
    expect(stand.vadUrls[0]).toBe(
      `https://models.example/speech/snakers4/silero-vad/${SPEECH_MODEL_CATALOGUE['silero-vad'].files[0].path}`,
    );
    expect(transcript?.metadata).toEqual({
      input: 'voice',
      language: 'en-US',
      engine: 'moonshine-tiny-en',
      where: 'device',
    });
  });

  it('tells Whisper the language, and hears nothing in silence', async () => {
    const stand = engines('Bonjour.');
    const hearing = new DeviceHearing(
      'https://models.example/speech',
      stand.engines,
    );
    await hearing.hear(new Float32Array(16000), 'fr-FR');
    expect(stand.asked[0]).toEqual({
      model: 'openai/whisper-base',
      options: { language: 'french', task: 'transcribe' },
    });
    // Less than a fifth of a second of speech: nothing was said.
    expect(
      await hearing.hear(new Float32Array(3200 + 1000), 'fr-FR'),
    ).toBeUndefined();
    expect(() => hearing.modelFor('de-DE')).toThrow(
      'Nothing in this browser hears de-DE',
    );
  });

  it('joins the speech found and brings audio to 16 kHz', () => {
    expect(
      joinSegments([new Float32Array([1, 2]), new Float32Array([3])]),
    ).toEqual(new Float32Array([1, 2, 3]));
    expect(resample(new Float32Array(48000), 48000).length).toBe(16000);
  });
});

describe('the speaker (VO-33)', () => {
  it('asks the speech service for each sentence, and says a refusal once', async () => {
    const states: unknown[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        voice: 'kokoro-af-heart',
        language: 'en-US',
        format: 'opus',
      });
      return new Response(
        JSON.stringify({
          detail: 'Answers are not spoken without an account yet.',
        }),
        { status: 429 },
      );
    });
    const speaker = new ServerSpeaker({
      speechUrl: 'https://r1.example/',
      voice: 'kokoro-af-heart',
      language: 'en-US',
      token: 'tok',
      fetcher: fetcher as unknown as typeof fetch,
      onState: state => states.push(state),
    });
    speaker.say('Hello there, how are you?');
    speaker.say('This one is dropped.');
    // Speaking from the first sentence given, before its sound comes (VO-12).
    expect(states[0]).toEqual({ speaking: true });
    await vi.waitFor(() => expect(states.at(-1)?.refused).toBeTruthy());
    expect(fetcher.mock.calls[0][0]).toBe(
      `https://r1.example${SYNTHESES_PATH}`,
    );
    expect((fetcher.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer tok',
    });
    expect(states.at(-1)).toEqual({
      speaking: false,
      sentence: undefined,
      refused: 'Answers are not spoken without an account yet.',
    });
    expect(speaker.level()).toBe(0);

    // Said again: speaking, and the old refusal is no longer reported.
    speaker.say('A new sentence to say.');
    expect(states.at(-1)).toMatchObject({ speaking: true });
    expect(states.at(-1)?.refused).toBeUndefined();
  });
});

describe('a long answer, said (VO-33, VO-39)', () => {
  it('asks the next sentences only, never more at once than the service lets a person have', async () => {
    const answers: Array<(response: Response) => void> = [];
    const fetcher = vi.fn(
      () => new Promise<Response>(resolve => answers.push(resolve)),
    );
    const states: Array<{ refused?: string }> = [];
    const speaker = new ServerSpeaker({
      speechUrl: 'https://r1.example',
      voice: 'kokoro-af-heart',
      language: 'en-US',
      fetcher: fetcher as unknown as typeof fetch,
      onState: state => states.push(state),
    });
    for (const n of [1, 2, 3, 4, 5, 6]) {
      speaker.say(`Sentence ${n}.`);
    }
    expect(SENTENCES_AHEAD).toBeLessThan(4);
    expect(fetcher).toHaveBeenCalledTimes(SENTENCES_AHEAD);
    // Refused: said once, and nothing more is asked.
    answers[0](
      new Response(JSON.stringify({ detail: 'No.' }), { status: 429 }),
    );
    await vi.waitFor(() => expect(states.at(-1)?.refused).toBe('No.'));
    expect(fetcher).toHaveBeenCalledTimes(SENTENCES_AHEAD);
  });
});

describe('the first sound, sooner (VO-52)', () => {
  const LONG =
    'The Eiffel Tower was built for the 1889 World’s Fair, and it was the tallest structure in the world for forty years.';

  it('cuts a long sentence after its first clause, never in a number nor into a sliver', () => {
    expect(LONG.length).toBeGreaterThan(FIRST_CLAUSE_SPLIT_CHARS);
    expect(firstClause(LONG)).toEqual([
      'The Eiffel Tower was built for the 1889 World’s Fair,',
      'and it was the tallest structure in the world for forty years.',
    ]);
    expect(firstClause('One moment, please.')).toEqual(['One moment, please.']);
    const number =
      'It costs 1,000,000 euros to repaint the whole tower every seven years or so.';
    expect(firstClause(number)).toEqual([number]);
    const sliver =
      'Yes, the tower is repainted by hand about every seven years by a crew.';
    expect(firstClause(sliver)).toEqual([sliver]);
  });

  it('asks the first clause on its own for the chat, and never for a caller following its sentences', () => {
    const asked = (firstClauseFirst: boolean) => {
      const fetcher = vi.fn(() => new Promise<Response>(() => undefined));
      const speaker = new ServerSpeaker({
        speechUrl: 'https://r1.example',
        voice: 'kokoro-af-heart',
        language: 'en-US',
        fetcher: fetcher as unknown as typeof fetch,
        firstClauseFirst,
      });
      speaker.say(LONG);
      speaker.say(LONG);
      return fetcher.mock.calls.map(
        call =>
          JSON.parse(String((call as unknown as [string, RequestInit])[1].body))
            .text,
      );
    };
    expect(asked(true)).toEqual([
      'The Eiffel Tower was built for the 1889 World’s Fair,',
      'and it was the tallest structure in the world for forty years.',
    ]);
    expect(asked(false)).toEqual([LONG, LONG]);
  });
});

describe('a sentence streamed, played as it comes (VO-52)', () => {
  it('asks it streamed, and plays each slice of 16-bit PCM right after the last as it arrives', async () => {
    const started: Array<{ at: number; seconds: number }> = [];
    const sources: Array<{ stop: () => void; onended?: () => void }> = [];
    class StandInContext {
      currentTime = 0;
      destination = {};
      createAnalyser() {
        return { fftSize: 0, connect: () => undefined };
      }
      createGain() {
        return { gain: { value: 1 }, connect: () => undefined };
      }
      createBuffer(_channels: number, length: number, rate: number) {
        const data = new Float32Array(length);
        return { duration: length / rate, getChannelData: () => data };
      }
      createBufferSource() {
        const source = {
          buffer: undefined as { duration: number } | undefined,
          playbackRate: { value: 1 },
          onended: undefined as undefined | (() => void),
          connect: () => undefined,
          start: (at: number) => {
            started.push({ at, seconds: source.buffer!.duration });
            setTimeout(() => source.onended?.(), 0);
          },
          stop: () => undefined,
        };
        sources.push(source);
        return source;
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', StandInContext);
    const rate = 24000;
    // Two pieces, a quarter second and a fifth: sent as they are said.
    const pieces = [
      new Uint8Array(rate * 0.25 * 2),
      new Uint8Array(rate * 0.2 * 2),
    ];
    const asked: unknown[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      asked.push(JSON.parse(String(init?.body)));
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const piece of pieces) {
            controller.enqueue(piece);
          }
          controller.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': `audio/L16;rate=${rate};channels=1`,
          'X-Speech-Rate': String(rate),
        },
      });
    });
    const first: number[] = [];
    const speaker = new ServerSpeaker({
      speechUrl: 'https://r1.example',
      voice: 'kokoro-af-heart',
      language: 'en-US',
      fetcher: fetcher as unknown as typeof fetch,
      streamed: true,
      firstClauseFirst: true,
      onFirstSound: ms => first.push(ms),
    });
    speaker.say(
      'The Eiffel Tower was built for the 1889 World’s Fair, and it was the tallest structure in the world.',
    );
    await vi.waitFor(() => expect(started.length).toBe(2));
    // Asked whole, streamed: the service cuts it where it pauses.
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ format: 'pcm', stream: true });
    // Each slice right after the last.
    expect(started[0].seconds).toBeCloseTo(0.25, 5);
    expect(started[1].at).toBeCloseTo(started[0].at + 0.25, 5);
    expect(first).toHaveLength(1);
    speaker.stop();
    vi.unstubAllGlobals();
  });
});

describe('the answers of a conversation, heard as they are written', () => {
  function Speaking({
    items,
    writing,
    said,
  }: {
    items: unknown[];
    writing: boolean;
    said: string[];
  }) {
    useSpokenAnswers(items, writing, true, sink(said));
    return null;
  }
  const sinks = new Map<
    string[],
    { say: (s: string) => void; stop: () => void }
  >();
  function sink(said: string[]) {
    if (!sinks.has(said)) {
      sinks.set(said, { say: s => said.push(s), stop: () => undefined });
    }
    return sinks.get(said)!;
  }

  it('reads the newest answer as it grows, and not what was there before', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const said: string[] = [];
    const old = {
      id: 'a0',
      role: 'assistant',
      content: 'An old answer. Not read again.',
    };
    act(() =>
      root.render(<Speaking items={[old]} writing={false} said={said} />),
    );
    const asked = { id: 'u1', role: 'user', content: 'Hi' };
    const growing = (content: string) => [
      old,
      asked,
      { id: 'a1', role: 'assistant', content },
    ];
    act(() =>
      root.render(
        <Speaking
          items={growing('The report is ready. I')}
          writing
          said={said}
        />,
      ),
    );
    expect(said).toEqual(['The report is ready.']);
    act(() =>
      root.render(
        <Speaking
          items={growing('The report is ready. I sent it to Ana.')}
          writing={false}
          said={said}
        />,
      ),
    );
    expect(said).toEqual(['The report is ready.', 'I sent it to Ana.']);
    act(() => root.unmount());
  });

  it('reads only the agent’s own words', () => {
    expect(
      answerText({ role: 'assistant', toolName: 'search', content: 'x' }),
    ).toBeUndefined();
    expect(answerText({ role: 'user', content: 'x' })).toBeUndefined();
    expect(
      answerText({
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi' }],
      }),
    ).toBe('Hi');
  });
});

describe('the assistant speaks with its voice (VO-22, VO-23)', () => {
  it('speaks while its voice is heard, even once the words have arrived', () => {
    expect(assistantStateOf('idle', { voicing: true })).toBe('speaking');
    expect(assistantStateOf('idle', { speaking: true })).toBe('idle');
    expect(assistantStateOf('waiting', { voicing: true })).toBe('waiting');
  });

  it('opens its mouth in three openings with the level', () => {
    expect([0, 0.1, 0.4, 0.9].map(mouthOpening)).toEqual([0, 1, 2, 3]);
  });
});
