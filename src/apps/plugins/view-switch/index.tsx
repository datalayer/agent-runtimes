/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The mould the view plugins are cast from.
 *
 * A view plugin — chat, notebook, document — puts one icon in the composer's
 * footer that switches the workspace to its view. The icon lives *in the
 * prompt* because that is where the writing hand already is: changing what
 * stands beside the conversation should not mean leaving it. Each plugin
 * therefore **requires** the input-prompt plugin — an icon with no footer to
 * sit in is a control that does not exist — and the reactor mounts the
 * composer with it and takes both down together.
 *
 * The icon knows its own standing: the active view's icon shows in the
 * accent colour, and an editor's icon withdraws entirely while its editor is
 * not on offer (no notebook plugin, no notebook button). The chat's icon is
 * there whenever an editor is: with no editor, the conversation is all there is
 * and its icon would change nothing.
 *
 * @module apps/plugins/view-switch
 */

import type { ComponentType, JSX } from 'react';
import { useSyncExternalStore } from 'react';
import { IconButton } from '@primer/react';
import { definePlugin } from '@datalayer/reactor';
import { useContributions } from '@datalayer/reactor/react';
import { AgentEditorView, AgentSlots } from '../../core';
import {
  NONE_EDITOR,
  chooseEditor,
  getEditorChoice,
  subscribeEditorChoice,
} from '../shell/editorChoice';
import { InputPromptPlugin } from '../input-prompt';
import { uiManifestOf } from '../../uiManifest';

export type ViewPluginOptions = {
  /** Short slug: `chat`, `notebook`, … names the plugin `…-<key>-view`. */
  key: string;
  /** The editor surface the icon switches to; `NONE_EDITOR` for the chat. */
  viewId: string;
  displayName: string;
  description: string;
  /** The footer icon, with its tooltip text. */
  icon: ComponentType<{ size?: number }>;
  tooltip: string;
  /** Registry icon name. */
  octicon?: string;
  emoji?: string;
  /** Where the icon stands among its siblings in the footer. */
  order: number;
};

/** One footer icon: switches to its view, shows when the view is real. */
function makeViewSwitchAction({
  viewId,
  icon,
  tooltip,
}: Pick<
  ViewPluginOptions,
  'viewId' | 'icon' | 'tooltip'
>): () => JSX.Element | null {
  return function ViewSwitchAction(): JSX.Element | null {
    /*
     * Field by field, never the wrapper: `getEditorChoice()` builds a fresh
     * object per call, and `useSyncExternalStore` re-renders whenever the
     * snapshot's identity changes — a fresh object every check is an
     * infinite loop. The id is a string and the options array keeps its
     * reference between changes, so these two are stable snapshots.
     */
    const editorId = useSyncExternalStore(
      subscribeEditorChoice,
      () => getEditorChoice().editorId,
    );
    /*
     * From the contributions, not the choice store's `options`: the store's
     * list is published by the header selector's render, and a workspace
     * that mounts no selector would leave it empty with every editor
     * standing. The point is the source of truth about what exists.
     */
    const editors = useContributions(AgentEditorView);
    // An editor's icon withdraws while its editor is not contributed: a
    // button that switches to nothing is the trap the fail-loud rules exist
    // to prevent. The chat's icon withdraws too while no editor is: with the
    // conversation all there is, "Show the chat" had nothing to change, and a
    // click on it did nothing at all (the user, 18 November 2026).
    if (
      viewId === NONE_EDITOR
        ? editors.length === 0
        : !editors.some(entry => entry.value.surfaceId === viewId)
    ) {
      return null;
    }
    const selected = (editorId || NONE_EDITOR) === viewId;
    return (
      <IconButton
        icon={icon}
        // The IconButton draws its tooltip from this label.
        aria-label={tooltip}
        size="small"
        variant="invisible"
        onClick={() => {
          if (!chooseEditor(viewId)) {
            console.warn(
              `[agent] No chat is on screen to switch to '${viewId}'.`,
            );
          }
        }}
        sx={selected ? { color: 'accent.fg' } : undefined}
      />
    );
  };
}

export function defineViewPlugin(options: ViewPluginOptions) {
  const { key, viewId, displayName, description, icon, tooltip, order } =
    options;
  const Component = makeViewSwitchAction({ viewId, icon, tooltip });
  return definePlugin({
    name: `@datalayer/agent-plugin-${key}-view`,
    displayName,
    description,
    octicon: options.octicon ?? 'eye',
    emoji: options.emoji,
    // What its UI spec (`<key>-view`) says: the catalogue's facts on its manifest.
    ...uiManifestOf(`${key}-view`),
    // The footer the icon sits in is the input-prompt plugin's: a view
    // plugin without it would be a control with nowhere to exist, so this is
    // a hard dependency — the composer mounts with it, and disabling the
    // composer takes the view icons down too.
    dependencies: [InputPromptPlugin],
    build: () => ({
      components: [
        {
          id: `${key}-view-action`,
          slot: AgentSlots.promptAction,
          order,
          Component,
        },
      ],
    }),
  });
}

export default defineViewPlugin;
