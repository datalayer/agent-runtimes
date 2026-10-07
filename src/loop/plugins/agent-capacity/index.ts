/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The mould the agent-capacity plugins are cast from.
 *
 * A capacity — codemode, hooks, guardrails, memory — is, from the
 * workspace's side, always the same two statements: *which agent* answers
 * (an agentspec id and the create-payload details its server needs) and
 * *what it is worth asking* (the openers on the empty chat). This factory
 * turns those statements into a reactor plugin: an `LoopAgentBlueprint`
 * contribution the agents plugin reads when its Local target creates the
 * agent, and an optional `LoopChatSuggestion` contribution the chat shows
 * ahead of the spec's own.
 *
 * One folder per capacity under `loop/plugins/agent-*`, each a few lines of
 * facts handed to this mould — the way every example used to carry the same
 * facts as props into its own private `<Chat>`.
 *
 * @module loop/plugins/agent-capacity
 */

import {
  contribution,
  definePlugin,
  type ReactorPlugin,
} from '@datalayer/reactor';
import {
  LoopAgentBlueprint,
  LoopChatSuggestion,
  type AgentBlueprintContribution,
  type ChatSuggestionItem,
} from '../../core';

export type AgentCapacityOptions = {
  /** Short slug: `hooks`, `codemode`, … names the plugin `…-agent-<key>`. */
  key: string;
  displayName: string;
  description: string;
  /** The agentspec the Local agent is created from. */
  specId: string;
  /** Registry icon; a sensible default is used when absent. */
  octicon?: string;
  emoji?: string;
  /** Whether the agent runs its tools through codemode. */
  codemode?: boolean;
  /** Extra fields merged into the server's create-agent payload. */
  createPayload?: Record<string, unknown>;
  /** The openers the empty chat offers for this capacity. */
  suggestions?: ChatSuggestionItem[];
  /** What the agent is told on top of its spec's prompt when the page turns it. */
  instructions?: string;
  /** The model it runs on in the page, in place of its spec's. */
  model?: string;
  /** What its modes tell a run turned in the page (LOOP P-19). */
  modeEffect?: AgentBlueprintContribution['modeEffect'];
  /**
   * Its own name in place of `@datalayer/loop-plugin-agent-<key>`: an
   * application's, the name its runtime's plugin has too (LOOP F-15).
   */
  name?: string;
  /** The runtime plugins it cannot work without (Reactor's cross-tier declaration). */
  requiredBackendPlugins?: string[];
};

export function defineAgentCapacityPlugin(
  options: AgentCapacityOptions,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  const {
    key,
    displayName,
    description,
    specId,
    octicon,
    emoji,
    codemode,
    createPayload,
    suggestions,
    instructions,
    model,
    modeEffect,
    name,
    requiredBackendPlugins,
  } = options;
  return definePlugin({
    name: name ?? `@datalayer/loop-plugin-agent-${key}`,
    ...(requiredBackendPlugins ? { requiredBackendPlugins } : {}),
    displayName,
    description,
    octicon: octicon ?? 'dependabot',
    emoji,
    contributes: [
      contribution(
        LoopAgentBlueprint,
        {
          id: key,
          specId,
          createPayload: {
            description,
            agent_library: 'pydantic-ai',
            enable_codemode: codemode ?? false,
            ...createPayload,
          },
          ...(instructions ? { instructions } : {}),
          ...(model ? { model } : {}),
          ...(modeEffect ? { modeEffect } : {}),
        },
        { id: key },
      ),
      ...(suggestions && suggestions.length > 0
        ? [
            contribution(
              LoopChatSuggestion,
              { id: key, suggestions },
              { id: key },
            ),
          ]
        : []),
    ],
  });
}

export default defineAgentCapacityPlugin;
