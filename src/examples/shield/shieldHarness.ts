/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What `ShieldHarnessExample` connects to and offers (SH-23).
 *
 * `examples/shield/harness_on_the_runtime.py --serve` names the harness's
 * agent `chat`, as `loop --harness` does with `AGENT_RUNTIMES_AGENT_NAME`;
 * the openers are the fake agent's words (its docstring says what each does).
 *
 * @module examples/shield/shieldHarness
 */

import type { Suggestion } from '../../types/chat';

/** The agent the local runtime serves the harness as. */
export const SHIELD_HARNESS_AGENT = 'chat';

/** What to ask the fake agent: one of each decision. */
export const SHIELD_HARNESS_OPENERS: Suggestion[] = [
  {
    title: 'Edit a file',
    message: 'edit and read README.md',
  },
  {
    title: 'Run a command',
    message: 'run echo hello',
  },
  {
    title: 'Read outside the workspace',
    message: 'outside',
  },
];
