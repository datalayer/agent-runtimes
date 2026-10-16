/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The registrations a UI spec is held to (AGENTIC_UI F-03): each Reactor
 * plugin of `src/apps/plugins/` built on a reactor of its own, started, and
 * read back — the Slots it fills, the Contribution Points it contributes to,
 * the Commands it registers, the Contribution Points it offers, and the
 * settings it takes. Read from the plugin as the reactor registers it, never
 * written down a second time.
 *
 * `HOW_TO_MOUNT` is how a test mounts each plugin folder that has a UI spec:
 * the plugin itself, or its factory called with an application of the
 * catalogue. `NOT_UI` is each other folder, and why it has no UI spec.
 *
 * @module apps/__tests__/fixtures/uiPluginRegistrations
 */

import {
  buildReactorFromPlugins,
  type PluginRef,
  type ReactorPlugin,
} from '@datalayer/reactor';
import { APP_CATALOGUE } from '../../../specs/apps';
import type { AppSpec } from '../../../types/agentspecs';
import { LoopCommand } from '../../core';
import { A2uiPlugin } from '../../plugins/a2ui';
import { A2uiSurfacePlugin } from '../../plugins/a2ui-surface';
import { AgentspecsPlugin } from '../../plugins/agentspecs';
import { defineAppActivityPlugin } from '../../plugins/app-activity';
import { defineAppComponentsPlugin } from '../../plugins/app-components';
import { defineAppComputerPlugin } from '../../plugins/app-computer';
import { AppElementsPlugin } from '../../plugins/app-elements';
import { defineAppPagePlugin } from '../../plugins/app-page';
import { defineAppRulesPlugin } from '../../plugins/app-rules';
import { CANVAS_BLOCK_PLUGINS } from '../../plugins/canvas-blocks';
import { CANVAS_PART_PLUGINS } from '../../plugins/canvas-parts';
import { ChatPlugin } from '../../plugins/chat';
import { createChatExtrasPlugin } from '../../plugins/chat-extras';
import { ChatHeaderPlugin } from '../../plugins/chat-header';
import { ChatViewPlugin } from '../../plugins/chat-view';
import { LoopCommandsPlugin } from '../../plugins/commands';
import { DocumentPlugin } from '../../plugins/document';
import { DocumentToolbarPlugin } from '../../plugins/document-toolbar';
import { DocumentViewPlugin } from '../../plugins/document-view';
import { InputPromptPlugin } from '../../plugins/input-prompt';
import { ModelsPlugin } from '../../plugins/models';
import { NotebookPlugin } from '../../plugins/notebook';
import { NotebookToolbarPlugin } from '../../plugins/notebook-toolbar';
import { NotebookViewPlugin } from '../../plugins/notebook-view';
import { LoopPageLayoutPlugin } from '../../plugins/page-layout';
import { PapSignInPlugin } from '../../plugins/pap-sign-in';
import { PromptPlugin } from '../../plugins/prompt';
import { SubagentActivityPlugin } from '../../plugins/subagent-activity';
import { WindowFramePlugin } from '../../plugins/window-frame';

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

/**
 * Each plugin folder that has a UI spec, by the spec's id (the folder's
 * name): the plugins it registers. A factory is called with the fixture
 * application; a plugin cast per source (`canvas-parts`) or per UI spec
 * (`canvas-blocks`) is mounted as every instance it has.
 */
export const HOW_TO_MOUNT: Record<string, Mount> = {
  a2ui: () => [A2uiPlugin],
  'a2ui-surface': () => [A2uiSurfacePlugin],
  agentspecs: () => [AgentspecsPlugin],
  'app-activity': () => [defineAppActivityPlugin(FIXTURE_APP)],
  'app-components': () => [defineAppComponentsPlugin(FIXTURE_APP)],
  'app-computer': () => [defineAppComputerPlugin(FIXTURE_APP)],
  'app-elements': () => [AppElementsPlugin],
  'app-page': () => [defineAppPagePlugin(FIXTURE_APP)],
  'app-rules': () => [defineAppRulesPlugin(FIXTURE_APP)],
  'canvas-blocks': () => CANVAS_BLOCK_PLUGINS,
  'canvas-parts': () => CANVAS_PART_PLUGINS,
  chat: () => [ChatPlugin],
  'chat-extras': () => [createChatExtrasPlugin().plugin],
  'chat-header': () => [ChatHeaderPlugin],
  'chat-view': () => [ChatViewPlugin],
  commands: () => [LoopCommandsPlugin],
  document: () => [DocumentPlugin],
  'document-toolbar': () => [DocumentToolbarPlugin as never],
  'document-view': () => [DocumentViewPlugin],
  'input-prompt': () => [InputPromptPlugin],
  models: () => [ModelsPlugin],
  notebook: () => [NotebookPlugin],
  'notebook-toolbar': () => [NotebookToolbarPlugin as never],
  'notebook-view': () => [NotebookViewPlugin],
  'page-layout': () => [LoopPageLayoutPlugin],
  'pap-sign-in': () => [PapSignInPlugin],
  prompt: () => [PromptPlugin],
  'subagent-activity': () => [SubagentActivityPlugin],
  'window-frame': () => [WindowFramePlugin],
};

/**
 * The plugin folders without a UI spec, and why: none is a part of an
 * application's interface a Maker chooses.
 */
export const NOT_UI: Record<string, string> = {
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
    "A coding agent's diffs and terminals, drawn where its tool results carry them in the chat, the embed and Activity: renderers, not a part of the interface an application chooses (SHIELD SH-16).",
  decks:
    'The deck editor, mounted by the decks package and not by the Loop editor.',
  assistant:
    'The floating assistant, a host of its own rather than a part of the Loop editor.',
  'assistant-characters':
    'The floating assistant’s characters, offered as parts of an agent on the Canvas.',
  'a2a-sidebar':
    'A sidebar of the A2A example, not mounted by the Loop editor or an application.',
  'checkpoints-sidebar':
    'A sidebar of the checkpoints example, not mounted by the Loop editor or an application.',
  'a2ui-scene': 'A scene of the A2UI examples, cast per example.',
  'pap-example': 'A page of the PAP examples, cast per example.',
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
   * composer's `/` commands it contributes (`loop.command`), by name.
   */
  commands: string[];
  /** The Contribution Points it offers. */
  contributionPoints: string[];
  /** Its settings, as its configuration's defaults. */
  settings: Record<string, unknown>;
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
        .getContributions(LoopCommand)
        .filter(entry => mine.has(entry.plugin))
        .map(entry => entry.value.name),
    ]),
    contributionPoints: sorted(contributionPoints),
    settings: loaded === false ? {} : { ...(config ?? {}) },
    displayName: presented.displayName,
    description: presented.description,
    emoji: presented.emoji,
    octicon: presented.octicon,
  };
}
