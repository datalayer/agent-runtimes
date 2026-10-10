/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The surfaces of `AnswerSurfaces`, drawn: each with `InlineSurface` on
 * Datalayer's catalog, its title and who showed it above it, and under it
 * what was chosen and what the member answered. One choice per surface:
 * once a button is pressed the surface says what was chosen and asks no
 * more — unless the press failed (the member not reached, a turn under
 * way): what failed is said, and another press is taken.
 *
 * @module components/teams/AnswerSurfacesView
 */

import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Spinner, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import {
  InlineSurface,
  SURFACE_CATALOG_ID,
} from '../../apps/plugins/a2ui-surface/InlineSurface';
import { readA2uiToolResult } from '../../apps/plugins/a2ui-surface/toolResult';
import { pressedOf, type AnswerSurfacesProps } from './AnswerSurfaces';
import type { A2ATeamSurface } from './useA2ATeam';

type Answered = {
  chose: string;
  reply?: string;
  waiting: boolean;
  /** It failed: said, and another button can be pressed. */
  failed?: boolean;
};

function OneSurface({
  surface,
  name,
  onPress,
}: {
  surface: A2ATeamSurface;
  name?: string;
  onPress: AnswerSurfacesProps['onPress'];
}): JSX.Element {
  const parsed = useMemo(
    () => readA2uiToolResult(surface.artifact.data, SURFACE_CATALOG_ID),
    [surface.artifact.data],
  );
  const [answered, setAnswered] = useState<Answered | null>(null);
  const onAction = useCallback(
    (action: A2uiClientAction) => {
      const pressed = pressedOf(action);
      if (!pressed || (answered && !answered.failed) || !onPress) {
        return;
      }
      setAnswered({ chose: pressed.message, waiting: true });
      onPress(surface, pressed).then(
        reply => setAnswered({ chose: pressed.message, reply, waiting: false }),
        (error: unknown) =>
          setAnswered({
            chose: pressed.message,
            reply: error instanceof Error ? error.message : String(error),
            waiting: false,
            failed: true,
          }),
      );
    },
    [answered, onPress, surface],
  );
  const title = parsed?.title || surface.artifact.name;
  return (
    <Box
      as="section"
      aria-label={name ? `${name}: ${title}` : title}
      data-answer-surface={surface.id}
      display="flex"
      flexDirection="column"
      gap={2}
      minWidth={0}
    >
      <Text sx={{ fontWeight: 'bold', fontSize: 1 }}>
        {name ? `${name} · ${title}` : title}
      </Text>
      {parsed?.messages?.length ? (
        <InlineSurface messages={parsed.messages} onAction={onAction} />
      ) : (
        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
          This could not be drawn: it holds no surface.
        </Text>
      )}
      {answered ? (
        <Box
          role="status"
          data-answer-reply=""
          display="flex"
          flexDirection="column"
          gap={1}
          fontSize={1}
        >
          <Text sx={{ color: 'fg.muted' }}>You chose: {answered.chose}</Text>
          {answered.waiting ? (
            <Box display="flex" alignItems="center" gap={2}>
              <Spinner size="small" />
              <Text sx={{ color: 'fg.muted' }}>
                {name ? `Asking ${name}…` : 'Asking…'}
              </Text>
            </Box>
          ) : answered.reply ? (
            <Text>{name ? `${name}: ${answered.reply}` : answered.reply}</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

export function AnswerSurfacesView({
  surfaces,
  names = {},
  onPress,
}: AnswerSurfacesProps): JSX.Element {
  return (
    <Box
      data-answer-surfaces=""
      display="flex"
      flexDirection="column"
      gap={3}
      minWidth={0}
    >
      {surfaces.map(surface => (
        <OneSurface
          key={surface.id}
          surface={surface}
          name={names[surface.giver]}
          onPress={onPress}
        />
      ))}
    </Box>
  );
}

export default AnswerSurfacesView;
