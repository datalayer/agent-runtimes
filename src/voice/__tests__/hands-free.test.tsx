/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation by voice, hands-free (VO-12, VO-13): the states,
 * the turn ended by the silence and sent by itself, the answer spoken over.
 * The microphone and the hearing are stand-ins built on the real
 * interfaces (`Capture`, `Hearing`).
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEARING_RATE, openMicrophone } from '../capture';
import { consent, consentKeyFor } from '../consent';
import {
  answerSpokenOver,
  ECHO_SHARE,
  HANDS_FREE_WORDS,
  TURN_SILENCE_MS,
  VOICE_OVER_ECHO,
  bargedIn,
  handsFreeState,
  heardOverPlayback,
  turnEnded,
} from '../handsFree';
import { BARGE_IN_POLL_MS, HandsFree } from '../HandsFree';
import { chatVoiceOf } from '../chatVoice';
import type { HeardSoFar, Hearing } from '../hearing';
import type { Transcript } from '../types';

vi.mock('../capture', async original => ({
  ...(await original<typeof import('../capture')>()),
  openMicrophone: vi.fn(),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('what hands-free is doing (VO-12)', () => {
  it('is off, paused, speaking, thinking or listening, in that order of precedence', () => {
    const off = { on: false, paused: false, speaking: true, running: true };
    expect(handsFreeState(off)).toBe('off');
    expect(handsFreeState({ ...off, on: true })).toBe('speaking');
    expect(handsFreeState({ ...off, on: true, paused: true })).toBe('paused');
    expect(
      handsFreeState({
        on: true,
        paused: false,
        speaking: false,
        running: true,
      }),
    ).toBe('thinking');
    expect(
      handsFreeState({
        on: true,
        paused: false,
        speaking: false,
        running: false,
      }),
    ).toBe('listening');
    expect(HANDS_FREE_WORDS.listening).toBe('Listening…');
  });

  it('ends a turn after the silence once the person spoke, 500 ms unless said (VO-52)', () => {
    expect(TURN_SILENCE_MS).toBe(500);
    expect(turnEnded({ spoke: true, silentMs: 499 })).toBe(false);
    expect(turnEnded({ spoke: true, silentMs: 500 })).toBe(true);
    expect(turnEnded({ spoke: false, silentMs: 5000 })).toBe(false);
    expect(turnEnded({ spoke: true, silentMs: 400 }, 300)).toBe(true);
  });

  it('is barged in when the person speaks while the agent thinks or speaks (VO-13)', () => {
    const spoke = { spoke: true, silentMs: 0 };
    expect(bargedIn('speaking', spoke)).toBe(true);
    expect(bargedIn('thinking', spoke)).toBe(true);
    expect(bargedIn('listening', spoke)).toBe(false);
    expect(bargedIn('speaking', { spoke: false, silentMs: 0 })).toBe(false);
  });

  it("counts speech over the answer only above what the answer's own sound can leave in the microphone (VO-13)", () => {
    const spoke = { spoke: true, silentMs: 0 };
    expect(ECHO_SHARE).toBe(0.6);
    expect(VOICE_OVER_ECHO).toBe(0.08);
    // Nothing plays: any speech is the person's.
    expect(heardOverPlayback({ microphone: 0.05, playback: 0 })).toBe(true);
    // The answer plays at 0.5: up to 0.3 may be its echo; 0.38 is the person.
    expect(heardOverPlayback({ microphone: 0.3, playback: 0.5 })).toBe(false);
    expect(heardOverPlayback({ microphone: 0.37, playback: 0.5 })).toBe(false);
    expect(heardOverPlayback({ microphone: 0.38, playback: 0.5 })).toBe(true);
    // A share measured on a laptop's own speakers (VO-52) is given in.
    expect(heardOverPlayback({ microphone: 0.3, playback: 0.5 }, 0.4)).toBe(
      true,
    );
    expect(
      bargedIn('speaking', spoke, { microphone: 0.3, playback: 0.5 }),
    ).toBe(false);
    expect(
      bargedIn('speaking', spoke, { microphone: 0.6, playback: 0.5 }),
    ).toBe(true);
    // Thinking, nothing plays yet: the levels are not asked.
    expect(
      bargedIn('thinking', spoke, { microphone: 0.01, playback: 0.9 }),
    ).toBe(true);
    expect(bargedIn('listening', spoke, { microphone: 0.9, playback: 0 })).toBe(
      false,
    );
  });

  it('implies the answers heard as they are written, from an Appspec', () => {
    const voice = chatVoiceOf(
      {
        enabled: true,
        input: 'hands_free',
        output: 'on_request',
        voice: '',
        language: 'en-US',
        where: 'auto',
      },
      { speechUrl: 'https://r1.example', consentKey: 'desk' },
    );
    expect(voice).toMatchObject({ input: 'hands_free', output: 'always' });
  });
});

/** A hearing whose words are whatever the test says next (`Hearing`). */
class StandInHearing implements Hearing {
  readonly where = 'device' as const;
  heard: HeardSoFar = { text: '', spoke: false, silentMs: 0 };
  whole = 'What is the weather like in Paris today?';
  readied = 0;
  async ready() {
    this.readied += 1;
  }
  async hearSoFar(): Promise<HeardSoFar> {
    return this.heard;
  }
  async hear(audio: Float32Array, language: string): Promise<Transcript> {
    return {
      text: this.whole,
      metadata: {
        input: 'voice',
        language,
        engine: 'stand-in',
        where: 'device',
      },
      seconds: audio.length / HEARING_RATE,
      ms: 1,
    };
  }
}

/** How loud the stand-in microphone is: 0.3 unless a test says otherwise. */
const micLevel = { now: 0.3 };

function microphone() {
  const capture = {
    open: true,
    level: () => micLevel.now,
    peek: () => new Float32Array(HEARING_RATE),
    stop: async () => {
      capture.open = false;
      return new Float32Array(HEARING_RATE);
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

describe('Talk with it (VO-12, VO-13)', () => {
  let root: Root;
  let container: HTMLDivElement;
  const opened: ReturnType<typeof microphone>[] = [];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    opened.length = 0;
    vi.mocked(openMicrophone).mockImplementation(async () => {
      const mic = microphone();
      opened.push(mic);
      return mic;
    });
    consent(consentKeyFor('desk', 'device'));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    micLevel.now = 0.3;
  });

  const state = () =>
    container
      .querySelector('[data-hands-free-state]')
      ?.getAttribute('data-hands-free-state');

  it('listens on, sends a turn after the silence, shows every state, and is paused by Esc', async () => {
    const hearing = new StandInHearing();
    const sent: string[] = [];
    const interim: string[] = [];
    let running = false;
    let speaking = false;
    const draw = () =>
      act(() =>
        root.render(
          <HandsFree
            hearing={hearing}
            language="en-US"
            consentKey="desk"
            turnSilenceMs={300}
            send={text => sent.push(text)}
            onInterim={text => interim.push(text)}
            running={running}
            speaking={speaking}
          />,
        ),
      );
    draw();
    expect(container.textContent).toContain('Talk with it');
    expect(state()).toBeUndefined();
    act(() => {
      (
        container.querySelector('[data-hands-free-toggle]') as HTMLElement
      ).click();
    });
    await until(() => opened.length === 1);
    expect(state()).toBe('listening');
    expect(hearing.readied).toBe(1);
    // The person speaks: the words come as they are heard (VO-11).
    hearing.heard = { text: 'What is the', spoke: true, silentMs: 0 };
    await until(() => interim.includes('What is the'));
    expect(sent).toEqual([]);
    // Then is silent for the turn's silence: the turn is sent by itself.
    hearing.heard = { text: 'What is the weather', spoke: true, silentMs: 300 };
    await until(() => sent.length === 1);
    expect(sent).toEqual(['What is the weather like in Paris today?']);
    expect(interim[interim.length - 1]).toBe('');
    // The microphone is opened anew for the next turn.
    await until(() => opened.length === 2);
    expect(opened[0].open).toBe(false);
    // The agent answers: Thinking, then Speaking.
    hearing.heard = { text: '', spoke: false, silentMs: 0 };
    running = true;
    draw();
    expect(state()).toBe('thinking');
    speaking = true;
    draw();
    expect(state()).toBe('speaking');
    expect(container.textContent).toContain('Speaking…');
    // Esc pauses it; Resume listens again.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(state()).toBe('paused');
    act(() => {
      (
        container.querySelector('[data-hands-free-resume]') as HTMLElement
      ).click();
    });
    expect(state()).toBe('speaking');
    act(() => {
      (
        container.querySelector('[data-hands-free-toggle]') as HTMLElement
      ).click();
    });
    expect(state()).toBeUndefined();
    expect(opened.every(mic => !mic.open)).toBe(true);
  });

  it('stops the voice and the run when the person speaks over the agent, and marks the answer (VO-13)', async () => {
    const hearing = new StandInHearing();
    const stopped = { voice: 0, run: 0, marked: 0 };
    const draw = (running: boolean, speaking: boolean) =>
      act(() =>
        root.render(
          <HandsFree
            hearing={hearing}
            language="en-US"
            consentKey="desk"
            send={() => undefined}
            running={running}
            speaking={speaking}
            onStopSpeaking={() => (stopped.voice += 1)}
            onStopRun={() => (stopped.run += 1)}
            onInterrupted={() => (stopped.marked += 1)}
          />,
        ),
      );
    draw(false, false);
    act(() => {
      (
        container.querySelector('[data-hands-free-toggle]') as HTMLElement
      ).click();
    });
    await until(() => opened.length === 1);
    // The agent speaks while still writing: the microphone is opened anew
    // so what it holds is the person's.
    draw(true, true);
    await until(() => opened.length === 2);
    expect(state()).toBe('speaking');
    // Nothing said: nothing stopped.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
    });
    expect(stopped).toEqual({ voice: 0, run: 0, marked: 0 });
    // The person speaks over it.
    hearing.heard = { text: 'Wait', spoke: true, silentMs: 0 };
    await until(() => stopped.voice >= 1);
    expect(stopped.run).toBeGreaterThanOrEqual(1);
    expect(stopped.marked).toBeGreaterThanOrEqual(1);
  });

  it('once the person spoke, looks for the end of the turn often, by the VAD alone (VO-52)', async () => {
    class QuickHearing extends StandInHearing {
      quiet = 0;
      transcribed = 0;
      async hearSoFar(): Promise<HeardSoFar> {
        this.transcribed += 1;
        return this.heard;
      }
      async quietSoFar(): Promise<HeardSoFar> {
        this.quiet += 1;
        return { ...this.heard, text: '' };
      }
    }
    const hearing = new QuickHearing();
    const sent: string[] = [];
    act(() =>
      root.render(
        <HandsFree
          hearing={hearing}
          language="en-US"
          consentKey="desk"
          send={text => sent.push(text)}
        />,
      ),
    );
    act(() => {
      (
        container.querySelector('[data-hands-free-toggle]') as HTMLElement
      ).click();
    });
    await until(() => opened.length === 1);
    hearing.heard = { text: 'What is', spoke: true, silentMs: 0 };
    await until(() => hearing.transcribed >= 1);
    // Spoke: looked at often without the words, the words now and then.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 600));
    });
    expect(hearing.quiet).toBeGreaterThanOrEqual(2);
    hearing.heard = { text: 'What is', spoke: true, silentMs: 600 };
    const quietAt = Date.now();
    await until(() => sent.length === 1);
    expect(Date.now() - quietAt).toBeLessThan(BARGE_IN_POLL_MS + 300);
  });

  it('while it answers, looks for the person by the VAD alone, often, over the last moment (VO-52)', async () => {
    class QuickHearing extends StandInHearing {
      looked: number[] = [];
      transcribed = 0;
      async hearSoFar(): Promise<HeardSoFar> {
        this.transcribed += 1;
        return this.heard;
      }
      async spokeSoFar(audio: Float32Array): Promise<boolean> {
        this.looked.push(audio.length);
        return this.heard.spoke;
      }
    }
    const hearing = new QuickHearing();
    const stopped = { voice: 0 };
    const draw = (running: boolean, speaking: boolean) =>
      act(() =>
        root.render(
          <HandsFree
            hearing={hearing}
            language="en-US"
            consentKey="desk"
            send={() => undefined}
            running={running}
            speaking={speaking}
            onStopSpeaking={() => (stopped.voice += 1)}
          />,
        ),
      );
    draw(false, false);
    act(() => {
      (
        container.querySelector('[data-hands-free-toggle]') as HTMLElement
      ).click();
    });
    await until(() => opened.length === 1);
    draw(true, true);
    await until(() => opened.length === 2);
    const transcribedBefore = hearing.transcribed;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 700));
    });
    // Several quick looks in what was one look before, none transcribed,
    // each over at most the last second and a half.
    expect(hearing.looked.length).toBeGreaterThanOrEqual(3);
    expect(hearing.transcribed).toBe(transcribedBefore);
    expect(Math.max(...hearing.looked)).toBeLessThanOrEqual(HEARING_RATE * 1.5);
    hearing.heard = { text: '', spoke: true, silentMs: 0 };
    const spoke = Date.now();
    await until(() => stopped.voice >= 1);
    expect(Date.now() - spoke).toBeLessThan(BARGE_IN_POLL_MS + 250);
  });

  it("does not take the answer's own sound for the person while it plays, and stops for the person's voice over it (VO-13)", async () => {
    const hearing = new StandInHearing();
    const stopped = { voice: 0, run: 0, marked: 0 };
    const playback = { now: 0.6 };
    const draw = (running: boolean, speaking: boolean) =>
      act(() =>
        root.render(
          <HandsFree
            hearing={hearing}
            language="en-US"
            consentKey="desk"
            send={() => undefined}
            running={running}
            speaking={speaking}
            playbackLevel={() => playback.now}
            onStopSpeaking={() => (stopped.voice += 1)}
            onStopRun={() => (stopped.run += 1)}
            onInterrupted={() => (stopped.marked += 1)}
          />,
        ),
      );
    draw(false, false);
    act(() => {
      (
        container.querySelector('[data-hands-free-toggle]') as HTMLElement
      ).click();
    });
    await until(() => opened.length === 1);
    draw(false, true);
    await until(() => opened.length === 2);
    expect(state()).toBe('speaking');
    // The VAD finds speech, but the microphone (0.3) is no louder than the
    // answer at 0.6 can leave in it (0.44): its echo, not the person.
    hearing.heard = { text: 'the weather', spoke: true, silentMs: 0 };
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 800));
    });
    expect(stopped).toEqual({ voice: 0, run: 0, marked: 0 });
    expect(state()).toBe('speaking');
    // The person speaks up over it.
    micLevel.now = 0.7;
    await until(() => stopped.voice >= 1);
    expect(stopped.marked).toBeGreaterThanOrEqual(1);
  });

  it('asks for the microphone first, in the device’s sentence, and listens once said yes', async () => {
    window.localStorage.clear();
    const hearing = new StandInHearing();
    act(() =>
      root.render(
        <HandsFree
          hearing={hearing}
          language="en-US"
          consentKey="desk"
          send={() => undefined}
        />,
      ),
    );
    act(() => {
      (
        container.querySelector('[data-hands-free-toggle]') as HTMLElement
      ).click();
    });
    expect(container.querySelector('[data-hands-free-consent]')).not.toBeNull();
    expect(container.textContent).toContain('transcribed on this device');
    expect(opened.length).toBe(0);
    act(() => {
      (
        container.querySelector('[data-hands-free-consent-yes]') as HTMLElement
      ).click();
    });
    await until(() => opened.length === 1);
    expect(state()).toBe('listening');
  });
});

describe('answerSpokenOver (VO-13)', () => {
  it('is the agent’s answer to the last turn, written or being said', () => {
    const turn = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant' },
      { id: 'u2', role: 'user' },
      { id: 'a2', role: 'assistant' },
    ];
    expect(answerSpokenOver(turn)).toBe('a2');
    // Answered in two messages: the last is the one being said.
    expect(answerSpokenOver([...turn, { id: 'a3', role: 'assistant' }])).toBe(
      'a3',
    );
  });

  it('marks nothing before the agent answered the turn', () => {
    expect(
      answerSpokenOver([
        { id: 'a1', role: 'assistant' },
        { id: 'u2', role: 'user' },
      ]),
    ).toBeUndefined();
    expect(answerSpokenOver([])).toBeUndefined();
  });
});
