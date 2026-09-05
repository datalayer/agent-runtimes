/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent-capacity plugins: one blueprint each, from the shared mould.
 *
 * What is pinned: every capacity plugin contributes exactly one
 * `LoopAgentBlueprint` naming its agentspec, with the pydantic-ai library
 * and an explicit codemode flag in the payload — the facts the Local target
 * needs to create the agent — and its openers (when it has any) arrive
 * through `LoopChatSuggestion` with both a chip text and a message.
 */

import { describe, expect, it } from 'vitest';
import type { ReactorPlugin } from '@datalayer/reactor';
import {
  LoopAgentBlueprint,
  LoopChatSuggestion,
  type AgentBlueprintContribution,
  type ChatSuggestionContribution,
} from '../core';
import { AgentA2uiPlugin } from '../plugins/agent-a2ui';
import { AgentA2uiJupyterOutputPlugin } from '../plugins/agent-a2ui-jupyter-output';
import { AgentCheckpointsPlugin } from '../plugins/agent-checkpoints';
import { SandboxCapacityPlugins } from '../plugins/agent-code-sandboxes';
import { AgentCodeSandboxPlugin } from '../plugins/agent-code-sandbox';
import {
  AgentCodemodePlugin,
  AgentNoCodemodePlugin,
} from '../plugins/agent-codemode';
import { AgentCompactionPlugin } from '../plugins/agent-compaction';
import { AgentEvalsPlugin } from '../plugins/agent-evals';
import { AgentGuardrailsPlugin } from '../plugins/agent-guardrails';
import { AgentHooksPlugin } from '../plugins/agent-hooks';
import { AgentInferencePlugin } from '../plugins/agent-inference';
import { AgentMcpPlugin } from '../plugins/agent-mcp';
import { AgentMemoryPlugin } from '../plugins/agent-memory';
import { AgentMonitoringPlugin } from '../plugins/agent-monitoring';
import { AgentNotificationsPlugin } from '../plugins/agent-notifications';
import { AgentOtelPlugin } from '../plugins/agent-otel';
import { AgentOutputsPlugin } from '../plugins/agent-outputs';
import { AgentParametersPlugin } from '../plugins/agent-parameters';
import { AgentSkillsPlugin } from '../plugins/agent-skills';
import { AgentSubagentsPlugin } from '../plugins/agent-subagents';
import { AgentToolApprovalsPlugin } from '../plugins/agent-tool-approvals';
import { AgentTriggersPlugin } from '../plugins/agent-triggers';

type AnyPlugin = ReactorPlugin<Record<string, never>, unknown, unknown>;

const ROSTER: [AnyPlugin, string][] = [
  [AgentA2uiPlugin, 'example-a2ui-agent'],
  [AgentA2uiJupyterOutputPlugin, 'example-a2ui-jupyter-output'],
  [SandboxCapacityPlugins['sandbox-eval'] as AnyPlugin, 'example-sandbox-eval'],
  [
    SandboxCapacityPlugins['sandbox-jupyter'] as AnyPlugin,
    'example-sandbox-jupyter',
  ],
  [AgentCheckpointsPlugin, 'monitor-sales-kpis'],
  [AgentCodeSandboxPlugin, 'example-full'],
  [AgentCodemodePlugin, 'example-codemode'],
  [AgentNoCodemodePlugin, 'example-no-codemode'],
  [AgentCompactionPlugin, 'example-monitoring'],
  [AgentEvalsPlugin, 'example-evals'],
  [AgentGuardrailsPlugin, 'example-guardrails'],
  [AgentHooksPlugin, 'example-hooks'],
  [AgentInferencePlugin, 'example-inference'],
  [AgentMcpPlugin, 'example-mcp'],
  [AgentMemoryPlugin, 'example-memory'],
  [AgentMonitoringPlugin, 'example-monitoring'],
  [AgentNotificationsPlugin, 'example-notifications'],
  [AgentOtelPlugin, 'example-otel'],
  [AgentOutputsPlugin, 'example-output'],
  [AgentParametersPlugin, 'example-parameters'],
  [AgentSkillsPlugin, 'example-skills'],
  [AgentSubagentsPlugin, 'example-subagents'],
  [AgentToolApprovalsPlugin, 'example-tool-approvals'],
  [AgentTriggersPlugin, 'example-one-trigger'],
];

function blueprintOf(plugin: AnyPlugin): AgentBlueprintContribution {
  const entry = plugin.contributes?.find(c => c.point === LoopAgentBlueprint);
  expect(entry, `${plugin.name} contributes a blueprint`).toBeDefined();
  return entry!.value as AgentBlueprintContribution;
}

describe('the capacity roster', () => {
  it.each(ROSTER.map(([plugin, spec]) => [plugin.name, plugin, spec]))(
    '%s names its spec and its library',
    (_name, plugin, spec) => {
      const blueprint = blueprintOf(plugin as AnyPlugin);
      expect(blueprint.specId).toBe(spec);
      expect(blueprint.createPayload?.agent_library).toBe('pydantic-ai');
      expect(typeof blueprint.createPayload?.enable_codemode).toBe('boolean');
    },
  );

  it('codemode is the one capacity that switches codemode on', () => {
    expect(
      blueprintOf(AgentCodemodePlugin as AnyPlugin).createPayload
        ?.enable_codemode,
    ).toBe(true);
    expect(
      blueprintOf(AgentNoCodemodePlugin as AnyPlugin).createPayload
        ?.enable_codemode,
    ).toBe(false);
  });

  it('openers carry a chip text, and a message when the two differ', () => {
    for (const [plugin] of ROSTER) {
      const entry = plugin.contributes?.find(
        c => c.point === LoopChatSuggestion,
      );
      if (!entry) {
        continue;
      }
      const { suggestions } = entry.value as ChatSuggestionContribution;
      expect(suggestions.length).toBeGreaterThan(0);
      for (const suggestion of suggestions) {
        expect(suggestion.text.length).toBeGreaterThan(0);
      }
    }
  });
});
