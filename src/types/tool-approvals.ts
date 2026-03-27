/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// ---- Tool Approvals ----

export interface ToolApproval {
  /** Unique approval request ID */
  id: string;
  /** Agent that requested the tool call */
  agentId: string;
  /** Pod running the agent */
  podName: string;
  /** Tool being requested */
  toolName: string;
  /** Tool call arguments */
  toolArgs: Record<string, unknown>;
  /** Current approval status */
  status: ToolApprovalStatus;
  /** When the request was created */
  createdAt: string;
  /** When the request was resolved */
  resolvedAt?: string;
  /** Who resolved the request */
  resolvedBy?: string;
  /** Optional note from the approver */
  note?: string;
  /** Time limit for the approval (ISO timestamp) */
  expiresAt?: string;
}

export type ToolApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'auto_approved';

export interface ToolApprovalFilters {
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by status */
  status?: ToolApprovalStatus;
  /** Filter by tool name */
  toolName?: string;
  /** Maximum results to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}
