/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-a2ui-surface` — an agent's generated surfaces,
 * drawn in the transcript and submitted back to it.
 *
 * An agentspec binds a tool's result to a renderer by name:
 *
 * ```yaml
 * frontend_render_tools:
 *   - tool: render_a2ui_surface
 *     renderer: a2ui-surface
 * ```
 *
 * The spec can say that and nothing more — what the renderer does is
 * frontend behaviour. This plugin is that behaviour, out of the box: every
 * tool any spec binds to `a2ui-surface` is drawn as a live A2UI surface
 * where the tool result lands, its submissions are checked against the
 * rules the tool shipped, and a submission that passes goes back to the
 * agent as the reader's next turn (see `chat/messages/formSubmission`).
 *
 * Two examples used to carry this each in its own copy — the renderer, the
 * validation, a way to reach the chat's `send` — and a third would have
 * copied it again. In the preset now, so an agent whose spec names the
 * renderer needs no example code at all; a host that wants to know what was
 * drawn or submitted asks for its own instance with callbacks.
 *
 * @module loop/plugins/a2ui-surface
 */

import type { JSX, ReactNode } from 'react';
import { useEffect } from 'react';
import { contribution, definePlugin, signal } from '@datalayer/reactor';
import type { ReactorPlugin } from '@datalayer/reactor';
import type { ToolCallRenderContext } from '../../../types/chat';
import { AGENTSPECS } from '../../../specs/agents';
import {
  LoopChatExtras,
  LoopSlots,
  type LoopWorkspaceContext,
} from '../../core';
import {
  SurfaceToolResult,
  type SurfaceRendered,
  type SurfaceSubmitted,
} from './SurfaceToolResult';

export const A2UI_SURFACE_PLUGIN_NAME = '@datalayer/loop-plugin-a2ui-surface';

/** The renderer name a spec binds a tool to. */
export const A2UI_SURFACE_RENDERER = 'a2ui-surface';

/**
 * Every tool some spec binds to this renderer.
 *
 * Read from the specs rather than from the workspace's current agent: a
 * tool result arrives named by its tool, and a name bound in any spec is a
 * surface wherever it turns up.
 */
export function surfaceToolNames(): Set<string> {
  const names = new Set<string>();
  for (const spec of Object.values(AGENTSPECS)) {
    for (const binding of spec.frontendRenderTools ?? []) {
      if (binding.renderer === A2UI_SURFACE_RENDERER) {
        names.add(binding.tool);
      }
    }
  }
  return names;
}

export type A2uiSurfacePluginOptions = {
  /** Told when a surface has been drawn from a tool result. */
  onRendered?: (rendered: SurfaceRendered) => void;
  /** Told when a submission passed its checks and went to the agent. */
  onSubmitted?: (submitted: SurfaceSubmitted) => void;
};

let counter = 0;

/**
 * An instance of the plugin, with a host's callbacks.
 *
 * The chat reaches a workspace's `send` only through slot props, so the
 * plugin keeps a silent component in the chat's title-bar slot — it draws
 * nothing and holds the `send` of the workspace it is in. The slot is asked
 * whether anyone contributed before it is drawn, so this costs the header
 * no space.
 */
export function createA2uiSurfacePlugin(
  options: A2uiSurfacePluginOptions = {},
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  const id = `a2ui-surface-${(counter += 1)}`;
  let currentSend: ((message: string) => void) | undefined;
  const send = (message: string): boolean => {
    if (!currentSend) {
      return false;
    }
    currentSend(message);
    return true;
  };

  function Capture({
    workspace,
  }: {
    workspace?: LoopWorkspaceContext;
  }): JSX.Element | null {
    const workspaceSend = workspace?.viewControls.send;
    useEffect(() => {
      currentSend = workspaceSend;
      return () => {
        if (currentSend === workspaceSend) {
          currentSend = undefined;
        }
      };
    }, [workspaceSend]);
    return null;
  }

  const tools = surfaceToolNames();
  // A failed call is the chat's to draw: its default card says what went
  // wrong, and a spinner that never ends would say nothing at all. So is
  // every tool that is not a surface: this renderer is the chat's only one,
  // and returning nothing for a tool it does not own hid every other tool
  // row — the notebook reads, the cell runs — from the transcript.
  const renderToolResult = (context: ToolCallRenderContext): ReactNode =>
    tools.has(context.toolName) && context.status !== 'error' ? (
      <SurfaceToolResult
        key={context.toolCallId}
        context={context}
        send={send}
        onRendered={options.onRendered}
        onSubmitted={options.onSubmitted}
      />
    ) : (
      context.defaultUI
    );

  const plugin = definePlugin({
    name:
      counter === 1
        ? A2UI_SURFACE_PLUGIN_NAME
        : `${A2UI_SURFACE_PLUGIN_NAME}-${id}`,
    displayName: 'A2UI surfaces',
    description:
      'Generated surfaces drawn in the transcript, and submitted back to the agent.',
    octicon: 'browser',
    emoji: '\u{1FA9F}',
    contributes: [
      contribution(
        LoopChatExtras,
        { id, extras: signal({ renderToolResult }) },
        { id },
      ),
    ],
    build() {
      return {
        components: [
          { slot: LoopSlots.chatHeader, id, Component: Capture as never },
        ],
      };
    },
  });
  return plugin as unknown as ReactorPlugin<
    Record<string, never>,
    unknown,
    unknown
  >;
}

/** The instance the preset mounts: no host callbacks. */
export const A2uiSurfacePlugin = createA2uiSurfacePlugin();

export type { SurfaceRendered, SurfaceSubmitted } from './SurfaceToolResult';
export {
  readA2uiToolResult,
  validateA2uiField,
  validateA2uiSubmission,
  type A2uiFieldRule,
  type A2uiToolResult,
} from './toolResult';
export default A2uiSurfacePlugin;
