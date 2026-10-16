/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hearing on Datalayer's servers (VO-34, VO-14): what was said
 * in one press, kept to its speech by Silero VAD in the page, then sent as a
 * WAV recording to the speech service's `POST /speech/transcriptions`, where
 * Whisper hears it — small for a spoken turn, large-v3-turbo past one
 * (decision 17) — in any language it knows, and finding
 * the language itself when the person asks for that (detection, VO-14). The
 * sound is held in the request only: the service keeps neither it nor the
 * words (VO-60).
 *
 * Used where the application's voice says `where: server`, where it says
 * `auto` and no model in the browser hears the language, and where the
 * person asked for their language to be detected — never when they chose to
 * keep speech on the device.
 *
 * While the person speaks, the words come too (VO-11): the first look at
 * what was heard so far opens `WS /speech/transcriptions/stream` (the token
 * in its first message, VO-37), the sound is sent as it is captured, 16-bit
 * PCM at 16 kHz, and the service's partial words are what was heard so far,
 * greyed in the composer until final. At the end of the press the stream is
 * told so and its final words are the transcript. A press heard without a
 * look before it (a short one) is sent whole as a recording instead.
 *
 * @module voice/serverHearing
 */

import { transcriberFor } from '../specs/voices';
import { HEARING_RATE } from './capture';
import type { Hearing, HearingProgress, HeardSoFar } from './hearing';
import type { Transcript } from './types';

/** Where the speech service hears a recording, on ai-agents' host. */
export const TRANSCRIPTIONS_PATH = '/api/ai-agents/v1/speech/transcriptions';

/** Where the speech service hears speech as it is said. */
export const TRANSCRIPTION_STREAM_PATH =
  '/api/ai-agents/v1/speech/transcriptions/stream';

/** A stream no look or hearing has fed for this long is closed: its press was cancelled. */
export const STREAM_IDLE_MS = 3000;

/** How long the final words of a stream are waited for. */
export const STREAM_FINAL_MS = 60_000;

/**
 * How much of the sound before a stream the service ended for its silence
 * (with no words) is sent again to the next: a word begun at the cut is
 * heard whole.
 */
export const STREAM_LOOKBACK_SAMPLES = HEARING_RATE / 2;

/** The model the speech service hears with (agentspecs' catalogue). */
export const SERVER_HEARING_MODEL = 'whisper-large-v3-turbo';

/** The shortest speech worth hearing, in samples: a word said alone. */
const SHORTEST = HEARING_RATE * 0.2;

/** Where a chat's voice hears: in the browser, or on Datalayer's servers. */
export type HearingPlace = 'device' | 'server';

/** The speech service refused a press, in its own sentence (a limit, a visitor's day). */
export class ServerRefused extends Error {}

/** What decides where a chat's voice hears. */
export interface HearingAsked {
  language: string;
  /** The application's `interface.voice.where`; `auto` when unsaid. */
  where?: 'auto' | 'device' | 'server';
  /** The person asked for their language to be detected (VO-14). */
  detect?: boolean;
  /** The speech service; none, and everything is heard in the browser. */
  speechUrl?: string;
}

/**
 * Where a chat's voice hears: in the browser unless the speech service
 * is named and the person asked for detection, the application says
 * `server`, or it says `auto` and no model in the browser hears the language.
 */
export function hearingPlace(voice: HearingAsked): HearingPlace {
  if (!voice.speechUrl) {
    return 'device';
  }
  if (voice.detect || voice.where === 'server') {
    return 'server';
  }
  if (voice.where === 'device') {
    return 'device';
  }
  return transcriberFor(voice.language) ? 'device' : 'server';
}

/** Mono samples at 16 kHz as a 16-bit PCM WAV file: what the service reads. */
export function wavOf(samples: Float32Array, rate = HEARING_RATE): ArrayBuffer {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(at + i, value.charCodeAt(i));
    }
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      44 + i * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    );
  }
  return bytes;
}

/** What finds the speech in what was heard: the browser's VAD (`DeviceHearing`). */
export interface SpeechFinder {
  readyToFindSpeech(progress?: HearingProgress): Promise<void>;
  findSpeech(
    audio: Float32Array,
  ): Promise<{ speech: Float32Array; silentMs: number }>;
}

