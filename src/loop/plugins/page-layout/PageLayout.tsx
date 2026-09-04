/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The page layout: the editor on a centred sheet, like a document.
 *
 * A quiet canvas fills the view. On it, one sheet — the notebook or the
 * document, at a reading width, with the margins and the shadow a page has —
 * and the composer floating over the top of the canvas like the title bar of
 * a document application, with the openers as chips directly under it. While
 * an agent works in the page, a small line at the top of the sheet says what
 * it is doing — "Analyst is adding a cell…" — so the change is seen where it
 * happens. The conversation is a panel on the right that opens when it is
 * wanted; closed, the page is all there is.
 *
 * Nothing here decides what the parts do. The view wired them; this arranges
 * them, which is the whole contract of `LoopChatLayout`.
 *
 * @module loop/plugins/page-layout/PageLayout
 */

import type { JSX } from 'react';
import { Box, Text } from '@primer/react';
import { useContributions, useSignalValue } from '@datalayer/reactor/react';
import { signal } from '@datalayer/reactor';
import {
  LoopChatTurn,
  type ChatLayoutParts,
  type ChatTurnSnapshot,
} from '../../core';
import { pageLayoutPanelOpen } from './panelState';

/** A page reads best at about this width; wider and lines run too long. */
const SHEET_WIDTH = 920;
/** The conversation panel, when open. */
const PANEL_WIDTH = 400;
/**
 * The band at the top of the canvas the floating composer sits over.
 *
 * The card is absolutely positioned, so the flow has to leave room for it or
 * the sheet slides underneath: measured, the composer with its footer stands
 * about 180px tall, anchored 16px from the top.
 */
const PROMPT_BAND = 188;

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

export function PageLayout({
  editors,
  hasEditor,
  transcript,
  prompt,
  chips,
  picker,
  transient,
}: ChatLayoutParts): JSX.Element {
  const panelOpen = useSignalValue(pageLayoutPanelOpen);
  const turnEntries = useContributions(LoopChatTurn);
  const turn = useSignalValue(turnEntries[0]?.value.turn ?? NO_TURN);

  /*
   * No editor: the conversation is the page.
   *
   * The picker's "Chat" choice, or a workspace with no editor plugin, leaves
   * nothing to put on a sheet — so the transcript takes the width and the
   * prompt keeps floating over it, which is the Loop Shell's arrangement.
   */
  if (!hasEditor) {
    return (
      <Box
        sx={{
          position: 'relative',
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {picker}
        <Box sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
          {transcript}
        </Box>
        {transient}
        {prompt}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        // The positioned ancestor the floating prompt anchors to.
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
        {/* The page. */}
        <Box
          sx={{
            flex: '1 1 auto',
            minWidth: 0,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            // Room for the floating prompt above the first line of the
            // sheet — only while there is one; a host that hid the prompt
            // gets the sheet where the eye lands.
            pt: prompt ? `${PROMPT_BAND}px` : 3,
            pb: 6,
            px: [2, 3, 4],
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
            sx={{
              width: '100%',
              maxWidth: SHEET_WIDTH,
              flex: '0 0 auto',
              bg: 'canvas.default',
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: '10px',
              boxShadow:
                '0 1px 2px rgba(0,0,0,0.06), 0 24px 48px -28px rgba(0,0,0,0.35)',
              // The page's own margins. The editors inside fill the sheet
              // and read against these, as text on paper does.
              px: [3, 4, '56px'],
              py: [3, 4, 4],
              // The editors position their hidden siblings against this.
              position: 'relative',
              display: 'flex',
              minHeight: 480,
              /*
                The editors fill the sheet, not the viewport: the sheet grows
                with its content and the canvas scrolls, which is what makes
                it a page.
              */
              '& > *': { flex: '1 1 auto', minWidth: 0 },
            }}
          >
            {editors}
          </Box>
        </Box>

        {/* The conversation, beside the page, when asked for. */}
        {panelOpen ? (
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
              // Over the canvas but under the floating prompt.
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
      {/* Floating, anchored to the top of the canvas: the command line of
          the page. It positions itself against the relative root above. */}
      {prompt}
    </Box>
  );
}

export default PageLayout;
