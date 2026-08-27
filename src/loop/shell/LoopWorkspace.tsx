/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The workspace: a prompt at the bottom, one view above it, and slots for the
 * rest.
 *
 * The base is deliberately almost nothing. The prompt is the shell and is never
 * contributed; everything above it is. Chat is a view like any other — the
 * shell has no idea it is special.
 *
 * It mounts no providers of its own (no theme, no router, no query client): the
 * entry point owns those and the workspace inherits them, which is what lets
 * the same component run as a page, inside the Datalayer app, and later inside
 * a JupyterLab panel.
 *
 * @module loop/shell/LoopWorkspace
 */

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Box } from '@primer/react';
import {
  buildReactorFromExtensions,
  type ExtensionRef,
  type ReactorPlatform,
} from '@datalayer/reactor';
import {
  ReactorSlot,
  ReactorViewHost,
  useContributions,
  useReactor,
} from '@datalayer/reactor/react';
import {
  LoopCommand,
  LoopSlots,
  LoopViewType,
  canOpenView,
  parseCommand,
  type LoopWorkspaceContext,
  type SandboxSnapshot,
} from '../core';
import { InputPrompt } from '../../chat/prompt/InputPrompt';
import { ViewSwitcher } from './ViewSwitcher';

export type LoopWorkspaceProps = {
  /** Server backing this session. */
  serverUrl: string;
  /** Agent bound to the session. */
  agentId: string;
  conversationId?: string;
  model?: string;
  sandbox?: SandboxSnapshot;
  /** Plugins to mount. Ignored when `reactor` is given. */
  extensions?: ExtensionRef[];
  /** A prebuilt platform, for hosts that assemble their own. */
  reactor?: ReactorPlatform;
  /** View to open on. Defaults to the first that can be opened. */
  initialViewType?: string;
  /** Where a prompt goes when it is not a command. */
  onSend?: (message: string, workspace: LoopWorkspaceContext) => void;
  placeholder?: string;
};

/** Build the platform for a set of plugins. */
export function buildLoopReactor(extensions: ExtensionRef[]): ReactorPlatform {
  return buildReactorFromExtensions(extensions);
}

export function LoopWorkspace(props: LoopWorkspaceProps): JSX.Element {
  const {
    serverUrl,
    agentId,
    conversationId,
    model,
    sandbox = { state: 'idle' as const },
    extensions = [],
    reactor: providedReactor,
    initialViewType,
    onSend,
    placeholder = 'Ask anything, or type / for commands',
  } = props;

  // Building the platform is a one-time act: rebuilding it on every render
  // would restart every plugin.
  const reactor = useMemo(
    () => providedReactor ?? buildLoopReactor(extensions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providedReactor],
  );
  useReactor(reactor);

  return (
    <WorkspaceBody
      serverUrl={serverUrl}
      agentId={agentId}
      conversationId={conversationId}
      model={model}
      sandbox={sandbox}
      initialViewType={initialViewType}
      onSend={onSend}
      placeholder={placeholder}
    />
  );
}

type BodyProps = Omit<LoopWorkspaceProps, 'extensions' | 'reactor'> & {
  sandbox: SandboxSnapshot;
  placeholder: string;
};

/**
 * Split from `LoopWorkspace` so the hooks below run with the platform already
 * registered — `useContributions` needs a reactor in the store, and `useReactor`
 * registers it during the parent's render.
 */
function WorkspaceBody({
  serverUrl,
  agentId,
  conversationId,
  model,
  sandbox,
  initialViewType,
  onSend,
  placeholder,
}: BodyProps): JSX.Element {
  const [activeViewType, setActiveViewType] = useState(initialViewType ?? '');
  const [transient, setTransient] = useState<ReactNode>(null);

  const views = useContributions(LoopViewType);
  const commands = useContributions(LoopCommand);

  const workspace = useMemo<LoopWorkspaceContext>(
    () => ({
      serverUrl,
      agentId,
      conversationId,
      model,
      sandbox,
      activeViewType,
      setActiveViewType,
    }),
    [serverUrl, agentId, conversationId, model, sandbox, activeViewType],
  );

  // With nothing chosen, open the first view that can be opened. Falling back
  // to "nothing" would leave a shell that looks broken on first paint.
  const effectiveViewType = useMemo(() => {
    if (activeViewType) {
      return activeViewType;
    }
    const openable = views.find(entry => canOpenView(entry.value, workspace));
    return openable?.value.viewType ?? '';
  }, [activeViewType, views, workspace]);

  const handleSend = useCallback(
    async (message: string) => {
      const command = parseCommand(message);
      if (!command) {
        setTransient(null);
        onSend?.(message, workspace);
        return;
      }

      const match = commands.find(
        entry =>
          entry.value.name === command.name ||
          (entry.value.aliases ?? []).includes(command.name),
      );
      if (!match) {
        setTransient(
          `Unknown command: /${command.name}. Type /help to see what there is.`,
        );
        return;
      }

      const result = await match.value.run({ workspace, argv: command.argv });
      setTransient((result?.content as ReactNode) ?? null);
      if (result?.prompt) {
        onSend?.(result.prompt, workspace);
      }
    },
    [commands, onSend, workspace],
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        bg: 'canvas.default',
        color: 'fg.default',
      }}
    >
      <Box
        as="header"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          flex: '0 0 auto',
        }}
      >
        <ViewSwitcher views={views} workspace={workspace} />
        <ReactorSlot slot={LoopSlots.header} props={{ workspace }} />
      </Box>

      <Box sx={{ flex: '1 1 auto', minHeight: 0, position: 'relative' }}>
        <ReactorViewHost
          point={LoopViewType}
          active={effectiveViewType}
          props={{ viewType: effectiveViewType, workspace }}
          fallback={<Centered>Loading…</Centered>}
          empty={<Centered>No view is available yet.</Centered>}
          errorFallback={error => (
            <Centered>This view failed to load: {error.message}</Centered>
          )}
        />
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
          placeholder={placeholder}
          showBorderTop
          footerContent={
            <ReactorSlot slot={LoopSlots.promptAction} props={{ workspace }} />
          }
        />
        <ReactorSlot slot={LoopSlots.status} props={{ workspace }} />
      </Box>
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
