/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat view: a conversation, a prompt, and whatever editors plugins add.
 *
 * The prompt lives here rather than in the shell. It is the chat's input — a
 * workspace with no chat plugin should have no input box — and putting it in
 * the base meant every workspace carried one whether or not anything answered
 * it. Slash commands still work, because dispatch stayed with the workspace:
 * `workspace.submit` sees every command every plugin contributed, which no
 * single plugin can.
 *
 * The editors beside the conversation are contributed, not built in. A notebook
 * and a document are what the conversation is *about*, so they belong next to
 * the reply rather than one tab away — and this view holds the point they
 * arrive through without knowing what either of them is.
 *
 * @module loop/plugins/chat/ChatView
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Box, SegmentedControl, Text } from '@primer/react';
import {
  useContributions,
  useGate,
  useReactorPlatform,
  ReactorLazy,
} from '@datalayer/reactor/react';
import { ChatBase } from '../../../chat/base/ChatBase';
import { browserProtocolConfig } from '../../../runtimes/browser';
import { useBrowserInference } from '../../../hooks/useBrowserInference';
import { AGENTSPECS } from '../../../specs/agents/agents';
import type { ProtocolConfig } from '../../../types/protocol';
import {
  targetRunsAgentInPage,
  type SandboxTarget,
} from '../agents/switchable';
import { CHAT_PLUGIN_NAME, type ChatPluginConfig } from './index';
import { InputPrompt } from '../../../chat/prompt/InputPrompt';
import {
  LoopAgentGate,
  LoopChatSurface,
  canOpenView,
  type ChatSurfaceContribution,
  type LoopViewProps,
} from '../../core';

type ChatControls = { send: (message: string) => void; stop: () => void };

/** No editor: the conversation on its own. */
const NO_SURFACE = '';

export default function ChatView({ workspace }: LoopViewProps): JSX.Element {
  const controlsRef = useRef<ChatControls | null>(null);
  const { setViewControls } = workspace;
  const [transient, setTransient] = useState<ReactNode>(null);
  const [surfaceId, setSurfaceId] = useState<string>(NO_SURFACE);

  const surfaces = useContributions(LoopChatSurface);
  // Read from the reactor rather than taken as a prop: the placeholder is the
  // chat plugin's own configuration, so a host sets it where it sets anything
  // else about this plugin.
  const reactor = useReactorPlatform();
  const placeholder =
    reactor.getConfig<ChatPluginConfig>(CHAT_PLUGIN_NAME)?.placeholder ??
    'Ask anything, or type / for commands';
  // Asked, not assumed: the chat cannot know whether anything is listening,
  // and whichever plugin does answers the gate. Re-asked on every render with
  // the live workspace, so switching the sandbox switches the prompt.
  const usable = useGate(LoopAgentGate, workspace);
  const chatDisabled = !usable.allowed;
  const disabledReason = chatDisabled
    ? (usable.reason ?? 'Chat is unavailable for this sandbox')
    : undefined;

  // Stable: ChatBase calls these in effects, and a new identity every render
  // would make it re-publish on every render.
  const handleSendReady = useCallback(
    (controls: ChatControls | null) => {
      controlsRef.current = controls;
      setViewControls(controls ? { stop: controls.stop } : null);
    },
    [setViewControls],
  );

  const handleLoadingChange = useCallback(
    (busy: boolean) => {
      setViewControls({ busy, stop: controlsRef.current?.stop });
    },
    [setViewControls],
  );

  // Stop reporting when the view goes away, or the shell would keep a stop
  // button for something that is no longer there.
  useEffect(() => () => setViewControls(null), [setViewControls]);

  useEffect(
    () =>
      workspace.prompts.subscribe(message => {
        // A prompt typed before the adapter is ready is dropped rather than
        // queued: silently sending it minutes later, out of context, is worse
        // than saying nothing happened.
        controlsRef.current?.send(message);
      }),
    [workspace.prompts],
  );

  const handleSend = useCallback(
    async (message: string) => {
      setTransient(null);
      const outcome = await workspace.submit(message);
      if (!outcome.handled) {
        setTransient(outcome.reason ?? null);
        return;
      }
      if (outcome.result?.content) {
        setTransient(outcome.result.content as ReactNode);
      }
    },
    [workspace],
  );

  const active = useMemo(
    () => surfaces.find(entry => entry.value.surfaceId === surfaceId)?.value,
    [surfaces, surfaceId],
  );

  // An editor that stops being openable — its sandbox went away — should not
  // stay on screen claiming otherwise.
  useEffect(() => {
    if (active && !canOpenView(active, workspace)) {
      setSurfaceId(NO_SURFACE);
    }
  }, [active, workspace]);

  // The AG-UI mount is per agent, and `default` is the agent a server runs when
  // it was not told otherwise, so a workspace opened without one still talks to
  // something.
  const agentId = workspace.agentId?.trim() || 'default';

  /*
   * Which protocol, decided by where the sandbox is.
   *
   * On the browser target there is no server to mount an agent on, so the loop
   * turns in this page with the Vercel AI SDK and the chat calls it rather
   * than addressing it. Everywhere else the agent lives on the runtime and the
   * chat speaks AG-UI to it, exactly as before.
   *
   * The spec's own `harness` does not decide this. It says where the agent
   * normally runs, and a page cannot turn a pydantic-ai loop whatever it asks
   * for — so the location wins, which is the same rule the examples follow.
   */
  const inPage = targetRunsAgentInPage(
    (workspace.sandbox.target as SandboxTarget) ?? 'local',
  );
  const spec = AGENTSPECS[agentId];
  const { inference } = useBrowserInference();

  const protocol = useMemo<ProtocolConfig>(
    () =>
      inPage
        ? browserProtocolConfig({
            agentId,
            instructions: spec?.systemPrompt,
            model: workspace.model || spec?.model,
            inference,
          })
        : {
            type: 'ag-ui',
            endpoint: `${workspace.serverUrl}/api/v1/ag-ui/${agentId}/`,
            agentId,
            // `/api/v1/configure`, not `/api/v1/configure/config`: the hooks
            // strip one trailing `config`/`configure` segment to find the API
            // base, so the longer form doubles it.
            configEndpoint: `${workspace.serverUrl}/api/v1/configure`,
            enableConfigQuery: true,
          },
    [
      agentId,
      inPage,
      inference,
      spec?.model,
      spec?.systemPrompt,
      workspace.model,
      workspace.serverUrl,
    ],
  );

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {surfaces.length > 0 ? (
        <SurfacePicker
          surfaces={surfaces.map(entry => entry.value)}
          active={surfaceId}
          onChange={setSurfaceId}
          workspace={workspace}
        />
      ) : null}

      <Box sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: '1 1 0', minWidth: 0, minHeight: 0 }}>
          <ChatBase
            // The header says why, beside the title, for the same reason the
            // placeholder does: a dead control with no explanation is worse
            // than an absent one.
            disabled={chatDisabled}
            disableReason={disabledReason}
            protocol={protocol}
            showHeader
            // This view owns the prompt, below, so the chat does not draw a
            // second one: two input boxes on one screen is one too many.
            showInput={false}
            onSendReady={handleSendReady}
            onLoadingChange={handleLoadingChange}
            enableStreaming
          />
        </Box>

        {active ? (
          <Box
            sx={{
              flex: '1 1 0',
              minWidth: 0,
              minHeight: 0,
              borderLeft: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <ReactorLazy
              load={active.load}
              props={{ surfaceId: active.surfaceId, workspace }}
              fallback={<Centered>Loading {active.title}…</Centered>}
              errorFallback={error => (
                <Centered>
                  {active.title} failed to load: {error.message}
                </Centered>
              )}
            />
          </Box>
        ) : null}
      </Box>

      {transient ? (
        <Box
          sx={{
            flex: '0 0 auto',
            px: 3,
            py: 2,
            borderTop: '1px solid',
            borderColor: 'border.default',
            bg: 'canvas.subtle',
            fontSize: 1,
            maxHeight: '40%',
            overflowY: 'auto',
          }}
        >
          {transient}
        </Box>
      ) : null}

      <Box sx={{ flex: '0 0 auto' }}>
        <InputPrompt
          onSend={message => void handleSend(message)}
          isLoading={workspace.viewControls.busy}
          onStop={workspace.viewControls.stop}
          // The reason where the typing would go, so it is read before the
          // person types rather than after nothing happens.
          placeholder={disabledReason ?? placeholder}
          disabled={chatDisabled}
          showBorderTop
        />
      </Box>
    </Box>
  );
}

