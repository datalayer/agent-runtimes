/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Read aloud*, under an answer (VOICE.md VO-21, `on_request`): the answer,
 * read as plain words and cut into sentences, given to the speaker — what it
 * was saying stops first. The press is the gesture a browser plays sound
 * after.
 *
 * @module voice/ReadAloud
 */

import type { JSX } from 'react';
import { IconButton, Tooltip } from '@primer/react';
import { UnmuteIcon } from '@primer/octicons-react';
import { SentenceCutter } from './sentences';
import type { SentenceSink } from './useSpokenAnswers';

/** What *Read aloud* gives an answer to: a sink a press may unlock. */
export interface ReadingSink extends SentenceSink {
  unlock?: () => void;
}

/** An answer read from its start: what was being said stops, its sentences follow. */
export function readAloud(sink: ReadingSink, answer: string): string[] {
  sink.unlock?.();
  sink.stop();
  const cutter = new SentenceCutter();
  const sentences = [...cutter.feed(answer), ...cutter.end(answer)];
  sentences.forEach(sentence => sink.say(sentence));
  return sentences;
}

/** A message, as far as *Read aloud* reads it. */
export interface ReadableMessage {
  id: string;
  role: string;
  live?: boolean;
  note?: unknown;
}

/**
 * Whether a message has *Read aloud* under it: an answer of the agent with
 * words, finished — not live, and not the one the agent is writing now.
 */
export function readsAloud(
  message: ReadableMessage,
  text: string,
  writingId: string | undefined,
): boolean {
  return (
    message.role === 'assistant' &&
    !message.live &&
    !message.note &&
    message.id !== writingId &&
    text.trim().length > 0
  );
}

export interface ReadAloudProps {
  /** Reads the answer aloud. */
  onRead: () => void;
}

/** The button under an answer. */
export function ReadAloud({ onRead }: ReadAloudProps): JSX.Element {
  return (
    <Tooltip text="Read aloud" direction="n">
      <IconButton
        data-read-aloud=""
        icon={UnmuteIcon}
        aria-label="Read aloud"
        size="small"
        variant="invisible"
        onClick={onRead}
      />
    </Tooltip>
  );
}

export default ReadAloud;
