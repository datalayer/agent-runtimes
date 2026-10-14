/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The microphone in the composer, as people expect it (VOICE.md VO-10,
 * VO-11): clicked, it listens, the words go in the box as they are heard,
 * and it stops at a second click or once the person stops speaking; held,
 * it stops when let go. Never sent: the box is the person's. And a chat's
 * voice from its spec, its answers said by the speech service.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceHearing } from '../hearing';
import { HEARING_RATE, MicrophoneRefused, openMicrophone } from '../capture';
import { consent } from '../consent';
import { VoiceInput } from '../VoiceInput';
import { ComposerVoice, spokenOf } from '../ComposerVoice';
import {
  DATALAYER_SPEECH_MODELS_URL,
  DATALAYER_VOICE_ENGINES,
  chatVoiceOf,
  settledVoice,
} from '../chatVoice';
import { useVoiceSpeaker, type VoiceSpeaker } from '../useVoiceSpeaker';
import { SYNTHESES_PATH } from '../speaker';
import type { Transcript, TransformersModule, VadModule } from '../types';
import type { AppVoiceSpec } from '../../types/agentspecs';

vi.mock('../capture', async original => ({
  ...(await original<typeof import('../capture')>()),
  openMicrophone: vi.fn(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * transformers.js and vad-web, of their published shapes: the speech ends a
 * second before what was heard does, and each look hears one word more.
 */
function engines(words: string[]) {
  let heard = 0;
  const transformers: TransformersModule = {
    env: {
      allowLocalModels: true,
      allowRemoteModels: false,
      remoteHost: '',
      remotePathTemplate: '',
      useBrowserCache: false,
      fetch: async () => new Response(''),
      backends: { onnx: { versions: { web: '1.31.0' }, wasm: {} } },
    },
    pipeline: async () => async () => {
      heard = Math.min(heard + 1, words.length);
      return { text: ` ${words.slice(0, heard).join(' ')} ` };
    },
  };
  const vad: VadModule = {
    NonRealTimeVAD: {
      new: async () => ({
        run: async function* (audio: Float32Array) {
          const end = audio.length - HEARING_RATE;
          if (end > HEARING_RATE * 0.25) {
            yield {
              audio: audio.slice(0, end),
              start: 0,
              end: (end / HEARING_RATE) * 1000,
            };
          }
        },
      }),
    },
  };
  return { transformers: async () => transformers, vad: async () => vad };
}

/** Two seconds heard, the last of them silent; closed when stopped. */
function microphone() {
  const audio = new Float32Array(HEARING_RATE * 2);
  const capture = {
    open: true,
    level: () => 0.3,
    peek: () => audio,
    stop: async () => {
      capture.open = false;
      return audio;
    },
    cancel: () => {
      capture.open = false;
    },
  };
  return capture;
}

async function until(check: () => boolean, ms = 4000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > ms) {
      throw new Error('Never came.');
    }
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
  }
}

function press(button: Element, type: 'pointerdown' | 'pointerup') {
  button.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }));
}

describe('what was heard so far (VO-11)', () => {
  it('gives the words heard, and how long it has been silent since', async () => {
    const hearing = new DeviceHearing(
      'https://models.example/speech',
      engines(['Open', 'the', 'notebook.']),
    );
    const so = await hearing.hearSoFar(
      new Float32Array(HEARING_RATE * 3),
      'en-US',
    );
    expect(so).toEqual({ text: 'Open', spoke: true, silentMs: 1000 });
    // Nothing said yet: no words, no silence counted.
    expect(
      await hearing.hearSoFar(new Float32Array(HEARING_RATE), 'en-US'),
    ).toEqual({ text: '', spoke: false, silentMs: 0 });
  });
});

