/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The segmented toggle for how a chat is shown — the four modes of
 * `CHAT_VIEW_MODES`, drawn as icons in a pill, the current one raised.
 *
 * It grew up in the chat header, and lives apart from it so the same
 * control can stand elsewhere: a composer floating over a page as a
 * draggable card carries it in its own footer, where the person deciding
 * how the chat should sit has the chat under their hands. The rules — the
 * order, the words, which modes are greyed out — stay in `viewModes.ts`;
 * this is only their drawing.
 *
 * @module chat/header/ChatViewModeToggle
 */

import type { JSX } from 'react';
import { Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  CommentDiscussionIcon,
  DeviceMobileIcon,
  GrabberIcon,
  SidebarExpandIcon,
  type Icon,
} from '@primer/octicons-react';
import type { ChatViewMode } from '../../types/chat';
import { CHAT_VIEW_MODES, SIDEBAR_NEEDS_MOUNT_POINT } from '../viewModes';

/** The drawing of each mode. */
export const VIEW_MODE_ICONS: Record<ChatViewMode, Icon> = {
  floating: CommentDiscussionIcon,
  'floating-small': DeviceMobileIcon,
  'floating-draggable': GrabberIcon,
  sidebar: SidebarExpandIcon,
};

export type ChatViewModeToggleProps = {
  /** The mode the chat is in now. */
  value?: ChatViewMode;
  /** The mode the person picked. */
  onChange: (mode: ChatViewMode) => void;
  /** Modes shown greyed out: the sidebar, when the host has no mount point. */
  disabledModes?: readonly ChatViewMode[];
  /** Where the tooltips open. Above by default; below for a control at the top of its window. */
  tooltipDirection?: 'n' | 's';
};

export function ChatViewModeToggle({
  value,
  onChange,
  disabledModes = [],
  tooltipDirection = 'n',
}: ChatViewModeToggleProps): JSX.Element {
  return (
    <Box
      role="group"
      aria-label="Display mode"
      data-chat-view-mode-toggle=""
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        bg: 'neutral.muted',
        borderRadius: '6px',
        p: '2px',
        gap: '1px',
      }}
    >
      {CHAT_VIEW_MODES.map(({ mode, label }) => {
        const ModeIcon = VIEW_MODE_ICONS[mode];
        const selected = value === mode;
        /* Greyed rather than left out: the person sees the mode exists, and
           that this page has no place for it. */
        const disabled = disabledModes.includes(mode);
        return (
          <Tooltip
            key={mode}
            text={
              disabled && mode === 'sidebar'
                ? `${label} — ${SIDEBAR_NEEDS_MOUNT_POINT}`
                : label
            }
            direction={tooltipDirection}
          >
            <Box
              as="button"
              type="button"
              aria-label={label}
              aria-pressed={selected}
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (!disabled) {
                  onChange(mode);
                }
              }}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 24,
                borderRadius: '4px',
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.45 : 1,
                bg: selected ? 'canvas.default' : 'transparent',
                boxShadow: selected ? 'shadow.small' : 'none',
                color: selected ? 'fg.default' : 'fg.muted',
                transition: 'all 0.15s ease',
                '&:hover': disabled
                  ? {}
                  : {
                      color: 'fg.default',
                      bg: selected ? 'canvas.default' : 'neutral.subtle',
                    },
              }}
            >
              <ModeIcon size={14} />
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
