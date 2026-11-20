/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The limited preview of an anonymous visitor's chat, as the indicator says
 * it and the agent reads and marks it (the user, 20 November 2026).
 *
 * What it holds comes from the chat's anonymous state (`useAnonymousChat`):
 * the turns the visitor has taken today as the chat counts them, the day's
 * turns the host gives (`maxTurns`), the refusal once none is left, and what
 * a visitor does not get of the agent's UI. The visitors' runtime keeps the
 * real count and refuses past it: nothing here changes it.
 *
 * Two frontend tools of the page, offered to the visitor's agent like any
 * page tool (`kind: external` on the runtime, so a visitor may call them):
 *
 * - `preview_status()`: read-only — limited or not, the turns left, the
 *   day's, what is disabled, the indicator's note;
 * - `preview_indicator_update({note?, flash?, clear?})`: a short note on the
 *   indicator, or a flash of it; refused where there is no limited preview,
 *   and for any key that would touch the count.
 *
 * @module apps/plugins/limited-preview/preview
 */

import type { FrontendToolDefinition } from '../../../types/tools';
import {
  ANONYMOUS_WORDS,
  turnsLeft,
  type ChatAnonymous,
} from '../../../chat/anonymous/anonymousMode';

export const PREVIEW_STATUS = 'preview_status';
export const PREVIEW_INDICATOR_UPDATE = 'preview_indicator_update';
export const LIMITED_PREVIEW_TOOL_NAMES = [
  PREVIEW_STATUS,
  PREVIEW_INDICATOR_UPDATE,
];

/** The longest note the agent may set on the indicator. */
export const PREVIEW_NOTE_MAX = 60;

/** Keys that would touch the count: refused, in their own sentence. */
const COUNT_KEYS = new Set([
  'turnsLeft',
  'turnsPerDay',
  'turns',
  'taken',
  'maxTurns',
  'limited',
  'quota',
]);

export const LIMITED_PREVIEW_WORDS = {
  label: 'Limited preview',
  /** On the indicator: `7/10 turns today`. */
  turns: (left: number, max: number) => `${left}/${max} turns today`,
  /** In its overlay: `7 of 10 turns left today.` */
  turnsLeft: (left: number, max: number) =>
    `${left} of ${max} turns left today.`,
  saveWork: 'Sign in to save your work.',
  someDisabled: ANONYMOUS_WORDS.someDisabled,
  disabledNamed: (names: readonly string[]) =>
    `Disabled without an account: ${names.join(', ')}.`,
  signIn: ANONYMOUS_WORDS.signIn,
  validating: ANONYMOUS_WORDS.validating,
  /** The indicator's accessible name. */
  title: 'Limited preview: what a visitor without an account can do',
  read: 'Read the limited preview',
  updated: (note: string) =>
    note ? `Preview note: ${note}` : 'Updated the preview indicator',
  reading: 'Reading the limited preview…',
  notLimited:
    'This chat is not a limited preview: there is no indicator to update.',
  noCount:
    'The turns are counted by the visitors’ runtime: this tool sets a note or a flash, never the count.',
  noteTooLong: `"note" is a string of at most ${PREVIEW_NOTE_MAX} characters.`,
  nothing: 'Say what to do: a "note", "flash": true, or "clear": true.',
  unknown: (key: string) =>
    `The indicator has no "${key}": note, flash and clear.`,
} as const;

/** The limited preview, as the indicator and `preview_status` say it. */
export type PreviewStatus = {
  limited: true;
  /** The temporary key is still asked for and checked. */
  validating: boolean;
  /** Turns left today; none when the host counts no turns. */
  turnsLeft: number | null;
  /** The day's turns; none when the host counts no turns. */
  turnsPerDay: number | null;
  /** What a visitor does not get of the agent's UI, by name. */
  disabled: string[];
  /** Why no turn is left, or `''`. */
  refused: string;
};

/** What the agent set on the indicator: a note, and a flash's count. */
export type PreviewMark = { note: string; flash: number };

/** The limited preview of a visitor's chat, from its anonymous state. */
export function previewStatusOf(
  state: {
    taken: number;
    refused: string;
    validating: boolean;
    config: Pick<ChatAnonymous, 'maxTurns'>;
  },
  disabled: readonly string[],
): PreviewStatus {
  const max = state.config.maxTurns;
  return {
    limited: true,
    validating: state.validating,
    turnsLeft: max === undefined ? null : turnsLeft(state.taken, max),
    turnsPerDay: max ?? null,
    disabled: [...disabled],
    refused: state.refused,
  };
}

