/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A card that floats over its host and can be dragged by its handle.
 *
 * The mechanics behind `InputPrompt`'s `draggable` prop, kept apart from the
 * prompt so the prompt module stays about composing messages. The card is
 * absolutely positioned against the nearest positioned ancestor — whoever
 * mounts a floating prompt owns giving it one — and sits bottom-centre until
 * somebody picks it up.
 *
 * @module chat/prompt/FloatingCard
 */

import type { JSX, ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { GrabberIcon } from '@primer/octicons-react';

/** Where the card sits once somebody has moved it. */
type Position = { left: number; top: number } | null;

/** Keep the card reachable: at least this much of it stays inside. */
const MARGIN = 8;

export type FloatingCardProps = {
  children: ReactNode;
};

export function FloatingCard({ children }: FloatingCardProps): JSX.Element {
  const [position, setPosition] = useState<Position>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  /* Where the pointer took hold of the card, so dragging moves the card by
     the pointer's delta rather than snapping its corner to the cursor. */
  const grip = useRef<{ dx: number; dy: number } | null>(null);

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
      // Absent in test DOMs; the move listeners below still work there.
      handle.setPointerCapture?.(event.pointerId);

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
      data-floating-prompt=""
      sx={{
        position: 'absolute',
        // Bottom-centre until somebody moves it: over the work but under the
        // eye, which is where a composer waits without being in the way.
        ...(position
          ? { left: position.left, top: position.top }
          : { left: '50%', bottom: 16, transform: 'translateX(-50%)' }),
        width: 'min(640px, calc(100% - 32px))',
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
      {children}
    </Box>
  );
}

export default FloatingCard;
