/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Tool approval dialog component.
 * Shows a dialog for HITL tool approval.
 *
 * @module components/chat/components/elements/ToolApprovalDialog
 */

import { useCallback, useState } from 'react';
import {
  Box,
  Button,
  Text,
  Heading,
  FormControl,
  Checkbox,
} from '@primer/react';
import { Dialog } from '@primer/react/experimental';
import { AlertIcon, ToolsIcon, CheckIcon, XIcon } from '@primer/octicons-react';

/**
 * ToolApprovalDialog props
 */
export interface ToolApprovalDialogProps {
  /** Whether dialog is open */
  isOpen: boolean;

  /** Tool name */
  toolName: string;

  /** Tool description */
  toolDescription?: string;

  /** Tool arguments */
  args: Record<string, unknown>;

  /** Callback when approved */
  onApprove: (rememberChoice?: boolean) => void;

  /** Callback when denied */
  onDeny: (rememberChoice?: boolean) => void;

  /** Callback when dialog closed */
  onClose: () => void;

  /** Show "remember my choice" option */
  showRememberChoice?: boolean;
}

/**
 * Tool Approval Dialog component
 */
export function ToolApprovalDialog({
  isOpen,
  toolName,
  toolDescription,
  args,
  onApprove,
  onDeny,
  onClose,
  showRememberChoice = true,
}: ToolApprovalDialogProps) {
  const [rememberChoice, setRememberChoice] = useState(false);

  const handleApprove = useCallback(() => {
    onApprove(rememberChoice);
  }, [onApprove, rememberChoice]);

  const handleDeny = useCallback(() => {
    onDeny(rememberChoice);
  }, [onDeny, rememberChoice]);

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog onClose={onClose} aria-labelledby="tool-approval-title">
      <Dialog.Header>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AlertIcon size={16} />
          Tool Approval Required
        </Box>
      </Dialog.Header>

      <Box sx={{ p: 3 }}>
        {/* Tool info */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <ToolsIcon size={20} />
            <Heading as="h4" sx={{ fontSize: 2 }}>
              {toolName}
            </Heading>
          </Box>

          {toolDescription && (
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
              {toolDescription}
            </Text>
          )}
        </Box>

        {/* Arguments */}
        <Box sx={{ mb: 3 }}>
          <Text
            sx={{
              fontWeight: 'semibold',
              fontSize: 1,
              mb: 2,
              display: 'block',
            }}
          >
            Arguments:
          </Text>
          <Box
            as="pre"
            sx={{
              p: 3,
              bg: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
              overflow: 'auto',
              maxHeight: 200,
              fontSize: 0,
            }}
          >
            {JSON.stringify(args, null, 2)}
          </Box>
        </Box>

        {/* Warning */}
        <Box
          sx={{
            p: 3,
            bg: 'attention.subtle',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'attention.muted',
            mb: 3,
          }}
        >
          <Text sx={{ fontSize: 1 }}>
            This tool will perform an action on your behalf. Please review the
            arguments before approving.
          </Text>
        </Box>

        {/* Remember choice */}
        {showRememberChoice && (
          <FormControl sx={{ mb: 3 }}>
            <Checkbox
              checked={rememberChoice}
              onChange={e => setRememberChoice(e.target.checked)}
            />
            <FormControl.Label>
              Remember my choice for this tool
            </FormControl.Label>
          </FormControl>
        )}

        {/* Actions */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button variant="danger" onClick={handleDeny} leadingVisual={XIcon}>
            Deny
          </Button>
          <Button
            variant="primary"
            onClick={handleApprove}
            leadingVisual={CheckIcon}
          >
            Approve
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}

/**
 * Hook to manage tool approval dialog state
 */
export function useToolApprovalDialog() {
  const [state, setState] = useState<{
    isOpen: boolean;
    toolName: string;
    toolDescription?: string;
    args: Record<string, unknown>;
    resolve?: (approved: boolean, rememberChoice?: boolean) => void;
  }>({
    isOpen: false,
    toolName: '',
    args: {},
  });

  const requestApproval = useCallback(
    (
      toolName: string,
      args: Record<string, unknown>,
      toolDescription?: string,
    ): Promise<{ approved: boolean; rememberChoice?: boolean }> => {
      return new Promise(resolve => {
        setState({
          isOpen: true,
          toolName,
          toolDescription,
          args,
          resolve: (approved, rememberChoice) =>
            resolve({ approved, rememberChoice }),
        });
      });
    },
    [],
  );

  const handleApprove = useCallback(
    (rememberChoice?: boolean) => {
      state.resolve?.(true, rememberChoice);
      setState(prev => ({ ...prev, isOpen: false }));
    },
    [state],
  );

  const handleDeny = useCallback(
    (rememberChoice?: boolean) => {
      state.resolve?.(false, rememberChoice);
      setState(prev => ({ ...prev, isOpen: false }));
    },
    [state],
  );

  const handleClose = useCallback(() => {
    state.resolve?.(false);
    setState(prev => ({ ...prev, isOpen: false }));
  }, [state]);

  return {
    isOpen: state.isOpen,
    toolName: state.toolName,
    toolDescription: state.toolDescription,
    args: state.args,
    requestApproval,
    handleApprove,
    handleDeny,
    handleClose,
  };
}

export default ToolApprovalDialog;
