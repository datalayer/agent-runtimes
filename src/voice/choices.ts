/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a person may choose for their voice (VO-14, VO-21, VO-25, VO-30),
 * from the catalogue: the languages a voice speaks and the device
 * hears, the voices of each, the speeds and loudnesses offered, and when
 * answers are heard. Read by the composer's menu (`VoiceMenu`) and by a
 * settings page, so both offer the same.
 *
 * @module voice/choices
 */

import {
  VOICE_CATALOGUE,
  transcriberFor,
  voiceSpeaks,
  type VoiceSpec,
} from '../specs/voices';
import type { ChatVoice } from './index';

/** A choice as a menu or a page lists it. */
export interface VoiceChoice<T> {
  value: T;
  label: string;
}

/** A language's name, in English, as the menu says it: `en-GB` is *British English*. */
export function languageName(language: string): string {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'language' });
    return names.of(language) ?? language;
  } catch {
    return language;
  }
}

/**
 * The languages a person may speak and hear: each a voice of the catalogue
 * speaks and a model on the device hears, in the catalogue's order.
 */
export function voiceLanguages(): VoiceChoice<string>[] {
  const seen = new Set<string>();
  const languages: VoiceChoice<string>[] = [];
  for (const voice of Object.values(VOICE_CATALOGUE)) {
    for (const language of voice.languages) {
      if (!seen.has(language) && transcriberFor(language)) {
        seen.add(language);
        languages.push({ value: language, label: languageName(language) });
      }
    }
  }
  return languages;
}

/** The voices that speak a language, in the catalogue's order. */
export function voicesSpeaking(language: string): VoiceSpec[] {
  return Object.values(VOICE_CATALOGUE).filter(
    voice =>
      voiceSpeaks(voice, language) ||
      voiceSpeaks(voice, language.split('-')[0]),
  );
}

/** Whether a voice of the catalogue speaks a language: what a new language keeps of a chosen voice. */
export function catalogueVoiceSpeaks(voice: string, language: string): boolean {
  return voicesSpeaking(language).some(spoken => spoken.id === voice);
}

/** The speeds offered, as multipliers of the voice's own. */
export const RATE_CHOICES: VoiceChoice<number>[] = [
  { value: 0.75, label: 'Slower' },
  { value: 1, label: 'Normal' },
  { value: 1.25, label: 'Faster' },
  { value: 1.5, label: 'Fastest' },
];

/** The loudnesses offered, 0 to 1. */
/** How long the person pauses before they are done (VO-69): the silences, times this. */
export const PAUSE_CHOICES: VoiceChoice<number>[] = [
  { value: 1, label: 'Usual' },
  { value: 2, label: 'Longer' },
  { value: 3, label: 'Much longer' },
];

export const VOLUME_CHOICES: VoiceChoice<number>[] = [
  { value: 0.25, label: 'Quiet' },
  { value: 0.5, label: 'Half' },
  { value: 0.75, label: 'Loud' },
  { value: 1, label: 'Full' },
];

/** When answers are heard (VO-21): what a person may choose where the application speaks. */
export const OUTPUT_CHOICES: VoiceChoice<NonNullable<ChatVoice['output']>>[] = [
  { value: 'off', label: 'Never' },
  { value: 'on_request', label: 'When I ask (Read aloud)' },
  { value: 'always', label: 'Always, as they are written' },
];
