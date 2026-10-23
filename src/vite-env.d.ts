/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly EXAMPLE?: string;
  readonly VITE_ACP_WS_URL?: string;
  readonly VITE_DATALAYER_RUNTIMES_URL?: string;
  readonly VITE_DATALAYER_AGENT_RUNTIMES_URL?: string;
  readonly VITE_DATALAYER_AI_INFERENCE_URL?: string;
  readonly VITE_COPILOT_KIT_API_KEY?: string;
  readonly VITE_BASE_URL?: string;
  readonly VITE_GITHUB_CLIENT_ID?: string;
  readonly VITE_KAGGLE_API_TOKEN?: string;
  /** Jupyter sandbox URL for two-container Codemode architecture */
  readonly VITE_JUPYTER_SANDBOX_URL?: string;
  /** Where the Accounting application is served over A2A (AgentA2ATeamExample). */
  readonly VITE_A2A_ACCOUNTING_URL?: string;
  /** A temporary key granted to Accounting's A2A route: never committed (`.env.local`). */
  readonly VITE_A2A_ACCOUNTING_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.lexical' {
  const content: any;
  export default content;
}
