/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The registrations a UI spec is held to: each Reactor
 * plugin of `src/apps/plugins/` built on a reactor of its own, started, and
 * read back — the Slots it fills, the Contribution Points it contributes to,
 * the Commands it registers, the Contribution Points it offers, and the
 * settings it takes. Read from the plugin as the reactor registers it, never
 * written down a second time.
 *
 * `mountOf` mounts a UI spec's plugin from the spec alone — its
 * `implementation`, the package, module and export that are it: the plugin
 * itself, its instances, or its factory called with an application of the
 * catalogue or its placement. `NOT_UI` is each plugin folder without a UI
 * spec, and why.
 *
 * @module apps/__tests__/fixtures/uiPluginRegistrations
 */

import {
  buildReactorFromPlugins,
  type PluginManifest,
  type PluginRef,
  type ReactorPlugin,
} from '@datalayer/reactor';
import { APP_CATALOGUE } from '../../../specs/apps';
import type { AppSpec, UISpec } from '../../../types/agentspecs';
import type { FrontendToolDefinition } from '../../../types/tools';
import { AgentChatExtras, AgentCommand } from '../../core';
import { CHROME_SLOTS } from '../../toolCards/chrome';

/** An application of the catalogue with a page, and a component of its developer's. */
export const FIXTURE_APP: AppSpec = (() => {
  const app = Object.values(APP_CATALOGUE).find(
    each => (each.interface.surface?.components ?? []).length > 0,
  );
  if (!app) {
    throw new Error('No application of the catalogue has a page.');
  }
  return {
    ...app,
    interface: {
      ...app.interface,
      customComponents: [
        {
          name: 'Gauge',
          description: 'A dial, from nothing to its most.',
          props: {
            type: 'object',
            properties: { value: { type: 'number' } },
          },
          shows: [],
          sends: [],
          module: 'https://example.com/gauge.js',
          height: 240,
          integrity: '',
        } as never,
      ],
    },
  };
})();

/** How one UI spec's plugin is mounted: one plugin, or one per instance. */
export type Mount = () => PluginRef[];

/** The package the UI specs of the catalogue name: this one. */
export const PACKAGE_NAME = '@datalayer/agent-runtimes';

/**
 * What a UI spec's implementation exports (`import { <export> } from
 * '<package>/<module>'`), read from this package's sources: a module of
 * `lib/` is its file under `src/`.
 */
export async function exportOf(spec: UISpec): Promise<unknown> {
  const { package: name, module, export: exported } = spec.implementation;
  if (name !== PACKAGE_NAME) {
    throw new Error(`${spec.id}: its package ${name} is not ${PACKAGE_NAME}`);
  }
  if (!module.startsWith('lib/')) {
    throw new Error(`${spec.id}: its module ${module} is not under lib/`);
  }
  const loaded = (await import(
    /* @vite-ignore */ `../../../${module.slice('lib/'.length)}`
  )) as Record<string, unknown>;
  if (!(exported in loaded)) {
    throw new Error(`${spec.id}: ${module} exports no ${exported}`);
  }
  return loaded[exported];
}

/** A factory's result: the plugin, or a handle holding it (`{ plugin, … }`). */
const asRef = (made: unknown): PluginRef =>
  made && typeof made === 'object' && 'plugin' in made && !('name' in made)
    ? ((made as { plugin: PluginRef }).plugin as PluginRef)
    : (made as PluginRef);

/**
 * How a UI spec's plugin is mounted, from its implementation alone: the
 * plugin; its instances; or its factory called with the fixture application
 * (`per: application`), with its first placement when that is in the chat's
 * chrome or a side panel, or with nothing.
 */
export async function mountOf(spec: UISpec): Promise<Mount> {
  const exported = await exportOf(spec);
  switch (spec.implementation.kind) {
    case 'plugin':
      return () => [exported as PluginRef];
    case 'plugins':
      return () => [...(exported as PluginRef[])];
    case 'factory': {
      const factory = exported as (...args: unknown[]) => unknown;
      const placement = spec.placements?.[0];
      const args =
        spec.per === 'application'
          ? [FIXTURE_APP]
          : placement && placement !== 'message' && placement in CHROME_SLOTS
            ? [placement]
            : [];
      return () => [asRef(factory(...args))];
    }
  }
}

/**
 * The plugin folders without a UI spec, and why: none is a part of an
 * application's interface a Maker chooses.
 */
