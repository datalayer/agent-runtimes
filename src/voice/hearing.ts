/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Hearing on the device (VOICE.md VO-10, VO-14, decision 3): what was said
 * in one press, kept to its speech by Silero VAD and transcribed by the
 * catalogue's model for the language — Moonshine for English, Whisper for
 * French — in the page, with transformers.js. The audio never leaves the
 * browser, and is forgotten once heard.
 *
 * @module voice/hearing
 */

import { SPEECH_MODEL_CATALOGUE, transcriberFor } from '../specs/voices';
import { pinnedBytes, pinnedFetch, downloadSize } from './pinned';
import { HEARING_RATE } from './capture';
import type {
  SpeechDtype,
  SpeechRecognizer,
  Transcript,
  VoiceEngines,
} from './types';

/** How far the first use has come: bytes loaded of the bytes to load. */
export type HearingProgress = (loaded: number, total: number) => void;

/** A language no device model hears. */
export class NotHeardHere extends Error {}

/** Where onnxruntime-web's own files are served, beside the models. */
export function runtimeFiles(modelsUrl: string, version: string) {
  const root = `${modelsUrl.replace(/\/+$/, '')}/onnxruntime-web/${version}/`;
  return {
    mjs: `${root}ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${root}ort-wasm-simd-threaded.asyncify.wasm`,
  };
}

/** Joins the speech a VAD found, in order. */
export function joinSegments(segments: Float32Array[]): Float32Array {
  const out = new Float32Array(segments.reduce((n, s) => n + s.length, 0));
  let at = 0;
  for (const segment of segments) {
    out.set(segment, at);
    at += segment.length;
  }
  return out;
}

/**
 * The page's hearing: loaded once, on first use, from Datalayer's origin
 * (`modelsUrl`), every file checked against its pin.
 */
export class DeviceHearing {
  private recognizers = new Map<string, Promise<SpeechRecognizer>>();
  private vad?: Promise<{
    run: (
      audio: Float32Array,
      rate: number,
    ) => AsyncIterable<{ audio: Float32Array }>;
  }>;

  constructor(
    private readonly modelsUrl: string,
    private readonly engines: VoiceEngines,
  ) {}

  /** The model that hears a language here, or a refusal in a sentence. */
  modelFor(language: string) {
    const model = transcriberFor(language);
    if (!model) {
      throw new NotHeardHere(
        `Nothing in this browser hears ${language} yet: type, or choose English or French.`,
      );
    }
    return model;
  }

  /** What the first use downloads for a language, in bytes. */
  sizeFor(language: string): number {
    return (
      downloadSize(this.modelFor(language).id) + downloadSize('silero-vad')
    );
  }

  /** Load what hears a language, saying how far it has come. */
  async ready(language: string, progress?: HearingProgress): Promise<void> {
    await Promise.all([this.recognizer(language, progress), this.activity()]);
  }

  private recognizer(
    language: string,
    progress?: HearingProgress,
  ): Promise<SpeechRecognizer> {
    const model = this.modelFor(language);
    let loading = this.recognizers.get(model.id);
    if (!loading) {
      loading = (async () => {
        const transformers = await this.engines.transformers();
        const { env } = transformers;
        env.allowLocalModels = false;
        env.allowRemoteModels = true;
        env.remoteHost = `${this.modelsUrl.replace(/\/+$/, '')}/`;
        env.remotePathTemplate = '{model}/';
        env.useBrowserCache = true;
        env.fetch = pinnedFetch(this.modelsUrl);
        const wasm = env.backends.onnx.wasm;
        const version = env.backends.onnx.versions?.web;
        if (wasm && version) {
          wasm.wasmPaths = runtimeFiles(this.modelsUrl, version);
        }
        const total = downloadSize(model.id);
        const loaded = new Map<string, number>();
        const recognizer = await transformers.pipeline(
          'automatic-speech-recognition',
          model.id,
          {
            dtype: model.dtype as SpeechDtype,
            device: 'wasm',
            progress_callback: (info: any) => {
              if (
                info?.status === 'progress' &&
                typeof info.loaded === 'number'
              ) {
                loaded.set(String(info.file), info.loaded);
                progress?.(
                  Array.from(loaded.values()).reduce((a, b) => a + b, 0),
                  total,
                );
              }
            },
          },
        );
        progress?.(total, total);
        return recognizer as SpeechRecognizer;
      })();
      loading.catch(() => this.recognizers.delete(model.id));
      this.recognizers.set(model.id, loading);
    }
    return loading;
  }

  private activity() {
    if (!this.vad) {
      const file = SPEECH_MODEL_CATALOGUE['silero-vad'].files[0].path;
      const url = `${this.modelsUrl.replace(/\/+$/, '')}/silero-vad/${file}`;
      this.vad = this.engines.vad().then(module =>
        module.NonRealTimeVAD.new({
          modelURL: url,
          modelFetcher: path => pinnedBytes(this.modelsUrl, path),
          ortConfig: ort => {
            const version = ort?.env?.versions?.web;
            if (ort?.env?.wasm && version) {
              ort.env.wasm.wasmPaths = runtimeFiles(this.modelsUrl, version);
            }
          },
          // A press is short: keep a word said alone.
          minSpeechMs: 150,
          preSpeechPadMs: 200,
          redemptionMs: 600,
        }),
      );
      this.vad.catch(() => {
        this.vad = undefined;
      });
    }
    return this.vad;
  }

  /**
   * What was said in a press, or `undefined` when nothing was: its speech
   * found by the VAD, then transcribed in the language.
   */
  async hear(
    audio: Float32Array,
    language: string,
  ): Promise<Transcript | undefined> {
    const started = performance.now();
    const model = this.modelFor(language);
    const [recognize, vad] = await Promise.all([
      this.recognizer(language),
      this.activity(),
    ]);
    const segments: Float32Array[] = [];
    for await (const segment of vad.run(audio, HEARING_RATE)) {
      segments.push(segment.audio);
    }
    const speech = joinSegments(segments);
    if (speech.length < HEARING_RATE * 0.2) {
      return undefined;
    }
    // Whisper is told the language; Moonshine hears English only.
    const options = model.id.startsWith('whisper')
      ? {
          language: language.startsWith('fr') ? 'french' : 'english',
          task: 'transcribe',
        }
      : {};
    const heard = await recognize(speech, options);
    const text = (
      Array.isArray(heard) ? heard.map(h => h.text).join(' ') : heard.text
    ).trim();
    if (!text) {
      return undefined;
    }
    return {
      text,
      metadata: { input: 'voice', language, engine: model.id, where: 'device' },
      seconds: speech.length / HEARING_RATE,
      ms: Math.round(performance.now() - started),
    };
  }
}
