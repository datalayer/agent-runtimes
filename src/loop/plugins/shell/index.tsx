/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-shell` — the loop's face of the generic shell.
 *
 * The machinery lives in `@datalayer/reactor-shell` now: the view choice
 * store, the segmented selector that shows nothing until plugins contribute,
 * the cycle command. This plugin is what makes it *the loop's*:
 *
 * - it points the generic plugin at {@link LoopEditorView} — the editor
 *   point the notebook and document fill — and declares the loop's points;
 * - it teaches the selector to read a {@link ChatSurfaceContribution},
 *   gating against the live workspace the header slot passes;
 * - it wires the announcer to `requestSurface`, so a choice reaches the chat
 *   through the same channel `/notebook` and `/document` use;
 * - it keeps the `/editor` slash command, in the loop's own registry.
 *
 * @module loop/plugins/shell
 */

import type { JSX } from 'react';
import {
  configurePlugin,
  contribution,
  definePlugin,
} from '@datalayer/reactor';
import {
  ShellPlugin as ReactorShellPlugin,
  ViewSelector,
  type ShellViewDescriptor,
} from '@datalayer/reactor-shell';
import {
  LoopCommand,
  LoopEditorView,
  LoopSlots,
  LoopViewType,
  canOpenView,
  requestSurface,
  type ChatSurfaceContribution,
  type LoopWorkspaceContext,
} from '../../core';
import {
  NONE_EDITOR,
  chooseEditor,
  getEditorChoice,
  nextEditor,
  seedEditorChoice,
} from './editorChoice';
import { useEditorPreviews } from './useEditorPreviews';

export const SHELL_PLUGIN_NAME = '@datalayer/loop-plugin-shell';

export type ShellPluginConfig = {
  /**
   * The editor the selector starts on.
   *
   * A preference, not a demand, exactly like the chat's `defaultSurface` — a
   * named editor whose plugin is not mounted leaves the selector on `'none'`.
   * The two configs should agree; `loopPlugins` sets both from one option.
   */
  defaultEditor: string;
  /**
   * Whether the header carries the segmented control at all.
   *
   * The points are declared either way — extending the shell must not
   * depend on whether its selector happens to be drawn.
   */
  showSelector: boolean;
};

/** How a loop editor contribution reads as the generic selector's view. */
function describeEditor(value: unknown, context: unknown): ShellViewDescriptor {
  const surface = value as ChatSurfaceContribution;
  const workspace = (context as { workspace?: LoopWorkspaceContext })
    ?.workspace;
  const openable = workspace ? canOpenView(surface, workspace) : true;
  return {
    id: surface.surfaceId,
    title: surface.title,
    icon: surface.icon,
    order: surface.order,
    disabled: !openable,
    disabledReason: openable
      ? undefined
      : (workspace && surface.unavailableReason?.(workspace)) ||
        'Not available right now',
  };
}

/** The generic selector, dressed for the loop's header. */
function EditorSelectorComponent(
  slotProps: Record<string, unknown>,
): JSX.Element | null {
  const workspace = (slotProps as { workspace?: LoopWorkspaceContext })
    .workspace;
  /*
   * Live figures for the labels — "Notebook (4)" — and the hover cards
   * behind them. The editors are connected whether or not they are shown;
   * the selector is where that stops being invisible.
   */
  const previews = useEditorPreviews(workspace?.surfaceId ?? '');
  const describe = (value: unknown, context: unknown) => {
    const base = describeEditor(value, context);
    const preview = previews[base.id];
    return preview
      ? { ...base, badge: preview.badge, details: preview.details }
      : base;
  };
  return (
    <ViewSelector
      point={LoopEditorView}
      describe={describe}
      context={slotProps}
      // "Chat", not "None": with no editor beside it the conversation IS the
      // view, and a control that names the common case after what it lacks
      // reads as an error state.
      noneLabel="Chat"
      ariaLabel="Editor"
    />
  );
}

export const ShellPlugin = definePlugin<ShellPluginConfig>({
  name: SHELL_PLUGIN_NAME,
  displayName: 'Shell',
  description: 'The workspace’s extension points, and the editor choice.',
  octicon: 'columns',
  emoji: '\u{1F4D1}',
  config: {
    defaultEditor: NONE_EDITOR,
    showSelector: true,
  },
  /*
   * The generic shell, configured for the loop. The selector is rendered by
   * *this* plugin (below) rather than the generic one, because which slot it
   * sits in and whether it shows are loop configuration; the generic
   * keybinding is stood down so the loop's `/editor` keeps `Mod+Alt+E`
   * without two commands fighting over one chord.
   */
  dependencies: [
    configurePlugin(ReactorShellPlugin, {
      point: LoopEditorView,
      describe: describeEditor,
      showSelector: false,
      announce: (viewId: string) => requestSurface(viewId),
      commandId: 'loop.shell.cycleEditor',
      keybinding: '',
    }),
  ],
  // Declared, not merely used: the registry knows who contributed to a
  // point, it cannot know who opened it — and these two are what makes this
  // the plugin the others extend.
  contributionPoints: [LoopViewType, LoopEditorView],
  contributes: [
    contribution(
      LoopCommand,
      {
        name: 'editor',
        aliases: ['editors'],
        description: 'Switch the editor beside the conversation',
        group: 'Open',
        keybinding: 'Mod+Alt+E',
        args: [
          {
            name: 'editor',
            description: 'Which editor: none, or a surface id. Omit to cycle.',
            required: false,
            choices: () => [NONE_EDITOR, ...getEditorChoice().options],
          },
        ],
        run: async ({ argv }) => {
          const asked = argv.trim();
          const wanted = asked === '' ? nextEditor() : asked;
          const known = [NONE_EDITOR, ...getEditorChoice().options];
          if (!known.includes(wanted)) {
            throw new Error(
              `No editor called '${wanted}'. There is: ${known.join(', ')}.`,
            );
          }
          if (!chooseEditor(wanted)) {
            throw new Error('No chat is on screen to host the editor.');
          }
        },
      },
      { id: 'editor' },
    ),
  ],
  build: ({ config }) => {
    // The selector starts where the chat starts. Seeded, not requested: the
    // chat's own `defaultSurface` is what actually opens the editor, and at
    // build time there is no chat listening yet. The chat writes "no editor"
    // as `''` or `'none'`; the selector's word for it is `'none'`.
    seedEditorChoice(config.defaultEditor || NONE_EDITOR);
    return {
      components: config.showSelector
        ? [
            {
              id: 'editor-selector',
              slot: LoopSlots.header,
              // The component holds itself to the trailing edge of the header
              // row with `marginLeft: 'auto'`, wherever the slot renders it.
              Component: EditorSelectorComponent,
            },
          ]
        : [],
    };
  },
});

export {
  NONE_EDITOR,
  chooseEditor,
  getEditorChoice,
  nextEditor,
  seedEditorChoice,
  setEditorOptions,
  subscribeEditorChoice,
} from './editorChoice';
/** The loop's selector, for a host that renders it somewhere of its own. */
export { EditorSelectorComponent as EditorSelector };

/** @deprecated The editors plugin grew into the shell plugin; same object. */
export const EditorsPlugin = ShellPlugin;
/** @deprecated See {@link SHELL_PLUGIN_NAME}. */
export const EDITORS_PLUGIN_NAME = SHELL_PLUGIN_NAME;

export default ShellPlugin;
