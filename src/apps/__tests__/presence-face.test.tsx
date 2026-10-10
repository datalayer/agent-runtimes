/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's face in its chat, drawn in Fluent Emoji (LOOP T-20): the
 * same drawing on every platform, from Datalayer's bundle — in the header's
 * presence, in the empty state at the page's size, and on the embed's
 * bubble — and the system's emoji only for one Datalayer ships no drawing of.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FaceDrawing, PresenceFace } from '../../chat/presence/Presence';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

/** Let the drawing's own module arrive, and React commit it. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50 && !container.querySelector('img'); i += 1) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
}

describe('an application’s face, in Fluent Emoji', () => {
  it('draws the presence’s emoji as the Fluent drawing, at its size', async () => {
    await act(async () => {
      root.render(<PresenceFace face="👀" size={20} state="idle" />);
    });
    await settle();
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.dataset.emoji).toBe('fluent');
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(img.getAttribute('width')).toBe('20');
    // The face is never redrawn as text.
    expect(container.textContent).toBe('');
  });

  it('draws it at the page’s size', async () => {
    await act(async () => {
      root.render(<FaceDrawing face="🔎" size={72} />);
    });
    await settle();
    expect(container.querySelector('img')?.getAttribute('width')).toBe('72');
  });

  it('leaves a host’s own drawing as it is', async () => {
    await act(async () => {
      root.render(
        <PresenceFace face={<b data-host>face</b>} size={40} state="idle" />,
      );
    });
    expect(container.querySelector('[data-host]')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('draws an emoji it ships no drawing of as the system’s', async () => {
    await act(async () => {
      root.render(<FaceDrawing face="🦖" size={20} />);
    });
    expect(container.querySelector('[data-emoji="system"]')?.textContent).toBe(
      '🦖',
    );
  });

  it('is what the chat’s empty state and the embed’s bubble draw', () => {
    const chat = readFileSync(
      join(__dirname, '..', 'plugins/chat/ChatView.tsx'),
      'utf8',
    );
    expect(chat).toContain(
      '<FaceDrawing face={presence.face} size={FACE_LARGE} />',
    );
    const embed = readFileSync(
      join(__dirname, '..', 'embed/AppEmbed.tsx'),
      'utf8',
    );
    expect(embed).toContain('<FluentEmoji emoji={emoji} size={20} label="" />');
  });
});
