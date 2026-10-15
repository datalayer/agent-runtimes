/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Harness Catalog.
 *
 * An agent program driven over the Agent Client Protocol (SHIELD.md SH-01).
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { HarnessSpec } from '../types/agentspecs';

export const CLAUDE_CODE_HARNESS_0_0_1: HarnessSpec = {
  id: 'claude-code',
  version: '0.0.1',
  name: 'Claude Code',
  description:
    "Anthropic's coding agent, driven over ACP through the Agent Client Protocol project's adapter on the Claude Agent SDK.",
  enabled: true,
  tags: ['harness'],
  docs: 'https://github.com/agentclientprotocol/claude-agent-acp',
  acp: {
    command: 'npx',
    args: ['-y', '@agentclientprotocol/claude-agent-acp@0.91.0'],
    protocolVersion: 1,
    loadSession: true,
    mcp: 'lend',
    modes: ['default', 'plan', 'acceptEdits', 'bypassPermissions'],
    env: {},
  },
  requires: {
    secrets: ['ANTHROPIC_API_KEY'],
    binaries: ['node', 'git'],
  },
  terms: {
    servedToThirdParties: 'api_key_only',
    licence:
      'Apache-2.0 (adapter); Anthropic Commercial Terms of Service (the agent)',
  },
  skills: {
    format: 'skill-md',
    dir: '.claude/skills',
  },
  honours: {
    model: true,
    subagents: false,
  },
  instructionsFile: 'CLAUDE.md',
  registered: {
    adapter: '@agentclientprotocol/claude-agent-acp',
    version: '0.91.0',
    licenceSource:
      'https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp',
    termsSource: 'https://code.claude.com/docs/en/legal-and-compliance',
    credential: "An Anthropic API key (ANTHROPIC_API_KEY), the person's own",
    binaries: 'Node 22 (engines.node >=22 on npm), git',
    note: "Anthropic's legal page (read 2026-10-15): running Claude Code in hosted sandboxes or agent infrastructure requires the Commercial Terms; each end user authenticates with their own API key or subscription; developers may not route requests through Free, Pro or Max plan credentials on behalf of their users, nor collect or intermediate Claude.ai credentials. So only API keys are taken; a subscription login is refused. The npm package moved from @zed-industries (0.23.1, March 2026) to @agentclientprotocol.",
  },
};

export const CODEX_HARNESS_0_0_1: HarnessSpec = {
  id: 'codex',
  version: '0.0.1',
  name: 'Codex',
  description:
    "OpenAI's coding agent, driven over ACP through the Agent Client Protocol project's adapter, which ships the Codex binary it drives.",
  enabled: true,
  tags: ['harness'],
  docs: 'https://github.com/agentclientprotocol/codex-acp',
  acp: {
    command: 'npx',
    args: ['-y', '@agentclientprotocol/codex-acp@2.2.2'],
    protocolVersion: 1,
    loadSession: true,
    mcp: 'lend',
    modes: ['read-only', 'workspace-write', 'agent', 'agent-full-access'],
    env: { NO_BROWSER: '1' },
  },
  requires: {
    secrets: ['OPENAI_API_KEY'],
    binaries: ['node', 'git'],
  },
  terms: {
    servedToThirdParties: 'api_key_only',
    licence: 'Apache-2.0 (adapter); OpenAI Terms of Use (the agent)',
  },
  skills: {
    format: 'skill-md',
    dir: '.agents/skills',
  },
  honours: {
    model: true,
    subagents: false,
  },
  instructionsFile: 'AGENTS.md',
  registered: {
    adapter: '@agentclientprotocol/codex-acp',
    version: '2.2.2',
    licenceSource:
      'https://www.npmjs.com/package/@agentclientprotocol/codex-acp',
    termsSource: 'https://learn.chatgpt.com/docs/auth',
    credential:
      "An OpenAI API key (OPENAI_API_KEY or CODEX_API_KEY), the person's own",
    binaries:
      "Node 22 (as the Agent Client Protocol project's adapters; unstated on npm), git",
    note: "Codex's authentication page (read 2026-10-15) recommends API keys for automation and device-code login for headless machines; a ChatGPT login needs a browser and is hidden with NO_BROWSER=1 in the adapter. Only API keys are taken; a ChatGPT login is refused. The Zed-scoped package was archived on 22 July 2026 and names this one.",
  },
};

