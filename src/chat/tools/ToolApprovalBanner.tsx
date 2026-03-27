/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Tool Approval Banner component.
 *
 * A persistent banner shown at the top of the chat when there are
 * pending tool approval requests. Provides quick counts and
 * a review button that opens the full ToolApprovalDialog.
 *
 * @module chat/tools/ToolApprovalBanner
 */

import { useState } from 'react';
import { Box, Button, Text, CounterLabel } from '@primer/react';
import {
  ShieldCheckIcon,
  AlertIcon,
  CheckIcon,
  XIcon,
} from '@primer/octicons-react';

/**
 * A single pending approval item.
 */
export interface PendingApproval {
  id: string;
  toolName: string;
  toolDescription?: string;
  args: Record<string, unknown>;
  agentId: string;
  requestedAt: string;
}

/**
 * Props for the ToolApprovalBanner.
 */
export interface ToolApprovalBannerProps {
  /** List of pending approvals */
  pendingApprovals: PendingApproval[];

  /** Called when user clicks "Review" on a specific approval */
  onReview: (approval: PendingApproval) => void;

  /** Called when user clicks "Approve All" */
  onApproveAll?: () => void;

  /** Called when user clicks "Dismiss" */
  onDismiss?: () => void;

  /** Whether the banner is collapsible */
  collapsible?: boolean;
}

/**
 * Persistent banner for tool approval notifications.
 */
export function ToolApprovalBanner({
  pendingApprovals,
  onReview,
  onApproveAll,
  onDismiss,
  collapsible = true,
}: ToolApprovalBannerProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (pendingApprovals.length === 0) {
    return null;
  }

  if (collapsed) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 3,
          py: 2,
          bg: 'attention.subtle',
          borderBottom: '1px solid',
          borderColor: 'attention.muted',
          cursor: 'pointer',
        }}
        onClick={() => setCollapsed(false)}
      >
        <ShieldCheckIcon size={16} />
        <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
          Tool approvals pending
        </Text>
        <CounterLabel>{pendingApprovals.length}</CounterLabel>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        borderBottom: '1px solid',
        borderColor: 'attention.muted',
        bg: 'attention.subtle',
      }}
    >
      {/* Header row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AlertIcon size={16} />
          <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
            {pendingApprovals.length} tool{' '}
            {pendingApprovals.length === 1 ? 'approval' : 'approvals'} pending
          </Text>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {onApproveAll && pendingApprovals.length > 1 && (
            <Button
              size="small"
              variant="primary"
              leadingVisual={CheckIcon}
              onClick={onApproveAll}
            >
              Approve all
            </Button>
          )}
          {collapsible && (
            <Button
              size="small"
              variant="invisible"
              onClick={() => setCollapsed(true)}
            >
              Collapse
            </Button>
          )}
          {onDismiss && (
            <Button
              size="small"
              variant="invisible"
              leadingVisual={XIcon}
              onClick={onDismiss}
              aria-label="Dismiss"
            />
          )}
        </Box>
      </Box>

      {/* Approval list */}
      <Box sx={{ px: 3, pb: 2 }}>
        {pendingApprovals.map(approval => (
          <Box
            key={approval.id}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 1,
              px: 2,
              mb: 1,
              bg: 'canvas.default',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Box>
              <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
                {approval.toolName}
              </Text>
              {approval.toolDescription && (
                <Text sx={{ color: 'fg.muted', fontSize: 0, ml: 2 }}>
                  {approval.toolDescription}
                </Text>
              )}
            </Box>
            <Button
              size="small"
              variant="default"
              onClick={() => onReview(approval)}
            >
              Review
            </Button>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export default ToolApprovalBanner;
