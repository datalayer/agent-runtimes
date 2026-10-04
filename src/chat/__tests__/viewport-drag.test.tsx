/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Moving a fixed box about the viewport: the chat's window keeps a margin on
 * screen, the floating assistant's character stays whole inside it (LOOP
 * T-23), so its balloon and conversation open inside the window too.
 */

import React, { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useViewportDrag, type DragPosition } from '../useViewportDrag';

const mounted: Array<() => void> = [];

afterEach(() => {
  mounted.splice(0).forEach(unmount => unmount());
  document.body.innerHTML = '';
});

/** Drags an 88px box from (50, 50) to (x, y); answers where it lands. */
async function dragTo(
  x: number,
  y: number,
  whole: boolean,
): Promise<DragPosition> {
  let position: DragPosition = null;
  function Box() {
    const ref = useRef<HTMLDivElement>(null);
    const drag = useViewportDrag(ref, { whole });
    position = drag.position;
    return <div ref={ref} onPointerDown={drag.onHandlePointerDown} />;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<Box />));
  mounted.push(() => act(() => root.unmount()));
  const box = container.firstElementChild as HTMLDivElement;
  box.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 88, height: 88 }) as DOMRect;
  const at = (type: string, clientX: number, clientY: number) =>
    new MouseEvent(type, { bubbles: true, clientX, clientY });
  await act(async () => {
    box.dispatchEvent(at('pointerdown', 50, 50));
    box.dispatchEvent(at('pointermove', x, y));
    box.dispatchEvent(at('pointerup', x, y));
  });
  return position;
}

describe('useViewportDrag', () => {
  it('keeps a margin of a window on screen', async () => {
    const position = await dragTo(-500, 5000, false);
    expect(position).toEqual({ left: 24 - 88, top: window.innerHeight - 24 });
  });

  it('keeps the whole assistant inside the window', async () => {
    expect(await dragTo(-500, -500, true)).toEqual({ left: 0, top: 0 });
    expect(await dragTo(5000, 5000, true)).toEqual({
      left: window.innerWidth - 88,
      top: window.innerHeight - 88,
    });
  });
});
