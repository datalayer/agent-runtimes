/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-agents` — the sandbox, owned in one place.
 *
 * @module apps/plugins/agents
 */

export {
  AGENTS_PLUGIN_NAME,
  AgentsPlugin,
  DEFAULT_DATALAYER_AGENTSPEC,
  type AgentsConfig,
  type AgentsOutput,
} from './plugin';
export { AgentsPlugin as default } from './plugin';
export {
  browserSource,
  createBrowserSandboxService,
  suppliedSource,
  type BrowserSandboxService,
  type ServiceManagerSource,
} from './browserService';
export {
  createServerSandboxService,
  serverTokenOf,
  summarize,
  type SandboxExecution,
  type SandboxService,
  type SandboxStatusPayload,
  type ServerToken,
} from './service';
export {
  useOptionalSandboxService,
  useSandboxService,
  useServerToken,
} from './useSandboxService';
export { SandboxStatusBridge } from './SandboxStatusBridge';
export { SandboxSelector } from './SandboxSelector';
export {
  SANDBOX_TARGETS,
  TARGET_SPECS,
  targetHasAgent,
  targetRunsAgentInPage,
  createSwitchableSandboxService,
  type SandboxTarget,
  type SwitchableSandboxService,
} from './switchable';
