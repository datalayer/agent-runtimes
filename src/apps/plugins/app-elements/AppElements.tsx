/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The elements an application's code opened beside the conversation (P-18): a side panel on the trailing edge, and a page of its own over the
 * workspace — each drawn from its display as an answer is (`AnswerShowsView`),
 * its buttons pressing the actions the display offered, and closed with its
 * own button.
 *
 * Drawn from the workspace's root slot, positioned against the workspace:
 * nothing is drawn, and nothing is laid out, while nothing is open.
 *
 * @module apps/plugins/app-elements/AppElements
 */

import type { JSX } from 'react';
import { useSyncExternalStore } from 'react';
import { IconButton, Text } from '@primer/react';
import { XIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import {
  closeLoopElement,
  onLoopElements,
  openLoopElements,
  type LoopElement,
} from '../../../chat/base/loopElement';
import type { LoopWorkspaceContext } from '../../core';
import { AnswerShowsView } from '../a2ui-surface/AnswerShows';

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
  // What its code shows, drawn as an answer's display is: its buttons press
  // what the display offered (P-04, RU-2).
  return (
    <AnswerShowsView
      display={element.shows}
      send={(message, forwardedProps) =>
        send !== undefined && !send(message, forwardedProps)
      }
    />
  );
}

function ElementHeader({ element }: { element: LoopElement }): JSX.Element {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={2}
      mb={2}
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
          position="absolute"
          top={0}
          right={0}
          bottom={0}
          width={`min(${APP_PANEL_WIDTH}px, 100%)`}
          zIndex={1}
          overflowY="auto"
          borderLeft="1px solid"
          borderColor="border.default"
          bg="canvas.subtle"
          boxShadow="shadow.medium"
          p={3}
          display="flex"
          flexDirection="column"
          gap={3}
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
          position="absolute"
          inset={0}
          zIndex={2}
          overflowY="auto"
          bg="canvas.default"
          p={[3, 4]}
        >
          <ElementHeader element={page} />
          <ElementBody element={page} send={send} />
        </Box>
      ) : null}
    </>
  );
}

export default AppElements;
