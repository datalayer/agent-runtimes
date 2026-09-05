/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-sandbox-*` — where the code runs, as
 * capacities.
 *
 * One plugin per sandbox variant, each cast from the shared capacity mould:
 * the blueprint names the variant's agentspec *and* pins `sandbox_variant`
 * in the create payload, which the Local target respects. The code-sandboxes
 * example offers the whole family behind a chooser; a host that wants
 * exactly one mounts exactly one.
 *
 * @module loop/plugins/agent-code-sandboxes
 */

import { defineAgentCapacityPlugin } from '../agent-capacity';

type SandboxCapacity = {
  key: string;
  variant: string;
  specId: string;
  displayName: string;
  description: string;
};

export const SANDBOX_CAPACITIES: SandboxCapacity[] = [
  {
    key: 'sandbox-eval',
    variant: 'eval',
    specId: 'example-sandbox-eval',
    displayName: 'Eval Sandbox',
    description: 'In-process Python execution for quick local iteration.',
  },
  {
    key: 'sandbox-jupyter',
    variant: 'jupyter-server',
    specId: 'example-sandbox-jupyter',
    displayName: 'Jupyter Sandbox',
    description: 'Kernel-backed execution with notebook-compatible behavior.',
  },
  {
    key: 'sandbox-docker',
    variant: 'docker',
    specId: 'example-sandbox-docker',
    displayName: 'Docker Sandbox',
    description: 'Containerized execution for stronger process isolation.',
  },
  {
    key: 'sandbox-datalayer',
    variant: 'datalayer',
    specId: 'example-sandbox-datalayer',
    displayName: 'Datalayer Sandbox',
    description: 'Cloud sandbox runtime powered by Datalayer environments.',
  },
  {
    key: 'sandbox-colab',
    variant: 'google-colab',
    specId: 'example-sandbox-colab',
    displayName: 'Colab Sandbox',
    description:
      'Google Colab runtime connector (reuse an already-running kernel).',
  },
  {
    key: 'sandbox-kaggle',
    variant: 'kaggle',
    specId: 'example-sandbox-kaggle',
    displayName: 'Kaggle Sandbox',
    description:
      'Kaggle runtime connector (create kernel with API token or attach existing).',
  },
  {
    key: 'sandbox-monty',
    variant: 'monty',
    specId: 'example-sandbox-monty',
    displayName: 'Monty Sandbox',
    description: 'Secure in-process interpreter focused on safe snippets.',
  },
];

const openers = (capacity: SandboxCapacity) => [
  {
    text: 'Run a quick sum',
    message:
      'Use your sandbox to compute the sum of the squares of 1..10 and show the result.',
  },
  {
    text: 'Describe this sandbox',
    message: `You run on the ${capacity.displayName.toLowerCase()} — explain where the code executes and what that means for isolation.`,
  },
];

/** The plugins, keyed by capacity key — one per sandbox variant. */
export const SandboxCapacityPlugins = Object.fromEntries(
  SANDBOX_CAPACITIES.map(capacity => [
    capacity.key,
    defineAgentCapacityPlugin({
      key: capacity.key,
      displayName: capacity.displayName,
      description: capacity.description,
      specId: capacity.specId,
      octicon: 'codespaces',
      emoji: '📦',
      createPayload: { sandbox_variant: capacity.variant },
      suggestions: openers(capacity),
    }),
  ]),
);

export default SandboxCapacityPlugins;