export const CUSTOM_HARNESS_0_0_1: HarnessSpec = {
  id: 'custom',
  version: '0.0.1',
  name: 'Custom harness',
  description:
    "An organization's own ACP agent, its command named by the organization's own harness spec and never typed into a form.",
  enabled: false,
  tags: ['harness'],
  docs: '',
  requires: {
    secrets: [],
    binaries: [],
  },
  terms: {
    servedToThirdParties: 'organizations_own',
    licence: "The organization's own",
  },
  skills: {
    format: 'none',
    dir: '',
  },
  honours: {
    model: false,
    subagents: false,
  },
  instructionsFile: '',
  registered: {
    adapter: "The organization's own",
    version: '0',
    licenceSource: 'https://agentspecs.datalayer.tech/harnesses',
    termsSource: 'https://agentspecs.datalayer.tech/harnesses',
    credential: "The organization's own",
    binaries: '',
    note: "Not launchable from the shared catalogue; an organization's own harness spec names the command and answers for its terms.",
  },
};

export const FAST_AGENT_HARNESS_0_0_1: HarnessSpec = {
  id: 'fast-agent',
  version: '0.0.1',
  name: 'fast-agent',
  description:
    "llmindset's agent framework served over ACP; each agent it defines is a session mode, with any model provider it is configured with.",
  enabled: true,
  tags: ['harness', 'framework'],
  docs: 'https://github.com/evalstate/fast-agent/blob/main/docs/docs/acp/index.md',
  acp: {
    command: 'uvx',
    args: ['fast-agent-acp==0.10.45'],
    protocolVersion: 1,
    loadSession: true,
    mcp: 'lend',
    modes: [],
    env: {},
  },
  requires: {
    secrets: ['ANTHROPIC_API_KEY'],
    binaries: ['uvx'],
  },
  terms: {
    servedToThirdParties: 'permitted',
    licence: 'Apache-2.0',
  },
  skills: {
    format: 'skill-md',
    dir: '.agents/skills',
  },
  honours: {
    model: true,
    subagents: false,
  },
  instructionsFile: 'AGENTS.md',
  registered: {
    adapter: 'fast-agent-acp',
    version: '0.10.45',
    licenceSource: 'https://pypi.org/project/fast-agent-acp/',
    termsSource: 'https://github.com/evalstate/fast-agent/blob/main/LICENSE',
    credential:
      "The provider's key fast-agent is given (ANTHROPIC_API_KEY, OPENAI_API_KEY or HF_TOKEN); ANTHROPIC_API_KEY declared",
    binaries: 'uv (uvx), Python 3.12 to 3.15 (requires_python on PyPI)',
    note: "A framework, not a coding agent (SHIELD §2.5): each agent it defines is an ACP mode; the client's MCP servers are attached; sessions are listed. Launched with uvx fast-agent-acp (docs/docs/acp/index.md); reads skills from .fast-agent/skills, .agents/skills and .claude/skills; its default prompt reads AGENTS.md.",
  },
};

