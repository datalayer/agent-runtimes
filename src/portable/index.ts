/*
 * Copyright (c) 2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What any JavaScript runtime can import from Agent Runtimes: plain
 * functions and types, no React, DOM, Jupyter or Node built-in. The mobile
 * app reaches Agent Runtimes only through
 * `@datalayer/agent-runtimes/lib/portable`.
 *
 * @module portable
 */

export {
  messageOfApproval,
  normalizeApproval,
  whyAsked,
  type ApprovalArgs,
  type ApprovalRecord,
  type MessageAsked,
} from './approvals';