export interface ServerHearingOptions {
  /** ai-agents' origin, where the speech service is. */
  speechUrl: string;
  /** The token the conversation speaks with: the person's, a visitor's, an embed's. */
  token?: string;
  /** Let Whisper find the language (VO-14), rather than tell it. */
  detect?: boolean;
  fetcher?: typeof fetch;
  /** Opens a WebSocket; the browser's own unless a test gives one. */
  socket?: (url: string) => SpeechSocket;
}

/** What `ServerHearing` needs of a WebSocket. */
export interface SpeechSocket {
  readonly readyState: number;
  binaryType: string;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string | ArrayBuffer): void;
  close(code?: number): void;
}

/** 16 kHz samples in [-1, 1] as little-endian 16-bit PCM: what a `pcm16` stream takes. */
export function pcm16Of(samples: Float32Array): ArrayBuffer {
  const bytes = new ArrayBuffer(samples.length * 2);
  const view = new DataView(bytes);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytes;
}

/** The ws(s) address of the stream on ai-agents' origin. */
export function streamUrlOf(speechUrl: string): string {
  return `${speechUrl.replace(/\/+$/, '').replace(/^http/, 'ws')}${TRANSCRIPTION_STREAM_PATH}`;
}

interface StreamFinal {
  text: string;
  language: string;
  /** Why the service ended it: `end`, `silence`, a limit. */
  why: string;
}

/**
 * One press heard as it is said: the sound sent as it comes, the service's
 * partial words kept, its final words awaited at the end.
 */
class PressStream {
  /** Samples of the press sent so far. */
  sent = 0;
  /** The newest partial words. */
  partial = '';
  /** Why the service refused, in its sentence. */
  refused?: string;
  private socket: SpeechSocket;
  private ready = false;
  private queued: Array<string | ArrayBuffer> = [];
  private final?: StreamFinal;
  private waiting?: (final: StreamFinal | undefined) => void;
  private closed = false;
  private idle?: ReturnType<typeof setTimeout>;

  constructor(
    open: (url: string) => SpeechSocket,
    speechUrl: string,
    first: { token?: string; language?: string },
    from = 0,
  ) {
    // The press's sound from `from` on: what came before was heard already.
    this.sent = from;
    this.socket = open(streamUrlOf(speechUrl));
    this.socket.binaryType = 'arraybuffer';
    this.socket.onopen = () => {
      this.socket.send(
        JSON.stringify({
          token: first.token ?? '',
          language: first.language ?? '',
          format: 'pcm16',
        }),
      );
    };
    this.socket.onmessage = event => {
      let said: Record<string, unknown>;
      try {
        said = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (said.type === 'ready') {
        this.ready = true;
        for (const chunk of this.queued.splice(0)) {
          this.socket.send(chunk);
        }
      } else if (said.type === 'partial' && typeof said.text === 'string') {
        this.partial = said.text.trim();
      } else if (said.type === 'final') {
        this.final = {
          text: typeof said.text === 'string' ? said.text.trim() : '',
          language: typeof said.language === 'string' ? said.language : '',
          why: typeof said.why === 'string' ? said.why : '',
        };
        this.settle();
      } else if (said.type === 'refused') {
        this.refused =
          typeof said.detail === 'string' && said.detail
            ? said.detail
            : "What you said could not be heard on Datalayer's servers.";
        this.settle();
      }
    };
    this.socket.onclose = () => {
      this.closed = true;
      this.settle();
    };
    this.socket.onerror = () => undefined;
    this.touch();
  }

  /**
   * The service ended it for its silence, with no words, while the press
   * goes on: a person who waits before speaking (hands-free's microphone
   * stays open) is heard by the next stream.
   */
  get silencedEmpty(): boolean {
    return (
      this.final !== undefined &&
      this.final.why === 'silence' &&
      !this.final.text
    );
  }

  /** Send what the press added since the last call. */
  feed(audio: Float32Array): void {
    this.touch();
    if (audio.length <= this.sent || this.closed) {
      return;
    }
    const chunk = pcm16Of(audio.subarray(this.sent));
    this.sent = audio.length;
    if (this.ready) {
      this.socket.send(chunk);
    } else {
      this.queued.push(chunk);
    }
  }

  /** The end of the press: the final words, or `undefined` when the stream ended without them. */
  finish(audio: Float32Array): Promise<StreamFinal | undefined> {
    this.feed(audio);
    if (this.final || this.closed || this.refused) {
      return Promise.resolve(this.final);
    }
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        this.waiting = undefined;
        this.close();
        resolve(undefined);
      }, STREAM_FINAL_MS);
      this.waiting = final => {
        clearTimeout(timer);
        resolve(final);
      };
      const end = JSON.stringify({ type: 'end' });
      if (this.ready) {
        this.socket.send(end);
      } else {
        // Said once the service is ready, after the sound queued before it.
        this.queued.push(end);
      }
    });
  }

  close(): void {
    if (this.idle) {
      clearTimeout(this.idle);
    }
    this.closed = true;
    try {
      this.socket.close(1000);
    } catch {
      // Already closed.
    }
    this.settle();
  }

  private touch(): void {
    if (this.idle) {
      clearTimeout(this.idle);
    }
    this.idle = setTimeout(() => {
      if (!this.waiting) {
        this.close();
      }
    }, STREAM_IDLE_MS);
  }

  private settle(): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    waiting?.(this.final);
    if (this.final || this.refused) {
      if (this.idle) {
        clearTimeout(this.idle);
      }
    }
  }
}

