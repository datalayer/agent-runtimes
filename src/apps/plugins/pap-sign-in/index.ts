/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-pap-sign-in` — *Sign in at a company*, drawn where
 * the gateway's `pap_sign_in` answers (PI-56).
 *
 * Its own renderer, for its own display type
 * (`application/vnd.datalayer.pap.sign-in+json`, typed in Python as
 * `personal_agent_protocol.ui.PapSignIn`), and its own binding for the tool,
 * with or without the gateway's prefix. It used to ride in the A2UI surface
 * plugin's renderer, because the chat kept one renderer and the later plugin
 * won; each plugin now draws its own tools and neither silences the other.
 *
 * A result that embeds the display (`_meta["reactor.ui/display"]`) is drawn
 * from it; a plain `pap_sign_in` result is read as the card always read it.
 * *I have signed in: check again* goes out as the person's next message
 * through the workspace's `send`, held by a silent component in the chat's
 * title-bar slot, as the A2UI surface plugin holds its own.
 *
 * @module apps/plugins/pap-sign-in
 */

import { createElement, useEffect, type JSX } from 'react';
import { contribution, definePlugin } from '@datalayer/reactor';
import type { ReactorPlugin } from '@datalayer/reactor';
import { Renderers, ToolBindings, type Display } from '@datalayer/reactor/ui';
import {
  defineRenderer,
  type RendererProps,
} from '@datalayer/reactor/ui/react';
import type { ToolCallRenderContext } from '../../../types/chat';
import { LoopSlots, type LoopWorkspaceContext } from '../../core';
import { PapSignInCard } from './PapSignInCard';
import { PAP_SIGN_IN_TOOL } from './signIn';

export const PAP_SIGN_IN_PLUGIN_NAME = '@datalayer/loop-plugin-pap-sign-in';

/** The display type of a sign-in waiting for the person. */
export const PAP_SIGN_IN_TYPE = 'application/vnd.datalayer.pap.sign-in+json';

/**
 * The result the card reads: the tool's own, or — for a display the result
 * embedded, or one drawn outside a chat — the display's data, as the answer
 * it stands for.
 */
function resultOf(display: Display, context?: ToolCallRenderContext): unknown {
  const data = display.data ?? {};
  if ('toolName' in data) {
    return context?.result;
  }
  return { status: 'waiting_for_the_person', ...data };
}

/** The plugin, and the workspace `send` it holds for *Check again*. */
export function createPapSignInPlugin(): ReactorPlugin<
  Record<string, never>,
  unknown,
  unknown
> {
  let currentSend:
    | ((
        message: string,
        forwardedProps?: Record<string, unknown>,
      ) => string | void)
    | undefined;
  // The chat answers why it could not send, when it could not.
  const send = (message: string): boolean =>
    currentSend ? !currentSend(message) : false;

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

  function SignIn({
    display,
    context,
  }: RendererProps<ToolCallRenderContext>): JSX.Element {
    const result = resultOf(display, context);
    return createElement(PapSignInCard, {
      key: display.id,
      context: context
        ? { ...context, result }
        : {
            toolCallId: display.id,
            toolName: 'pap_sign_in',
            name: 'pap_sign_in',
            args: {},
            status: 'complete',
            result,
          },
      send: currentSend ? send : undefined,
    });
  }

  const plugin = definePlugin({
    name: PAP_SIGN_IN_PLUGIN_NAME,
    displayName: 'Sign in at a company',
    description:
      'The company’s page, the code and until when, where the agent asks the person to sign in.',
    octicon: 'sign-in',
    emoji: '\u{1F511}',
    contributes: [
      contribution(
        Renderers,
        defineRenderer({ type: PAP_SIGN_IN_TYPE, component: SignIn }),
        { id: 'pap-sign-in' },
      ),
      contribution(
        ToolBindings,
        { tool: PAP_SIGN_IN_TOOL, type: PAP_SIGN_IN_TYPE },
        { id: 'pap-sign-in' },
      ),
    ],
    build() {
      return {
        components: [
          {
            slot: LoopSlots.chatHeader,
            id: 'pap-sign-in',
            Component: Capture as never,
          },
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

/** The instance the preset mounts. */
export const PapSignInPlugin = createPapSignInPlugin();

export { PapSignInCard, type PapSignInCardProps } from './PapSignInCard';
export {
  PAP_SIGN_IN_TOOL,
  PAP_SIGN_IN_WORDS,
  isPapSignInTool,
  readPapSignIn,
  safeSignInUrl,
  type PapSignInWaiting,
} from './signIn';
export default PapSignInPlugin;