/**
 * Which editor sits beside the conversation.
 *
 * Rendered only when a plugin contributed one — a chat on its own has nothing
 * to pick between, and a control with a single option is noise.
 */
function SurfacePicker({
  surfaces,
  active,
  onChange,
  workspace,
}: {
  surfaces: ChatSurfaceContribution[];
  active: string;
  onChange: (surfaceId: string) => void;
  workspace: LoopViewProps['workspace'];
}): JSX.Element {
  const ordered = [...surfaces].sort(
    (left, right) => (left.order ?? 100) - (right.order ?? 100),
  );

  return (
    <Box
      sx={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 3,
        py: 2,
        borderBottom: '1px solid',
        borderColor: 'border.default',
      }}
    >
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Beside the chat</Text>
      <SegmentedControl aria-label="Editor beside the chat" size="small">
        <SegmentedControl.Button
          selected={active === NO_SURFACE}
          onClick={() => onChange(NO_SURFACE)}
        >
          None
        </SegmentedControl.Button>
        {ordered.map(surface => {
          const openable = canOpenView(surface, workspace);
          const reason = openable
            ? undefined
            : (surface.unavailableReason?.(workspace) ??
              'Not available right now');
          return (
            <SegmentedControl.Button
              key={surface.surfaceId}
              selected={active === surface.surfaceId}
              // `aria-disabled` rather than `disabled`: a disabled button is
              // not focusable, so a keyboard or screen-reader user would never
              // hear *why* the editor is unavailable. It stays focusable, the
              // title explains, and the handler declines.
              aria-disabled={!openable}
              // The native attribute rather than Primer's `Tooltip`: that
              // component requires its child to *be* the interactive element,
              // and `SegmentedControl.Button` renders a list item around its
              // button — wrapping it throws before the workspace can paint.
              title={reason ?? surface.title}
              // Primer types this as its own icon shape; a contribution may
              // bring any component, which is the point of the extension point.
              leadingIcon={surface.icon as never}
              onClick={() => {
                if (openable) {
                  onChange(surface.surfaceId);
                }
              }}
            >
              {surface.title}
            </SegmentedControl.Button>
          );
        })}
      </SegmentedControl>
    </Box>
  );
}

function Centered({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'fg.muted',
        fontSize: 1,
        px: 3,
        textAlign: 'center',
      }}
    >
      {children}
    </Box>
  );
}
