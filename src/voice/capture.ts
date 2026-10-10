/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The microphone, for one press (VOICE.md VO-10, VO-62): opened by a
 * gesture, shown while open, closed when the press ends or is cancelled.
 * What it heard is kept in memory only, until it is transcribed.
 *
 * @module voice/capture
 */

/** The rate the speech models hear at. */
export const HEARING_RATE = 16000;

/** One opening of the microphone. */
export interface Capture {
  /** How loud it is now, between 0 and 1: what the level meter shows. */
  level: () => number;
  /** Close it and give what it heard, mono at 16 kHz. */
  stop: () => Promise<Float32Array>;
  /** Close it and forget what it heard. */
  cancel: () => void;
}

/** The microphone could not be opened: said in a sentence, never a trace. */
export class MicrophoneRefused extends Error {}

/** The loudness of what an analyser holds now, between 0 and 1. */
export function levelOf(analyser: AnalyserNode, buffer: Float32Array): number {
  analyser.getFloatTimeDomainData(buffer as Float32Array<ArrayBuffer>);
  let sum = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    sum += buffer[index] * buffer[index];
  }
  // Speech sits around 0.05 to 0.2 RMS: brought to a scale the eye reads.
  return Math.min(1, Math.sqrt(sum / buffer.length) * 5);
}

/** Mono samples at one rate, brought to another. */
export function resample(
  samples: Float32Array,
  from: number,
  to = HEARING_RATE,
): Float32Array {
  if (from === to) {
    return samples;
  }
  const length = Math.round((samples.length * to) / from);
  const out = new Float32Array(length);
  const step = from / to;
  for (let index = 0; index < length; index += 1) {
    const at = index * step;
    const left = Math.floor(at);
    const right = Math.min(left + 1, samples.length - 1);
    out[index] = samples[left] + (samples[right] - samples[left]) * (at - left);
  }
  return out;
}

/**
 * Open the microphone. The browser's echo cancellation is asked for, so
 * the agent's own voice is not heard back (VO-13).
 */
export async function openMicrophone(): Promise<Capture> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneRefused('This browser gives no page a microphone.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (error) {
    const name = (error as DOMException)?.name;
    throw new MicrophoneRefused(
      name === 'NotAllowedError'
        ? 'The microphone was not allowed: allow it for this page to talk, or type.'
        : name === 'NotFoundError'
          ? 'No microphone was found on this device.'
          : 'The microphone could not be opened.',
    );
  }
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  // The samples as they come, kept in memory until the press ends.
  const recorder = context.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  recorder.onaudioprocess = event => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(recorder);
  // A processor runs only when connected; a silent gain keeps it off the speakers.
  const mute = context.createGain();
  mute.gain.value = 0;
  recorder.connect(mute);
  mute.connect(context.destination);
  const buffer = new Float32Array(analyser.fftSize);
  const close = () => {
    recorder.onaudioprocess = null;
    stream.getTracks().forEach(track => track.stop());
    void context.close();
  };
  return {
    level: () => levelOf(analyser, buffer),
    stop: async () => {
      const rate = context.sampleRate;
      close();
      const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
      const joined = new Float32Array(length);
      let at = 0;
      for (const chunk of chunks) {
        joined.set(chunk, at);
        at += chunk.length;
      }
      chunks.length = 0;
      return resample(joined, rate);
    },
    cancel: () => {
      close();
      chunks.length = 0;
    },
  };
}
