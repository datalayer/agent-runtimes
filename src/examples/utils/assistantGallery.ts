/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the floating assistant's gallery shows (LOOP T-21 to T-27): every
 * state a character acts (T-22), and stepped aside (T-27), with the balloon
 * each one says — the agent's latest saying (T-23), an approval to answer,
 * or that it is paused. Static data only: no agent, no server.
 *
 * @module examples/utils/assistantGallery
 */

import type { AssistantStageProps } from '../../chat/assistant/AssistantStage';
import {
  ASSISTANT_WORDS,
  latestSaying,
  type AssistantState,
  type BalloonApproval,
} from '../../chat/assistant/state';

/** What the gallery poses a character in: a state, or stepped aside. */
export type GalleryPose = AssistantState | 'aside';

/** Every state, in the order an assistant lives them, then stepped aside. */
export const GALLERY_POSES = [
  'idle',
  'greeting',
  'thinking',
  'working',
  'waiting',
  'speaking',
  'paused',
  'aside',
  'goodbye',
] as const satisfies readonly GalleryPose[];

/** How the gallery names each pose. */
export const GALLERY_POSE_LABELS: Record<GalleryPose, string> = {
  idle: 'Idle',
  greeting: 'Greeting',
  thinking: 'Thinking',
  working: 'Working',
  waiting: 'Waiting',
  speaking: 'Speaking',
  paused: 'Paused',
  aside: 'Stepped aside',
  goodbye: 'Goodbye',
};

/** The state the stage acts for a pose: aside, it is idle under what covers it. */
export function stateOfPose(pose: GalleryPose): AssistantState {
  return pose === 'aside' ? 'idle' : pose;
}

/**
 * What the agent said, as a conversation would hold it: each entry is read
 * by `latestSaying`, as the floating assistant reads the chat — Markdown made
 * plain, a long answer cut with *Open the conversation*.
 */
export const SAMPLE_CONVERSATIONS: readonly (readonly unknown[])[] = [
  [
    { id: 'u1', role: 'user', content: 'Who wrote about late deliveries?' },
    {
      id: 'a1',
      role: 'assistant',
      content:
        'Three customers wrote about **late deliveries** this week: Ada, Grace and Alan.',
    },
  ],
  [
    { id: 'u2', role: 'user', content: 'Is the notebook up to date?' },
    { id: 't2', role: 'assistant', toolName: 'readCell', content: '' },
    {
      id: 'a2',
      role: 'assistant',
      content:
        'Yes — the last cell ran at 9:40 and its [chart](#chart) shows the new week.',
    },
  ],
  [
    { id: 'u3', role: 'user', content: 'Summarise the quarter.' },
    {
      id: 'a3',
      role: 'assistant',
      content:
        'Revenue grew 12% on the quarter, carried by the renewals in March. Churn held at 2.1%, the same as the last two quarters, and the new plan took 140 accounts in its first six weeks. Support tickets fell by a fifth after the onboarding change, and the slowest region, the north, closed half its gap with the others. The full table, with each region and month, is in the notebook.',
    },
  ],
];

/** The saying of sample `index` (wrapping), as the balloon shows it. */
export function sampleSaying(index: number): { text: string; more: boolean } {
  const conversation =
    SAMPLE_CONVERSATIONS[
      ((index % SAMPLE_CONVERSATIONS.length) + SAMPLE_CONVERSATIONS.length) %
        SAMPLE_CONVERSATIONS.length
    ];
  const saying = latestSaying(conversation);
  if (!saying) {
    throw new Error(`The sample conversation ${index} says nothing.`);
  }
  return { text: saying.text, more: saying.more };
}

/** The approval the gallery waits on (T-23): answered in the balloon. */
export function sampleApproval(
  onApprove: () => void,
  onDeny: () => void,
): BalloonApproval {
  return {
    id: 'gallery-approval',
    asks: 'send_reply',
    why: 'Send a reply to a customer: ask me first',
    others: 1,
    onApprove,
    onDeny,
  };
}

/**
 * The balloon for a pose: waiting holds the approval, paused says so, and
 * any other pose says the sample's words when asked to (`saying`).
 */
export function balloonForPose(
  pose: GalleryPose,
  {
    saying,
    approval,
  }: {
    saying?: { text: string; more: boolean };
    approval: BalloonApproval;
  },
): AssistantStageProps['balloon'] {
  if (pose === 'waiting') {
    return { text: ASSISTANT_WORDS.approval, approval };
  }
  if (pose === 'paused') {
    return { text: ASSISTANT_WORDS.paused };
  }
  if (pose === 'goodbye' || pose === 'aside') {
    return undefined;
  }
  return saying;
}
