/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application in the designer: its parts on the
 * surface, a toolbox whose every part arrives with an example the
 * Appspec takes as it is, and its events — all written through
 * the Appspec's own converters, so the spec stays the one the editors share.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { APPSPEC_SCHEMA } from '../../specs/appspecSchema';
import type { AppSpec } from '../../types/agentspecs';
import { dumpAppspec, emptyAppspec, parseAppspec } from '../apps/appspec';
import {
  canvasPartsOf,
  canvasPartsReactor,
  canvasPartsReactorOf,
} from '../plugins/canvas-parts';
import type { CanvasPartContribution } from '../core/canvasParts';
import {
  AGENT_DROP_WORDS,
  AGENT_KEYS,
  TOOLBOX_GROUPS,
  appParts,
  avatarModelUrlOf,
  avatarOf,
  kindProblemsOf,
  partFamilies,
  toolboxGroupsOf,
  uiChoiceRoot,
  withPartAdded,
  withPartRemoved,
} from '../composer/appDesign';
import { whenOf } from '../composer/appEvents';
import { partOf, schemaAt, withValueAt } from '../composer/schemaAt';

/** An application that asks one business over PACT, as the Studio adds one. */
const withPactConnection = (
  app: AppSpec,
  connection: {
    brand: string;
    audience: string;
    access: string;
    scopes: string[];
  },
): AppSpec => {
  const read = parseAppspec({
    ...(dumpAppspec(app) as Record<string, unknown>),
    protocols: ['pact'],
    pact: {
      connections: [
        { id: connection.brand.replace(/\W+/g, '-'), ...connection },
      ],
    },
  });
  if (read.problems.length) {
    throw new Error(read.problems.join(' '));
  }
  return read.app;
};

/** What the plugins contribute: the toolbox, read as the designer reads it. */
const OFFERED = canvasPartsOf(canvasPartsReactor());
/** One part of each kind, the first the toolbox offers. */
const ONE_OF_EACH: CanvasPartContribution[] = TOOLBOX_GROUPS.map(group =>
  OFFERED.find(part => part.kind === group.kind)!,
);
const LISTED = ONE_OF_EACH.filter(
  part =>
    part.kind !== 'model' && part.kind !== 'avatar' && part.kind !== 'agent',
);

const fresh = () =>
  dumpAppspec({
    ...emptyAppspec('chat'),
    name: 'Desk',
    agent: 'desk-agent',
    instructions: 'Answer from the docs.',
  });

describe('the surface: every part of the application, selectable', () => {
  it('shows the agent and its model, always, and every part of every list', () => {
    let data: unknown = fresh();
    for (const tool of LISTED) {
      data = withPartAdded(data, tool).data;
    }
    const parts = appParts(data);
    // A blank chat starts with its kind's UI plugin, the chat: the one added comes after it.
    // The accountability plane after the event (6 November 2026): the example's four Guards, its Gate and its Track.
    expect(parts.map(part => part.kind)).toEqual([
      'agent',
      'model',
      'connection',
      'rule',
      'skill',
      'protocol',
      'ui',
      'ui',
      'test',
      'event',
      'guard',
      'guard',
      'guard',
      'guard',
      'gate',
      'track',
    ]);
    // A protocol and a UI plugin by the catalogue's names.
    expect(parts.find(part => part.kind === 'protocol')).toMatchObject({
      at: { path: ['protocols', 0] },
    });
    expect(parts.filter(part => part.kind === 'ui')).toMatchObject([
      { label: 'Chat', at: { path: ['ui', 0] } },
      {
        label: 'Surfaces in the conversation',
        detail: 'In its own page',
        at: { path: ['ui', 1] },
      },
    ]);
    expect(parts[0]).toMatchObject({
      label: 'desk-agent',
      detail: 'Answer from the docs.',
      at: { path: [], keys: AGENT_KEYS },
    });
    expect(parts.find(part => part.kind === 'rule')).toMatchObject({
      label: 'Send on my behalf',
      detail: 'ask first',
      at: { path: ['rules', 0] },
    });
  });

  it('finds a schema for every part it shows: the grid can draw them all', () => {
    let data: unknown = fresh();
    for (const tool of LISTED) {
      data = withPartAdded(data, tool).data;
    }
    for (const part of appParts(data)) {
      const drawn = partOf(APPSPEC_SCHEMA, data, part.at);
      expect([part.id, Boolean(drawn)]).toEqual([part.id, true]);
    }
    // The agent is some of the spec's own keys, drawn as one part.
    expect(
      Object.keys(
        partOf(APPSPEC_SCHEMA, fresh(), { path: [], keys: AGENT_KEYS })!.schema
          .properties ?? {},
      ),
    ).toEqual(expect.arrayContaining([...AGENT_KEYS]));
  });
});

