/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent chooser's facts: what a host offers (its groups of agentspec
 * ids), the chooser's words, each group's tone, and how the keys move.
 *
 * @module apps/plugins/agent-chooser/chooser
 */

/** A category of the agents offered: its name and its agents' ids, in order. */
export type AgentChooserGroup = {
  name: string;
  /** Agentspec ids (`worker-shopper`), each one an agent that presents itself. */
  agents: readonly string[];
};

/** What a host says the chooser offers, and what it does with a choice. */
export type AgentChooserOptions = {
  /** The agents offered, by category, in the dialog's order. */
  groups: readonly AgentChooserGroup[];
  /** Told the agent chosen (its id, as offered); the dialog has closed. */
  onChoose: (agentId: string) => void;
  /** The dialog's heading; `AGENT_CHOOSER_WORDS.heading` when unsaid. */
  heading?: string;
  /** A line under the heading; none when unsaid. */
  says?: string;
};

/** The chooser's words. */
export const AGENT_CHOOSER_WORDS = {
  /** The launcher's name, with the count. */
  open: (count: number) => `Choose an agent (${count})`,
  /** Short, in a narrow title bar. */
  openShort: 'Agents',
  heading: 'Choose an agent',
  close: 'Close',
  /** On the agent at work. */
  current: 'Open now',
} as const;

/** The tones of the groups, in order, from the theme's tokens: a group's dot and its tiles' edge (`fg`), the agent at work's fill (`subtle`). */
export const GROUP_TONES: readonly { fg: string; subtle: string }[] = [
  { fg: 'var(--fgColor-accent)', subtle: 'var(--bgColor-accent-muted)' },
  { fg: 'var(--fgColor-success)', subtle: 'var(--bgColor-success-muted)' },
  { fg: 'var(--fgColor-done)', subtle: 'var(--bgColor-done-muted)' },
  { fg: 'var(--fgColor-attention)', subtle: 'var(--bgColor-attention-muted)' },
  { fg: 'var(--fgColor-sponsors)', subtle: 'var(--bgColor-sponsors-muted)' },
];

/** The tone of the group at `index`, round the list. */
export const groupToneOf = (index: number) =>
  GROUP_TONES[index % GROUP_TONES.length];

/** The agents in the dialog's order, across the groups: what the arrow keys walk. */
export const agentOrderOf = (groups: readonly AgentChooserGroup[]): string[] =>
  groups.flatMap(group => group.agents);

/** Where a key moves the focus from `at`, along `count` agents; none for any other key. */
export function rovedIndex(
  key: string,
  at: number,
  count: number,
): number | undefined {
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    return (at + 1) % count;
  }
  if (key === 'ArrowLeft' || key === 'ArrowUp') {
    return (at - 1 + count) % count;
  }
  if (key === 'Home') {
    return 0;
  }
  if (key === 'End') {
    return count - 1;
  }
  return undefined;
}

/** Where Tab goes from `at` among `count` focusables, wrapping at both ends: the trap. */
export const trappedIndex = (
  at: number,
  count: number,
  back: boolean,
): number =>
  back ? (at <= 0 ? count - 1 : at - 1) : at >= count - 1 ? 0 : at + 1;
