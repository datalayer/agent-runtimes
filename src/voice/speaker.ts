/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Answers heard, from Datalayer's speech service (VOICE.md VO-20, VO-33,
 * decision 1): each sentence is sent to ai-agents as soon as it is written
 * and played as soon as its audio arrives, one after the other, while the
 * next ones are being made. The level of what plays moves the assistant's
 * mouth (VO-23). Nothing is kept: each sentence's audio is dropped once played.
 *
 * @module voice/speaker
 */

/** The path of the syntheses on ai-agents. */
export const SYNTHESES_PATH = '/api/ai-agents/v1/speech/syntheses';

/** What the speaker is doing, for the assistant and the controls. */
export interface SpeakerState {
  /** Sound is playing. */
  speaking: boolean;
  /** The sentence being said, for the balloon (VO-26). */
  sentence?: string;
  /** Why the last sentence could not be said, in a sentence. */
  refused?: string;
}

export interface SpeakerOptions {
  /** ai-agents' origin, `https://r1.datalayer.run` or a local one. */
  speechUrl: string;
  /** The voice of the catalogue. */
  voice: string;
  language: string;
  /** The person's token, an application's principal's, or a visitor's. */
  token?: string;
  /** Called whenever the state changes. */
  onState?: (state: SpeakerState) => void;
  /** Called with how long a sentence took from asked to first sound, in ms. */
  onFirstSound?: (ms: number) => void;
  fetcher?: typeof fetch;
}

interface Queued {
  text: string;
  audio: Promise<ArrayBuffer | string>;
  asked: number;
}

/** Plays an answer's sentences, said by the speech service. */
export class ServerSpeaker {
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private buffer?: Float32Array;
  private queue: Queued[] = [];
  private playing?: AudioBufferSourceNode;
  private running = false;
  private generation = 0;
  private state: SpeakerState = { speaking: false };

  constructor(private options: SpeakerOptions) {}

  /** Change the voice, the language or the token for the sentences to come. */
  update(options: Partial<SpeakerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Must be called from a gesture once (a press, a click): a browser plays
   * nothing a page did not start from one.
   */
  unlock(): void {
    this.audio();
    void this.context?.resume();
  }

  private audio(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.context.destination);
      this.buffer = new Float32Array(this.analyser.fftSize);
    }
    return this.context;
  }

  /** How loud what plays is, between 0 and 1: what moves the mouth. */
  level(): number {
    if (!this.analyser || !this.buffer || !this.state.speaking) {
      return 0;
    }
    this.analyser.getFloatTimeDomainData(
      this.buffer as Float32Array<ArrayBuffer>,
    );
    let sum = 0;
    for (const sample of this.buffer) {
      sum += sample * sample;
    }
    return Math.min(1, Math.sqrt(sum / this.buffer.length) * 6);
  }

  private set(state: Partial<SpeakerState>): void {
    this.state = { ...this.state, ...state };
    this.options.onState?.(this.state);
  }

  /** Say a sentence after those already given. */
  say(text: string): void {
    const sentence = text.trim();
    if (!sentence) {
      return;
    }
    this.queue.push({
      text: sentence,
      audio: this.fetch(sentence),
      asked: performance.now(),
    });
    if (!this.running) {
      void this.run(this.generation);
    }
  }

  private async fetch(text: string): Promise<ArrayBuffer | string> {
    const { speechUrl, voice, language, token, fetcher = fetch } = this.options;
    try {
      const answered = await fetcher(
        `${speechUrl.replace(/\/+$/, '')}${SYNTHESES_PATH}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ text, voice, language, format: 'opus' }),
        },
      );
      if (!answered.ok) {
        const body = await answered.json().catch(() => ({}));
        return typeof body?.detail === 'string'
          ? body.detail
          : `The answer could not be spoken (${answered.status}).`;
      }
      return await answered.arrayBuffer();
    } catch {
      return 'Datalayer’s speech service could not be reached: the answer is still written here.';
    }
  }

  private async run(generation: number): Promise<void> {
    this.running = true;
    try {
      while (this.queue.length && generation === this.generation) {
        const next = this.queue.shift()!;
        const audio = await next.audio;
        if (generation !== this.generation) {
          return;
        }
        if (typeof audio === 'string') {
          // Refused: say why once, and drop what was waiting.
          this.queue = [];
          this.set({ speaking: false, sentence: undefined, refused: audio });
          return;
        }
        const context = this.audio();
        const decoded = await context.decodeAudioData(audio);
        if (generation !== this.generation) {
          return;
        }
        await new Promise<void>(resolve => {
          const source = context.createBufferSource();
          source.buffer = decoded;
          source.connect(this.analyser!);
          source.onended = () => resolve();
          this.playing = source;
          this.set({ speaking: true, sentence: next.text, refused: undefined });
          this.options.onFirstSound?.(
            Math.round(performance.now() - next.asked),
          );
          source.start();
        });
        this.playing = undefined;
      }
    } finally {
      if (generation === this.generation) {
        this.running = false;
        if (this.state.speaking) {
          this.set({ speaking: false, sentence: undefined });
        }
      }
    }
  }

  /** Stop at once: what plays and what waits (barge-in, `Esc`; VO-13). */
  stop(): void {
    this.generation += 1;
    this.queue = [];
    this.running = false;
    try {
      this.playing?.stop();
    } catch {
      // Already ended.
    }
    this.playing = undefined;
    this.set({ speaking: false, sentence: undefined });
  }

  /** Stop, and let the audio context go. */
  close(): void {
    this.stop();
    void this.context?.close();
    this.context = undefined;
  }
}
