/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Button, Label, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  CheckCircleIcon,
  EyeClosedIcon,
  EyeIcon,
  TrashIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import { formatRelativeTime } from '@datalayer/core/lib/utils';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'approved_with_changes'
  | 'rejected';
type RiskLevel = 'low' | 'medium' | 'high';

export const TOOL_APPROVAL_STATUS_CONFIG: Record<
  ApprovalStatus,
  {
    label: string;
    variant:
      | 'default'
      | 'primary'
      | 'secondary'
      | 'accent'
      | 'success'
      | 'attention'
      | 'severe'
      | 'danger'
      | 'done';
  }
> = {
  pending: { label: 'Pending', variant: 'attention' },
  approved: { label: 'Approved', variant: 'success' },
  approved_with_changes: { label: 'Approved with Changes', variant: 'accent' },
  rejected: { label: 'Rejected', variant: 'danger' },
};

const RISK_CONFIG: Record<
  RiskLevel,
  {
    label: string;
    variant:
      | 'default'
      | 'primary'
      | 'secondary'
      | 'accent'
      | 'success'
      | 'attention'
      | 'severe'
      | 'danger'
      | 'done';
  }
> = {
  low: { label: 'Low Risk', variant: 'success' },
  medium: { label: 'Medium Risk', variant: 'attention' },
  high: { label: 'High Risk', variant: 'severe' },
};

export interface ToolApprovalCardData {
  id: string;
  toolName: string;
  toolDescription: string;
  sourceType: 'agent' | 'team';
  sourceName: string;
  requestedBy: string;
  requestedAt: string;
  status: ApprovalStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reason: string;
  reviewComment?: string;
  changes?: string;
  parameters?: Record<string, string>;
  riskLevel: RiskLevel;
  isRead?: boolean;
}

export interface ToolApprovalCardProps {
  approval: ToolApprovalCardData;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onToggleRead?: (id: string, read: boolean) => void;
  onDelete?: (id: string) => void;
}

