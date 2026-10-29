/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A person's own voice settings (VO-30), and what a chat's voice is
 * once they are taken into account (VO-14, VO-25).
 *
 * An application says what voice it wants — `interface.voice` in its spec,
 * reaching the chat as `ChatVoice`. A person says what *they* want: the
 * language they speak, the voice they would rather hear, how fast and how
 * loud it is, whether what they say is sent at once, and whether anything
 * may leave the device at all. Those are kept where the assistant's away
 * choice is kept (T-24): the browser's storage, which may be refused, in
 * which case the choice holds for the page.
 *
 * **Whose choice wins.** The person's, where they have made one — a menu
 * that an application's spec could overrule would be a menu that does
 * nothing. Where they have not, the spec's; and for the language, where
 * neither says, the browser's. The one thing a person cannot do is turn on
 * what the application turned off: an application whose voice is `off` is
 * silent, and `onDeviceOnly` only ever takes capability away.
 *
 * @module voice/settings
 */

import type { ChatVoice } from './index';

/** Where a person's voice settings are kept. */
export const VOICE_SETTINGS_KEY = 'datalayer-voice-settings';

/** How fast and how loud, as multipliers of the voice's own. */
export const RATE_RANGE = { min: 0.5, max: 2, default: 1 } as const;
export const VOLUME_RANGE = { min: 0, max: 1, default: 1 } as const;
/**
 * How much longer than usual the person pauses before they are done
 * (VO-69): the silence that stops a microphone clicked on, and the
 * one that ends a hands-free turn, times this.
 */
export const PAUSE_RANGE = { min: 1, max: 4, default: 1 } as const;

/**
 * What a person chose for themselves. Every field is optional: an absent one
 * means "whatever the application says".
 */
export interface VoiceSettings {
  /** The language they speak and want to hear, BCP 47. */
  language?: string;
  /** A voice of the catalogue, theirs rather than the application's. */
  voice?: string;
  /** A multiplier on the speaking speed, 0.5 to 2. */
  rate?: number;
  /** A multiplier on the loudness, 0 to 1. */
  volume?: number;
  /** When answers are spoken, where the application allows a choice. */
  output?: ChatVoice['output'];
  /** Send what was said at once, rather than put it in the composer. */
  sendWhatISay?: boolean;
  /** The microphone to listen with, a `MediaDeviceInfo.deviceId`. */
  microphoneId?: string;
  /**
   * Keep speech on this device: no audio and no text is sent to Datalayer's
   * speech service, so answers are spoken only if the browser can do it.
   */
  onDeviceOnly?: boolean;
  /**
   * Let Whisper find the language they speak (VO-14): what they say is
   * heard on Datalayer's servers, which detect it, rather than in the browser.
   */
  detectLanguage?: boolean;
  /** How much longer they pause before they are done (VO-69): 1 is usual. */
  pause?: number;
}

function clamp(
  value: number,
  { min, max }: { min: number; max: number },
): number {
  return Math.min(max, Math.max(min, value));
}

/** The settings as they can be used: numbers in range, nothing else trusted. */
export function saneVoiceSettings(
  settings: VoiceSettings | null | undefined,
): VoiceSettings {
  const kept = settings ?? {};
  const sane: VoiceSettings = {};
  if (typeof kept.language === 'string' && kept.language.trim()) {
    sane.language = kept.language.trim();
  }
  if (typeof kept.voice === 'string' && kept.voice.trim()) {
    sane.voice = kept.voice.trim();
  }
  if (typeof kept.rate === 'number' && Number.isFinite(kept.rate)) {
    sane.rate = clamp(kept.rate, RATE_RANGE);
  }
  if (typeof kept.volume === 'number' && Number.isFinite(kept.volume)) {
    sane.volume = clamp(kept.volume, VOLUME_RANGE);
  }
  if (
    kept.output === 'off' ||
    kept.output === 'on_request' ||
    kept.output === 'always'
  ) {
    sane.output = kept.output;
  }
  if (typeof kept.sendWhatISay === 'boolean') {
    sane.sendWhatISay = kept.sendWhatISay;
  }
  if (typeof kept.microphoneId === 'string' && kept.microphoneId.trim()) {
    sane.microphoneId = kept.microphoneId.trim();
  }
  if (typeof kept.onDeviceOnly === 'boolean') {
    sane.onDeviceOnly = kept.onDeviceOnly;
  }
  if (typeof kept.detectLanguage === 'boolean') {
    sane.detectLanguage = kept.detectLanguage;
  }
  if (typeof kept.pause === 'number' && Number.isFinite(kept.pause)) {
    sane.pause = clamp(kept.pause, PAUSE_RANGE);
  }
  return sane;
}

