/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The editor toolbars, as contribution points.
 *
 * What this is really testing is a direction of dependency. The notebook used
 * to draw two buttons that submitted prompts, which meant the notebook knew
 * about the chat; now the notebook offers a toolbar and the chat fills it, and
 * neither imports the other. That is only true if switching the chat off takes
 * its buttons with it — so that is what these check.
 */

import { describe, expect, it } from 'vitest';
import { buildReactorFromPlugins, defineExtension } from '@datalayer/reactor';
import {
  LoopDocumentToolbar,
  LoopNotebookToolbar,
  createPromptChannel,
  type EditorToolbarContext,
  type LoopWorkspaceContext,
} from '../core';
import { ChatPlugin } from '../plugins/chat';
import { DocumentPlugin } from '../plugins/document';
import { NotebookPlugin } from '../plugins/notebook';
import { DocumentExtension, NotebookExtension } from '../extensions';
import { NOTEBOOK_TOOLBAR_PLUGIN_NAME } from '../plugins/notebook-toolbar/names';
import { DOCUMENT_TOOLBAR_PLUGIN_NAME } from '../plugins/document-toolbar/names';

function workspace(): LoopWorkspaceContext {
  return {
    serverUrl: 'http://server',
    agentId: 'default',
    sandbox: { state: 'running' },
    setSandbox: () => {},
    activeViewType: 'chat',
    setActiveViewType: () => {},
    prompts: createPromptChannel(),
    viewControls: {},
    setViewControls: () => {},
  };
}

function context(): EditorToolbarContext {
  return { workspace: workspace(), editorId: 'loop-default' };
}

describe('the editors', () => {
  it('declare the toolbar points they offer', () => {
    const reactor = buildReactorFromPlugins([NotebookPlugin, DocumentPlugin]);
    reactor.start();

    // Declared, not merely used: this is what puts an empty toolbar on the
    // plugin graph, which is when knowing it exists is most useful.
    expect(
      reactor.getManifest(NotebookPlugin.name)?.contributionPoints,
    ).toContain('loop.notebook.toolbar');
    expect(
      reactor.getManifest(DocumentPlugin.name)?.contributionPoints,
    ).toContain('loop.document.toolbar');
  });

  it('offer a toolbar nobody has to fill', () => {
    const reactor = buildReactorFromPlugins([NotebookPlugin]);
    reactor.start();

    // An editor with no toolbar contributors is a working editor.
    expect(reactor.getContributions(LoopNotebookToolbar)).toEqual([]);
  });
});

describe('the chat', () => {
  it('puts its agent actions on the notebook toolbar', () => {
    const reactor = buildReactorFromPlugins([ChatPlugin, NotebookPlugin]);
    reactor.start();

    const items = reactor
      .getContributions(LoopNotebookToolbar)
      .flatMap(entry => entry.value.items(context()));

    expect(items.map(item => item.key)).toEqual([
      'loop-compact',
      'loop-reproduce',
    ]);
  });

  it('submits a prompt when one is pressed, rather than calling an agent', () => {
    const reactor = buildReactorFromPlugins([ChatPlugin, NotebookPlugin]);
    reactor.start();

    const submitted: string[] = [];
    const ctx = context();
    ctx.workspace.prompts.subscribe(prompt => {
      submitted.push(prompt);
      return { handled: true };
    });

    const items = reactor
      .getContributions(LoopNotebookToolbar)
      .flatMap(entry => entry.value.items(ctx));
    const compact = items.find(item => item.key === 'loop-compact');
    (compact as { onClick: () => void }).onClick();

    // Through the same channel a person types into: a button that reached an
    // agent directly would be a second way in, free to drift from the first.
    expect(submitted).toEqual([
      '@NotebookCompactor compact this notebook without changing what it computes.',
    ]);
  });

  it('takes its buttons off the toolbar when it is switched off', () => {
    const reactor = buildReactorFromPlugins([ChatPlugin, NotebookPlugin]);
    reactor.start();
    expect(reactor.getContributions(LoopNotebookToolbar)).toHaveLength(1);

    reactor.disable(ChatPlugin.name);

    // The whole claim of the split, in one assertion: the notebook keeps
    // working and loses only what the chat was putting there.
    expect(reactor.getContributions(LoopNotebookToolbar)).toEqual([]);
    expect(reactor.isEnabled(NotebookPlugin.name)).toBe(true);
  });

  it('also fills the document toolbar', () => {
    const reactor = buildReactorFromPlugins([ChatPlugin, DocumentPlugin]);
    reactor.start();

    const items = reactor
      .getContributions(LoopDocumentToolbar)
      .flatMap(entry => entry.value.items(context()));

    expect(items.map(item => item.key)).toEqual(['loop-summarise']);
  });
});

describe('the toolbar plugins', () => {
  it('are delivered by the editor extensions, and grouped as such', () => {
    const reactor = buildReactorFromPlugins([NotebookExtension, DocumentExtension]);
    reactor.start();

    expect(reactor.getExtensionManifest(NotebookExtension.name)?.plugins).toEqual([
      NotebookPlugin.name,
      NOTEBOOK_TOOLBAR_PLUGIN_NAME,
    ]);
    expect(reactor.getManifest(NOTEBOOK_TOOLBAR_PLUGIN_NAME)?.extension).toBe(
      NotebookExtension.name,
    );
    expect(reactor.getManifest(DOCUMENT_TOOLBAR_PLUGIN_NAME)?.extension).toBe(
      DocumentExtension.name,
    );
  });

  it('wait for their toolbar to be read rather than loading at startup', async () => {
    const reactor = buildReactorFromPlugins([NotebookExtension]);
    reactor.start();
    await reactor.whenReady();

    // Listed and describable, and not fetched: a workspace where nobody opens
    // a notebook never pays for the toolbar's module.
    const manifest = reactor.getManifest(NOTEBOOK_TOOLBAR_PLUGIN_NAME);
    expect(manifest).toMatchObject({
      displayName: 'Notebook toolbar',
      lazy: true,
      loaded: false,
      activated: false,
    });
    expect(manifest?.activationEvents).toEqual([
      'onContributionPoint:loop.notebook.toolbar',
    ]);
  });

  it('are still switched off one at a time, without taking the editor down', () => {
    const reactor = buildReactorFromPlugins([NotebookExtension]);
    reactor.start();

    reactor.disable(NOTEBOOK_TOOLBAR_PLUGIN_NAME);

    // Grouping is about delivery, not fate.
    expect(reactor.isEnabled(NOTEBOOK_TOOLBAR_PLUGIN_NAME)).toBe(false);
    expect(reactor.isEnabled(NotebookPlugin.name)).toBe(true);
  });
});

describe('an extension', () => {
  it('is not itself a plugin', () => {
    const reactor = buildReactorFromPlugins([NotebookExtension]);
    reactor.start();

    expect(reactor.hasPlugin(NotebookExtension.name)).toBe(false);
    expect(reactor.listExtensions()).toEqual([NotebookExtension.name]);
  });

  it('refuses to group nothing', () => {
    expect(() =>
      defineExtension({ name: '@loop/empty', plugins: [] }),
    ).toThrow(/at least one plugin/);
  });
});
