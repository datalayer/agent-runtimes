/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The floating prompt: an input that sits on the workspace, not in it.
 *
 * The chat's prompt is a bar the layout makes room for. This one is a card
 * over the work — for a shell that is mostly canvas, where a docked composer
 * would claim a permanent strip of a page whose point is the output. It can be
 * picked up by its handle and put down wherever it is least in the way.
 *
 * It owns no conversation. Everything typed goes through `workspace.submit`,
 * the same dispatch the docked prompt uses, so slash commands work and
 * whichever view is listening for prompts answers. When nothing answers, the
 * reason is shown on the card rather than swallowed.
 *
 * @module loop/plugins/prompt/FloatingPrompt
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton } from '@primer/react';
import { GrabberIcon, PaperAirplaneIcon } from '@primer/octicons-react';
import type { LoopWorkspaceContext } from '../../core';
import { onPromptFocusRequest } from './focusRequests';

export type FloatingPromptProps = {
  workspace: LoopWorkspaceContext;
  /** What the empty input says. */
  placeholder: string;
};

/** Where the card sits until somebody moves it. */
type Position = { left: number; top: number } | null;

/** Keep the card reachable: at least this much of it stays inside. */
const MARGIN = 8;

export function FloatingPrompt({
  workspace,
  placeholder,
}: FloatingPromptProps): JSX.Element {
  const [draft, setDraft] = useState('');
  /* What `workspace.submit` had to say about the last message that went
     nowhere. Shown on the card, cleared by typing: an error about the previous
     attempt should not outlive the next one being written. */
  const [notice, setNotice] = useState<string | null>(null);
  const [position, setPosition] = useState<Position>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  /* Where the pointer took hold of the card, so dragging moves the card by
     the pointer's delta rather than snapping its corner to the cursor. */
  const grip = useRef<{ dx: number; dy: number } | null>(null);

  // A command asking for focus — `/prompt`, or its keystroke.
  useEffect(() => onPromptFocusRequest(() => inputRef.current?.focus()), []);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message) {
      return;
    }
    setDraft('');
    const outcome = await workspace.submit(message);
    if (!outcome.handled) {
      setNotice(outcome.reason ?? 'Nothing answered that.');
    }
  }, [draft, workspace]);

  const onHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const card = cardRef.current;
      const parent = card?.offsetParent as HTMLElement | null;
      if (!card || !parent) {
        return;
      }
      const cardBox = card.getBoundingClientRect();
      const parentBox = parent.getBoundingClientRect();
      grip.current = {
        dx: event.clientX - cardBox.left,
        dy: event.clientY - cardBox.top,
      };
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const move = (moved: PointerEvent) => {
        if (!grip.current) {
          return;
        }
        // Clamped so the card cannot be dropped where its handle is
        // unreachable — a prompt dragged off the edge is a prompt lost.
        const left = Math.min(
          Math.max(
            moved.clientX - parentBox.left - grip.current.dx,
            MARGIN - cardBox.width / 2,
          ),
          parentBox.width - cardBox.width / 2 - MARGIN,
        );
        const top = Math.min(
          Math.max(moved.clientY - parentBox.top - grip.current.dy, MARGIN),
          parentBox.height - MARGIN * 4,
        );
        setPosition({ left, top });
      };
      const up = () => {
        grip.current = null;
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
      event.preventDefault();
    },
    [],
  );

  return (
    <Box
      ref={cardRef}
      data-loop-floating-prompt=""
      sx={{
        position: 'absolute',
        // Bottom-centre until somebody moves it: over the work but under the
        // eye, which is where a composer waits without being in the way.
        ...(position
          ? { left: position.left, top: position.top }
          : { left: '50%', bottom: 16, transform: 'translateX(-50%)' }),
        width: 'min(560px, calc(100% - 32px))',
        zIndex: 20,
        bg: 'canvas.default',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        boxShadow: 'shadow.large',
        overflow: 'hidden',
      }}
    >
      <Box
        onPointerDown={onHandlePointerDown}
        aria-label="Move the prompt"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 18,
          cursor: 'grab',
          color: 'fg.subtle',
          bg: 'canvas.subtle',
          borderBottom: '1px solid',
          borderColor: 'border.muted',
          touchAction: 'none',
          '&:active': { cursor: 'grabbing' },
        }}
      >
        <GrabberIcon size={16} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, p: 2 }}>
        <Box
          as="textarea"
          ref={inputRef}
          rows={1}
          value={draft}
          placeholder={placeholder}
          aria-label="Prompt"
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
            setDraft(event.target.value);
            setNotice(null);
          }}
          onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Enter sends; Shift+Enter is still a new line, as every composer
            // this package draws has it.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          sx={{
            flex: '1 1 auto',
            resize: 'none',
            border: 'none',
            outline: 'none',
            bg: 'transparent',
            color: 'fg.default',
            fontSize: 1,
            fontFamily: 'normal',
            lineHeight: 1.5,
            p: 1,
            '::placeholder': { color: 'fg.subtle' },
          }}
        />
        <IconButton
          icon={PaperAirplaneIcon}
          aria-label="Send"
          size="small"
          disabled={!draft.trim()}
          onClick={() => void send()}
        />
      </Box>
      {notice ? (
        <Box
          sx={{
            px: 3,
            pb: 2,
            fontSize: 0,
            color: 'attention.fg',
          }}
        >
          {notice}
        </Box>
      ) : null}
    </Box>
  );
}

export default FloatingPrompt;
