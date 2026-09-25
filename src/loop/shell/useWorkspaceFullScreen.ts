/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Full screen for the workspace, from wherever the control is drawn.
 *
 * Extracted from the chat view so the same behaviour can be offered twice —
 * the chat's own header keeps its control, and the workspace header gains one
 * — without either copying the machinery.
 *
 * Done with the Fullscreen API rather than by drawing a big box, because a
 * component cannot know what it is inside of. `position: fixed` escapes only
 * as far as the nearest ancestor with a transform, and a page that animates
 * its sections in — the landing does — leaves one behind permanently: the
 * "full screen" chat then filled the card it was already in. The API promotes
 * the element to the browser's top layer, where no ancestor can hold it, and
 * unlike a portal it does not move in the DOM — so every inherited theme
 * variable the editors read still resolves.
 *
 * A CSS overlay is kept as the fallback for where the API is refused — an
 * iframe without `allow="fullscreen"`, mostly. The hook only reports which of
 * the two is in play (`usingApi`); painting the overlay stays with the caller,
 * which is the one that knows what it looks like.
 *
 * @module loop/shell/useWorkspaceFullScreen
 */

import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

export type WorkspaceFullScreen = {
  /** Whether the workspace is at full screen, by either door. */
  fullScreen: boolean;
  /** Whether the browser's API is the door in use; read `.current`. */
  usingApi: RefObject<boolean>;
  /** Enter or leave, whichever applies. */
  toggle: () => void;
  /**
   * The `topOffset` in pixels while the overlay is up — measured from a
   * selector's element when `topOffset` is one — for a caller that paints
   * its own overlay. 0 otherwise.
   */
  topOffsetPx: number;
};

/**
 * A top offset as pixels: a number as given, or the bottom edge of the
 * element a CSS selector names — a host's fixed header, whose height depends
 * on the width it wraps at and is never a number worth hard-coding. A
 * selector that matches nothing, or no document, is 0.
 */
export function resolveTopOffset(offset: number | string | undefined): number {
  if (typeof offset === 'number') {
    return offset;
  }
  if (!offset || typeof document === 'undefined') {
    return 0;
  }
  const element = document.querySelector(offset);
  return element
    ? Math.max(0, Math.round(element.getBoundingClientRect().bottom))
    : 0;
}

export type WorkspaceFullScreenOptions = {
  /**
   * Never ask the browser's API for full screen — go straight to the CSS
   * overlay, every time.
   *
   * The API promotes the workspace above *everything* on the page, a fixed
   * header the host drew around the workspace included: there is no partial
   * form of it that leaves a sibling element on screen, because promoting an
   * element removes the rest of the page from the compositor entirely. A
   * host whose header must survive full screen has no choice but to give up
   * the API's own benefits (see the module doc) and ask for the overlay
   * outright. False (the default) keeps trying the API first, the way every
   * other host wants it.
   */
  forceOverlay?: boolean;
  /**
   * Paint the CSS-overlay fallback itself, directly on the promoted node's
   * own inline styles, for a caller with no overlay of its own to paint —
   * `WorkspaceFullScreenAction`, which is a bare icon and never had one.
   * Implies `forceOverlay`: painting an overlay is moot if the API took the
   * workspace instead.
   *
   * `ChatView`'s own call leaves this off and keeps painting its own —
   * scoped to its own view rather than the whole workspace — so the two
   * never stack on top of one another.
   */
  paintOverlay?: boolean;
  /**
   * Room left clear at the top of the overlay, for a host's own fixed
   * header: pixels, or a CSS selector for the header itself, whose bottom
   * edge is measured when the overlay goes up and again on every resize.
   * Painted by the hook when `paintOverlay` is set; reported as
   * `topOffsetPx` for a caller that paints its own.
   */
  topOffset?: number | string;
};

/**
 * Full-screen state and the toggle, anchored by any element inside the
 * workspace.
 *
 * The element promoted is the whole workspace — the nearest
 * `[data-loop-workspace]` above the anchor — so the header's controls come
 * along instead of being left on the page underneath. With no workspace
 * around it, the anchor's own element is promoted, which is what a view
 * mounted without a shell would want.
 */