export function ToolApprovalCard({
  approval,
  onApprove,
  onReject,
  onToggleRead,
  onDelete,
}: ToolApprovalCardProps) {
  const statusConfig = TOOL_APPROVAL_STATUS_CONFIG[approval.status];
  const riskConfig = RISK_CONFIG[approval.riskLevel];
  const parameterCount = approval.parameters
    ? Object.keys(approval.parameters).length
    : 0;
  const detailLineSx = { fontSize: 0, overflowWrap: 'anywhere' as const };
  const detailLabelSx = { color: 'fg.muted' };
  const detailValueSx = { color: 'fg.default' };
  const isRead = approval.isRead ?? false;

  return (
    <Box
      sx={{
        p: 3,
        borderRadius: 2,
        border: '1px solid',
        borderColor: isRead ? 'transparent' : 'accent.muted',
        bg: isRead ? 'canvas.default' : 'accent.subtle',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 3,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              mb: 1,
              flexWrap: 'wrap',
            }}
          >
            <Text sx={{ fontWeight: 'bold', fontSize: 2 }}>
              {approval.toolName}
            </Text>
            <Label variant={statusConfig.variant}>{statusConfig.label}</Label>
            <Label variant={riskConfig.variant}>{riskConfig.label}</Label>
            {!isRead && <Label variant="accent">Unread</Label>}
          </Box>
          <Text sx={{ color: 'fg.muted', fontSize: 0, display: 'block' }}>
            Requested by {approval.requestedBy}{' '}
            {formatRelativeTime(approval.requestedAt)}
            {approval.reviewedAt
              ? `, reviewed by ${approval.reviewedBy || 'reviewer'} ${formatRelativeTime(approval.reviewedAt)}`
              : ', review pending'}
          </Text>
          <Box
            sx={{
              mt: 2,
              width: '100%',
              p: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.muted',
              bg: 'canvas.subtle',
            }}
          >
            <details>
              <summary style={{ cursor: 'pointer' }}>
                <Text sx={{ fontSize: 0, fontWeight: 'semibold' }}>
                  View details
                </Text>
              </summary>
              <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
                <Text sx={detailLineSx}>
                  <Text as="span" sx={detailLabelSx}>
                    Source:{' '}
                  </Text>
                  <Text as="span" sx={detailValueSx}>
                    {approval.sourceName} ({approval.sourceType})
                  </Text>
                </Text>
                <Text sx={detailLineSx}>
                  <Text as="span" sx={detailLabelSx}>
                    Request ID:{' '}
                  </Text>
                  <Text as="span" sx={detailValueSx}>
                    {approval.id}
                  </Text>
                </Text>
                <Text sx={detailLineSx}>
                  <Text as="span" sx={detailLabelSx}>
                    Requested at:{' '}
                  </Text>
                  <Text as="span" sx={detailValueSx}>
                    {new Date(approval.requestedAt).toLocaleString()}
                  </Text>
                </Text>
                <Text sx={detailLineSx}>
                  <Text as="span" sx={detailLabelSx}>
                    Requested by:{' '}
                  </Text>
                  <Text as="span" sx={detailValueSx}>
                    {approval.requestedBy}
                  </Text>
                </Text>
                {approval.reviewedAt && (
                  <Text sx={detailLineSx}>
                    <Text as="span" sx={detailLabelSx}>
                      Reviewed at:{' '}
                    </Text>
                    <Text as="span" sx={detailValueSx}>
                      {new Date(approval.reviewedAt).toLocaleString()} by{' '}
                      {approval.reviewedBy || 'reviewer'}
                    </Text>
                  </Text>
                )}
                <Text sx={detailLineSx}>
                  <Text as="span" sx={detailLabelSx}>
                    Parameters:{' '}
                  </Text>
                  <Text as="span" sx={detailValueSx}>
                    {parameterCount}
                  </Text>
                </Text>
                <Text sx={detailLineSx}>
                  <Text as="span" sx={detailLabelSx}>
                    Reason:{' '}
                  </Text>
                  <Text as="span" sx={detailValueSx}>
                    {approval.reason || approval.toolDescription}
                  </Text>
                </Text>
              </Box>
              {parameterCount > 0 && (
                <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
                  {Object.entries(approval.parameters || {}).map(
                    ([key, value]) => (
                      <Text key={key} sx={detailLineSx}>
                        <Text as="span" sx={detailLabelSx}>
                          {key}:{' '}
                        </Text>
                        <Text as="span" sx={detailValueSx}>
                          {String(value)}
                        </Text>
                      </Text>
                    ),
                  )}
                </Box>
              )}
            </details>
          </Box>
        </Box>
        {approval.status === 'pending' && (
          <Box sx={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <Button
              size="small"
              variant="primary"
              leadingVisual={CheckCircleIcon}
              onClick={() => onApprove?.(approval.id)}
            >
              Approve
            </Button>
            <Button
              size="small"
              variant="danger"
              leadingVisual={XCircleIcon}
              onClick={() => onReject?.(approval.id)}
            >
              Reject
            </Button>
          </Box>
        )}
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}
        >
          <Button
            size="small"
            variant="invisible"
            onClick={() => onToggleRead?.(approval.id, isRead)}
            sx={{ p: 1 }}
            title={`Mark as ${isRead ? 'unread' : 'read'}`}
            aria-label={`Mark as ${isRead ? 'unread' : 'read'}`}
          >
            {isRead ? <EyeClosedIcon size={12} /> : <EyeIcon size={12} />}
          </Button>
          <Button
            size="small"
            variant="invisible"
            onClick={() => onDelete?.(approval.id)}
            sx={{ p: 1, color: 'danger.fg' }}
            title="Delete"
            aria-label="Delete"
          >
            <TrashIcon size={12} />
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

export default ToolApprovalCard;
