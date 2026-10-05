/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A large visual a balloon carries (LOOP T-23): a notebook today, a chart or
 * a table later. The balloon shows it compact — its `attachment`, such as
 * the read-only preview of a notebook — with an *Expand* button; expanded,
 * the visual is drawn large: into the element the host names
 * (`expandTarget`, through a portal), or, when it names none, in a large
 * dialog over the page — Esc closes it, and the focus stays in it while it
 * is open.
 *
 * What the expanded visual is, the visual says (`render`): for a notebook,
 * the one that runs and is edited on the browser sandbox (`TeamNotebook`).
 *
 * @module chat/assistant/BalloonVisual
 */

import type { JSX, ReactNode, RefObject } from 'react';
import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dialog, IconButton } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  ScreenFullIcon,
  ScreenNormalIcon,
  XIcon,
} from '@primer/octicons-react';

/** A large visual a balloon carries, and how it is drawn large. */
export interface BalloonVisual {
  /** Its id: a new one is a new visual. */
  id: string;
  /** What it is: `Accounting's notebook`; the dialog's title. */
  title: string;
  /**
   * The visual, large: drawn only once it is expanded — in the page's
   * target, or in a dialog, which already shows `title`.
   */
  render: (place: 'target' | 'overlay') => ReactNode;
  /**
   * Large, it shrinks back into the balloon (*Shrink*) rather than closes:
   * the balloon's own content drawn large, such as its history.
   */
  shrink?: boolean;
}

/** Where an expanded visual goes: an element of the page, or none (a dialog). */
export type BalloonExpandTarget = RefObject<HTMLElement | null>;

/**
 * Expands the visual of the balloon it is in: what its compact form (a
 * notebook's preview) calls when it is clicked. None outside such a balloon.
 */
export const BalloonExpandContext = createContext<(() => void) | null>(null);

/** The balloon's way to expand its visual, if it carries one. */
export function useBalloonExpand(): (() => void) | null {
  return useContext(BalloonExpandContext);
}

/** The balloon's *Expand* button. */
export function BalloonExpandButton({
  title,
  onExpand,
}: {
  title: string;
  onExpand: () => void;
}): JSX.Element {
  return (
    <Button
      size="small"
      variant="invisible"
      leadingVisual={ScreenFullIcon}
      aria-label={`Expand ${title}`}
      data-balloon-expand=""
      onClick={onExpand}
      sx={{ alignSelf: 'flex-start', px: 1 }}
    >
      Expand
    </Button>
  );
}

/** How large the dialog is when no target is named: most of the window. */
export const EXPANDED_DIALOG_SIZE = { width: '80vw', height: '80vh' } as const;

/**
 * The visual, expanded: into `target` when it names an element, else in a
 * large dialog over the page, closed with Esc or its close button.
 */
export function ExpandedVisual({
  visual,
  target,
  onClose,
}: {
  visual: BalloonVisual;
  target?: BalloonExpandTarget;
  onClose: () => void;
}): JSX.Element | null {
  const element = target?.current;
  if (target) {
    if (!element) {
      return null;
    }
    return createPortal(
      <Box
        data-balloon-expanded="target"
        data-balloon-visual={visual.id}
        sx={{ position: 'relative', minWidth: 0 }}
      >
        <Box sx={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}>
          <IconButton
            icon={visual.shrink ? ScreenNormalIcon : XIcon}
            size="small"
            variant="invisible"
            aria-label={`${visual.shrink ? 'Shrink' : 'Close'} ${visual.title}`}
            data-balloon-expanded-close=""
            {...(visual.shrink ? { 'data-balloon-shrink': '' } : {})}
            onClick={onClose}
          />
        </Box>
        {visual.render('target')}
      </Box>,
      element,
    );
  }
  return (
    <Dialog
      title={visual.title}
      onClose={onClose}
      sx={{
        width: EXPANDED_DIALOG_SIZE.width,
        maxWidth: EXPANDED_DIALOG_SIZE.width,
        height: EXPANDED_DIALOG_SIZE.height,
        maxHeight: EXPANDED_DIALOG_SIZE.height,
      }}
    >
      <Box
        data-balloon-expanded="overlay"
        data-balloon-visual={visual.id}
        sx={{ minWidth: 0 }}
      >
        {visual.shrink && (
          <Button
            size="small"
            variant="invisible"
            leadingVisual={ScreenNormalIcon}
            onClick={onClose}
            data-balloon-shrink=""
            sx={{ float: 'right' }}
          >
            Shrink
          </Button>
        )}
        {visual.render('overlay')}
      </Box>
    </Dialog>
  );
}

/**
 * Brings an expanded visual into view in its target: scrolled to, and the
 * first element that takes the focus there (a notebook's section) focused.
 */
export function focusExpanded(target: BalloonExpandTarget | undefined): void {
  const element = target?.current;
  if (!element) {
    return;
  }
  const still =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView?.({
    behavior: still ? 'auto' : 'smooth',
    block: 'start',
  });
  const focusable =
    element.querySelector<HTMLElement>('[tabindex="-1"]') ?? element;
  focusable.focus?.({ preventScroll: true });
}
