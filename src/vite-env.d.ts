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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.lexical' {
  const content: any;
  export default content;
}
