/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * PoweredBy tag component for Chat.
 * Shows branding at the bottom of the chat.
 *
 * @module components/chat/components/elements/PoweredByTag
 */

import React from 'react';
import { Box, Link } from '@primer/react';

/**
 * PoweredByTag props
 */
export interface PoweredByTagProps {
  /** Whether to show the powered by tag */
  show?: boolean;

  /** Brand name to display */
  brandName?: string;

  /** Brand URL to link to */
  brandUrl?: string;

  /** Custom brand icon */
  brandIcon?: React.ReactNode;
}

/**
 * PoweredBy tag component
 * Displays a "Powered by X" branding tag
 */
export function PoweredByTag({
  show = true,
  brandName = 'Datalayer',
  brandUrl = 'https://datalayer.ai',
  brandIcon,
}: PoweredByTagProps) {
  if (!show) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        py: 2,
        px: 3,
        fontSize: 0,
        color: 'fg.muted',
        borderTop: '1px solid',
        borderColor: 'border.default',
        bg: 'canvas.subtle',
      }}
    >
      {brandIcon && (
        <Box sx={{ display: 'flex', alignItems: 'center' }}>{brandIcon}</Box>
      )}
      <span>Powered by</span>
      <Link
        href={brandUrl}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          color: 'fg.muted',
          fontWeight: 'semibold',
          textDecoration: 'none',
          '&:hover': {
            color: 'accent.fg',
            textDecoration: 'underline',
          },
        }}
      >
        {brandName}
      </Link>
    </Box>
  );
}

export default PoweredByTag;