describe('the microphone in the composer (VO-10, VO-11)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let capture: ReturnType<typeof microphone>;
  const interim: string[] = [];
  const transcripts: Transcript[] = [];

  beforeEach(() => {
    interim.length = 0;
    transcripts.length = 0;
    consent('listening-test');
    capture = microphone();
    vi.mocked(openMicrophone).mockReset();
    vi.mocked(openMicrophone).mockResolvedValue(capture);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function draw(silenceMs = 800) {
    const hearing = new DeviceHearing(
      'https://models.example/speech',
      engines(['Open', 'the', 'notebook.']),
    );
    act(() => {
      root.render(
        <VoiceInput
          hearing={hearing}
          language="en-US"
          consentKey="listening-test"
          silenceMs={silenceMs}
          onInterim={words => interim.push(words)}
          onTranscript={transcript => transcripts.push(transcript)}
        />,
      );
    });
    return container.querySelector('[data-voice-mic]')!;
  }

  const state = () =>
    container
      .querySelector('[data-voice-input]')!
      .getAttribute('data-voice-input');

  it('clicked, listens and writes the words as they come, then stops once the person stops speaking', async () => {
    const mic = draw();
    await act(async () => {
      press(mic, 'pointerdown');
      press(mic, 'pointerup');
    });
    await until(() => state() === 'listening');
    // Recording, and said so: red, pressed, in words.
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    expect(mic.getAttribute('aria-label')).toBe('Listening — click to stop');
    expect(container.textContent).toContain(
      'click the microphone or stop speaking to stop',
    );
    // A second of silence after the speech, more than 800 ms: it stops itself.
    await until(() => transcripts.length === 1);
    expect(interim[0]).toBe('Open');
    expect(transcripts[0].text).toBe('Open the');
    expect(transcripts[0].metadata.where).toBe('device');
    expect(capture.open).toBe(false);
    expect(state()).toBe('idle');
    expect(mic.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicked again, stops at once', async () => {
    const mic = draw(60_000);
    await act(async () => {
      press(mic, 'pointerdown');
      press(mic, 'pointerup');
    });
    await until(() => state() === 'listening');
    await act(async () => {
      press(mic, 'pointerdown');
      press(mic, 'pointerup');
    });
    await until(() => transcripts.length === 1);
    expect(capture.open).toBe(false);
  });

  it('held, keeps listening through a silence, and stops when let go', async () => {
    const mic = draw();
    await act(async () => {
      press(mic, 'pointerdown');
    });
    await until(() => state() === 'listening');
    expect(mic.getAttribute('aria-label')).toBe('Listening — let go to stop');
    // Two looks at what was heard: the words written, still listening.
    await until(() => interim.length >= 2);
    expect(state()).toBe('listening');
    expect(capture.open).toBe(true);
    await act(async () => {
      press(mic, 'pointerup');
    });
    await until(() => transcripts.length === 1);
    expect(capture.open).toBe(false);
  });

  it('cancelled with Esc, gives the box back what it held', async () => {
    const mic = draw(60_000);
    await act(async () => {
      press(mic, 'pointerdown');
      press(mic, 'pointerup');
    });
    await until(() => state() === 'listening');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(state()).toBe('idle');
    expect(interim[interim.length - 1]).toBe('');
    expect(transcripts).toHaveLength(0);
  });

  it('says so in a sentence when the microphone is refused', async () => {
    vi.mocked(openMicrophone).mockRejectedValue(
      new MicrophoneRefused(
        'The microphone was not allowed: allow it for this page to talk, or type.',
      ),
    );
    const mic = draw();
    await act(async () => {
      press(mic, 'pointerdown');
      press(mic, 'pointerup');
    });
    await until(() => !!container.querySelector('[data-voice-problem]'));
    expect(
      container.querySelector('[data-voice-problem]')!.getAttribute('role'),
    ).toBe('alert');
    expect(container.textContent).toContain('The microphone was not allowed');
    expect(state()).toBe('idle');
  });
});

describe('the composer a host holds (VO-10, VO-27)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    consent('composer-test');
    vi.mocked(openMicrophone).mockReset();
    vi.mocked(openMicrophone).mockResolvedValue(microphone());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function draw(sendWhatISay: boolean, speaking = false) {
    const box: string[] = [];
    const spoken: unknown[] = [];
    const sent: string[] = [];
    const stopped: number[] = [];
    act(() => {
      root.render(
        <ComposerVoice
          voice={{
            ...settledVoice(
              {
                language: 'en-US',
                input: 'push_to_talk',
                consentKey: 'composer-test',
                sendWhatISay,
                silenceMs: 800,
              },
              {},
            ),
            engines: engines(['Open', 'the', 'notebook.']),
          }}
          input="Please"
          setInput={text => box.push(text)}
          onSpoken={metadata => spoken.push(metadata)}
          send={text => sent.push(text)}
          speaking={speaking}
          onStopSpeaking={() => stopped.push(1)}
        />,
      );
    });
    return {
      mic: container.querySelector('[data-voice-mic]')!,
      box,
      spoken,
      sent,
      stopped,
    };
  }

  it('offers “Stop speaking” while the agent speaks, and stops its voice when the microphone opens', async () => {
    const { mic, spoken, stopped } = draw(false, true);
    const stop = container.querySelector('[data-voice-stop]');
    expect(stop).not.toBeNull();
    act(() => {
      (stop as HTMLElement).click();
    });
    expect(stopped).toHaveLength(1);
    await act(async () => {
      press(mic, 'pointerdown');
      press(mic, 'pointerup');
    });
    expect(stopped).toHaveLength(2);
    await until(() => spoken.length === 1);
  });

  it('offers no “Stop speaking” while the agent is silent', () => {
    draw(false, false);
    expect(container.querySelector('[data-voice-stop]')).toBeNull();
  });

  it('writes the words after what the box held, and leaves them there to send', async () => {
    const { mic, box, spoken, sent } = draw(false);
    await act(async () => {
      press(mic, 'pointerdown');
      press(mic, 'pointerup');
    });
    await until(() => spoken.length === 1);
    expect(box[0]).toBe('Please Open');
    expect(box[box.length - 1]).toBe('Please Open the');
    expect(spokenOf(spoken[0])).toEqual(spoken[0]);
    expect(sent).toEqual([]);
  });

  it('sends at once with “send what I say”, the box given back', async () => {
    const { mic, box, sent } = draw(true);
    await act(async () => {
      press(mic, 'pointerdown');
      press(mic, 'pointerup');
    });
    await until(() => sent.length === 1);
    expect(sent).toEqual(['Open the']);
    expect(box[box.length - 1]).toBe('Please');
  });

  it('knows a spoken message’s metadata riding on a run, and nothing else', () => {
    expect(
      spokenOf({
        input: 'voice',
        language: 'en',
        engine: 'm',
        where: 'device',
      }),
    ).toBeDefined();
    expect(spokenOf({ input: 'text' })).toBeUndefined();
    expect(spokenOf(undefined)).toBeUndefined();
  });
});

describe('a chat’s voice from its spec (VO-41, VO-49)', () => {
  const spec = (more: Partial<AppVoiceSpec> = {}): AppVoiceSpec => ({
    enabled: true,
    input: 'push_to_talk',
    output: 'on_request',
    voice: '',
    language: '',
    where: 'auto',
    ...more,
  });
  const place = { speechUrl: 'https://r1.example', consentKey: 'app-1' };

  it('is none unless said', () => {
    expect(chatVoiceOf(undefined, place)).toBeUndefined();
    expect(chatVoiceOf(spec({ enabled: false }), place)).toBeUndefined();
    expect(
      chatVoiceOf(spec({ input: 'off', output: 'off' }), place),
    ).toBeUndefined();
  });

  it('reads the models from Datalayer’s CDN, in the language’s voice', () => {
    const voice = chatVoiceOf(spec({ language: 'fr-FR' }), place)!;
    expect(voice).toMatchObject({
      language: 'fr-FR',
      input: 'push_to_talk',
      output: 'on_request',
      voice: 'kokoro-ff-siwis',
      modelsUrl: 'https://models-speech.datalayer.tech',
      speechUrl: 'https://r1.example',
      consentKey: 'app-1',
    });
    expect(voice.engines).toBe(DATALAYER_VOICE_ENGINES);
  });

  it('refuses answers heard with no speech service', () => {
    expect(() => chatVoiceOf(spec(), { consentKey: 'app-1' })).toThrow(
      'gave no address',
    );
    expect(() =>
      settledVoice({ language: 'en-US', input: 'off', output: 'always' }),
    ).toThrow('speechUrl is missing');
  });

  it('is the person’s where they chose (VO-30): their voice and pace, or nothing sent', () => {
    const given = {
      language: 'en-US',
      input: 'push_to_talk' as const,
      output: 'always' as const,
      speechUrl: 'https://r1.example',
      token: 'tok',
    };
    expect(
      settledVoice(given, { voice: 'kokoro-bf-emma', rate: 1.25 }),
    ).toMatchObject({ voice: 'kokoro-bf-emma', rate: 1.25, output: 'always' });
    // Kept on the device: the microphone still listens, nothing is said.
    expect(settledVoice(given, { onDeviceOnly: true })).toMatchObject({
      input: 'push_to_talk',
      output: 'off',
      speechUrl: undefined,
      token: undefined,
    });
  });

  it('as a chat prop, needs only a language and the microphone', () => {
    expect(
      settledVoice({ language: 'en-US', input: 'push_to_talk' }),
    ).toMatchObject({
      output: 'off',
      voice: 'kokoro-af-heart',
      modelsUrl: DATALAYER_SPEECH_MODELS_URL,
      silenceMs: 1500,
    });
  });
});

describe('a chat’s answers said by the speech service (VO-21, VO-33)', () => {
  it('asks datalayer-speech’s syntheses for each sentence read aloud, with its voice and token', async () => {
    class StandInContext {
      destination = {};
      createAnalyser() {
        return { fftSize: 0, connect: () => undefined };
      }
      createGain() {
        return { gain: { value: 1 }, connect: () => undefined };
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', StandInContext);
    const asked: Array<{ url: string; body: unknown; auth: string | null }> =
      [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        asked.push({
          url,
          body: JSON.parse(String(init?.body)),
          auth: new Headers(init?.headers).get('Authorization'),
        });
        return new Response(
          JSON.stringify({ detail: 'Speech is over its hour for you.' }),
          { status: 429 },
        );
      }),
    );
    let speaker: VoiceSpeaker | undefined;
    function Host() {
      speaker = useVoiceSpeaker(
        settledVoice({
          language: 'en-GB',
          input: 'off',
          output: 'on_request',
          speechUrl: 'https://r1.example/',
          token: 'tok',
        }),
      );
      return null;
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<Host />));
    expect(speaker?.speaker).toBeDefined();
    await act(async () => {
      speaker!.read('The report is ready. It is **long**.');
    });
    await until(() => !!speaker?.state.refused);
    expect(asked[0]).toEqual({
      url: `https://r1.example${SYNTHESES_PATH}`,
      body: {
        text: 'The report is ready.',
        voice: 'kokoro-bf-emma',
        language: 'en-GB',
        format: 'opus',
      },
      auth: 'Bearer tok',
    });
    // A refusal is said once, in the service's words.
    expect(speaker!.state.refused).toBe('Speech is over its hour for you.');
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it('has no speaker while answers are not heard', () => {
    let speaker: VoiceSpeaker | undefined;
    function Host() {
      speaker = useVoiceSpeaker(
        settledVoice({ language: 'en-US', input: 'push_to_talk' }),
      );
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Host />));
    expect(speaker?.speaker).toBeUndefined();
    act(() => root.unmount());
  });
});
