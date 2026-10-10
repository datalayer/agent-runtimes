/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Voice in the page (VOICE.md V1): answers cut into what is said, models
 * read only as pinned, hearing with a stand-in built on the real packages'
 * shapes, the speaker's refusals, and the assistant speaking with its voice.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { SentenceCutter, plainWords } from '../sentences';
import { PinRefused, pinOf, pinnedFetch, sha256Hex } from '../pinned';
import { DeviceHearing, joinSegments, runtimeFiles } from '../hearing';
import { resample } from '../capture';
import { ServerSpeaker, SYNTHESES_PATH } from '../speaker';
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
    expect(pinOf(base, `${base}/silero-vad/${pin.path}`)).toEqual(pin);
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
    await expect(fetchPinned(`${base}/silero-vad/${pin.path}`)).rejects.toThrow(
      'not the file the voice catalogue pins',
    );
    // The runtime's own files are under the origin and pinned by version.
    expect(
      (await fetchPinned(`${base}/onnxruntime-web/1.30.0/x.wasm`)).ok,
    ).toBe(true);
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
      )(`${base}/whisper-base/${file.path}`);
      expect(await answered.text()).toBe('{"a":1}');
    } finally {
      Object.assign(file, original);
    }
  });

  it('serves onnxruntime’s own files beside the models', () => {
    expect(runtimeFiles(`${base}/`, '1.31.0').wasm).toBe(
      `${base}/onnxruntime-web/1.31.0/ort-wasm-simd-threaded.asyncify.wasm`,
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
  const vad: VadModule = {
    NonRealTimeVAD: {
      new: async () => ({
        run: async function* (audio: Float32Array) {
          // Speech in the middle of what was heard, silence around it.
          yield {
            audio: audio.slice(1600, audio.length - 1600),
            start: 100,
            end: 900,
          };
        },
      }),
    },
  };
  return {
    engines: { transformers: async () => transformers, vad: async () => vad },
    env,
    asked,
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
      model: 'whisper-base',
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
    await vi.waitFor(() => expect(states.length).toBeGreaterThan(0));
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