export const NOT_UI: Record<string, string> = {
  'agent-identity':
    "A host's plugin: the page that shows an application adds it (`renderer.plugins`) to name the agent in the chat's title bar from its presentation (`AgentSlots.chatHeaderTitle`); no Appspec names it.",
  'agent-chooser':
    "A host's plugin, made with what the host offers (`agentChooserPlugin({ groups, onChoose })`): the agents behind the apps grid at the end of the chat's title bar (`AgentSlots.chatHeaderEnd`); no Appspec names it.",
  'agent-presentation':
    "A host's plugin: the page that shows an application adds it (`renderer.plugins`) to present the application from its spec's `presentation` in the left panel; no Appspec names it.",
  shell:
    'The workspace itself: it opens the Contribution Points every other plugin fills, in every workspace.',
  agents: 'The agent and the machine it runs on, not a part of the interface.',
  'view-switch':
    'The mould chat-view, notebook-view and document-view are cast from, not a plugin of its own.',
  'agent-capacity':
    'The mould the agent-* plugins are cast from, not a plugin of its own.',
  'plugins-panel':
    'A tool for whoever writes plugins: it lists and switches them.',
  graph: 'A tool for whoever writes plugins: it draws how they connect.',
  'shield-displays':
    "A coding agent's diffs and terminals, drawn where its tool results carry them in the chat, the embed and Activity: renderers, not a part of the interface an application chooses (SH-16).",
  decks:
    'The deck editor, mounted by the decks package and not by the Agent editor.',
  assistant:
    'The floating assistant, a host of its own rather than a part of the Agent editor.',
  'assistant-characters':
    'The floating assistant’s characters, offered as parts of an agent on the Canvas.',
  'a2a-sidebar':
    'A sidebar of the A2A example, not mounted by the Agent editor or an application.',
  'checkpoints-sidebar':
    'A sidebar of the checkpoints example, not mounted by the Agent editor or an application.',
  'a2ui-scene': 'A scene of the A2UI examples, cast per example.',
  'pap-example': 'A page of the PAP examples, cast per example.',
  'locked-ui':
    'What a visitor sees locked of the UI an agent brings (each its own UI spec), cast per agent with their words.',
  'limited-preview':
    'An anonymous visitor’s limited preview beside the composer, with its page tools: mounted by the preset for a visitor, cast per agent with what it keeps from them, never chosen by an application.',
  'agent-a2a':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-a2ui':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-a2ui-jupyter-output':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-checkpoints':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-codemode':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-code-sandbox':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-code-sandboxes':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-compaction':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-evals':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-guardrails':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-hooks':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-inference':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-mcp':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-memory':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-monitoring':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-notifications':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-otel':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-outputs':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-parameters':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-skills':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-subagents':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-tool-approvals':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
  'agent-triggers':
    'An agent capability (which agent answers, and its openers), not a part of the interface.',
};

/** What a UI spec says of its plugin, as the reactor registers it. */
export type Registration = {
  /** The names it registers under. */
  names: string[];
  /** The Slots it fills. */
  slots: string[];
  /** The Contribution Points it contributes to. */
  points: string[];
  /**
   * The Commands it adds: the Reactor Commands it registers, by id, and the
   * composer's `/` commands it contributes (`agent.command`), by name.
   */
  commands: string[];
  /** The Contribution Points it offers. */
  contributionPoints: string[];
  /** Its settings, as its configuration's defaults. */
  settings: Record<string, unknown>;
  /** The manifest of each plugin it registers, in order. */
  manifests: PluginManifest[];
  /** The frontend tools it hands the chat's agent (`agent.chat.extras`), in order. */
  frontendTools: FrontendToolDefinition[];
  /** Its name, description and faces, as it presents itself. */
  displayName?: string;
  description?: string;
  emoji?: string;
  octicon?: string;
};

const pluginOf = (ref: PluginRef): ReactorPlugin<any, any, any> =>
  'plugin' in ref && !('name' in ref)
    ? (ref as { plugin: ReactorPlugin<any, any, any> }).plugin
    : (ref as ReactorPlugin<any, any, any>);

const sorted = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort();

/**
 * The registration of a UI spec's plugins: each mounted on a reactor of its
 * own (with what it depends on), started — a lazy one loaded by its
 * activation events — and read back, its instances' together.
 */
export async function registrationOf(mount: Mount): Promise<Registration> {
  const refs = mount();
  const names = refs.map(ref => pluginOf(ref).name);
  const reactor = buildReactorFromPlugins(refs);
  reactor.start();
  for (const name of names) {
    const manifest = reactor.getManifest(name);
    if (manifest?.lazy && !manifest.loaded) {
      for (const event of manifest.activationEvents) {
        await reactor.fire(event);
      }
    }
  }
  await reactor.whenReady();
  for (const name of names) {
    const failed = reactor.getManifest(name)?.loadError;
    if (failed) {
      throw new Error(`${name} did not load: ${failed}`);
    }
  }
  const mine = new Set(names);
  const first = names[0];
  const presented = (reactor.getManifest(first) ?? {}) as {
    displayName?: string;
    description?: string;
    emoji?: string;
    octicon?: string;
  };
  const slots: string[] = [];
  const contributionPoints: string[] = [];
  for (const name of names) {
    const output = reactor.getOutput<{ components?: { slot: string }[] }>(name);
    slots.push(...(output?.components ?? []).map(component => component.slot));
    contributionPoints.push(
      ...(reactor.getManifest(name)?.contributionPoints ?? []),
    );
  }
  const loaded = reactor.getManifest(first)?.loaded;
  // A lazy plugin's settings are its loaded module's.
  const config = (pluginOf(refs[0]) as { config?: Record<string, unknown> })
    .config;
  return {
    names,
    slots: sorted(slots),
    points: sorted(
      reactor
        .describeContributions()
        .filter(entry =>
          entry.contributions.some(each => mine.has(each.plugin)),
        )
        .map(entry => entry.point),
    ),
    commands: sorted([
      ...reactor
        .listCommands()
        .filter(command => mine.has(command.plugin))
        .map(command => command.id),
      ...reactor
        .getContributions(AgentCommand)
        .filter(entry => mine.has(entry.plugin))
        .map(entry => entry.value.name),
    ]),
    contributionPoints: sorted(contributionPoints),
    manifests: names.map(name => reactor.getManifest(name)!),
    frontendTools: reactor
      .getContributions(AgentChatExtras)
      .filter(entry => mine.has(entry.plugin))
      .flatMap(entry => entry.value.extras.value.frontendTools ?? []),
    settings: loaded === false ? {} : { ...(config ?? {}) },
    displayName: presented.displayName,
    description: presented.description,
    emoji: presented.emoji,
    octicon: presented.octicon,
  };
}
