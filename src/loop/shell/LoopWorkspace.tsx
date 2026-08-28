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
  createPromptChannel,
  parseCommand,
  type LoopWorkspaceContext,
  type SandboxSnapshot,
  type ViewControls,
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
  /**
   * Whether the workspace registers and starts the platform.
   *
   * A host that renders its own reactor-aware UI *around* the workspace — a
   * plugin checkbox list, say — has to register the platform before that UI
   * renders, and therefore owns the lifecycle. Passing `false` stops the
   * workspace from starting it a second time.
   */
  manageReactor?: boolean;
  /** View to open on. Defaults to the first that can be opened. */
  initialViewType?: string;
  /** Where a prompt goes when it is not a command. */
  onSend?: (message: string, workspace: LoopWorkspaceContext) => void;
  placeholder?: string;
  /**
   * How much room there is.
   *
   * `page` is the default: the shell owns the viewport. `panel` is a
   * JupyterLab side panel — a column, not a page — where the switcher shows
   * icons rather than labels and the header wraps instead of overflowing. The
   * views are the same views; only the chrome around them gives way.
   */
  layout?: 'page' | 'panel';
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
    manageReactor = true,
    initialViewType,
    onSend,
    placeholder = 'Ask anything, or type / for commands',
    layout = 'page',
  } = props;

  // Building the platform is a one-time act: rebuilding it on every render
  // would restart every plugin.
  const reactor = useMemo(
    () => providedReactor ?? buildLoopReactor(extensions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providedReactor],
  );
  useReactor(reactor, { autoStart: manageReactor });

  return (
    <WorkspaceBody
      serverUrl={serverUrl}
      agentId={agentId}
      conversationId={conversationId}
      model={model}
      initialSandbox={sandbox}
      initialViewType={initialViewType}
      onSend={onSend}
      placeholder={placeholder}
      layout={layout}
    />
  );
}

type BodyProps = Omit<LoopWorkspaceProps, 'extensions' | 'reactor' | 'sandbox'> & {
  initialSandbox: SandboxSnapshot;
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
  initialSandbox,
  initialViewType,
  onSend,
  placeholder,
  layout = 'page',
}: BodyProps): JSX.Element {
  const [activeViewType, setActiveViewType] = useState(initialViewType ?? '');
  // Seeded by the host (a handoff carries what the terminal knew), then kept
  // current by whichever plugin owns the sandbox.
  const [sandbox, setSandbox] = useState<SandboxSnapshot>(initialSandbox);
  const [transient, setTransient] = useState<ReactNode>(null);
  // One channel per workspace, created once: recreating it would drop whatever
  // the mounted view had subscribed with.
  const [prompts] = useState(createPromptChannel);
  const [viewControls, setViewControlsState] = useState<ViewControls>({});

  const setViewControls = useCallback((controls: ViewControls | null) => {
    setViewControlsState(controls ?? {});
  }, []);

  const views = useContributions(LoopViewType);
  const commands = useContributions(LoopCommand);
  const compact = layout === 'panel';

  const workspace = useMemo<LoopWorkspaceContext>(
    () => ({
      serverUrl,
      agentId,
      conversationId,
      model,
      sandbox,
      setSandbox,
      activeViewType,
      setActiveViewType,
      prompts,
      viewControls,
      setViewControls,
    }),
    [
      serverUrl,
      agentId,
      conversationId,
      model,
      sandbox,
      activeViewType,
      prompts,
      viewControls,
      setViewControls,
    ],
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
        // The active view answers ordinary prompts. When nothing is listening —
        // no view mounted yet, or a view that does not take prompts — say so
        // rather than swallowing what the person typed.
        if (!prompts.submit(message) && !onSend) {
          setTransient('Nothing is listening for prompts in this view yet.');
        }
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
    [commands, onSend, prompts, workspace],
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
          // In a column there is no room for a row: the header wraps rather
          // than pushing the model chip off the edge.
          justifyContent: compact ? 'flex-start' : 'space-between',
          flexWrap: compact ? 'wrap' : 'nowrap',
          gap: 2,
          px: compact ? 2 : 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          flex: '0 0 auto',
        }}
      >
        <ViewSwitcher views={views} workspace={workspace} compact={compact} />
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
          // The work happens in a view; the spinner and the stop button belong
          // where the person is typing.
          isLoading={viewControls.busy}
          onStop={viewControls.stop}
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
