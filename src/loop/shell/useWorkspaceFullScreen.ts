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
): WorkspaceFullScreen {
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
    if (!node?.requestFullscreen) {
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
  }, [anchorRef, fullScreen]);

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

  return { fullScreen, usingApi, toggle };
}

export default useWorkspaceFullScreen;
