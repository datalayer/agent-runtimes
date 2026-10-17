/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Answers heard, from Datalayer's speech service (VO-20, VO-33):
 * each sentence is sent to ai-agents as soon as it is written
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
  /**
   * Sound is playing, or a sentence given is being made into sound to play
   * next: from the moment there is something to say, so that hands-free
   * reads speech in that moment as the person speaking over it (VO-12,
   * VO-13). What moves the mouth is the sound's level, and the sentence
   * marked is the one playing.
   */
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
  /**
   * The person's token, an application's principal's, a visitor's or an
   * embed's — whose deployment is the one it names (VO-19).
   */
  token?: string;
  /**
   * How fast it speaks, as a multiplier of the voice's own pace (VO-25,
   * VO-30). Applied here rather than asked of the service: `POST
   * /speech/syntheses` takes a text, a voice, a language and a format, and
   * no speed. Playing a buffer faster lifts its pitch a little; a speed the
   * engine itself honoured would not, and is where this belongs once the
   * service takes one.
   */
  rate?: number;
  /** How loud it is, 0 (silent) to 1 (the voice's own) (VO-25, VO-30). */
  volume?: number;
  /** Called whenever the state changes. */
  onState?: (state: SpeakerState) => void;
  /** Called with how long a sentence took from asked to first sound, in ms. */
  onFirstSound?: (ms: number) => void;
  fetcher?: typeof fetch;
}

interface Queued {
  text: string;
  /** Asked of the service once it is among the next `SENTENCES_AHEAD`. */
  audio?: Promise<ArrayBuffer | string>;
  asked: number;
}

/**
 * How many sentences are asked of the speech service ahead of the one
 * playing: enough that the next is ready when one ends, and under the calls
 * it lets a person have at once (`DATALAYER_SPEECH_CONCURRENT`, 4) — asked
 * all at once, a long answer's fifth sentence was refused (seen on :3063,
 * 14 October 2026).
 */
export const SENTENCES_AHEAD = 2;

/** Plays an answer's sentences, said by the speech service. */
export class ServerSpeaker {
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private gain?: GainNode;
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
      // The gain sits after the analyser, so the mouth keeps moving to what
      // the voice says rather than to how loud the person set it — a muted
      // answer still shows the assistant speaking (VO-23).
      this.gain = this.context.createGain();
      this.analyser.connect(this.gain);
      this.gain.connect(this.context.destination);
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

  /** The speaking speed asked for, within what is intelligible. */
  private speed(): number {
    const rate = this.options.rate;
    return typeof rate === 'number' && Number.isFinite(rate)
      ? Math.min(2, Math.max(0.5, rate))
      : 1;
  }

  /** The loudness asked for, between silence and the voice's own. */
  private loudness(): number {
    const volume = this.options.volume;
    return typeof volume === 'number' && Number.isFinite(volume)
      ? Math.min(1, Math.max(0, volume))
      : 1;
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
    this.queue.push({ text: sentence, asked: performance.now() });
    if (!this.state.speaking) {
      this.set({ speaking: true });
    }
    this.askAhead();
    if (!this.running) {
      void this.run(this.generation);
    }
  }

  /** Ask the service for the next sentences, `SENTENCES_AHEAD` at most. */
  private askAhead(): void {
    for (const queued of this.queue.slice(0, SENTENCES_AHEAD)) {
      if (!queued.audio) {
        queued.audio = this.fetch(queued.text);
      }
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
          body: JSON.stringify({
            text,
            voice,
            language,
            format: 'opus',
          }),
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
        this.askAhead();
        const next = this.queue[0];
        const audio = await next.audio!;
        if (generation !== this.generation) {
          return;
        }
        if (typeof audio === 'string') {
          // Refused: say why once, and drop what was waiting.
          this.queue = [];
          this.set({ speaking: false, sentence: undefined, refused: audio });
          return;
        }
        // Played now: the one after it is asked for.
        this.queue.shift();
        this.askAhead();
        const context = this.audio();
        const decoded = await context.decodeAudioData(audio);
        if (generation !== this.generation) {
          return;
        }
        await new Promise<void>(resolve => {
          const source = context.createBufferSource();
          source.buffer = decoded;
          source.playbackRate.value = this.speed();
          if (this.gain) {
            this.gain.gain.value = this.loudness();
          }
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