/** What was kept, or nothing. Storage may be refused, or hold nonsense. */
export function keptVoiceSettings(): VoiceSettings {
  try {
    const kept = window.localStorage.getItem(VOICE_SETTINGS_KEY);
    return kept ? saneVoiceSettings(JSON.parse(kept) as VoiceSettings) : {};
  } catch {
    // A page without storage, or holding something that is not ours: the
    // application's voice is used as it is.
    return {};
  }
}

/**
 * What the page holds: the kept settings, or the choice made on this page
 * when storage refused it. Read once, then told of each change.
 */
let held: VoiceSettings | undefined;

/** Who is told when the person's settings change: every chat on the page (VO-30). */
const listeners = new Set<(settings: VoiceSettings) => void>();

/** The person's settings as the page holds them (VO-30). */
export function heldVoiceSettings(): VoiceSettings {
  if (held === undefined) {
    held = keptVoiceSettings();
  }
  return held;
}

/**
 * Be told when the person's settings change — from a menu on this page, or
 * from another tab, whose storage event is read here. Returns the unsubscribe.
 */
export function onVoiceSettingsChange(
  listener: (settings: VoiceSettings) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function told(settings: VoiceSettings): void {
  held = settings;
  for (const listener of [...listeners]) {
    listener(settings);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === VOICE_SETTINGS_KEY || event.key === null) {
      told(keptVoiceSettings());
    }
  });
}

/**
 * Keep what the person chose; an empty choice forgets it. Every chat on the
 * page is told, so the menu's choice is heard at once (VO-30).
 */
export function keepVoiceSettings(settings: VoiceSettings): VoiceSettings {
  const sane = saneVoiceSettings(settings);
  try {
    if (Object.keys(sane).length === 0) {
      window.localStorage.removeItem(VOICE_SETTINGS_KEY);
    } else {
      window.localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(sane));
    }
  } catch {
    // Without storage the choice holds for the page.
  }
  told(sane);
  return sane;
}

/**
 * The settings with one choice changed (VO-30): `undefined` forgets that
 * choice, giving it back to the application. A new language drops a voice
 * the person chose that does not speak it, for the language's own.
 */
export function withVoiceSetting<K extends keyof VoiceSettings>(
  settings: VoiceSettings,
  key: K,
  value: VoiceSettings[K] | undefined,
  speaks?: (voice: string, language: string) => boolean,
): VoiceSettings {
  const next: VoiceSettings = { ...saneVoiceSettings(settings) };
  if (value === undefined) {
    delete next[key];
  } else {
    next[key] = value;
  }
  if (
    key === 'language' &&
    typeof value === 'string' &&
    next.voice &&
    speaks &&
    !speaks(next.voice, value)
  ) {
    delete next.voice;
  }
  return saneVoiceSettings(next);
}

/** The language the browser says the person reads, or nothing. */
export function browserLanguage(): string | undefined {
  try {
    const language = navigator.languages?.[0] || navigator.language;
    return language?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The chat's voice as the person wants it (VO-14, VO-25, VO-30).
 *
 * The language is theirs if they chose one, else the application's, else the
 * browser's. The voice, the rate, the volume and *Send what I say* are
 * theirs where they chose. When answers are spoken is theirs too — but an
 * application that says `off` stays off, since a person's menu may not turn
 * on what was not offered. `onDeviceOnly` drops the speech service: the
 * browser speaks or nothing does.
 */
export function voiceForPerson(
  voice: ChatVoice,
  person: VoiceSettings = {},
  browser: string | undefined = browserLanguage(),
): ChatVoice {
  const chosen = saneVoiceSettings(person);
  const silent = voice.output === 'off';
  // A spec that says no language carries an empty string, which `??` would
  // keep: blank is unsaid here, or the browser's language would never be
  // reached.
  const said = (language: string | undefined) =>
    language && language.trim() ? language.trim() : undefined;
  const next: ChatVoice = {
    ...voice,
    language:
      chosen.language ?? said(voice.language) ?? said(browser) ?? 'en-US',
    voice: chosen.voice ?? voice.voice,
    output: silent ? 'off' : (chosen.output ?? voice.output),
    rate: chosen.rate ?? voice.rate,
    volume: chosen.volume ?? voice.volume,
  };
  if (chosen.sendWhatISay !== undefined) {
    next.sendWhatISay = chosen.sendWhatISay;
  }
  if (chosen.microphoneId) {
    next.microphoneId = chosen.microphoneId;
  }
  if (chosen.detectLanguage) {
    next.detect = true;
  }
  if (chosen.onDeviceOnly) {
    // Nothing is asked of the speech service: no token, no origin. Answers
    // are said by that service only (no voice made in the
    // browser), so they are not heard; listening stays on the device.
    next.speechUrl = undefined;
    next.token = undefined;
    next.output = 'off';
    next.where = 'device';
    next.detect = false;
  }
  return next;
}
