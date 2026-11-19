/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A page tool's call, run: it always answers.
 *
 * What its handler returned, or — when the handler throws — a failure, the
 * tool and what failed in a sentence. Sent back either way, so the run goes
 * on and the runtime can count a failure: it ends a turn whose page tool
 * failed twice (`agent_runtimes.apps.page_tools`). A call left without a
 * result stopped the run where it stood.
 *
 * @module chat/base/pageTool
 */

import type { ToolExecutionResult } from '../../types/tools';

/** What failed, said of a page tool. */
export function pageToolFailure(toolName: string, error: unknown): string {
  const said =
    error instanceof Error ? error.message : String(error ?? 'it failed');
  return `${toolName} failed: ${said.trim() || 'it failed'}`;
}

/** Run a page tool's handler, its failure answered rather than thrown. */
export async function runPageTool(
  toolName: string,
  handler: (args: Record<string, unknown>) => Promise<unknown>,
  args: Record<string, unknown>,
  toolCallId?: string,
): Promise<ToolExecutionResult> {
  try {
    return { toolCallId, success: true, result: await handler(args) };
  } catch (error) {
    return {
      toolCallId,
      success: false,
      error: pageToolFailure(toolName, error),
    };
  }
}
