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
  /**
   * Say a long first sentence's first clause on its own (VO-52): the service
   * makes a sentence whole, in about the time its length takes, so the first
   * sound comes sooner when the first thing asked is shorter. Off for a
   * caller that follows its sentences one by one (a deck's narrator).
   */
  firstClauseFirst?: boolean;
  /**
   * Ask each sentence streamed (VO-52): the speech service says it piece by
   * piece where it pauses and sends each piece's 16-bit PCM as soon as it is
   * said, and the speaker plays the pieces as they come — the first sound
   * after the first piece, not the whole sentence. A service that answers a
   * whole sound instead is played as before.
   */
  streamed?: boolean;
  fetcher?: typeof fetch;
}

/** A sentence's sound as the service answered it: whole, or 16-bit PCM as it comes. */
type Answer =
  | { kind: 'whole'; audio: ArrayBuffer }
  | {
      kind: 'pcm';
      rate: number;
      body: ReadableStream<Uint8Array> | ArrayBuffer;
    };

/** Played as it comes: at least this much at a time, in seconds. */
const STREAMED_SLICE_SECONDS = 0.25;

interface Queued {
  text: string;
  /** Asked of the service once it is among the next `SENTENCES_AHEAD`. */
  audio?: Promise<Answer | string>;
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

/** A first sentence longer than this is said clause first (`firstClauseFirst`). */
export const FIRST_CLAUSE_SPLIT_CHARS = 60;

/** Neither part of a sentence cut at its first clause is shorter than this. */
const SHORTEST_CLAUSE_CHARS = 15;

/**
 * A sentence cut after its first clause — a comma, semicolon, colon or dash
 * followed by a space — when it is long and neither part is too short (VO-52);
 * else the sentence alone. Never cut inside a number (`1,000`).
 */
export function firstClause(sentence: string): string[] {
  if (sentence.length <= FIRST_CLAUSE_SPLIT_CHARS) {
    return [sentence];
  }
  const boundary = /[,;:\u2013\u2014]\s+/g;
  let found: RegExpExecArray | null;
  while ((found = boundary.exec(sentence)) !== null) {
    const end = found.index + 1;
    if (end < SHORTEST_CLAUSE_CHARS) {
      continue;
    }
    const rest = sentence.slice(found.index + found[0].length);
    if (rest.length < SHORTEST_CLAUSE_CHARS) {
      break;
    }
    return [sentence.slice(0, end), rest];
  }
  return [sentence];
}

/** Plays an answer's sentences, said by the speech service. */
export class ServerSpeaker {
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private gain?: GainNode;
  private buffer?: Float32Array;
  private queue: Queued[] = [];
  private playing?: AudioBufferSourceNode;
  /** The pieces of a streamed sentence scheduled to play, stopped together. */
  private scheduled: AudioBufferSourceNode[] = [];
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
    // Nothing playing or waiting: this is the first thing heard (VO-52).
    const first =
      this.options.firstClauseFirst &&
      !this.options.streamed &&
      !this.queue.length &&
      !this.playing &&
      !this.running;
    for (const part of first ? firstClause(sentence) : [sentence]) {
      this.queue.push({ text: part, asked: performance.now() });
    }
    if (!this.state.speaking) {
      // Something new to say: the last refusal is no longer the news.
      this.set({ speaking: true, refused: undefined });
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

  private async fetch(text: string): Promise<Answer | string> {
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
            ...(this.options.streamed
              ? { format: 'pcm', stream: true }
              : { format: 'opus' }),
          }),
        },
      );
      if (!answered.ok) {
        const body = await answered.json().catch(() => ({}));
        return typeof body?.detail === 'string'
          ? body.detail
          : `The answer could not be spoken (${answered.status}).`;
      }
      const kind = answered.headers.get('content-type') ?? '';
      if (kind.toLowerCase().startsWith('audio/l16')) {
        const rate =
          Number(answered.headers.get('x-speech-rate')) ||
          Number(/rate=(\d+)/i.exec(kind)?.[1]) ||
          24000;
        return {
          kind: 'pcm',
          rate,
          body: answered.body ?? (await answered.arrayBuffer()),
        };
      }
      return { kind: 'whole', audio: await answered.arrayBuffer() };
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
        if (audio.kind === 'pcm') {
          await this.playStreamed(generation, next, audio);
          continue;
        }
        const decoded = await context.decodeAudioData(audio.audio);
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

  /**
   * A sentence streamed as 16-bit PCM (VO-52): played in slices as they
   * come, each scheduled right after the last, until the last has ended.
   */
  private async playStreamed(
    generation: number,
    next: Queued,
    answer: { rate: number; body: ReadableStream<Uint8Array> | ArrayBuffer },
  ): Promise<void> {
    const context = this.audio();
    const speed = this.speed();
    if (this.gain) {
      this.gain.gain.value = this.loudness();
    }
    let at = 0;
    let first = true;
    let pending = new Uint8Array(0);
    let last: Promise<void> = Promise.resolve();
    const slice = Math.round(answer.rate * STREAMED_SLICE_SECONDS) * 2;
    const play = (bytes: Uint8Array) => {
      const samples = new Float32Array(bytes.length / 2);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
      for (let k = 0; k < samples.length; k++) {
        samples[k] = view.getInt16(k * 2, true) / 32768;
      }
      const buffer = context.createBuffer(1, samples.length, answer.rate);
      buffer.getChannelData(0).set(samples);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = speed;
      source.connect(this.analyser!);
      at = Math.max(at, context.currentTime);
      last = new Promise<void>(resolve => {
        source.onended = () => {
          this.scheduled = this.scheduled.filter(one => one !== source);
          resolve();
        };
      });
      this.scheduled.push(source);
      this.playing = source;
      if (first) {
        first = false;
        this.set({ speaking: true, sentence: next.text, refused: undefined });
        this.options.onFirstSound?.(Math.round(performance.now() - next.asked));
      }
      source.start(at);
      at += buffer.duration / speed;
    };
    const take = (chunk: Uint8Array, done: boolean) => {
      const joined = new Uint8Array(pending.length + chunk.length);
      joined.set(pending);
      joined.set(chunk, pending.length);
      pending = joined;
      while (pending.length >= slice || (done && pending.length >= 2)) {
        const size = Math.min(pending.length, Math.max(slice, 2));
        const even = size - (size % 2);
        play(pending.subarray(0, even));
        pending = pending.slice(even);
        if (done && pending.length < 2) {
          break;
        }
      }
    };
    if (answer.body instanceof ArrayBuffer) {
      take(new Uint8Array(answer.body), true);
    } else {
      const reader = answer.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (generation !== this.generation) {
          void reader.cancel().catch(() => undefined);
          return;
        }
        if (done) {
          take(new Uint8Array(0), true);
          break;
        }
        take(value, false);
      }
    }
    await last;
    this.playing = undefined;
  }

  /** Stop at once: what plays and what waits (barge-in, `Esc`; VO-13). */
  stop(): void {
    this.generation += 1;
    this.queue = [];
    this.running = false;
    for (const source of [
      ...this.scheduled,
      ...(this.playing ? [this.playing] : []),
    ]) {
      try {
        source.stop();
      } catch {
        // Already ended.
      }
    }
    this.scheduled = [];
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
