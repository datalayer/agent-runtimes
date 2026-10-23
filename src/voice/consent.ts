/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The person's yes to the microphone, asked once per application before the
 * browser's own prompt (VO-61), and remembered where the page keeps
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

/**
 * The sentence said before the first use when what is said is heard on
 * Datalayer's servers (VO-34, VO-61): asked apart from the device's, since
 * a yes to one is not a yes to the other.
 */
export const SERVER_CONSENT_SENTENCE =
  'What you say is sent to Datalayer’s servers to be transcribed: the sound and the words are not kept there. The words go in the message box, for you to send.';

/**
 * Whose consent is remembered for hearing in a place: the application's,
 * apart for the server, and apart again when what is said is kept as sound
 * (VO-63) — a yes to being heard is not a yes to being kept.
 */
export function consentKeyFor(
  app: string,
  where: 'device' | 'server',
  keepsAudio?: number,
): string {
  const heard = where === 'server' ? `${app}:server` : app;
  return keepsAudio ? `${heard}:kept` : heard;
}
