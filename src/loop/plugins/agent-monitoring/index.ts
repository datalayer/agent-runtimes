/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-monitoring` — the capacity, as a plugin.
 *
 * Mounts the `example-monitoring` agent and offers what it is worth asking. Cast
 * from the shared capacity mould; see `loop/plugins/agent-capacity`.
 *
 * @module loop/plugins/agent-monitoring
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

export const AGENT_MONITORING_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-monitoring';

export const AgentMonitoringPlugin = defineAgentCapacityPlugin({
  key: 'monitoring',
  displayName: 'Agent Monitoring',
  description: '${alerts.length} active alert${alerts.length !== 1 ? ',
  specId: 'example-monitoring',
  octicon: 'pulse',
  emoji: '📈',
  suggestions: [
    {
      text: '▶ No-tool turn',
      message:
        'Briefly introduce yourself without calling any tool or skill — produces a linear Start → Model → Decision → End graph.',
    },
    {
      text: '🔍 Single tool call',
      message:
        'Use the Tavily web search tool to find the latest news about pydantic-graph. Make a single search call.',
    },
    {
      text: '🌀 Parallel tool fan-out',
      message:
        'Use Tavily to search the web in parallel for these three topics in the same turn: (1) OpenTelemetry traces, (2) agent observability, (3) LLM cost monitoring. Issue all three searches together so the turn graph fans out (Broadcast → Spread → Join).',
    },
    {
      text: '🧩 Skill call',
      message:
        'Use the datalayer-whoami skill to identify my profile, then summarize it.',
    },
    {
      text: '😄 Joke skill',
      message:
        'Use the jokes skill to tell me a random dad joke, then wrap it in one-sentence commentary.',
    },
    {
      text: '🧪 Mixed tools + skills',
      message:
        'In one turn: (a) use Tavily to search for "OTEL traces best practices", (b) call the datalayer-whoami skill, (c) call the jokes skill. Summarize all three results together. This should produce a Broadcast → three Spread nodes → Join in the Turn Execution Graph.',
    },
    {
      text: 'Monitoring summary',
      message:
        'Summarize my current token usage, cost status, and recent turn activity.',
    },
    {
      text: 'Turn usage analysis',
      message:
        'Analyze the last turn usage and explain which parts drove input and output tokens.',
    },
  ],
});

export default AgentMonitoringPlugin;
