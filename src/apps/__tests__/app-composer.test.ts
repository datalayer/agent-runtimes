/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's commands and modes in the composer (LOOP P-19): read and
 * written as agentspecs says them, checked as it checks them, its commands
 * workspace commands listed in the `/` menu, its modes sent with every run.
 */

import { describe, expect, it } from 'vitest';
import {
  LoopAgentBlueprint,
  LoopCommand,
  LoopRunProps,
  runForwardedProps,
} from '../core';
import { defineAppComposerPlugin } from '../apps/AppComposer';
import { appPreset } from '../apps/AppRenderer';
import { dumpAppspec, parseAppspec } from '../apps/appspec';
import { checkAppspec } from '../apps/checks';
import {
  commandPrompt,
  modeChoice,
  modeDefaults,
  modeEffect,
} from '../apps/composer';

const BASE = {
  schema: 'loop.app/v1',
  id: 'desk',
  name: 'Desk',
  kind: 'chat',
  agent: 'cog-crawler:0.0.1',
};

const COMMANDS = [
  {
    name: 'summarise',
    description: 'Summarise what was said',
    prompt: 'Summarise: {input}',
  },
  { name: 'brief', description: 'Be brief', prompt: 'Be brief.' },
];

const MODES = [
  {
    id: 'depth',
    label: 'Depth',
    options: [
      { id: 'quick', label: 'Quick', instructions: 'Two sentences.' },
      {
        id: 'thorough',
        label: 'Thorough',
        description: 'Longer',
        instructions: 'Cite what you read.',
      },
    ],
    default: 'thorough',
  },
];

const DESK = { ...BASE, interface: { commands: COMMANDS, modes: MODES } };

const contributed = (
  plugin: ReturnType<typeof defineAppComposerPlugin>,
  point: unknown,
) =>
  (plugin.contributes ?? []).filter(
    (item: { point?: unknown }) => item.point === point,
  ) as Array<{ value: Record<string, any> }>;

