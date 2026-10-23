/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application's answer shows, drawn from its display (P-04,
 * RU-2): the A2UI surface in its data, and its buttons pressing
 * only the actions the display offered, each with the token the session
 * minted for it. The answer under its message and an element in a panel or
 * a page of its own are drawn by this one view.
 *
 * @module apps/plugins/a2ui-surface/AnswerShows
 */

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { Text } from '@primer/react';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import type { Display } from '@datalayer/reactor/ui';
import { InlineSurface, SURFACE_CATALOG_ID } from './InlineSurface';
import { useOwnCatalog } from './ownComponents';
import { answerPress, answerSurface } from './toolResult';

export type AnswerShowsViewProps = {
  display: Display;
  /**
   * Say something as the reader, with what goes with the run besides it;
   * `false` when the chat cannot take it.
   */
  send: (message: string, forwardedProps?: Record<string, unknown>) => boolean;
};

export function AnswerShowsView({
  display,
  send,
}: AnswerShowsViewProps): JSX.Element {
  const parsed = useMemo(
    () => answerSurface(display, SURFACE_CATALOG_ID),
    [display],
  );
  // With the components the application's developer wrote (P-17).
  const catalog = useOwnCatalog();
  const [said, setSaid] = useState<string | null>(null);
  if (!parsed?.messages || parsed.messages.length === 0) {
    return <Text sx={{ color: 'fg.muted' }}>{display.text}</Text>;
  }
  const onAction = (action: A2uiClientAction): void => {
    const pressed = answerPress(display, action);
    if ('refused' in pressed) {
      setSaid(pressed.refused);
      return;
    }
    setSaid(
      send(pressed.message, pressed.forwardedProps)
        ? null
        : 'The chat is not ready to take it yet.',
    );
  };
  return (
    <InlineSurface
      // Drawn again whole when the code changes it.
      key={JSON.stringify(display)}
      messages={parsed.messages}
      onAction={onAction}
      validationError={said}
      catalog={catalog}
    />
  );
}

export default AnswerShowsView;
