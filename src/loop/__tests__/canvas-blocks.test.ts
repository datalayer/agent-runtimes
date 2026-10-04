/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Canvas's palette as a contribution point (LOOP C-12): the blocks are
 * what the enabled plugins contribute, a plugin disabled takes its blocks
 * off, and an application using one of them says so in its setup notes.
 */

import { describe, expect, it } from 'vitest';
import { contribution, definePlugin } from '@datalayer/reactor';
import {
  CANVAS_BLOCK_PLUGINS,
  blockSetupNotes,
  canvasBlocksOf,
  canvasBlocksPluginName,
  canvasBlocksReactor,
  canvasBlocksReactorOf,
  componentsUsedBy,
  pluginsOffSetupNotes,
  unknownPluginsOff,
} from '../plugins/canvas-blocks';
import { checkApp, checkAppspec } from '../apps/checks';
import { dumpAppspec } from '../apps/appspec';
import { LoopCanvasBlock } from '../core';
import { emptyAppspec } from '../apps/appspec';
import { listComponents } from '../../specs/uiPlugins';
import type { AppSpec, ComponentSpec } from '../../types/agentspecs';

const A2UI = canvasBlocksPluginName('a2ui');

const gauge: ComponentSpec = {
  id: 'Gauge',
  name: 'Gauge',
  description: 'A needle on a dial.',
  category: 'data',
  emoji: '🧭',
  standard: false,
  events: [],
};

const GaugePlugin = definePlugin({
  name: 'test-gauge-block',
  contributes: [
    contribution(
      LoopCanvasBlock,
      { id: 'Gauge', uiPlugin: 'gauges', component: gauge },
      { id: 'Gauge' },
    ),
  ],
});

const withPage = (components: string[], placed: string[] = []): AppSpec => {
  const app = emptyAppspec('chat');
  return {
    ...app,
    interface: {
      ...app.interface,
      components,
      surface: {
        protocol: 'a2ui/v0.9',
        components: placed.map((component, at) => ({
          id: `block-${at}`,
          component,
        })),
        composedBy: '',
        composedAt: '',
      },
    },
  };
};

describe('the blocks of the Canvas', () => {
  it('are one plugin per UI plugin of the catalogue that renders components', () => {
    expect(CANVAS_BLOCK_PLUGINS.map(plugin => plugin.name)).toEqual([A2UI]);
  });

  it('are the whole catalog while its plugins are enabled', () => {
    const blocks = canvasBlocksOf(canvasBlocksReactor());
    expect(blocks.map(block => block.id)).toEqual(
      listComponents().map(component => component.id),
    );
  });

  it('leave the palette with their plugin, disabled', () => {
    expect(canvasBlocksOf(canvasBlocksReactor([A2UI]))).toEqual([]);
  });

  it('are what the enabled plugins contribute, and nothing else', () => {
    const reactor = canvasBlocksReactor(
      [A2UI],
      [...CANVAS_BLOCK_PLUGINS, GaugePlugin],
    );
    expect(canvasBlocksOf(reactor)).toEqual([gauge]);
  });

  it('refuse a plugin to disable that the Canvas does not have', () => {
    expect(() => canvasBlocksReactor(['no-such-plugin'])).toThrow(
      `No plugin of the Canvas is named "no-such-plugin"; they are ${A2UI}.`,
    );
  });
});

describe('an application using a block whose plugin is off', () => {
  it('reads the components its page names, once each', () => {
    expect(
      componentsUsedBy(withPage(['Table', 'Chart'], ['Table', 'Text'])),
    ).toEqual(['Table', 'Chart', 'Text']);
  });

  it('says nothing while their plugin is enabled', () => {
    expect(
      blockSetupNotes(withPage(['Table'], ['Chart']), canvasBlocksReactor()),
    ).toEqual([]);
  });

  it('says so in its setup notes, naming the plugin and its blocks', () => {
    expect(
      blockSetupNotes(
        withPage(['Table'], ['Chart']),
        canvasBlocksReactor([A2UI]),
      ),
    ).toEqual([
      'The UI plugin “A2UI” is not enabled, and its page uses its blocks Table, Chart: they are off the Canvas until it is.',
    ]);
    expect(
      blockSetupNotes(withPage([], ['Chart']), canvasBlocksReactor([A2UI])),
    ).toEqual([
      'The UI plugin “A2UI” is not enabled, and its page uses its block Chart: it is off the Canvas until it is.',
    ]);
  });

  it('leaves a component the catalogue does not have to the instant checks', () => {
    expect(
      blockSetupNotes(withPage(['Nope']), canvasBlocksReactor([A2UI])),
    ).toEqual([]);
  });
});

describe('the plugins an organization has turned off', () => {
  it('take the blocks of a UI plugin off its palette, by catalogue id', () => {
    expect(canvasBlocksOf(canvasBlocksReactorOf(['a2ui']))).toEqual([]);
    expect(canvasBlocksOf(canvasBlocksReactorOf([])).length).toBe(
      listComponents().length,
    );
  });

  it('take nothing off for a UI plugin with no blocks, or one the catalogue does not have', () => {
    expect(
      canvasBlocksOf(canvasBlocksReactorOf(['mcp-ui', 'no-such-plugin']))
        .length,
    ).toBe(listComponents().length);
    expect(unknownPluginsOff(['a2ui', 'mcp-ui', 'no-such-plugin'])).toEqual([
      'no-such-plugin',
    ]);
  });

  it('are said in the setup notes of an application using their blocks', () => {
    const app = withPage(['Table']);
    expect(pluginsOffSetupNotes(app, [])).toEqual([]);
    expect(pluginsOffSetupNotes(app, ['a2ui'])).toEqual([
      'The UI plugin “A2UI” is not enabled, and its page uses its block Table: it is off the Canvas until it is.',
    ]);
  });

  it('are said by checkApp and checkAppspec, given them, and by nothing else', () => {
    const app = withPage(['Table']);
    const note =
      'The UI plugin “A2UI” is not enabled, and its page uses its block Table: it is off the Canvas until it is.';
    expect(checkApp(app).setup).not.toContain(note);
    expect(checkApp(app, [], { pluginsOff: ['a2ui'] }).setup).toContain(note);
    expect(
      checkAppspec(dumpAppspec(app), { pluginsOff: ['a2ui'] }).setup,
    ).toContain(note);
  });
});