describe('commands and modes in the composer', () => {
  it('are read and written as the spec says them', () => {
    const app = parseAppspec(DESK).app;
    expect(app.interface.commands).toEqual(COMMANDS);
    expect(app.interface.modes).toEqual(MODES);
    expect(dumpAppspec(app).interface).toEqual({
      commands: COMMANDS,
      modes: MODES,
    });
    expect(parseAppspec(dumpAppspec(app)).app).toEqual(app);
    const plain = parseAppspec(BASE).app;
    expect([plain.interface.commands, plain.interface.modes]).toEqual([[], []]);
    expect(dumpAppspec(plain).interface).toBeUndefined();
    expect(checkAppspec(DESK).problems).toEqual([]);
  });

  it('send a command’s prompt, the words typed after it in place of {input}', () => {
    const [summarise, brief] = COMMANDS;
    expect(commandPrompt(summarise, ' the call ')).toBe('Summarise: the call');
    expect(commandPrompt(summarise)).toBe('Summarise:');
    expect(commandPrompt(brief)).toBe('Be brief.');
    expect(commandPrompt(brief, 'to Ana')).toBe('Be brief.\n\nto Ana');
  });

  it('start each mode on its default, else its first, and refuse what is not the application’s', () => {
    const app = parseAppspec(DESK).app;
    expect(modeDefaults(app)).toEqual({ depth: 'thorough' });
    expect(modeChoice(app, { depth: 'quick' })).toEqual({ depth: 'quick' });
    expect(() => modeChoice(app, { speed: 'fast' })).toThrow(
      'Desk has no mode “speed”.',
    );
    expect(() => modeChoice(app, { depth: 'deep' })).toThrow(
      'The mode Depth has no option “deep”.',
    );
  });

  it('refuse what agentspecs refuses', () => {
    const said = (ui: Record<string, unknown>) =>
      checkAppspec({ ...BASE, interface: ui }).problems;
    const one = { description: 'd', prompt: 'p' };
    expect(said({ commands: [{ ...one, name: 'Two Words' }] })).toContain(
      'interface.commands.0.name: is what follows the slash: lower-case letters, digits and hyphens, a letter first.',
    );
    expect(
      said({
        commands: [
          { ...one, name: 'go' },
          { ...one, name: 'go' },
        ],
      }),
    ).toContain('interface.commands.1.name: names /go a second time.');
    expect(said({ commands: [{ name: 'go', description: 'd' }] })).toContain(
      'interface.commands.0.prompt: is missing.',
    );
    expect(
      said({ commands: [{ ...one, name: 'go', prompt: 'Ask {question}' }] }),
    ).toContain(
      'interface.commands.0.prompt: takes the words typed after the command as {input}, not {question}.',
    );
    expect(said({ commands: [{ ...one, name: 'go', key: 'g' }] })).toContain(
      'interface.commands.0.key: is not a key of a command: name, description, prompt.',
    );
    const option = { id: 'a', label: 'A' };
    const two = [option, { id: 'b', label: 'B' }];
    expect(
      said({ modes: [{ id: 'depth', label: 'Depth', options: [option] }] }),
    ).toContain('interface.modes.0.options: are two at least.');
    expect(
      said({
        modes: [{ id: 'depth', label: 'Depth', options: two, default: 'c' }],
      }),
    ).toContain('interface.modes.0.default: is one of its options.');
    expect(
      said({
        modes: [
          { id: 'depth', label: 'Depth', options: [option, { ...option }] },
        ],
      }),
    ).toContain(
      'interface.modes.0.options.1.id: names the option a a second time.',
    );
    expect(
      said({
        modes: [
          { id: 'depth', label: 'D', options: two },
          { id: 'depth', label: 'E', options: two },
        ],
      }),
    ).toContain('interface.modes.1.id: names the mode depth a second time.');
    expect(
      said({
        modes: [
          {
            id: 'depth',
            label: 'D',
            options: [{ ...option, colour: 'red' }, two[1]],
          },
        ],
      }),
    ).toContain(
      'interface.modes.0.options.0.colour: is not a key of an option: id, label, description, instructions, model.',
    );
    const choosing = (id: string) => ({
      id,
      label: id,
      options: [{ ...option, model: 'alibaba:qwen-max' }, two[1]],
    });
    expect(said({ modes: [choosing('one'), choosing('two')] })).toContain(
      'interface.modes: let only one mode choose the model, not one, two.',
    );
    expect(
      said({
        modes: [
          {
            id: 'speed',
            label: 'Speed',
            options: [{ ...option, model: 'no-such-model' }, two[1]],
          },
        ],
      }),
    ).toContain(
      'The mode “speed” runs “a” on “no-such-model”, which is no model.',
    );
  });

  it('are workspace commands listed in the menu, and modes sent with every run', async () => {
    const app = parseAppspec(DESK).app;
    const plugin = defineAppComposerPlugin(app);
    const commands = contributed(plugin, LoopCommand).map(item => item.value);
    expect(commands.map(command => [command.name, command.composer])).toEqual([
      ['summarise', true],
      ['brief', true],
    ]);
    expect(await commands[0].run({ workspace: {}, argv: 'the call' })).toEqual({
      prompt: 'Summarise: the call',
    });
    const [runProps] = contributed(plugin, LoopRunProps);
    expect(runProps.value.props()).toEqual({
      loop: { modes: { depth: 'thorough' } },
    });
    // What a page sends with its own message goes over it, `loop` key by key.
    expect(
      runForwardedProps([runProps.value as never], {
        loop: { action: { name: 'save', payload: {} } },
        voice: { said: true },
      }),
    ).toEqual({
      loop: {
        modes: { depth: 'thorough' },
        action: { name: 'save', payload: {} },
      },
      voice: { said: true },
    });
    expect(runForwardedProps([], undefined)).toBeUndefined();
    // Only an application that has commands or modes gets the plugin.
    const names = (spec: unknown) =>
      appPreset(parseAppspec(spec).app).plugins.map(
        item => (item as { name: string }).name,
      );
    expect(names(DESK)).toContain('@datalayer/loop-plugin-app-composer-desk');
    expect(names(BASE)).not.toContain(
      '@datalayer/loop-plugin-app-composer-desk',
    );
  });

  it('tell a run the options’ instructions, in the order of the modes, on the model one names', () => {
    const two = parseAppspec({
      ...BASE,
      interface: {
        modes: [
          ...MODES,
          {
            id: 'voice',
            label: 'Voice',
            options: [
              { id: 'plain', label: 'Plain', instructions: '  ' },
              {
                id: 'formal',
                label: 'Formal',
                instructions: 'Say vous.',
                model: 'bedrock:us.anthropic.claude-opus-4-1',
              },
            ],
          },
        ],
      },
    }).app;
    // Where each starts: the default of the first, the first of the second,
    // whose blank instructions say nothing.
    expect(modeEffect(two)).toEqual({ instructions: 'Cite what you read.' });
    expect(modeEffect(two, { depth: 'quick', voice: 'formal' })).toEqual({
      instructions: 'Two sentences.\n\nSay vous.',
      model: 'bedrock:us.anthropic.claude-opus-4-1',
    });
    expect(() => modeEffect(two, { depth: 'deep' })).toThrow(
      'The mode Depth has no option “deep”.',
    );
    expect(modeEffect(parseAppspec(BASE).app)).toEqual({ instructions: '' });
  });

  it('are applied by an agent turned in the page, through its blueprint', () => {
    const blueprint = (spec: unknown) => {
      const [plugin] = appPreset(parseAppspec(spec).app).plugins as Array<{
        contributes?: Array<{ point?: unknown; value: Record<string, any> }>;
      }>;
      return plugin.contributes?.find(item => item.point === LoopAgentBlueprint)
        ?.value;
    };
    const desk = blueprint(DESK);
    expect(desk?.modeEffect({ depth: 'quick' })).toEqual({
      instructions: 'Two sentences.',
    });
    expect(() => desk?.modeEffect({ speed: 'fast' })).toThrow(
      'Desk has no mode “speed”.',
    );
    // An application with no modes says none.
    expect(blueprint(BASE)?.modeEffect).toBeUndefined();
  });
});
