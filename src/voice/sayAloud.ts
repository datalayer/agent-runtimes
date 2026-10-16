/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What only the runtime knows of voice, as it says it over AG-UI (VOICE.md
 * VO-35) and Vercel AI (VO-36): `voice.settings` — the running application's
 * voice and language, at a run's start — and `voice.say` — a short line the
 * agent wants heard and not written (*One moment*), shown as a caption while
 * it is said. The chat reads `voice.say` from a run's custom events
 * (`CUSTOM`, the chat's `activity`) or data parts (`data-voice.say`); it
 * already knows its application's voice from `/apps/configure` (VO-45), and
 * `voice.settings` is for clients that do not ask it.
 *
 * @module voice/sayAloud
 */

/** A line the agent wants heard, not written. */
export const VOICE_SAY_EVENT = 'voice.say';

/** The running application's voice, at a run's start. */
export const VOICE_SETTINGS_EVENT = 'voice.settings';

/** The longest line said aloud: the runtime refuses longer ones. */
export const SAY_ALOUD_MAX_CHARACTERS = 200;

/** A custom event or data part, as the chat's adapters give it. */
export interface VoiceActivity {
  type: string;
  data: unknown;
}

const nameOf = (type: string): string => type.replace(/^data-/, '');

/** The line a `voice.say` says, or `undefined` for anything else. */
export function lineToSay(activity: VoiceActivity): string | undefined {
  if (nameOf(activity.type) !== VOICE_SAY_EVENT) {
    return undefined;
  }
  const data = activity.data as { text?: unknown } | null;
  const text =
    data && typeof data.text === 'string'
      ? data.text.split(/\s+/).join(' ').trim()
      : '';
  return text ? text.slice(0, SAY_ALOUD_MAX_CHARACTERS) : undefined;
}
