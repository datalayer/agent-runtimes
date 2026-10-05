/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A notebook, read-only and small: what a member of the team gave, shown in
 * its balloon (LOOP T-23, H-29). It is jupyter-react's notebook in read-only
 * mode (`NotebookPreviewView`): its cells and the outputs it carries, nothing
 * editable, on a service manager with no kernel (`ServiceManagerLess`) —
 * nothing runs, and no Pyodide is loaded. The view is imported only when a
 * notebook is drawn, so a balloon, and the page it is on, stay light until
 * one arrives. It scrolls within its own height, and a click takes the
 * reader to the notebook that runs (`TeamNotebook`).
 *
 * @module components/teams/NotebookPreview
 */

import type { JSX } from 'react';
import { Suspense, lazy } from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useBalloonExpand } from '../../chat/assistant/BalloonVisual';

/** jupyter-react's notebook, read-only, with no kernel: loaded when a notebook is drawn. */
const NotebookPreviewView = lazy(() => import('./NotebookPreviewView'));

/** An nbformat 4 document, as far as the preview checks it. */
export interface NotebookDocument {
  cells: unknown[];
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
}

/** The document a notebook artifact carries, or none when it is not one. */
export function notebookDocument(data: unknown): NotebookDocument | undefined {
  const parsed =
    typeof data === 'string'
      ? (() => {
          try {
            return JSON.parse(data) as unknown;
          } catch {
            return undefined;
          }
        })()
      : data;
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as NotebookDocument).cells)
  ) {
    return parsed as NotebookDocument;
  }
  return undefined;
}

export type NotebookPreviewProps = {
  /** The nbformat document (an artifact's `data`, parsed or not). */
  notebook: unknown;
  /** Its name, said to a screen reader: `Accounting's notebook`. */
  title: string;
  /** How tall it is, in pixels; it scrolls within. */
  maxHeight?: number;
  /**
   * Takes the reader to the notebook that runs; the line under it says so.
   * Unsaid, in a balloon that carries the notebook as its large visual, a
   * click expands it (`BalloonVisual`).
   */
  onOpen?: () => void;
  /**
   * The line under it, which opens it: `Open it below to run it`. Shown
   * when `onOpen` or this is given — in a balloon, its *Expand* says it.
   */
  openLabel?: string;
};

/** A notebook, read-only and small, with the way to the one that runs. */
export function NotebookPreview({
  notebook,
  title,
  maxHeight = 220,
  onOpen: onOpenGiven,
  openLabel,
}: NotebookPreviewProps): JSX.Element | null {
  const expand = useBalloonExpand();
  const onOpen = onOpenGiven ?? expand ?? undefined;
  const doc = notebookDocument(notebook);
  if (!doc) {
    return null;
  }
  return (
    <Box
      data-notebook-preview=""
      sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}
    >
      <Box
        role="region"
        aria-label={`${title}, read-only`}
        onClick={onOpen}
        data-notebook-preview-cells={doc.cells.length}
        sx={{
          position: 'relative',
          height: maxHeight,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'border.muted',
          borderRadius: 2,
          bg: 'canvas.default',
          cursor: onOpen ? 'pointer' : 'default',
        }}
      >
        <Suspense
          fallback={
            <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, m: 2 }}>
              Opening the notebook…
            </Text>
          }
        >
          <NotebookPreviewView nbformat={doc} height={maxHeight} />
        </Suspense>
      </Box>
      {onOpen && (onOpenGiven || openLabel) ? (
        <Text
          as="button"
          type="button"
          onClick={onOpen}
          data-notebook-preview-open=""
          sx={{
            alignSelf: 'flex-start',
            p: 0,
            border: 0,
            bg: 'transparent',
            color: 'accent.fg',
            fontSize: 0,
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {openLabel ?? 'Open it to run it'}
        </Text>
      ) : null}
    </Box>
  );
}

/** Where the notebook that runs is: `TeamNotebook` marks its section. */
export const TEAM_NOTEBOOK_SELECTOR = '[data-team-notebook]';

/** Takes the reader to the notebook that runs: scrolled to, and focused. */
export function focusTeamNotebook(): void {
  const section = document.querySelector<HTMLElement>(TEAM_NOTEBOOK_SELECTOR);
  if (!section) {
    return;
  }
  const still =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView?.({
    behavior: still ? 'auto' : 'smooth',
    block: 'start',
  });
  section.focus({ preventScroll: true });
}

export default NotebookPreview;
