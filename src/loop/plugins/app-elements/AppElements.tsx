/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The elements an application's code opened beside the conversation (LOOP
 * P-18): a side panel on the trailing edge, and a page of its own over the
 * workspace — each drawn from the same A2UI surface an answer is drawn from
 * (`InlineSurface`), its buttons sent to the application's actions as an
 * answer's are (`answerAction`), and closed with its own button.
 *
 * Drawn from the workspace's root slot, positioned against the workspace:
 * nothing is drawn, and nothing is laid out, while nothing is open.
 *
 * @module loop/plugins/app-elements/AppElements
 */

import type { JSX } from 'react';
import { useMemo, useSyncExternalStore } from 'react';
import { IconButton, Text } from '@primer/react';
import { XIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import {
  closeLoopElement,
  onLoopElements,
  openLoopElements,
  type LoopElement,
} from '../../../chat/base/loopElement';
import type { LoopWorkspaceContext } from '../../core';
import {
  InlineSurface,
  SURFACE_CATALOG_ID,
} from '../a2ui-surface/InlineSurface';
import { answerAction, readA2uiToolResult } from '../a2ui-surface/toolResult';

/** How wide the side panel is, at most. */
export const APP_PANEL_WIDTH = 380;

/** What is open now: the panels in the order they opened, and the last page. */
export function elementsByPlace(open: readonly LoopElement[]): {
  panels: LoopElement[];
  page: LoopElement | null;
} {
  const pages = open.filter(element => element.where === 'page');
  return {
    panels: open.filter(element => element.where === 'panel'),
    page: pages.length > 0 ? pages[pages.length - 1] : null,
  };
}

type Send = LoopWorkspaceContext['viewControls']['send'];

function ElementBody({
  element,
  send,
}: {
  element: LoopElement;
  send: Send;
}): JSX.Element {
  const parsed = useMemo(
    () => readA2uiToolResult(element.shows, SURFACE_CATALOG_ID),
    [element.shows],
  );
  const onAction = (action: A2uiClientAction): void => {
    // A button of what its code shows: its action goes to the application,
    // as a button of an answer does (LOOP P-04).
    const pressed = answerAction(action);
    if (pressed) send?.(pressed.message, pressed.forwardedProps);
  };
  if (!parsed?.messages || parsed.messages.length === 0) {
    return <Text sx={{ color: 'fg.muted' }}>Nothing to show.</Text>;
  }
  return (
    <InlineSurface
      // Drawn again whole when the code changes it.
      key={JSON.stringify(element.shows)}
      messages={parsed.messages}
      onAction={onAction}
    />
  );
}

function ElementHeader({ element }: { element: LoopElement }): JSX.Element {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        mb: 2,
      }}
    >
      <Text as="h2" sx={{ fontSize: 2, fontWeight: 'bold', m: 0 }}>
        {element.title}
      </Text>
      <IconButton
        icon={XIcon}
        variant="invisible"
        size="small"
        aria-label={`Close ${element.title}`}
        onClick={() => closeLoopElement(element.id)}
      />
    </Box>
  );
}

/** Every element open in a side panel or on a page, drawn where it belongs. */
export function AppElements({
  workspace,
}: {
  workspace?: LoopWorkspaceContext;
}): JSX.Element | null {
  const open = useSyncExternalStore(
    onLoopElements,
    openLoopElements,
    openLoopElements,
  );
  const { panels, page } = elementsByPlace(open);
  const send = workspace?.viewControls.send;
  if (panels.length === 0 && page === null) return null;
  return (
    <>
      {panels.length > 0 ? (
        <Box
          as="aside"
          aria-label="Side panel"
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: `min(${APP_PANEL_WIDTH}px, 100%)`,
            zIndex: 1,
            overflowY: 'auto',
            borderLeft: '1px solid',
            borderColor: 'border.default',
            bg: 'canvas.subtle',
            boxShadow: 'shadow.medium',
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          {panels.map(element => (
            <Box as="section" key={element.id} aria-label={element.title}>
              <ElementHeader element={element} />
              <ElementBody element={element} send={send} />
            </Box>
          ))}
        </Box>
      ) : null}
      {page !== null ? (
        <Box
          role="dialog"
          aria-label={page.title}
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            overflowY: 'auto',
            bg: 'canvas.default',
            p: [3, 4],
          }}
        >
          <ElementHeader element={page} />
          <ElementBody element={page} send={send} />
        </Box>
      ) : null}
    </>
  );
}

export default AppElements;
