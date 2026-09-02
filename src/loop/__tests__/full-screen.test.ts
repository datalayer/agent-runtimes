/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What "full screen" has to mean for a workspace embedded in someone's page.
 *
 * Two things went wrong here in turn, and both are invisible to a type
 * checker, so they are pinned in the source.
 *
 * It first hid the editor and let the chat fill the workspace — which on a
 * landing page is a card a few hundred pixels tall. The notebook vanished and
 * nothing was full screen. Then it drew a `position: fixed` overlay, which
 * escapes only as far as the nearest ancestor with a transform: a page that
 * animates its sections in leaves one behind permanently, so the overlay
 * filled the same card it was already in.
 *
 * The answer to both is the browser's own API. It promotes the element to the
 * top layer, where no ancestor can hold it, and — unlike a portal — leaves it
 * where it is in the DOM, so the theme variables the editors read still
 * resolve.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CHAT_VIEW = readFileSync(
  join(__dirname, '..', 'plugins', 'chat', 'ChatView.tsx'),
  'utf8',
);
const SHELL = readFileSync(
  join(__dirname, '..', 'shell', 'LoopWorkspace.tsx'),
  'utf8',
);
/* The machinery itself, extracted so the workspace header's icon and the
   chat's control share one implementation. */
const HOOK = readFileSync(
  join(__dirname, '..', 'shell', 'useWorkspaceFullScreen.ts'),
  'utf8',
);

describe('entering full screen', () => {
  it('asks the browser rather than drawing a big box', () => {
    // The whole point: a component cannot know what it is inside of, and
    // `position: fixed` is at the mercy of whatever transformed it.
    expect(HOOK).toContain('requestFullscreen()');
    expect(HOOK).toContain("document.addEventListener('fullscreenchange'");
    // And the chat actually uses that machinery rather than its own copy.
    expect(CHAT_VIEW).toContain('useWorkspaceFullScreen(viewRef)');
  });

  it('promotes the workspace, so its controls come too', () => {
    // Promoting the chat view alone would leave the agent picker and the
    // "where does the code run" control on the page underneath.
    // Two facts, not one line: a formatter is free to break the call across
    // lines and did, which failed an assertion that had pinned the whitespace
    // rather than the behaviour.
    expect(HOOK).toContain('.closest(');
    expect(HOOK).toContain("'[data-loop-workspace]'");
    expect(SHELL).toContain('data-loop-workspace');
  });

  it('keeps a covering overlay for where the API is refused', () => {
    // An iframe without `allow="fullscreen"`, mostly. Confined to a card is a
    // worse answer than full screen and a better one than nothing.
    expect(CHAT_VIEW).toContain("position: 'fixed'");
    expect(CHAT_VIEW).toContain('!usingFullscreenApi.current');
  });
});

describe('what is on screen while it lasts', () => {
  it('keeps whatever editor was open', () => {
    /*
     * The regression this file exists for. The column was gated on the
     * full-screen flag, so asking for more room took the notebook away — and
     * somebody working on a notebook who asks for more room is asking for more
     * room for the notebook. The reveal is decided by which surface is
     * chosen, and by nothing else.
     */
    expect(CHAT_VIEW).toContain(
      'const shown = active?.surfaceId === surface.surfaceId;',
    );
    expect(CHAT_VIEW).not.toContain('&& !chatFullScreen');
  });

  it('paints its own background once it is promoted', () => {
    // Out of the top layer there is nothing behind it: a workspace that
    // inherited its canvas from an ancestor would arrive transparent on black.
    expect(CHAT_VIEW).toContain(
      "...(fullScreen ? { bg: 'canvas.default' } : null)",
    );
  });
});

describe('leaving', () => {
  it('lets the browser Escape do it, and does not race it', () => {
    // The API exits on Escape by itself and tells us through the event. A
    // second listener bound at the same time would only fight it, so the
    // keyboard fallback is for the overlay path alone.
    expect(HOOK).toContain('if (!fullScreen || usingApi.current)');
    // And a menu closing on Escape must not also drop the reader out.
    expect(HOOK).toContain('!event.defaultPrevented');
  });
});
