/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Transcribe WAV files with a speech-to-text model of the catalogue, as the
 * browser runs it: transformers.js, the same ONNX files, read from the
 * pinned store (VOICE.md VO-05, VO-51). Prints one JSON line.
 *
 *   node scripts/voice/transcribe.mjs <store> <model id> <language> <file.wav>...
 *
 * In Node the runtime is onnxruntime-node on the CPU, not the browser's
 * WASM: the words are the model's, the timings are not the browser's.
 */

import { readFileSync } from 'node:fs';
import { env, pipeline } from '@huggingface/transformers';

const [, , store, model, language, ...files] = process.argv;
env.allowRemoteModels = false;
env.localModelPath = store.endsWith('/') ? store : `${store}/`;

/** A 16-bit PCM mono WAV, as samples between -1 and 1. */
function readWav(path) {
  const bytes = readFileSync(path);
  const at = bytes.indexOf('data') + 8;
  const count = (bytes.length - at) / 2;
  const samples = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    samples[index] = bytes.readInt16LE(at + 2 * index) / 32768;
  }
  return samples;
}

const loading = performance.now();
const transcribe = await pipeline('automatic-speech-recognition', model, {
  dtype: 'q8',
  device: 'cpu',
});
const loadMs = Math.round(performance.now() - loading);
// Whisper is told the language; Moonshine hears English only.
const options = model.startsWith('whisper')
  ? { language: language === 'fr' ? 'french' : 'english', task: 'transcribe' }
  : {};
const results = [];
for (const file of files) {
  const audio = readWav(file);
  const started = performance.now();
  const output = await transcribe(audio, options);
  results.push({
    file: file.split('/').pop(),
    text: output.text.trim(),
    ms: Math.round(performance.now() - started),
    audio_s: Math.round((audio.length / 16000) * 100) / 100,
  });
}
console.log(JSON.stringify({ model, language, load_ms: loadMs, results }));