describe('the toolbox: what the plugins contribute, each arriving with its example', () => {
  it('groups the contributed parts in a form designer’s order, every kind there', () => {
    expect(toolboxGroupsOf(OFFERED).map(group => group.kind)).toEqual(
      TOOLBOX_GROUPS.map(group => group.kind),
    );
    // A source turned off takes its group off, as a plugin's blocks leave the palette.
    expect(
      toolboxGroupsOf(canvasPartsOf(canvasPartsReactorOf(['skills']))).map(
        group => group.kind,
      ),
    ).not.toContain('skill');
  });

  it.each(LISTED.map(tool => [tool.id, tool] as const))('%s', (_, tool) => {
    const { data, at, id } = withPartAdded(fresh(), tool);
    // A blank chat lists its chat already: a UI plugin added is the second.
    // The Track is one per application, its id its kind (6 November 2026).
    expect(id).toBe(
      tool.kind === 'track'
        ? 'track'
        : `${tool.kind}-${tool.kind === 'ui' ? 1 : 0}`,
    );
    expect(schemaAt(APPSPEC_SCHEMA, at.path)).toBeDefined();
    const read = parseAppspec(data);
    expect([tool.id, read.problems]).toEqual([tool.id, []]);
  });

  it('sets the model, rather than adding one to a list', () => {
    const model = ONE_OF_EACH.find(part => part.kind === 'model')!;
    const { data, id, at } = withPartAdded(fresh(), model);
    expect(id).toBe('model');
    expect(at).toEqual({ path: [], keys: ['model'] });
    expect(parseAppspec(data).app.model).toBe(model.example);
  });

  it('sets the avatar on the agent, rather than adding a part', () => {
    const wizard = OFFERED.find(part => part.id === 'avatar:wizard')!;
    expect(avatarOf(fresh())).toBe('');
    const { data, id, at } = withPartAdded(fresh(), wizard);
    expect([id, at]).toEqual(['agent', { path: [], keys: AGENT_KEYS }]);
    expect(avatarOf(data)).toBe('wizard');
    expect(parseAppspec(data).app.interface.avatar).toBe('wizard');
    expect(appParts(data).some(part => part.kind === ('avatar' as never))).toBe(
      false,
    );
  });

  it('sets a 3D avatar on the agent, keeping the address of a model already there', () => {
    const model3d = OFFERED.find(part => part.id === 'avatar:model3d')!;
    expect(model3d.label).toBe('3D model');
    const { data } = withPartAdded(fresh(), model3d);
    expect(avatarOf(data)).toBe('model3d');
    expect(avatarModelUrlOf(data)).toBeUndefined();
    expect(parseAppspec(data).app.interface.avatar).toEqual({
      kind: 'model3d',
    });
    const url = 'https://example.com/fox.glb';
    const withFox = {
      ...(data as Record<string, unknown>),
      interface: { avatar: { kind: 'model3d', url } },
    };
    const again = withPartAdded(withFox, model3d).data;
    expect(avatarModelUrlOf(again)).toBe(url);
    // Another avatar dropped on it replaces the model.
    expect(
      avatarOf(
        withPartAdded(
          again,
          OFFERED.find(part => part.id === 'avatar:cat')!,
        ).data,
      ),
    ).toBe('cat');
  });

  it('lists a protocol or a UI once: added again, the one there is selected', () => {
    const pap = OFFERED.find(part => part.id === 'protocol:pap')!;
    const once = withPartAdded(fresh(), pap);
    const again = withPartAdded(once.data, pap);
    expect(again.data).toBe(once.data);
    expect(again.id).toBe('protocol-0');
    expect(parseAppspec(once.data).app.protocols).toEqual(['pap']);
    // No protocol is planned any more: TAP, the last, ships as a draft at test merchants
    // (14 October 2026), so every protocol is offered to add, and TAP added is taken.
    const protocols = OFFERED.filter(part => part.id.startsWith('protocol:'));
    expect(protocols.map(part => part.id)).toContain('protocol:tap');
    expect(
      protocols.filter(part => !part.enabled).map(part => part.id),
    ).toEqual([]);
    const tap = protocols.find(part => part.id === 'protocol:tap')!;
    expect(parseAppspec(withPartAdded(fresh(), tap).data).problems).toEqual([]);
  });

  it('adds at the end of its list, and takes a part off by where it is', () => {
    const rule = ONE_OF_EACH.find(tool => tool.kind === 'rule')!;
    const once = withPartAdded(fresh(), rule);
    const twice = withPartAdded(once.data, rule);
    expect(twice.at.path).toEqual(['rules', 1]);
    const first = appParts(twice.data).find(part => part.id === 'rule-0')!;
    expect(
      appParts(withPartRemoved(twice.data, first)).filter(
        part => part.kind === 'rule',
      ),
    ).toHaveLength(1);
    // The agent is not in a list: it stays.
    expect(withPartRemoved(twice.data, appParts(twice.data)[0])).toBe(
      twice.data,
    );
  });
});