export function useWorkspaceFullScreen(
  anchorRef: RefObject<HTMLElement | null>,
  options: WorkspaceFullScreenOptions = {},
): WorkspaceFullScreen {
  const { forceOverlay = false, paintOverlay = false, topOffset = 0 } = options;
  const [fullScreen, setFullScreen] = useState(false);
  /* Which of the two doors is in play, so leaving uses the one it came in
     by. */
  const usingApi = useRef(false);

  useEffect(() => {
    /* The browser can leave without asking us — Escape does exactly that — so
       the flag follows the document rather than the click. */
    const sync = () => {
      if (!usingApi.current) {
        return;
      }
      // Whatever was promoted — the workspace, or the anchor's element where
      // there is no workspace around it — as long as it still contains us.
      const active =
        !!document.fullscreenElement &&
        !!anchorRef.current &&
        document.fullscreenElement.contains(anchorRef.current);
      setFullScreen(active);
      if (!active) {
        usingApi.current = false;
      }
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [anchorRef]);

  const toggle = useCallback(() => {
    /*
     * The whole workspace, not the view the control happens to be in.
     *
     * Promoting a single view would leave the workspace's header on the page
     * underneath — the agent picker and the control saying where the code
     * runs — so at full screen a reader would lose the two controls most
     * worth having room for.
     */
    const node =
      (anchorRef.current?.closest(
        '[data-loop-workspace]',
      ) as HTMLElement | null) ?? anchorRef.current;
    if (fullScreen) {
      if (usingApi.current && document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        setFullScreen(false);
      }
      return;
    }
    if (forceOverlay || paintOverlay || !node?.requestFullscreen) {
      setFullScreen(true);
      return;
    }
    usingApi.current = true;
    node.requestFullscreen().then(
      () => setFullScreen(true),
      () => {
        // Refused. Cover what can be covered instead.
        usingApi.current = false;
        setFullScreen(true);
      },
    );
  }, [anchorRef, fullScreen, forceOverlay, paintOverlay]);

  /*
   * The offset, measured while the overlay is up: on entry, and again when
   * the window resizes and the header may wrap to a different height.
   */
  const [topOffsetPx, setTopOffsetPx] = useState(0);
  useEffect(() => {
    if (!fullScreen || usingApi.current) {
      setTopOffsetPx(0);
      return undefined;
    }
    const measure = () => setTopOffsetPx(resolveTopOffset(topOffset));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fullScreen, topOffset]);

  /*
   * The overlay itself, for a caller that asked the hook to paint one.
   *
   * Direct inline styles rather than a class: this hook has no stylesheet of
   * its own to add one to, and the node being styled is found by DOM query
   * in the first place — see `toggle` above, which the same lookup is
   * copied from rather than shared, since memoising it would need `anchorRef`
   * itself to change identity to notice a different anchor mounting, which
   * it never does.
   */
  useEffect(() => {
    if (!paintOverlay || !fullScreen || usingApi.current) {
      return undefined;
    }
    const node =
      (anchorRef.current?.closest(
        '[data-loop-workspace]',
      ) as HTMLElement | null) ?? anchorRef.current;
    if (!node) {
      return undefined;
    }
    const previous = node.getAttribute('style');
    node.style.position = 'fixed';
    node.style.top = `${topOffsetPx}px`;
    node.style.right = '0';
    node.style.bottom = '0';
    node.style.left = '0';
    // The workspace root sizes itself `height: 100%`; left in place, that
    // height wins over `top`/`bottom` and the overlay runs `topOffset` pixels
    // past the bottom of the window.
    node.style.height = 'auto';
    node.style.zIndex = '1000';
    return () => {
      if (previous === null) {
        node.removeAttribute('style');
      } else {
        node.setAttribute('style', previous);
      }
    };
  }, [paintOverlay, fullScreen, anchorRef, topOffsetPx]);

  /*
   * Escape leaves the fallback overlay, as it does from anything covering the
   * window. Not bound for the real thing: the browser handles Escape itself
   * there, and a second listener would only race it.
   *
   * `defaultPrevented` is the guard that matters: a menu open inside the
   * workspace closes on Escape too, and says so by consuming the event.
   * Without the check, dismissing a menu would drop the reader out of full
   * screen as well.
   */
  useEffect(() => {
    if (!fullScreen || usingApi.current) {
      return undefined;
    }
    const leave = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        setFullScreen(false);
      }
    };
    window.addEventListener('keydown', leave);
    return () => window.removeEventListener('keydown', leave);
  }, [fullScreen]);

  return { fullScreen, usingApi, toggle, topOffsetPx };
}

export default useWorkspaceFullScreen;
