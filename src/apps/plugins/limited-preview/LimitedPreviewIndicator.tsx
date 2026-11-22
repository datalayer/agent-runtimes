/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The limited-preview indicator, beside the composer's other controls (the
 * user, 20 November 2026: in place of the box on top of a visitor's chat).
 *
 * *Limited preview · 7/10 turns today*, and the agent's note when it set one;
 * a click opens the rest: *Sign in to save your work* (or the host's call to
 * action), the turns left, what is disabled, and *Sign in*. While the
 * temporary key is checked it counts nothing yet; once no turn is left it
 * says why. When the chat draws no header, the key's clock stands beside it.
 *
 * Drawn only inside an anonymous visitor's chat (`useAnonymousChat`): a
 * signed-in person never sees it. It publishes the preview to its plugin's
 * board for the page tools (`preview_status`), and withdraws it when it goes.
 *
 * It stands in `AgentSlots.promptStatus`, outside the composer's disabled
 * region: once no turn is left the composer closes, and the indicator still
 * opens onto the refusal and *Sign in*.
 *
 * @module apps/plugins/limited-preview/LimitedPreviewIndicator
 */

import type { JSX } from 'react';
import {
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AnchoredOverlay, Button, Text } from '@primer/react';
import { EyeIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import {
  AnonymousKeyClock,
  useAnonymousChat,
} from '../../../chat/anonymous/AnonymousChat';
import { ToolResultsContext } from '../../toolCards/toolResults';
import {
  LIMITED_PREVIEW_WORDS,
  previewStatusOf,
  type PreviewBoard,
} from './preview';

/** How long a flash lasts. */
export const PREVIEW_FLASH_MS = 1600;

/** At or under this many turns left, the indicator asks for attention. */
const FEW_TURNS = 2;

export function LimitedPreviewIndicator({
  disabled,
  board,
}: {
  /** What a visitor does not get of the agent's UI, by name. */
  disabled: readonly string[];
  /** This chat's limited preview, its plugin's own. */
  board: PreviewBoard;
}): JSX.Element | null {
  const state = useAnonymousChat();
  const status = state ? previewStatusOf(state, disabled) : null;
  const published = JSON.stringify(status);
  useEffect(() => {
    board.publish(status);
    // By content: the state is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, published]);
  useEffect(() => () => board.publish(null), [board]);
  useSyncExternalStore(board.subscribe, board.getRevision, board.getRevision);
  // A conversation started over: the agent's note goes with it.
  const results = useContext(ToolResultsContext);
  const generation = useSyncExternalStore(
    results.subscribe,
    results.getGeneration,
    results.getGeneration,
  );
  useEffect(() => {
    board.clearMark();
  }, [board, generation]);
  // A flash asked after this indicator was drawn.
  const seenFlash = useRef(board.mark.flash);
  const [flashing, setFlashing] = useState(false);
  const flash = board.mark.flash;
  useEffect(() => {
    if (flash === seenFlash.current) {
      return undefined;
    }
    seenFlash.current = flash;
    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), PREVIEW_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);
  const [open, setOpen] = useState(false);
  if (!state || !status) {
    return null;
  }
  const cta = state.config.callToAction;
  const counted =
    status.turnsLeft !== null &&
    status.turnsPerDay !== null &&
    !status.validating;
  const tone = status.refused
    ? 'danger.fg'
    : counted && (status.turnsLeft ?? 0) <= FEW_TURNS
      ? 'attention.fg'
      : 'fg.muted';
  const note = board.mark.note;
  return (
    <Box
      display="inline-flex"
      alignItems="center"
      gap={1}
      data-limited-preview={
        status.validating ? 'validating' : status.refused ? 'reached' : 'open'
      }
      data-limited-preview-flash={flashing ? 'on' : 'off'}
    >
      <AnchoredOverlay
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        width="medium"
        renderAnchor={anchorProps => (
          <Button
            {...(anchorProps as Record<string, unknown>)}
            size="small"
            variant="invisible"
            leadingVisual={EyeIcon}
            aria-busy={status.validating || undefined}
            title={LIMITED_PREVIEW_WORDS.title}
            sx={{
              color: tone,
              transition: 'background-color 300ms ease, box-shadow 300ms ease',
              ...(flashing
                ? {
                    bg: 'attention.muted',
                    boxShadow:
                      '0 0 0 2px var(--borderColor-attention-emphasis, #bf8700)',
                  }
                : {}),
            }}
          >
            <Box as="span" display="inline-flex" alignItems="center" gap={1}>
              <Box as="span">{LIMITED_PREVIEW_WORDS.label}</Box>
              {counted ? (
                <Box
                  as="span"
                  sx={{ fontWeight: 'normal' }}
                  data-limited-preview-turns=""
                >
                  {LIMITED_PREVIEW_WORDS.turns(
                    status.turnsLeft as number,
                    status.turnsPerDay as number,
                  )}
                </Box>
              ) : null}
              {note ? (
                <Box
                  as="span"
                  sx={{ fontWeight: 'normal', fontStyle: 'italic' }}
                  data-limited-preview-note=""
                >
                  {note}
                </Box>
              ) : null}
            </Box>
          </Button>
        )}
      >
        <Box
          p={3}
          display="flex"
          flexDirection="column"
          gap={2}
          data-limited-preview-details=""
        >
          <Text
            sx={{ fontWeight: 'semibold', fontSize: 1 }}
            role={status.refused ? 'alert' : undefined}
          >
            {status.refused || cta?.says || LIMITED_PREVIEW_WORDS.saveWork}
          </Text>
          {counted ? (
            <Text sx={{ fontSize: 0 }}>
              {LIMITED_PREVIEW_WORDS.turnsLeft(
                status.turnsLeft as number,
                status.turnsPerDay as number,
              )}
            </Text>
          ) : null}
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            {status.disabled.length > 0
              ? LIMITED_PREVIEW_WORDS.disabledNamed(status.disabled)
              : LIMITED_PREVIEW_WORDS.someDisabled}
          </Text>
          {note ? <Text sx={{ fontSize: 0 }}>{note}</Text> : null}
          <Box>
            {cta ? (
              <Button
                size="small"
                variant="primary"
                onClick={cta.onAction}
                data-anonymous-call-to-action=""
              >
                {cta.label}
              </Button>
            ) : (
              <Button
                size="small"
                variant="primary"
                onClick={state.signIn}
                data-anonymous-sign-in=""
              >
                {LIMITED_PREVIEW_WORDS.signIn}
              </Button>
            )}
          </Box>
        </Box>
      </AnchoredOverlay>
      {/* The key's clock, when there is no header to hold it. */}
      {state.headerShown || status.validating || status.refused ? null : (
        <AnonymousKeyClock state={state} />
      )}
    </Box>
  );
}

export default LimitedPreviewIndicator;