/**
 * Hears on Datalayer's servers: the browser's VAD finds the speech and when
 * it stopped; Whisper, on the speech service, writes it.
 */
export class ServerHearing implements Hearing {
  readonly where = 'server' as const;

  constructor(
    private readonly finder: SpeechFinder,
    private readonly options: ServerHearingOptions,
  ) {}

  /** Only the VAD loads in the page: the words are written on the server. */
  ready(_language: string, progress?: HearingProgress): Promise<void> {
    return this.finder.readyToFindSpeech(progress);
  }

  /** The press being heard as it is said, while one is. */
  private press?: PressStream;

  /** The press's stream, opened anew when a new press began (its sound is shorter). */
  private streamFor(
    audio: Float32Array,
    language: string,
  ): PressStream | undefined {
    const open =
      this.options.socket ??
      (typeof WebSocket === 'undefined'
        ? undefined
        : (url: string) => new WebSocket(url) as unknown as SpeechSocket);
    if (!open) {
      return undefined;
    }
    let from = 0;
    if (this.press && audio.length < this.press.sent) {
      this.press.close();
      this.press = undefined;
    } else if (this.press?.silencedEmpty) {
      // Ended by the service for its silence, nothing said: a new stream
      // hears the rest of the press, from just before the cut.
      from = Math.max(0, this.press.sent - STREAM_LOOKBACK_SAMPLES);
      this.press.close();
      this.press = undefined;
    }
    if (!this.press) {
      this.press = new PressStream(
        open,
        this.options.speechUrl,
        {
          token: this.options.token,
          language: this.options.detect ? '' : language,
        },
        from,
      );
    }
    return this.press;
  }

  /**
   * Whether speech was found and how long it has been silent, and the words
   * the speech service heard so far: the sound goes to its stream as it comes.
   */
  async hearSoFar(audio: Float32Array, language = ''): Promise<HeardSoFar> {
    const { speech, silentMs } = await this.finder.findSpeech(audio);
    const spoke = speech.length >= SHORTEST;
    const press = this.streamFor(audio, language);
    press?.feed(audio);
    return { text: spoke ? (press?.partial ?? '') : '', spoke, silentMs };
  }

