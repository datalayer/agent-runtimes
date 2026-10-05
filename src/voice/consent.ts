/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The person's yes to the microphone, asked once per application before the
 * browser's own prompt (VOICE.md VO-61), and remembered where the page keeps
 * its preferences. A page without storage asks again next time.
 *
 * @module voice/consent
 */

const KEY = 'datalayer-voice-consent';

/** Whether the person said yes for this application. */
export function consented(app: string): boolean {
  try {
    const kept = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    return kept?.[app] === true;
  } catch {
    return false;
  }
}

/** Remember the person's yes for this application. */
export function consent(app: string): void {
  try {
    const kept = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    window.localStorage.setItem(KEY, JSON.stringify({ ...kept, [app]: true }));
  } catch {
    // Without storage, the yes holds for the page.
  }
}

/** The sentence said before the first use: where the audio goes (VO-61). */
export const CONSENT_SENTENCE =
  'What you say is transcribed on this device: the sound never leaves it, and is not kept. The words go in the message box, for you to send.';