describe('the events: what happens when, chosen from a list', () => {
  it('offers each kind of trigger the schema has, as the plugins contribute them', () => {
    const kinds = (schemaAt(APPSPEC_SCHEMA, ['triggers', 0, 'type'])!.schema
      .enum ?? []) as string[];
    const offered = OFFERED.filter(part => part.kind === 'event').map(
      part => (part.example as { type: string }).type,
    );
    expect([...new Set(offered)].sort()).toEqual([...kinds].sort());
  });

  it('says when each fires, in words', () => {
    expect(
      whenOf({ type: 'schedule', description: 'Every weekday at 9:00' }),
    ).toBe('Every weekday at 9:00');
    expect(whenOf({ type: 'event', event: 'email_received' })).toBe(
      'When email received',
    );
    expect(whenOf({ type: 'once', at: '2026-12-31T09:00:00' })).toBe(
      'Once, at 2026-12-31T09:00:00',
    );
  });
});

describe('what it speaks, as its checks say it', () => {
  // An application stored before `protocols` existed: its pact block, nothing listed.
  const listed = withPactConnection(emptyAppspec('chat'), {
    brand: 'air.example',
    audience: 'https://provider.example/a2a',
    access: 'read',
    scopes: ['bookings:read'],
  });
  const stored = { ...listed, protocols: [] };

  it('says on the Protocols node that a block configures a protocol it does not list, and lists nothing for it', () => {
    expect(kindProblemsOf(listed)).toEqual({});
    const said = kindProblemsOf(stored);
    expect(Object.keys(said)).toEqual(['protocol']);
    expect(said.protocol).toEqual([
      expect.stringContaining("add 'pact' to `protocols`"),
    ]);
    // Nothing decided for the Maker: no protocol part appears by itself.
    expect(
      appParts(dumpAppspec(stored)).filter(part => part.kind === 'protocol'),
    ).toEqual([]);
  });

  it('is answered by adding the protocol from the toolbox', () => {
    const pact = OFFERED.find(
      part => part.kind === 'protocol' && part.example === 'pact',
    )!;
    const added = withPartAdded(dumpAppspec(stored), pact);
    expect(kindProblemsOf(parseAppspec(added.data).app)).toEqual({});
  });

  it('says a UI the catalogue does not know on the UI node', () => {
    expect(
      kindProblemsOf({ ...emptyAppspec('chat'), ui: [{ plugin: 'nowhere' }] }),
    ).toEqual({
      ui: [expect.stringContaining("no UI plugin named 'nowhere'")],
    });
  });
});

describe('a UI part: a plugin, then a renderer per plugin', () => {
  const surfaces = OFFERED.find(part => part.id === 'ui:a2ui-surface')!;
  const chat = OFFERED.find(part => part.id === 'ui:chat')!;

  it('is offered once per UI plugin, never as a renderer, and added as {plugin}', () => {
    expect(OFFERED.some(part => part.id === 'ui:a2ui')).toBe(false);
    // After the chat a blank chat starts with, which is selected rather than listed twice.
    const once = withPartAdded(fresh(), surfaces);
    expect(parseAppspec(once.data).app.ui).toEqual([
      { plugin: 'chat' },
      { plugin: 'a2ui-surface' },
    ]);
    const again = withPartAdded(once.data, surfaces);
    expect([again.data, again.id]).toEqual([once.data, 'ui-1']);
    expect(withPartAdded(once.data, chat)).toMatchObject({
      data: once.data,
      id: 'ui-0',
    });
  });

  it('draws its properties: the plugins of the catalogue, and the renderers this one may be exposed through', () => {
    const added = withPartAdded(fresh(), surfaces);
    const drawn = partOf(
      uiChoiceRoot(APPSPEC_SCHEMA, added.data, added.at),
      added.data,
      added.at,
    )!;
    const plugins = (
      drawn.schema.properties!.plugin.oneOf as { const: string }[]
    ).map(each => each.const);
    expect(plugins).toEqual(
      expect.arrayContaining(['a2ui-surface', 'chat', 'app-page']),
    );
    expect(plugins).not.toContain('a2ui');
    expect(
      (drawn.schema.properties!.renderer.oneOf as { const: string }[]).map(
        each => each.const,
      ),
    ).toEqual(['', 'a2ui']);
    // A plugin with no renderer is drawn in its own page: no renderer to choose.
    const other = withPartAdded(fresh(), chat);
    expect(
      partOf(
        uiChoiceRoot(APPSPEC_SCHEMA, other.data, other.at),
        other.data,
        other.at,
      )!.schema.properties,
    ).not.toHaveProperty('renderer');
  });

  it('says the renderer on the node, and refuses one the plugin may not be exposed through', () => {
    const added = withPartAdded(fresh(), surfaces);
    const exposed = withValueAt(
      added.data,
      [...added.at.path, 'renderer'],
      'a2ui',
    );
    expect(
      appParts(exposed).find(
        part => part.label === 'Surfaces in the conversation',
      ),
    ).toMatchObject({ detail: 'Through A2UI' });
    expect(parseAppspec(exposed).problems).toEqual([]);
    const wrong = withValueAt(
      withPartAdded(fresh(), chat).data,
      ['ui', 0, 'renderer'],
      'a2ui',
    );
    expect(parseAppspec(wrong).problems).toEqual([
      "The UI plugin Chat ('chat') is not exposed through A2UI: through no renderer.",
    ]);
  });
});