/**
 * One chat's limited preview: what its indicator publishes, what its agent
 * marks. One per plugin (`limitedPreviewPlugin`), never one per page: two
 * anonymous embeds on a page keep their own.
 */
export class PreviewBoard {
  status: PreviewStatus | null = null;
  mark: PreviewMark = { note: '', flash: 0 };
  private revision = 0;
  private listeners = new Set<() => void>();

  /** The chat's preview, or none once the indicator goes. */
  publish(status: PreviewStatus | null): void {
    if (JSON.stringify(status) === JSON.stringify(this.status)) {
      return;
    }
    this.status = status;
    this.tell();
  }

  /** A note set or cleared, a flash asked for. */
  update({ note, flash = false }: { note?: string; flash?: boolean }): void {
    this.mark = {
      note: note ?? this.mark.note,
      flash: this.mark.flash + (flash ? 1 : 0),
    };
    this.tell();
  }

  /** The note taken away: the conversation started over. */
  clearMark(): void {
    if (this.mark.note) {
      this.mark = { ...this.mark, note: '' };
      this.tell();
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRevision = (): number => this.revision;

  private tell(): void {
    this.revision += 1;
    this.listeners.forEach(listener => listener());
  }
}

/** What `preview_indicator_update` was given, checked; throws a sentence. */
function readUpdate(args: Record<string, unknown>): {
  note?: string;
  flash: boolean;
} {
  for (const key of Object.keys(args)) {
    if (COUNT_KEYS.has(key)) {
      throw new Error(LIMITED_PREVIEW_WORDS.noCount);
    }
    if (!['note', 'flash', 'clear'].includes(key)) {
      throw new Error(LIMITED_PREVIEW_WORDS.unknown(key));
    }
  }
  if (
    args.note !== undefined &&
    (typeof args.note !== 'string' ||
      args.note.trim().length > PREVIEW_NOTE_MAX)
  ) {
    throw new Error(LIMITED_PREVIEW_WORDS.noteTooLong);
  }
  const flash = args.flash === true;
  const clear = args.clear === true;
  const note =
    typeof args.note === 'string' ? args.note.trim() : clear ? '' : undefined;
  if (note === undefined && !flash) {
    throw new Error(LIMITED_PREVIEW_WORDS.nothing);
  }
  return { ...(note !== undefined ? { note } : {}), flash };
}

/** The two tools, over one chat's limited preview. */
export function limitedPreviewTools(
  board: PreviewBoard,
): FrontendToolDefinition[] {
  return [
    {
      name: PREVIEW_STATUS,
      description:
        'Reads the limited preview the person is in, as the page shows it: limited (true for a visitor without an account), turnsLeft and turnsPerDay (today’s turns, none when not counted), disabled (what needs an account), refused (why no turn is left, when none is) and the note on the indicator. Read-only. Call it before telling the person how many turns they have left.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      handler: async () => {
        const status = board.status;
        if (!status) {
          return { limited: false };
        }
        return {
          limited: true,
          turnsLeft: status.turnsLeft,
          turnsPerDay: status.turnsPerDay,
          disabled: status.disabled,
          ...(status.refused ? { refused: status.refused } : {}),
          ...(board.mark.note ? { note: board.mark.note } : {}),
        };
      },
      summaryOf: () => LIMITED_PREVIEW_WORDS.read,
    },
    {
      name: PREVIEW_INDICATOR_UPDATE,
      description: `Sets a short note (at most ${PREVIEW_NOTE_MAX} characters) on the limited-preview indicator beside the composer, or flashes it to draw the person's eye to it — for example when you tell them how many turns are left, or that signing in keeps their work. "clear": true takes the note away. It runs in the page; it never changes the turns, which the visitors' runtime counts. Only in a limited preview.`,
      parameters: {
        type: 'object',
        properties: {
          note: {
            type: 'string',
            maxLength: PREVIEW_NOTE_MAX,
            description: 'A few words beside the turns: "3 turns left".',
          },
          flash: {
            type: 'boolean',
            description: 'Flash the indicator once.',
          },
          clear: {
            type: 'boolean',
            description: 'Take the note away.',
          },
        },
        additionalProperties: false,
      },
      handler: async args => {
        if (!board.status) {
          throw new Error(LIMITED_PREVIEW_WORDS.notLimited);
        }
        const update = readUpdate(args ?? {});
        board.update(update);
        return {
          note: board.mark.note,
          flashed: update.flash,
          turnsLeft: board.status.turnsLeft,
        };
      },
      summaryOf: args =>
        LIMITED_PREVIEW_WORDS.updated(
          typeof args.note === 'string' ? args.note.trim() : '',
        ),
    },
  ];
}
