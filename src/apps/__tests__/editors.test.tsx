/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The editor selector: the chat's choice, offered from the header.
 *
 * The selector and the `/editor` command are two faces of one store, and both
 * reach the chat through the same `requestSurface` channel as `/notebook` —
 * so what these pin down is that the two faces agree, that the channel is
 * actually asked, and that a command with nobody listening says so.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildReactorFromPlugins,
  configurePlugin,
  contribution,
  definePlugin,
} from '@datalayer/reactor';
import { LoopWorkspace } from '../shell/LoopWorkspace';
import {
  ShellPlugin,
  SHELL_PLUGIN_NAME,
  NONE_EDITOR,
  getEditorChoice,
  seedEditorChoice,
  setEditorOptions,
} from '../plugins/shell';
import { PROMPT_PLUGIN_NAME } from '../plugins/prompt';
import {
  LoopChatSurface,
  LoopCommand,
  LoopEditorView,
  onSurfaceRequest,
} from '../core';
import {
  SpreadsheetPlugin,
  SPREADSHEET_SURFACE_ID,
} from '../plugins/spreadsheet';
import { CHAT_PLUGIN_NAME, type ChatPluginConfig } from '../plugins/chat';
import { loopPlugins } from '../presets';

/** Two surfaces, the way the notebook and document plugins contribute them. */
const SurfacesPlugin = definePlugin({
  name: '@tests/surfaces',
  contributes: [
    contribution(
      LoopChatSurface,
      {
        surfaceId: 'notebook',
        title: 'Notebook',
        order: 10,
        load: () => Promise.reject(new Error('not loaded in this test')),
      },
      { id: 'notebook', order: 10 },
    ),
    contribution(
      LoopChatSurface,
      {
        surfaceId: 'document',
        title: 'Document',
        order: 20,
        canOpen: () => false,
        unavailableReason: () => 'Needs a running sandbox',
        load: () => Promise.reject(new Error('not loaded in this test')),
      },
      { id: 'document', order: 20 },
    ),
  ],
});

/** The command a plugin contributes, by name. */
function commandOf(plugin: { contributes?: readonly any[] }, name: string) {
  const record = (plugin.contributes ?? []).find(
    entry => entry.point === LoopCommand && entry.value.name === name,
  );
  return record?.value;
}

async function mount(plugins: Parameters<typeof buildReactorFromPlugins>[0]) {
  const reactor = buildReactorFromPlugins(plugins);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<LoopWorkspace serverUrl="" agentId="a" reactor={reactor} />);
  });
  return { container, root };
}

function buttonByText(container: HTMLElement, text: string) {
  return [...container.querySelectorAll('button')].find(
    button => button.textContent?.trim() === text,
  );
}

beforeEach(() => {
  // The store is module state, exactly like the surface channel it feeds;
  // each test starts from the blank shell.
  seedEditorChoice(NONE_EDITOR);
  setEditorOptions([]);
});

describe('the selector in the header', () => {
  it('offers none plus every contributed surface, gated', async () => {
    const { container, root } = await mount([ShellPlugin, SurfacesPlugin]);

    expect(buttonByText(container, 'Chat')).toBeDefined();
    expect(buttonByText(container, 'Notebook')).toBeDefined();
    const document_ = buttonByText(container, 'Document')!;
    // Focusable but declining, with the reason where a tooltip reads it —
    // the same manners as the chat's own strip.
    expect(document_.getAttribute('aria-disabled')).toBe('true');
    expect(document_.getAttribute('title')).toBe('Needs a running sandbox');

    await act(async () => root.unmount());
  });

  it('asks the chat for what is clicked, and remembers asking', async () => {
    const asked: string[] = [];
    const stop = onSurfaceRequest(id => asked.push(id));
    const { container, root } = await mount([ShellPlugin, SurfacesPlugin]);

    await act(async () => {
      buttonByText(container, 'Notebook')!.click();
    });
    expect(asked).toEqual(['notebook']);
    expect(getEditorChoice().editorId).toBe('notebook');

    // A disabled editor declines the click instead of asking anyway.
    await act(async () => {
      buttonByText(container, 'Document')!.click();
    });
    expect(asked).toEqual(['notebook']);

    // And `Chat` closes the editor: the same channel, the word the chat
    // knows is still 'none'.
    await act(async () => {
      buttonByText(container, 'Chat')!.click();
    });
    expect(asked).toEqual(['notebook', 'none']);

    stop();
    await act(async () => root.unmount());
  });
});

