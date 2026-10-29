/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Two families of avatars beside Datalayer's drawings: the design library's
 * orb, thinking while a turn runs, and the characters clippy.js publishes,
 * fetched from jsDelivr when one is drawn — read as text, never run — and,
 * when they cannot be fetched, the paper clip with a sentence that says why.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import {
  ASSISTANT_CHARACTER_PLUGINS,
  AssistantCharactersPlugin,
  ClippyJsCharactersPlugin,
  assistantCharacterFor,
  assistantCharactersOf,
} from '../../apps/plugins/assistant-characters';
import { AVATAR_PARTS } from '../../apps/plugins/canvas-parts';
import {
  SHIPPED_ASSISTANT_CHARACTERS,
  familyOf,
  shippedAssistantCharacter,
} from '../assistant/catalogue';
import {
  CLIPPY_JS_ASSISTANT_CHARACTERS,
  CLIPPY_JS_CHARACTERS,
  clippyJsProblem,
  fetchClippyJsCharacter,
} from '../assistant/clippyJsCharacters';
import { orbStateOf } from '../assistant/orbCharacters';
import { APP_ASSISTANT_AVATAR_ID } from '../../apps/apps/appspec';

vi.mock('@datalayer/design/lib/avatar/SvgAvatarOrb', () => ({
  SvgAvatarOrb: ({
    size,
    state,
    tone,
  }: {
    size: number;
    state: string;
    tone: string;
  }) => (
    <svg
      data-orb-state={state}
      data-orb-tone={tone}
      width={size}
      height={size}
    />
  ),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<() => void> = [];
afterEach(() => {
  for (const unmount of mounted.splice(0)) {
    unmount();
  }
  vi.unstubAllGlobals();
});

async function draw(element: React.ReactElement): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

describe('the orb', () => {
  it('acts out every state of the assistant, idle when it has none', () => {
    for (const state of [
      'idle',
      'greeting',
      'thinking',
      'working',
      'waiting',
      'speaking',
      'paused',
      'goodbye',
    ] as const) {
      expect(orbStateOf(state)).toBe(state);
    }
    expect(orbStateOf(undefined)).toBe('idle');
  });

  it('is contributed by Datalayer’s plugin once, in the theme’s colours, named Orb', async () => {
    const reactor = buildReactorFromPlugins([AssistantCharactersPlugin]);
    await reactor.start();
    const orbs = assistantCharactersOf(reactor).filter(entry =>
      entry.id.startsWith('orb'),
    );
    expect(orbs.map(entry => [entry.id, entry.character.name])).toEqual([
      ['orb', 'Orb'],
    ]);
  });

  it('draws the design library’s orb in the theme’s colours and the stage’s state', async () => {
    const Orb = shippedAssistantCharacter('orb').Drawing;
    const host = await draw(<Orb size={40} state="working" />);
    await settle();
    const svg = host.querySelector('svg[data-orb-tone]');
    expect(svg?.getAttribute('data-orb-tone')).toBe('theme');
    expect(svg?.getAttribute('data-orb-state')).toBe('working');
  });
});

describe('the clippy.js characters', () => {
  it('are one avatar each, in their own plugin, said to be fetched', async () => {
    const reactor = buildReactorFromPlugins([ClippyJsCharactersPlugin]);
    await reactor.start();
    expect(assistantCharactersOf(reactor).map(entry => entry.id)).toEqual(
      CLIPPY_JS_CHARACTERS.map(name => `clippy-js-${name.toLowerCase()}`),
    );
    for (const character of CLIPPY_JS_ASSISTANT_CHARACTERS) {
      expect(character.family).toBe('clippy-js');
      expect(character.fetchedFrom).toMatch(/jsDelivr/);
      expect(APP_ASSISTANT_AVATAR_ID.test(character.id)).toBe(true);
    }
    expect(ASSISTANT_CHARACTER_PLUGINS).toContain(ClippyJsCharactersPlugin);
  });

  it('are fetched from jsDelivr only when one is drawn, and read as text', async () => {
    const fetched: string[] = [];
    const agentModule =
      'var agent = {"overlayCount":1,"framesize":[1,1],"animations":{"Idle1_1":{"frames":[{"duration":100,"images":[[0,0]]}]}}};\nexport { agent as default };\n';
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const mapModule = `var map = "${png}";\nexport { map as default };\n`;
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url);
      if (url.endsWith('agent.mjs')) {
        return new Response(agentModule);
      }
      if (url.endsWith('map.mjs')) {
        return new Response(mapModule);
      }
      // The sprite sheet's data URL, as the browser reads it.
      const bytes = Uint8Array.from(atob(png.split(',')[1]), c =>
        c.charCodeAt(0),
      );
      return new Response(bytes);
    });
    // jsdom holds no object URLs: the sprite sheet is named, not drawn.
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:sprite' }),
    );
    // Listing the avatars fetches nothing.
    void SHIPPED_ASSISTANT_CHARACTERS.map(character => character.name);
    expect(fetched).toEqual([]);
    const character = await fetchClippyJsCharacter('Rocky');
    expect(character.name).toBe('Rocky');
    expect(fetched.slice(0, 2)).toEqual([
      'https://cdn.jsdelivr.net/npm/clippyjs@0.1.0/dist/agents/rocky/agent.mjs',
      'https://cdn.jsdelivr.net/npm/clippyjs@0.1.0/dist/agents/rocky/map.mjs',
    ]);
    // Fetched once for the page.
    const again = fetched.length;
    await fetchClippyJsCharacter('Rocky');
    expect(fetched.length).toBe(again);
  });

  it('stand in as the paper clip, with a sentence, when jsDelivr cannot be reached', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('Failed to fetch.');
    });
    const Merlin = shippedAssistantCharacter('clippy-js-merlin').Drawing;
    const host = await draw(<Merlin size={64} state="idle" />);
    await settle();
    const fallback = host.querySelector('[data-assistant-fetch-problem]');
    expect(fallback?.getAttribute('data-assistant-fetch-problem')).toBe(
      'clippy-js-merlin',
    );
    expect(fallback?.getAttribute('title')).toBe(
      clippyJsProblem('Merlin', new Error('Failed to fetch.')),
    );
    expect(fallback?.getAttribute('title')).toBe(
      'Merlin could not be fetched from jsDelivr (clippyjs 0.1.0): Failed to fetch. The paper clip stands in for it.',
    );
    expect(fallback?.querySelector('svg')).not.toBeNull();
  });
});

describe('the avatars a picker lists', () => {
  it('are grouped: the orb, the clippy.js characters, the drawings, the 3D model', () => {
    const groups = [...new Set(AVATAR_PARTS.map(part => part.group))];
    expect(groups).toEqual([
      'Datalayer’s orb',
      'clippy.js characters',
      'Paper clips and drawings',
      '3D models',
    ]);
    const clippy = AVATAR_PARTS.find(
      part => part.id === 'avatar:clippy-js-clippy',
    );
    expect(clippy?.groupNote).toMatch(/Microsoft’s characters.*jsDelivr/);
    expect(familyOf(shippedAssistantCharacter('wizard'))).toBe('drawing');
  });

  it('are found by id wherever an avatar is chosen', () => {
    const contributed = SHIPPED_ASSISTANT_CHARACTERS.map(character => ({
      id: character.id,
      character,
    }));
    const chosen = assistantCharacterFor(contributed, { app: 'orb' });
    expect('problem' in chosen ? chosen.problem : chosen.id).toBe('orb');
  });
});
