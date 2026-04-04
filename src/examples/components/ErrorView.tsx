/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Text, Button } from '@primer/react';
import { AlertIcon, SignOutIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';

export type ErrorViewProps = {
  /** Primary error message. Falls back to "Agent failed to start". */
  error?: string | null;
  /** Optional secondary detail line shown below the primary message. */
  detail?: string | null;
  /** Called when the user clicks "Sign out". Button only appears for 401 errors. */
  onLogout?: () => void;
};

/**
 * Full-screen error view used by examples when agent creation fails.
 * Automatically shows a "Sign out" button when the error contains "401".
 */
export const ErrorView: React.FC<ErrorViewProps> = ({
  error,
  detail,
  onLogout,
}) => {
  const message = error || 'Agent failed to start';
  const is401 =
    String(message).includes('401') || String(detail || '').includes('401');

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 3,
      }}
    >
      <AlertIcon size={48} />
      <Text sx={{ color: 'danger.fg', fontSize: 2 }}>{message}</Text>
      {detail && <Text sx={{ color: 'fg.muted' }}>{detail}</Text>}
      {is401 && onLogout && (
        <Button variant="danger" leadingVisual={SignOutIcon} onClick={onLogout}>
          Sign out
        </Button>
      )}
    </Box>
  );
};