export const GEMINI_CLI_HARNESS_0_0_1: HarnessSpec = {
  id: 'gemini-cli',
  version: '0.0.1',
  name: 'Gemini CLI',
  description:
    "Google's coding agent, which speaks ACP itself when started with --experimental-acp.",
  enabled: true,
  tags: ['harness'],
  docs: 'https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md',
  acp: {
    command: 'npx',
    args: ['-y', '@google/gemini-cli@0.64.0', '--experimental-acp'],
    protocolVersion: 1,
    loadSession: false,
    mcp: 'lend',
    modes: ['default', 'auto_edit', 'yolo', 'plan'],
    env: {},
  },
  requires: {
    secrets: ['GEMINI_API_KEY'],
    binaries: ['node', 'git'],
  },
  terms: {
    servedToThirdParties: 'api_key_only',
    licence:
      'Apache-2.0 (the agent); Gemini API or Gemini Code Assist terms (the model)',
    tierRestrictions:
      'Gemini Code Assist Standard or Enterprise for a Google login (the individuals tier stopped being served on 18 June 2026); a Gemini API key otherwise',
  },
  skills: {
    format: 'skill-md',
    dir: '.gemini/skills',
  },
  honours: {
    model: true,
    subagents: false,
  },
  instructionsFile: 'GEMINI.md',
  registered: {
    adapter: '@google/gemini-cli',
    version: '0.64.0',
    licenceSource: 'https://www.npmjs.com/package/@google/gemini-cli',
    termsSource:
      'https://developers.google.com/gemini-code-assist/resources/privacy-notice-gemini-code-assist-individuals',
    credential:
      "A Gemini API key (GEMINI_API_KEY), the person's own; or a Google login on a Code Assist Standard or Enterprise subscription",
    binaries: 'Node 20 or later (engines.node >=20 on npm), git',
    note: 'Google\'s notice (read 2026-10-15): "Starting June 18, 2026, Gemini Code Assist IDE extensions stopped serving requests for the Gemini Code Assist for individuals"; Standard and Enterprise follow a separate schedule. The ACP flag is --experimental-acp in the CLI reference (docs/cli/cli-reference.md).',
  },
};

export const GOOSE_HARNESS_0_0_1: HarnessSpec = {
  id: 'goose',
  version: '0.0.1',
  name: 'goose',
  description:
    "Block's open agent (now the Agentic AI Foundation's), which speaks ACP itself with goose acp; any model provider it is configured with.",
  enabled: true,
  tags: ['harness'],
  docs: 'https://block.github.io/goose/docs/gdk/acp/',
  acp: {
    command: 'goose',
    args: ['acp'],
    protocolVersion: 1,
    loadSession: false,
    mcp: 'lend',
    modes: [],
    env: { GOOSE_PROVIDER: 'anthropic' },
  },
  requires: {
    secrets: ['ANTHROPIC_API_KEY'],
    binaries: ['goose@1.54.0', 'git'],
  },
  terms: {
    servedToThirdParties: 'permitted',
    licence: 'Apache-2.0',
  },
  skills: {
    format: 'skill-md',
    dir: '.agents/skills',
  },
  honours: {
    model: true,
    subagents: false,
  },
  instructionsFile: '.goosehints',
  registered: {
    adapter: 'goose',
    version: '1.54.0',
    licenceSource: 'https://github.com/aaif-goose/goose',
    termsSource: 'https://github.com/aaif-goose/goose/blob/main/LICENSE',
    credential:
      "The provider's key goose is configured with (GOOSE_PROVIDER); ANTHROPIC_API_KEY declared",
    binaries: 'The goose CLI (release v1.54.0 of 8 October 2026), git',
    note: "Open source under Apache-2.0, no vendor terms of its own; the model provider's terms apply to the key. Launched as goose acp (documentation/docs/gdk/acp/index.md).",
  },
};

