/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Sandbox-related types for WebSocket status streaming and
 * the SandboxStatusIndicator component.
 *
 * @module types/sandbox
 */

import { defaultIndicatorColors } from '@datalayer/primer-addons/lib/theme';

/* ── WebSocket message from server ─────────────────────── */

/**
 * Status message pushed by the `/configure/sandbox/ws` WebSocket.
 */
export interface SandboxWsStatus {
  variant: string;
  sandbox_running: boolean;
  is_executing: boolean;
  jupyter_url?: string | null;
  /** Present only on error. */
  error?: string;
}

/**
 * Acknowledge message when the client sends an interrupt action.
 */
export interface SandboxInterruptAck {
  action: 'interrupt';
  success: boolean;
  error?: string;
}

/** Union of all messages the server can send. */
export type SandboxWsMessage = SandboxWsStatus | SandboxInterruptAck;

/* ── Aggregate status ──────────────────────────────────── */

/**
 * Derived aggregate status for display purposes.
 */
export type SandboxAggregateStatus =
  | 'unavailable'
  | 'stopped'
  | 'idle'
  | 'executing';

/* ── Visual constants ──────────────────────────────────── */

export const SANDBOX_STATUS_COLORS: Record<SandboxAggregateStatus, string> = {
  unavailable: defaultIndicatorColors.muted,
  stopped: defaultIndicatorColors.muted,
  idle: defaultIndicatorColors.success,
  executing: defaultIndicatorColors.info,
};

export const SANDBOX_STATUS_LABELS: Record<SandboxAggregateStatus, string> = {
  unavailable: 'Sandbox unavailable',
  stopped: 'Sandbox not running',
  idle: 'Sandbox idle',
  executing: 'Sandbox executing code',
};
