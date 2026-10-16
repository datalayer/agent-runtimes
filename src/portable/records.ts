/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The words of an application's record that every client shows the same:
 * how a run ended, and what a person asked without what the runtime told the
 * application before their words. Read by the web's record feed
 * (`apps/apps/records`), the chat and Datalayer Mobile.
 *
 * @module portable/records
 */

/**
 * How a run ended, in the `output` entry every run ends with, kept whatever
 * the application's `record.include` says (R-01): its words
 * only when it keeps `outputs`.
 */
export const RUN_END_WORDS: Record<string, string> = {
  answered: 'Answered',
  stopped: 'Stopped',
  gone: 'Its client went before the answer',
};

/**
 * The mark around what the runtime tells an application of a turn a personal
 * agent asked over PAP or PACT, before the request (`asked_for_said`,
 * `ASKED_FOR_TAG` in agent_runtimes.loop.apps.pap_company).
 */
export const ASKED_FOR_TAG = 'asked-for';

/**
 * What a person asked, as they are shown it: without what the runtime told
 * the application before their words (decided 2026-10-14).
 * The record keeps it for the application's builder; the person never wrote
 * it, so *Your conversations* and a thread opened again leave it out.
 */
export function askedOf(text: string): string {
  const open = `<${ASKED_FOR_TAG}>`;
  const close = `</${ASKED_FOR_TAG}>`;
  if (!text.startsWith(open)) {
    return text;
  }
  const end = text.indexOf(close);
  if (end < 0) {
    throw new Error(
      `What was asked opens <${ASKED_FOR_TAG}> and never closes it.`,
    );
  }
  return text.slice(end + close.length).trimStart();
}