  async hear(
    audio: Float32Array,
    language: string,
  ): Promise<Transcript | undefined> {
    const started = performance.now();
    if (this.press?.silencedEmpty && audio.length >= this.press.sent) {
      // Cut for its silence before the person spoke: heard by a new stream.
      this.streamFor(audio, language);
    }
    const press =
      this.press && audio.length >= this.press.sent ? this.press : undefined;
    if (this.press && !press) {
      this.press.close();
    }
    this.press = undefined;
    const { speech } = await this.finder.findSpeech(audio);
    if (speech.length < SHORTEST) {
      press?.close();
      return undefined;
    }
    if (press) {
      const final = await press.finish(audio);
      press.close();
      if (press.refused) {
        throw new ServerRefused(press.refused);
      }
      if (!final) {
        throw new Error(
          "What you said could not be heard on Datalayer's servers: the stream ended before its words.",
        );
      }
      return final.text
        ? {
            text: final.text,
            metadata: {
              input: 'voice',
              language: final.language || language,
              engine: SERVER_HEARING_MODEL,
              where: 'server',
            },
            seconds: audio.length / HEARING_RATE,
            ms: Math.round(performance.now() - started),
          }
        : undefined;
    }
    const { speechUrl, token, detect, fetcher = fetch } = this.options;
    const query = detect ? '' : `?language=${encodeURIComponent(language)}`;
    const answered = await fetcher(
      `${speechUrl.replace(/\/+$/, '')}${TRANSCRIPTIONS_PATH}${query}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: wavOf(speech),
      },
    );
    const body = (await answered.json().catch(() => ({}))) as {
      text?: unknown;
      language?: unknown;
      detail?: unknown;
    };
    if (!answered.ok) {
      throw new ServerRefused(
        typeof body.detail === 'string' && body.detail
          ? body.detail
          : `What you said could not be heard on Datalayer's servers (${answered.status}).`,
      );
    }
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return undefined;
    }
    return {
      text,
      metadata: {
        input: 'voice',
        language:
          typeof body.language === 'string' && body.language
            ? body.language
            : language,
        engine: SERVER_HEARING_MODEL,
        where: 'server',
      },
      seconds: speech.length / HEARING_RATE,
      ms: Math.round(performance.now() - started),
    };
  }
}

/** Said when the device's model did not load and the server will hear instead. */
export const MOVED_TO_SERVER =
  "This device could not load its model: what you say will be heard on Datalayer's servers instead. Press the microphone again to agree.";

/**
 * `where: auto`: each press heard on the device when a model there
 * hears the language and loads, on the speech service otherwise.
 *
 * The device's model failing to load moves the hearing to the server, and
 * the press is refused in a sentence so that the server's own consent is
 * asked at the next one. The server refusing a press — a limit, a visitor's
 * day spent — moves it back to the device when a model there hears the
 * language, and the press is heard there: the sound then stays in the page.
 */
export class AutoHearing implements Hearing {
  private place: HearingPlace;
  /** The device's model did not load: it is not tried again on this page. */
  private deviceBroken = false;

  constructor(
    private readonly device: Hearing,
    private readonly server: Hearing,
    language: string,
    private readonly hearsHere: (language: string) => boolean = language =>
      Boolean(transcriberFor(language)),
  ) {
    this.place = hearsHere(language) ? 'device' : 'server';
  }

  get where(): HearingPlace {
    return this.place;
  }

  private get current(): Hearing {
    return this.place === 'device' ? this.device : this.server;
  }

  async ready(language: string, progress?: HearingProgress): Promise<void> {
    if (
      this.place === 'server' &&
      !this.deviceBroken &&
      this.hearsHere(language)
    ) {
      // A language the device hears, chosen after a server-only one.
      this.place = 'device';
    }
    if (this.place === 'device') {
      try {
        await this.device.ready(language, progress);
        return;
      } catch {
        this.place = 'server';
        this.deviceBroken = true;
        throw new Error(MOVED_TO_SERVER);
      }
    }
    await this.server.ready(language, progress);
  }

  hearSoFar(audio: Float32Array, language: string): Promise<HeardSoFar> {
    return this.current.hearSoFar(audio, language);
  }

  async hear(
    audio: Float32Array,
    language: string,
  ): Promise<Transcript | undefined> {
    if (this.place === 'device') {
      return this.device.hear(audio, language);
    }
    try {
      return await this.server.hear(audio, language);
    } catch (error) {
      if (
        !(error instanceof ServerRefused) ||
        this.deviceBroken ||
        !this.hearsHere(language)
      ) {
        throw error;
      }
      this.place = 'device';
      await this.device.ready(language);
      return this.device.hear(audio, language);
    }
  }
}
