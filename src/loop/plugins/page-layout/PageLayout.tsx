/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The page layout: the editor on a centred sheet, like a document.
 *
 * A quiet canvas fills the view. On it, one sheet — the notebook or the
 * document, at a reading width, with the margins and the shadow a page has —
 * and the composer docked in a band directly above the canvas — or, when the
 * host asks for it, floating over the canvas as a draggable card — like the
 * toolbar of a document application, with the openers as chips directly
 * under it. In the chat view there is no editor, so the transcript is the
 * page: the same sheet, holding the conversation, and no side panel. While
 * an agent works in the page, a small line at the top of the sheet says what
 * it is doing — "Analyst is adding a cell…" — so the change is seen where it
 * happens. The conversation is a panel on the right that opens when it is
 * wanted; closed, the page is all there is.
 *
 * The band holds one **mount point**, and that is what gives the composer its
 * width: the same `SHEET_WIDTH` column the sheet gets, centred the same way,
 * inside the same canvas padding. So the prompt and the page below it are one
 * column with one pair of edges, and they stay one when the conversation
 * panel opens and narrows the canvas — because the band lives inside the page
 * column, not across the whole view. A floating card sized itself
 * (`min(640px, …)`), which is why it never lined up with anything and had to
 * be given a strip of empty canvas to hover over.
 *
 * Nothing here decides what the parts do. The view wired them; this arranges
 * them, which is the whole contract of `LoopChatLayout`.
 *
 * @module loop/plugins/page-layout/PageLayout
 */

import { useEffect, type JSX } from 'react';
import { Box, Text } from '@primer/react';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import { signal } from '@datalayer/reactor';
import {
  LoopChatTurn,
  type ChatLayoutParts,
  type ChatTurnSnapshot,
} from '../../core';
import { pageLayoutPanelOpen, pageLayoutSheet } from './panelState';

/** A page reads best at about this width; wider and lines run too long. */
const SHEET_WIDTH = 920;
/** The conversation panel, when open. */
const PANEL_WIDTH = 400;
/**
 * The canvas' own gutters, shared by the sheet and the composer's band.
 *
 * One constant rather than two literals: the two are only aligned as long as
 * they are equal, and a column that lines up by coincidence stops lining up
 * the first time one of them is edited.
 */
const CANVAS_PX = [2, 3, 4];

/* A signal to read when no chat contributed a turn: the hook needs one. */
const NO_TURN = signal<ChatTurnSnapshot>({ id: 0, status: 'idle' });

/** What the agent is doing in the page, pinned to the sheet's top edge. */
function ActivityLine({ label }: { label: string }): JSX.Element {
  return (
    <Box
      data-page-activity=""
      role="status"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: '4px',
        borderRadius: '999px',
        border: '1px solid',
        borderColor: 'accent.muted',
        bg: 'accent.subtle',
        color: 'accent.fg',
        fontSize: 0,
        fontWeight: 'semibold',
        whiteSpace: 'nowrap',
        boxShadow: '0 4px 12px -6px rgba(0,0,0,0.3)',
      }}
    >
      <Box
        as="span"
        aria-hidden="true"
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          bg: 'accent.fg',
          animation: 'loop-activity-dot 1.1s ease-in-out infinite',
          '@keyframes loop-activity-dot': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.3 },
          },
        }}
      />
      <Text>{label}</Text>
    </Box>
  );
}

/**
 * The strip of canvas kept clear under a floating composer.
 *
 * The card is absolutely positioned, so the flow has to leave room for it or
 * the sheet slides underneath: measured, the composer with its footer stands
 * about 170px tall, anchored 16px from the top.
 */
const PROMPT_BAND = 188;

export type PageLayoutProps = ChatLayoutParts & {
  /**
   * `docked` (the default): the composer in a band above the canvas, at the
   * sheet's width. `floating`: the draggable card over the top of the canvas.
   * Set by the plugin from its configuration.
   */
  promptMode?: 'docked' | 'floating';
};

