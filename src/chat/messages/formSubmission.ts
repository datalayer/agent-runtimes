/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A form submission as a chat turn: written for the agent, drawn for the
 * reader.
 *
 * When a reader submits a surface the agent drew, the values go back to the
 * agent as the reader's next turn — that is how the confirmation lands in
 * the conversation. But a turn is text, and the reader was shown that text:
 * a JSON blob under "here are the values", which is the agent's reading and
 * nobody else's. So the turn carries the submission in a fenced block of its
 * own language, `a2ui-submission`. The agent reads the JSON inside it as
 * before; the transcript recognises the fence and draws a card instead —
 * the form's name and its fields, the way a tool call is drawn.
 *
 * Pure, so the two halves — the sender's writing, the transcript's reading —
 * are tested together without a chat.
 *
 * @module chat/messages/formSubmission
 */

/** The fence's language: what marks a turn as a submission. */
export const FORM_SUBMISSION_LANGUAGE = 'a2ui-submission';

export type FormSubmission = {
  /** The form's title, as the surface named it. */
  title: string;
  /** The surface the values came from, when known. */
  surfaceId?: string;
  /** The values, by field id. */
  values: Record<string, unknown>;
};

const FENCE = new RegExp(
  '```' + FORM_SUBMISSION_LANGUAGE + '\\s*\\n([\\s\\S]*?)\\n```',
);

/** The turn to send: a sentence, the fenced submission, the ask. */
export function encodeFormSubmission(submission: FormSubmission): string {
  const json = JSON.stringify(submission, null, 2);
  return (
    `I just submitted "${submission.title}".\n\n` +
    '```' +
    FORM_SUBMISSION_LANGUAGE +
    '\n' +
    json +
    '\n```\n\n' +
    'Please confirm you received it and briefly say what happens next.'
  );
}

/** The submission a turn carries, or `null` for any other turn. */
export function parseFormSubmission(text: string): FormSubmission | null {
  const match = FENCE.exec(text);
  if (!match) {
    return null;
  }
  try {
    const parsed = JSON.parse(match[1]) as Partial<FormSubmission>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.title !== 'string' ||
      !parsed.values ||
      typeof parsed.values !== 'object'
    ) {
      return null;
    }
    return {
      title: parsed.title,
      ...(parsed.surfaceId ? { surfaceId: String(parsed.surfaceId) } : {}),
      values: parsed.values as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/**
 * A field id as a label: `party-size` → `Party size`.
 *
 * The turn carries ids, not labels — the values are keyed by them — and an
 * id is a readable enough label once its dashes and underscores are spaces.
 */
export function labelOfFieldId(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : id;
}

/** A value as a reader would write it; `—` for nothing. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'string') {
    return value.trim() === '' ? '—' : value;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? '—' : value.map(displayValue).join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
}
