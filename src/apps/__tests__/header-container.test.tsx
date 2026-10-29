/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A host that already draws a bar above the workspace can have the header's
 * controls there instead of in a row of their own, and can have the openers
 * only in the composer's menu.
 *
 * What is pinned: `headerContainer` portals the header's controls into the
 * host's element and draws no header row; full screen then promotes what the
 * host marked (`data-loop-fullscreen-root`), so the controls — the one that
 * leaves included — are not left under the overlay; and `suggestionLabels`
 * is on unless a host turns it off, and off takes the labels, not the menu.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { loopPlugins } from '../presets';
import { CHAT_PLUGIN_NAME, type ChatPluginConfig } from '../plugins/chat';
import { fullScreenNode } from '../shell/useWorkspaceFullScreen';

const source = (path: string) =>
  readFileSync(join(__dirname, '..', path), 'utf8');

describe('full screen from a control outside the workspace', () => {
  const tree = (marked: boolean) => {
    const root = document.createElement('div');
    if (marked) {
      root.setAttribute('data-loop-fullscreen-root', '');
    }
    const bar = document.createElement('div');
    const control = document.createElement('button');
    bar.appendChild(control);
    const workspace = document.createElement('div');
    workspace.setAttribute('data-loop-workspace', '');
    const inside = document.createElement('button');
    workspace.appendChild(inside);
    root.append(bar, workspace);
    return { root, control, workspace, inside };
  };

  it('promotes what the host marked, bar and workspace together', () => {
    const { root, control, inside } = tree(true);
    expect(fullScreenNode(control)).toBe(root);
    // The chat's own control too: one full screen, whichever asked.
    expect(fullScreenNode(inside)).toBe(root);
  });

  it('promotes the workspace when nothing is marked', () => {
    const { workspace, inside, control } = tree(false);
    expect(fullScreenNode(inside)).toBe(workspace);
    // Outside any workspace, the anchor itself — as before.
    expect(fullScreenNode(control)).toBe(control);
  });
});

describe('the header in the host bar', () => {
  const workspace = source('shell/LoopWorkspace.tsx');

  it('portals the controls into the host element and draws no row', () => {
    expect(workspace).toContain("import { createPortal } from 'react-dom';");
    expect(workspace).toContain('headerContainer?: HTMLElement | null;');
    expect(workspace).toMatch(
      /showHeader && headerContainer\s*\? createPortal\(/,
    );
    expect(workspace).toContain(
      'showHeader && headerContainer === undefined ? (',
    );
    // The same controls either way: one definition, rendered in one place.
    expect(workspace.match(/\{headerControls\}/g)?.length).toBe(2);
  });

  it('is passed through by the embed', () => {
    const embed = source('embed/LoopEmbed.tsx');
    expect(embed).toContain('headerContainer?: HTMLElement | null;');
    expect(embed).toContain('headerContainer={headerContainer}');
  });
});

describe('the suggestion labels', () => {
  const config = (options: Parameters<typeof loopPlugins>[0]) =>
    buildReactorFromPlugins(loopPlugins(options)).getConfig<ChatPluginConfig>(
      CHAT_PLUGIN_NAME,
    );

  it('are on by default', () => {
    expect(config({})?.suggestionLabels).toBe(true);
  });

  it('can be turned off', () => {
    expect(config({ suggestionLabels: false })?.suggestionLabels).toBe(false);
  });

  it('take the labels only: the composer keeps the menu', () => {
    const chat = source('plugins/chat/ChatView.tsx');
    expect(chat).toContain(
      'config?.suggestionLabels !== false && chatSuggestions.length > 0 ? (',
    );
    expect(chat).toContain(
      'topPrompt || layout || config?.suggestionLabels === false',
    );
    // The composer's own suggestions control is fed regardless.
    expect(chat).toContain('suggestions: chatSuggestions,');
  });
});
