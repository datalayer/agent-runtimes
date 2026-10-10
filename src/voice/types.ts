/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Voice in the page (VOICE.md §6): what the chat needs to listen and speak.
 *
 * The packages that hear — transformers.js for Moonshine and Whisper, and
 * vad-web for Silero VAD — are given by the host page (`VoiceEngines`), each
 * loaded only once the person turns voice on: nothing of them is in a page
 * that does not ask, and the library names no package it does not need.
 * Their shapes are written here as far as voice uses them, against the
 * packages' published types (`@huggingface/transformers` 4.3.0,
 * `@ricky0123/vad-web` 0.0.31).
 *
 * @module voice/types
 */

/** What transformers.js's `env` holds, as far as voice sets it. */
export interface TransformersEnv {
  allowLocalModels: boolean;
  allowRemoteModels: boolean;
  remoteHost: string;
  remotePathTemplate: string;
  useBrowserCache: boolean;
  fetch: (input: string | URL, init?: any) => Promise<any>;
  backends: {
    onnx: {
      versions?: Record<string, string | undefined>;
      wasm?: { wasmPaths?: unknown; proxy?: boolean };
    };
  };
}

/** A speech-recognition pipeline: audio at 16 kHz in, words out. */
export type SpeechRecognizer = (
  audio: Float32Array,
  options?: Record<string, unknown>,
) => Promise<{ text: string } | Array<{ text: string }>>;

/** The precisions a speech model of the catalogue is published in. */
export type SpeechDtype = 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | 'q4';

/** The part of `@huggingface/transformers` voice uses. */
export interface TransformersModule {
  env: TransformersEnv;
  pipeline: (
    task: 'automatic-speech-recognition',
    model: string,
    options?: {
      dtype?: SpeechDtype;
      device?: 'wasm' | 'webgpu';
      progress_callback?: (info: any) => void;
    },
  ) => Promise<unknown>;
}

/** A speech segment Silero VAD found, in milliseconds. */
export interface VadSegment {
  audio: Float32Array;
  start: number;
  end: number;
}

/** The part of `@ricky0123/vad-web` voice uses. */
export interface VadModule {
  NonRealTimeVAD: {
    new: (options: {
      modelURL: string;
      modelFetcher: (path: string) => Promise<ArrayBuffer>;
      ortConfig?: (ort: any) => void;
      positiveSpeechThreshold?: number;
      negativeSpeechThreshold?: number;
      minSpeechMs?: number;
      preSpeechPadMs?: number;
      redemptionMs?: number;
    }) => Promise<{
      run: (
        audio: Float32Array,
        sampleRate: number,
      ) => AsyncIterable<VadSegment>;
    }>;
  };
}

/** How the host page loads the packages that hear, once voice is turned on. */
export interface VoiceEngines {
  transformers: () => Promise<TransformersModule>;
  vad: () => Promise<VadModule>;
}

/** How a message was heard: what rides on it as `metadata` (VO-27). */
export interface SpokenMetadata {
  input: 'voice';
  language: string;
  engine: string;
  where: 'device' | 'server';
}

/** What the person said, once heard. */
export interface Transcript {
  text: string;
  metadata: SpokenMetadata;
  /** Seconds of speech kept by the VAD. */
  seconds: number;
  /** How long hearing took, from release to words, in ms. */
  ms: number;
}
