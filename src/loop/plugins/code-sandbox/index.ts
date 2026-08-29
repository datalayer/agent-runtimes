/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-code-sandbox` — the sandbox, owned in one place.
 *
 * @module loop/plugins/code-sandbox
 */

export {
  CODE_SANDBOX_PLUGIN_NAME,
  CodeSandboxPlugin,
  type CodeSandboxConfig,
  type CodeSandboxOutput,
} from './plugin';
export { CodeSandboxPlugin as default } from './plugin';
export {
  browserSource,
  createBrowserSandboxService,
  suppliedSource,
  type BrowserSandboxService,
  type ServiceManagerSource,
} from './browserService';
export {
  createServerSandboxService,
  summarize,
  type SandboxExecution,
  type SandboxService,
  type SandboxStatusPayload,
} from './service';
export {
  useOptionalSandboxService,
  useSandboxService,
} from './useSandboxService';
export { SandboxStatusBridge } from './SandboxStatusBridge';
export { SandboxSelector } from './SandboxSelector';
export {
  SANDBOX_TARGETS,
  TARGET_SPECS,
  targetHasAgent,
  createSwitchableSandboxService,
  type SandboxTarget,
  type SwitchableSandboxService,
} from './switchable';