describe('the /editor command', () => {
  it('cycles through none and the surfaces on offer', async () => {
    setEditorOptions(['notebook', 'document']);
    const asked: string[] = [];
    const stop = onSurfaceRequest(id => asked.push(id));

    const command = commandOf(ShellPlugin, 'editor')!;
    await command.run({ workspace: {} as never, argv: '' });
    expect(getEditorChoice().editorId).toBe('notebook');
    await command.run({ workspace: {} as never, argv: '' });
    expect(getEditorChoice().editorId).toBe('document');
    await command.run({ workspace: {} as never, argv: '' });
    // Wraps through the blank shell rather than sticking at the end.
    expect(getEditorChoice().editorId).toBe(NONE_EDITOR);
    expect(asked).toEqual(['notebook', 'document', 'none']);

    stop();
  });

  it('takes a name, and refuses one it does not know', async () => {
    setEditorOptions(['notebook']);
    const stop = onSurfaceRequest(() => {});

    const command = commandOf(ShellPlugin, 'editor')!;
    await command.run({ workspace: {} as never, argv: 'notebook' });
    expect(getEditorChoice().editorId).toBe('notebook');

    await expect(
      command.run({ workspace: {} as never, argv: 'whiteboard' }),
    ).rejects.toThrow(/No editor called 'whiteboard'/);

    stop();
  });

  it('opens a workbook in Cells as the spreadsheet', async () => {
    const asked: string[] = [];
    const stop = onSurfaceRequest(id => asked.push(id));
    const { container, root } = await mount([ShellPlugin, SpreadsheetPlugin]);

    // Offered beside the others, and never gated: the grid needs no sandbox.
    const offered = buttonByText(container, 'Spreadsheet')!;
    expect(offered).toBeDefined();
    expect(offered.getAttribute('aria-disabled')).not.toBe('true');
    expect(getEditorChoice().options).toContain(SPREADSHEET_SURFACE_ID);

    const command = commandOf(ShellPlugin, 'editor')!;
    await command.run({ workspace: {} as never, argv: 'spreadsheet' });
    expect(getEditorChoice().editorId).toBe('spreadsheet');
    expect(asked).toEqual(['spreadsheet']);

    // What the chat draws for it: the lazy view, a workbook in Cells.
    const editor = commandOf(SpreadsheetPlugin, 'spreadsheet');
    expect(editor?.keybinding).toBe('Mod+Alt+S');
    const view = (SpreadsheetPlugin.contributes ?? []).find(
      entry => entry.point === LoopEditorView,
    )!.value as { load: () => Promise<{ default: React.ComponentType<any> }> };
    const { default: SpreadsheetView, spreadsheetWorkbook } =
      (await view.load()) as typeof import('../plugins/spreadsheet/SpreadsheetView');
    // jsdom has no ResizeObserver, which the grid sizes itself with.
    const hadObserver = 'ResizeObserver' in globalThis;
    if (!hadObserver) {
      (globalThis as any).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const viewRoot = createRoot(host);
    try {
      await act(async () => {
        viewRoot.render(
          <SpreadsheetView
            surfaceId="conversation-1"
            workspace={{ surfaceId: 'conversation-1' } as never}
          />,
        );
      });
      expect(
        host.querySelector('[data-spreadsheet-editor="conversation-1"]'),
      ).not.toBeNull();
      expect(host.querySelector('[role="grid"]')).not.toBeNull();
      // The same workbook each time the editor comes back.
      const workbook = spreadsheetWorkbook('conversation-1');
      expect(workbook.sheets.length).toBeGreaterThan(0);
      expect(spreadsheetWorkbook('conversation-1')).toBe(workbook);
    } finally {
      await act(async () => viewRoot.unmount());
      if (!hadObserver) {
        delete (globalThis as any).ResizeObserver;
      }
      stop();
      await act(async () => root.unmount());
    }
  });

  it('says so when no chat is listening', async () => {
    const command = commandOf(ShellPlugin, 'editor')!;
    await expect(
      command.run({ workspace: {} as never, argv: '' }),
    ).rejects.toThrow(/No chat is on screen/);
  });

  it('spends a keystroke on switching', () => {
    expect(commandOf(ShellPlugin, 'editor')!.keybinding).toBe('Mod+Alt+E');
  });
});

describe('the preset switch', () => {
  it('mounts the selector and stands the chat strip down, together', () => {
    const reactor = buildReactorFromPlugins(
      loopPlugins({ editorSelector: true, defaultEditor: 'none' }),
    );
    expect(reactor.hasPlugin(SHELL_PLUGIN_NAME)).toBe(true);
    // Two controls offering the same choice would eventually disagree.
    expect(
      reactor.getConfig<ChatPluginConfig>(CHAT_PLUGIN_NAME)
        ?.showSurfaceSelector,
    ).toBe(false);
    expect(reactor.hasPlugin(PROMPT_PLUGIN_NAME)).toBe(false);
  });

  it('starts the selector where the chat starts', async () => {
    const { root } = await mount([
      configurePlugin(ShellPlugin, { defaultEditor: 'notebook' }),
      SurfacesPlugin,
    ]);
    // Seeded, not requested: the chat's own default opens the editor, this
    // only makes the selector agree from the first paint.
    expect(getEditorChoice().editorId).toBe('notebook');
    await act(async () => root.unmount());
  });
});