export const OPENCODE_HARNESS_0_0_1: HarnessSpec = {
  id: 'opencode',
  version: '0.0.1',
  name: 'OpenCode',
  description:
    "Anomaly's open coding agent, which speaks ACP itself with opencode acp; any model provider it is configured with.",
  enabled: true,
  tags: ['harness'],
  docs: 'https://opencode.ai/docs/acp/',
  acp: {
    command: 'npx',
    args: ['-y', 'opencode-ai@1.19.0', 'acp'],
    protocolVersion: 1,
    loadSession: false,
    mcp: 'lend',
    modes: [],
    env: {},
  },
  requires: {
    secrets: ['ANTHROPIC_API_KEY'],
    binaries: ['node', 'git'],
  },
  terms: {
    servedToThirdParties: 'permitted',
    licence: 'MIT',
  },
  skills: {
    format: 'skill-md',
    dir: '.opencode/skills',
  },
  honours: {
    model: true,
    subagents: false,
  },
  instructionsFile: 'AGENTS.md',
  registered: {
    adapter: 'opencode-ai',
    version: '1.19.0',
    licenceSource: 'https://www.npmjs.com/package/opencode-ai',
    termsSource: 'https://github.com/anomalyco/opencode/blob/dev/LICENSE',
    credential:
      "The provider's key OpenCode is configured with; ANTHROPIC_API_KEY declared",
    binaries: 'Node (the opencode-ai package), git',
    note: "Open source under MIT, no vendor terms of its own; the model provider's terms apply to the key. Launched as opencode acp (opencode.ai/docs/acp); reads skills from .opencode/skills, .claude/skills and .agents/skills.",
  },
};

export const OPENHANDS_HARNESS_0_0_1: HarnessSpec = {
  id: 'openhands',
  version: '0.0.1',
  name: 'OpenHands',
  description:
    'The OpenHands CLI, which speaks ACP itself with openhands acp; any model provider it is configured with.',
  enabled: true,
  tags: ['harness'],
  docs: 'https://docs.openhands.dev/openhands/usage/run-openhands/acp',
  acp: {
    command: 'uvx',
    args: [
      '--from',
      'openhands==1.16.0',
      'openhands',
      'acp',
      '--override-with-envs',
    ],
    protocolVersion: 1,
    loadSession: true,
    mcp: 'lend',
    modes: ['always-ask', 'always-approve', 'llm-approve'],
    env: {},
  },
  requires: {
    secrets: ['LLM_API_KEY'],
    binaries: ['uvx', 'git'],
  },
  terms: {
    servedToThirdParties: 'permitted',
    licence: 'MIT',
  },
  skills: {
    format: 'skill-md',
    dir: '.agents/skills',
  },
  honours: {
    model: true,
    subagents: false,
  },
  instructionsFile: 'AGENTS.md',
  registered: {
    adapter: 'openhands',
    version: '1.16.0',
    licenceSource: 'https://pypi.org/project/openhands/',
    termsSource: 'https://github.com/OpenHands/OpenHands-CLI/blob/main/LICENSE',
    credential:
      "The provider's key OpenHands reads as LLM_API_KEY, with LLM_MODEL, under --override-with-envs",
    binaries: 'uv (uvx), Python 3.12 or later, git',
    note: "Open source under MIT, no vendor terms of its own; the model provider's terms apply to the key. Launched as openhands acp (OpenHands-CLI README; docs.openhands.dev's ACP page); resumes with --resume; reads skills from .agents/skills (.openhands/skills is legacy).",
  },
};

export const HARNESS_CATALOGUE: Record<string, HarnessSpec> = {
  'claude-code': CLAUDE_CODE_HARNESS_0_0_1,
  codex: CODEX_HARNESS_0_0_1,
  custom: CUSTOM_HARNESS_0_0_1,
  'fast-agent': FAST_AGENT_HARNESS_0_0_1,
  'gemini-cli': GEMINI_CLI_HARNESS_0_0_1,
  goose: GOOSE_HARNESS_0_0_1,
  opencode: OPENCODE_HARNESS_0_0_1,
  openhands: OPENHANDS_HARNESS_0_0_1,
};

/** A harness by id. */
export function getHarness(harnessId: string): HarnessSpec | undefined {
  return HARNESS_CATALOGUE[harnessId];
}

/** Every harness of the catalogue. */
export function listHarnesses(): HarnessSpec[] {
  return Object.values(HARNESS_CATALOGUE);
}