export function PageLayout({
  editors,
  hasEditor,
  transcript,
  prompt,
  chips,
  picker,
  transient,
  promptMode = 'docked',
}: PageLayoutProps): JSX.Element {
  const floating = promptMode === 'floating';
  const panelOpen = useSignalValue(pageLayoutPanelOpen);
  const turnEntries = useContributions(LoopChatTurn);
  const turn = useSignalValue(turnEntries[0]?.value.turn ?? NO_TURN);

  /*
   * No editor — the picker's "Chat" choice, or a workspace without an editor
   * plugin — and the transcript is what lies on the sheet. Told to the parts
   * that only make sense beside an editor, through the shared signal.
   */
  const sheet = hasEditor ? 'editor' : 'transcript';
  useEffect(() => {
    pageLayoutSheet.value = sheet;
  }, [sheet]);

  return (
    <Box
      sx={{
        // The positioned ancestor the out-of-sight transcript parks against.
        position: 'relative',
        flex: '1 1 auto',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {picker}
      <Box
        sx={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          // The canvas the sheet lies on: a step darker than the page, so the
          // sheet reads as paper rather than as a bordered region of the
          // same surface.
          bg: 'canvas.inset',
        }}
      >
        {/* The page column: the composer's band, and the canvas under it.
            Both live in here rather than the row, so the conversation panel
            narrows the two of them together and the column stays a column. */}
        <Box
          sx={{
            flex: '1 1 auto',
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* The composer, docked above the page: the band spans the canvas,
              the mount point inside it is the page's own column, so the two
              share one pair of edges. Nothing when the host hid the prompt —
              an empty band is a strip of chrome that does nothing. */}
          {prompt && !floating ? (
            <Box
              data-page-prompt-dock=""
              sx={{
                flex: '0 0 auto',
                display: 'flex',
                justifyContent: 'center',
                px: CANVAS_PX,
                // The composer brings its own padding, its own border and
                // its own `canvas.subtle`; the band only has to carry them
                // the full width of the canvas and close with a rule.
                bg: 'canvas.subtle',
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              {/* The mount point: the same column the sheet gets, so
                  `[data-page-prompt-dock] > *` and `[data-page-sheet]`
                  measure the same width and the same left edge. */}
              <Box sx={{ width: '100%', maxWidth: SHEET_WIDTH, minWidth: 0 }}>
                {prompt}
              </Box>
            </Box>
          ) : null}
          {/* The page. */}
          <Box
            sx={{
              flex: '1 1 auto',
              minWidth: 0,
              minHeight: 0,
              // An editor's sheet grows with its content and the canvas
              // scrolls; the transcript's sheet fills the canvas and scrolls
              // inside, so the conversation keeps following the stream.
              overflowY: hasEditor ? 'auto' : 'hidden',
              overflowX: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              // Under a floating card, room for it above the first line of
              // the sheet — only while there is one.
              pt: floating && prompt ? `${PROMPT_BAND}px` : 3,
              pb: 6,
              px: CANVAS_PX,
            }}
          >
            {/* The openers, under the composer and above the sheet. */}
            {prompt && chips ? (
              <Box
                sx={{
                  width: '100%',
                  maxWidth: SHEET_WIDTH,
                  mb: 3,
                  display: 'flex',
                  justifyContent: 'center',
                  '& > *': { justifyContent: 'center' },
                }}
              >
                {chips}
              </Box>
            ) : null}
            {/* What the agent is doing, at the top of the sheet, while it does. */}
            {turn.activity ? (
              <Box
                sx={{
                  width: '100%',
                  maxWidth: SHEET_WIDTH,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  mb: 2,
                }}
              >
                <ActivityLine label={turn.activity} />
              </Box>
            ) : null}
            <Box
              data-page-sheet=""
              sx={{
                width: '100%',
                maxWidth: SHEET_WIDTH,
                flex: hasEditor ? '0 0 auto' : '1 1 auto',
                bg: 'canvas.default',
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: '10px',
                boxShadow:
                  '0 1px 2px rgba(0,0,0,0.06), 0 24px 48px -28px rgba(0,0,0,0.35)',
                // The page's own margins. The editors inside fill the sheet
                // and read against these, as text on paper does; the
                // transcript brings its own gutters, so it sits closer.
                px: hasEditor ? [3, 4, '56px'] : [2, 3, 4],
                py: hasEditor ? [3, 4, 4] : 2,
                // The editors position their hidden siblings against this.
                position: 'relative',
                display: 'flex',
                minHeight: hasEditor ? 480 : 0,
                /*
                The editors fill the sheet, not the viewport: the sheet grows
                with its content and the canvas scrolls, which is what makes
                it a page.
              */
                '& > *': { flex: '1 1 auto', minWidth: 0 },
              }}
            >
              {hasEditor ? editors : transcript}
            </Box>
          </Box>
        </Box>

        {/* The conversation, beside the page, when asked for — and only
            when the page is an editor; the transcript is the page otherwise. */}
        {!hasEditor ? null : panelOpen ? (
          <Box
            sx={{
              flex: `0 0 ${PANEL_WIDTH}px`,
              maxWidth: '45%',
              minWidth: 0,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              bg: 'canvas.default',
              borderLeft: '1px solid',
              borderColor: 'border.default',
              // Over the canvas, and beside the composer's band rather than
              // under it: the band belongs to the page column.
              zIndex: 1,
              '& > *': { flex: '1 1 auto', minHeight: 0 },
            }}
          >
            {transcript}
          </Box>
        ) : (
          // Kept mounted, out of sight: the transcript is where the tools
          // run and the stream lands, and a panel that unmounted it would
          // stop the agent the moment the reader closed the conversation.
          <Box
            aria-hidden="true"
            sx={{
              position: 'absolute',
              inset: 0,
              visibility: 'hidden',
              pointerEvents: 'none',
              zIndex: -1,
              display: 'flex',
            }}
          >
            {transcript}
          </Box>
        )}
      </Box>
      {transient}
      {/* Floating: anchored to the top of the canvas, the command line of
          the page. It positions itself against the relative root above. */}
      {floating ? prompt : null}
    </Box>
  );
}

export default PageLayout;
