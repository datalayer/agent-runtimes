/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly EXAMPLE?: string;
  readonly VITE_ACP_WS_URL?: string;
  readonly VITE_DATALAYER_RUN_URL?: string;
  readonly VITE_COPILOT_KIT_API_KEY?: string;
  readonly VITE_BASE_URL?: string;
  readonly VITE_GITHUB_CLIENT_ID?: string;
  readonly VITE_KAGGLE_TOKEN?: string;
  /** Jupyter sandbox URL for two-container Codemode architecture */
  readonly VITE_JUPYTER_SANDBOX_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.lexical' {
  const content: any;
  export default content;
}
