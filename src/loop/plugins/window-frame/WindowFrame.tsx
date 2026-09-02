/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A window around the workspace.
 *
 * Chrome that says "this is an application" without imitating a particular
 * one: a rounded, shadowed card with a title bar carrying window controls on
 * the leading edge, a name, and whatever the host offers on the trailing edge.
 *
 * It exists so that a page embedding Loop does not have to draw one. The
 * landing page had this markup, which is the wrong side of the boundary for it
 * to live on — a change to how Loop presents itself would have had to be made
 * in a repository that only renders it.
 *
 * Both edges are reactor slots, so what goes in them is contributed rather
 * than passed down: a plugin adds a control without the frame knowing what it
 * is, and without the host that mounted the frame having to forward it.
 *
 * @module loop/plugins/window-frame/WindowFrame
 */

import type { ReactNode } from 'react';
import { Box } from '@datalayer/primer-addons';
import {
  ReactorSlot,
  useOptionalSlotComponents,
} from '@datalayer/reactor/react';
import { WINDOW_ACTIONS_SLOT, WINDOW_CONTROLS_SLOT } from './slots';

export type WindowFrameProps = {
  /** What the window contains — the workspace, normally. */
  children: ReactNode;
  /**
   * What the window is called, shown in the title bar.
   *
   * Optional: a host that names the workspace on the line above it has no use
   * for a second label, but a window bar is where a window's name goes, so the
   * space stays for one that does.
   */
  title?: ReactNode;
  /**
   * How tall the body stands. Any CSS length.
   *
   * The host's call rather than the frame's: how much of the page Loop should
   * take is a question about the page.
   *
   * Omitted, the frame fills whatever it was given and the body takes what the
   * title bar leaves. That is the right answer for a full-page host, and it
   * avoids the alternative — subtracting the bar's height in a `calc` on the
   * host's side, which is a number that silently goes wrong the first time the
   * bar gains a row.
   */
  height?: string | number;
  /** Anything the slots' components should receive. */
  slotProps?: Record<string, unknown>;
};

export function WindowFrame({
  children,
  title,
  height,
  slotProps = {},
}: WindowFrameProps): React.JSX.Element {
  /*
   * Asked rather than assumed, so the trailing group is not an empty flex box
   * taking a gap's worth of space in a bar that is mostly title.
   *
   * The tolerant read, because the frame is *outside* the workspace it frames:
   * a host composes `<WindowFrame>` around whatever builds the reactor, so on
   * the first render there is no platform at all. The bar draws without its
   * actions and fills them in when the workspace registers one.
   */
  const actions = useOptionalSlotComponents(WINDOW_ACTIONS_SLOT);

  return (
    <Box
      sx={{
        position: 'relative',
        // Filling is the default: with no height given the frame takes the
        // space it was handed and the body gets the remainder.
        ...(height === undefined
          ? { height: '100%', display: 'flex', flexDirection: 'column' }
          : null),
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'border.default',
        bg: 'canvas.default',
        // Lifted off the field, so the workspace reads as a thing sitting on
        // the page rather than a hole cut into it.
        boxShadow: '0 24px 60px -28px rgba(0, 0, 0, 0.55)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          bg: 'canvas.subtle',
          // The bar may be the page's first line of type as well as its
          // chrome, so it takes a second row on a narrow screen rather than
          // shedding its actions off the edge.
          flexWrap: 'wrap',
          rowGap: 2,
          // Never squeezed by the body beside it.
          flex: '0 0 auto',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            mr: 1,
            flexShrink: 0,
          }}
        >
          <ReactorSlot slot={WINDOW_CONTROLS_SLOT} props={slotProps} />
        </Box>

        {/* Allowed to shrink to nothing before the actions do: a title that
            truncates is still a title, and a button pushed off the edge is not
            a button. */}
        <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>{title}</Box>

        {actions.length > 0 ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexShrink: 0,
              ml: 'auto',
            }}
          >
            <ReactorSlot slot={WINDOW_ACTIONS_SLOT} props={slotProps} />
          </Box>
        ) : null}
      </Box>

      <Box
        sx={
          height === undefined
            ? { flex: '1 1 auto', minHeight: 0 }
            : { height, minHeight: 0 }
        }
      >
        {children}
      </Box>
    </Box>
  );
}

export default WindowFrame;
