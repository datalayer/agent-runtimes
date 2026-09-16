/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Moving a fixed-position box about the viewport by a handle.
 *
 * The mechanics behind the chat's "Floating draggable" mode. The same idea
 * as `FloatingCard`'s, which moves a prompt about its host; this one moves
 * the whole chat window about the viewport, because that is what a fixed
 * box is positioned against. The box stays reachable: however far it is
 * dragged, a margin of it stays on screen, so its handle can always be
 * picked up again.
 *
 * @module chat/useViewportDrag
 */

import { useCallback, useRef, useState } from 'react';

/** Where the box sits once somebody has moved it, in viewport pixels. */
export type DragPosition = { left: number; top: number } | null;

/** How much of the box must stay inside the viewport. */
const MARGIN = 24;

export function useViewportDrag(boxRef: React.RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<DragPosition>(null);
  /* Where the pointer took hold, so the box moves by the pointer's delta
     rather than snapping its corner to the cursor. */
  const grip = useRef<{ dx: number; dy: number } | null>(null);

  const onHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const box = boxRef.current;
      if (!box) {
        return;
      }
      const rect = box.getBoundingClientRect();
      grip.current = {
        dx: event.clientX - rect.left,
        dy: event.clientY - rect.top,
      };
      const handle = event.currentTarget;
      // Absent in test DOMs; the move listeners below still work there.
      handle.setPointerCapture?.(event.pointerId);

      const move = (moved: PointerEvent) => {
        if (!grip.current) {
          return;
        }
        const left = Math.min(
          Math.max(moved.clientX - grip.current.dx, MARGIN - rect.width),
          window.innerWidth - MARGIN,
        );
        const top = Math.min(
          Math.max(moved.clientY - grip.current.dy, 0),
          window.innerHeight - MARGIN,
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
    [boxRef],
  );

  /** Back to wherever the box starts: called when the mode changes. */
  const reset = useCallback(() => setPosition(null), []);

  return { position, onHandlePointerDown, reset };
}

export default useViewportDrag;