describe('the Agents of the toolbox: a coding agent behind the Shield', () => {
  it('offers the catalogue’s harnesses first, Claude Code by the agent that runs on it', () => {
    expect(TOOLBOX_GROUPS[0]).toEqual({ kind: 'agent', label: 'Agents' });
    const agents = OFFERED.filter(part => part.kind === 'agent');
    expect(agents.map(part => part.harness)).toEqual(
      expect.arrayContaining(['claude-code', 'codex']),
    );
    expect(agents.find(part => part.harness === 'claude-code')?.example).toBe(
      'example-harness-claude-code',
    );
    // Every harness of the catalogue has its agent now; an organization's own (custom) is never offered.
    expect(agents.map(part => [part.harness, part.example])).toEqual(
      agents.map(part => [part.harness, `example-harness-${part.harness}`]),
    );
    expect(agents.some(part => part.harness === 'custom')).toBe(false);
  });

  it('has no box of its own: the agent’s node says it is where it goes, while one is dragged', () => {
    const designer = readFileSync(
      join(__dirname, '..', 'composer', 'AppCanvasEditor.tsx'),
      'utf8',
    );
    expect(designer).toContain(
      "{target && (dragging === 'agent' || dragging === 'avatar') ? (",
    );
    expect(designer).toContain(
      '{over ? AGENT_DROP_WORDS.over : AGENT_DROP_WORDS[dragging]}',
    );
    expect(AGENT_DROP_WORDS).toEqual({
      agent: 'Drop here: it becomes the agent',
      avatar: 'Drop here: the agent wears it',
      over: 'Let go',
    });
  });

  it('dropped, it is the application’s agent: its id set, the agent selected', () => {
    const claude = OFFERED.find(part => part.id === 'agent:claude-code')!;
    const added = withPartAdded(fresh(), claude);
    expect(added.id).toBe('agent');
    expect(added.at).toEqual({ path: [], keys: AGENT_KEYS });
    expect((added.data as Record<string, unknown>).agent).toBe(
      'example-harness-claude-code',
    );
  });
});

describe('the avatars it may show, by family', () => {
  it('lists the orb, the clippy.js characters (Microsoft’s, fetched), the drawings and the 3D model, each under its heading', () => {
    const avatars = toolboxGroupsOf(OFFERED).find(
      group => group.kind === 'avatar',
    )!.parts;
    const families = partFamilies(avatars);
    expect(families.map(family => family.label)).toEqual([
      'Datalayer’s orb',
      'clippy.js characters',
      'Paper clips and drawings',
      '3D models',
    ]);
    expect(families[0].parts.map(part => part.example)).toEqual(['orb']);
    expect(families[1].parts.map(part => part.example)).toContain(
      'clippy-js-merlin',
    );
    expect(families[1].parts).toHaveLength(10);
    expect(families[1].note).toMatch(/Microsoft’s characters.*jsDelivr/);
    expect(families[2].parts.map(part => part.example)).toEqual([
      'paperclip',
      'wizard',
      'cat',
      'eyes',
    ]);
    expect(families[3].parts.map(part => part.example)).toEqual([
      { kind: 'model3d' },
    ]);
  });

  it('puts each on the agent as the Appspec takes it', () => {
    for (const id of ['avatar:orb', 'avatar:clippy-js-bonzi']) {
      const tool = OFFERED.find(part => part.id === id)!;
      const { data } = withPartAdded(fresh(), tool);
      expect(parseAppspec(data).problems).toEqual([]);
      expect(avatarOf(data)).toBe(id.slice('avatar:'.length));
    }
  });

  it('keeps parts that say no family together, with no heading', () => {
    const parts = OFFERED.filter(part => part.kind === 'skill').slice(0, 2);
    expect(partFamilies(parts)).toEqual([{ label: '', parts }]);
  });
});
