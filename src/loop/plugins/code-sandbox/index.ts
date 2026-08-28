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
  CODE_SANDBOX_EXTENSION_NAME,
  CodeSandboxExtension,
  type CodeSandboxConfig,
  type CodeSandboxOutput,
} from './extension';
export { CodeSandboxExtension as default } from './extension';
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
export { useOptionalSandboxService, useSandboxService } from './useSandboxService';
export { SandboxStatusBridge } from './SandboxStatusBridge';
export { SandboxSelector } from './SandboxSelector';
export {
  TARGET_VARIANTS,
  createSwitchableSandboxService,
  type SandboxTarget,
  type SwitchableSandboxService,
} from './switchable';
