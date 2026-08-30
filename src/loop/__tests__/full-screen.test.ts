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

describe('entering full screen', () => {
  it('asks the browser rather than drawing a big box', () => {
    // The whole point: a component cannot know what it is inside of, and
    // `position: fixed` is at the mercy of whatever transformed it.
    expect(CHAT_VIEW).toContain('requestFullscreen()');
    expect(CHAT_VIEW).toContain("document.addEventListener('fullscreenchange'");
  });

  it('promotes the workspace, so its controls come too', () => {
    // Promoting the chat view alone would leave the agent picker and the
    // "where does the code run" control on the page underneath.
    expect(CHAT_VIEW).toContain("closest('[data-loop-workspace]')");
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
     * room for the notebook.
     */
    expect(CHAT_VIEW).toContain('{active || waiting ? (');
    expect(CHAT_VIEW).not.toContain('&& !chatFullScreen');
  });

  it('paints its own background once it is promoted', () => {
    // Out of the top layer there is nothing behind it: a workspace that
    // inherited its canvas from an ancestor would arrive transparent on black.
    expect(CHAT_VIEW).toContain("...(fullScreen ? { bg: 'canvas.default' } : null)");
  });
});

describe('leaving', () => {
  it('lets the browser Escape do it, and does not race it', () => {
    // The API exits on Escape by itself and tells us through the event. A
    // second listener bound at the same time would only fight it, so the
    // keyboard fallback is for the overlay path alone.
    expect(CHAT_VIEW).toContain('if (!fullScreen || usingFullscreenApi.current)');
    // And a menu closing on Escape must not also drop the reader out.
    expect(CHAT_VIEW).toContain('!event.defaultPrevented');
  });
});
