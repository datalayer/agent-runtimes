/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The workspace: one view, and slots for whatever a plugin wants beside it.
 *
 * The base is blank. It renders no prompt, no chat, no editor — those are all
 * plugins, and a workspace mounted with none of them shows an empty frame,
 * which is the honest picture of what the shell actually is. Even the prompt
 * belongs to the chat plugin: it is the chat's input, and putting it in the
 * shell made a workspace without a chat carry an input box wired to nothing.
 *
 * What the shell keeps is what only it can do: hold the view host, render the
 * slots, and dispatch a typed message against every command every plugin
 * contributed. That last one stays here — as `workspace.submit` — because no
 * single plugin can see the others' commands.
 *
 * It mounts no providers of its own (no theme, no router, no query client): the
 * entry point owns those and the workspace inherits them, which is what lets
 * the same component run as a page, inside the Datalayer app, and later inside
 * a JupyterLab panel.
 *
 * @module loop/shell/LoopWorkspace
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Box } from '@primer/react';
import {
  buildReactorFromPlugins,
  onView,
  type PluginRef,
  type ReactorPlatform,
} from '@datalayer/reactor';
import {
  ReactorSlot,
  ReactorViewHost,
  useContributions,
  useReactorEvent,
  useSlotComponents,
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
import { SIDEBAR_WIDTH } from '../plugins/plugins-panel';
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
  extensions?: PluginRef[];
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
  /**
   * Where a prompt goes when no view answers it.
   *
   * A host embedding the workspace in something that already has a
   * conversation — the Datalayer app — takes the message itself.
   */
  onSend?: (message: string, workspace: LoopWorkspaceContext) => void;
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
export function buildLoopReactor(extensions: PluginRef[]): ReactorPlatform {
  return buildReactorFromPlugins(extensions);
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
      layout={layout}
    />
  );
}

type BodyProps = Omit<
  LoopWorkspaceProps,
  'extensions' | 'reactor' | 'sandbox'
> & {
  initialSandbox: SandboxSnapshot;
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
  layout = 'page',
}: BodyProps): JSX.Element {
  const [activeViewType, setActiveViewType] = useState(initialViewType ?? '');
  // Seeded by the host (a handoff carries what the terminal knew), then kept
  // current by whichever plugin owns the sandbox.
  const [sandbox, setSandbox] = useState<SandboxSnapshot>(initialSandbox);
  // One channel per workspace, created once: recreating it would drop whatever
  // the mounted view had subscribed with.
  const [prompts] = useState(createPromptChannel);
  const [viewControls, setViewControlsState] = useState<ViewControls>({});

  const setViewControls = useCallback((controls: ViewControls | null) => {
    setViewControlsState(controls ?? {});
  }, []);

  const views = useContributions(LoopViewType);
  const commands = useContributions(LoopCommand);
  // Read to decide whether the column exists at all, not to render it: the
  // slot does that.
  const sidebar = useSlotComponents(LoopSlots.sidebar);
  const commandsRef = useRef(commands);
  const currentWorkspace = useRef<LoopWorkspaceContext | null>(null);
  const compact = layout === 'panel';

  // Dispatch stays with the shell because only the shell sees every command
  // every plugin contributed. Whoever renders a prompt calls this.
  const submit = useCallback<LoopWorkspaceContext['submit']>(
    async message => {
      const command = parseCommand(message);
      if (!command) {
        onSend?.(message, currentWorkspace.current!);
        const heard = prompts.submit(message);
        return heard || onSend
          ? { handled: true }
          : {
              handled: false,
              reason: 'Nothing is listening for prompts in this view yet.',
            };
      }

      const match = commandsRef.current.find(
        entry =>
          entry.value.name === command.name ||
          (entry.value.aliases ?? []).includes(command.name),
      );
      if (!match) {
        return {
          handled: false,
          command: command.name,
          reason: `Unknown command: /${command.name}. Type /help to see what there is.`,
        };
      }

      const result = await match.value.run({
        workspace: currentWorkspace.current!,
        argv: command.argv,
      });
      if (result?.prompt) {
        onSend?.(result.prompt, currentWorkspace.current!);
      }
      return {
        handled: true,
        command: command.name,
        result: result ?? undefined,
      };
    },
    [onSend, prompts],
  );

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
      submit,
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
      submit,
      viewControls,
      setViewControls,
    ],
  );

  // `submit` must not be rebuilt whenever the workspace object changes — the
  // chat holds on to it — so it reads the current values through refs.
  currentWorkspace.current = workspace;
  commandsRef.current = commands;

  // With nothing chosen, open the first view that can be opened. Falling back
  // to "nothing" would leave a shell that looks broken on first paint.
  const effectiveViewType = useMemo(() => {
    if (activeViewType) {
      return activeViewType;
    }
    const openable = views.find(entry => canOpenView(entry.value, workspace));
    return openable?.value.viewType ?? '';
  }, [activeViewType, views, workspace]);

  // Tell the reactor which view is open, so plugins that only matter inside
  // one can wait for it and stand down when it closes. One line, and it is
  // both halves: `fire` deactivates whatever declared this event before it
  // activates whatever was waiting for it. A plugin that declares neither is
  // untouched, so this costs nothing until somebody uses it.
  useReactorEvent(effectiveViewType ? onView(effectiveViewType) : undefined);

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

      <Box sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
        <Box
          sx={{
            flex: '1 1 auto',
            minWidth: 0,
            minHeight: 0,
            position: 'relative',
          }}
        >
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
        {sidebar.length > 0 ? (
          <Box
            as="aside"
            sx={{
              flex: '0 0 auto',
              // Wide enough for a plugin's name, its description and a switch
              // on one line. The panel truncates to the same number, and takes
              // it from `SIDEBAR_WIDTH` so the two cannot drift.
              width: compact ? '100%' : `${SIDEBAR_WIDTH}px`,
              minWidth: 0,
              // On the trailing edge: the work is what a person reads first,
              // and the switches belong beside it rather than in front of it.
              borderLeft: compact ? 'none' : '1px solid',
              borderTop: compact ? '1px solid' : 'none',
              borderColor: 'border.default',
              bg: 'canvas.subtle',
              overflowY: 'auto',
              // The shell's chrome, not the plugins': a contributed panel
              // should not have to guess how far its host keeps things from
              // the edge, and two of them would guess differently.
              px: 3,
              py: 3,
            }}
          >
            <ReactorSlot slot={LoopSlots.sidebar} props={{ workspace }} />
          </Box>
        ) : null}
      </Box>

      {/* Whatever a plugin puts under the view: the chat's prompt lands here. */}
      <Box sx={{ flex: '0 0 auto' }}>
        <ReactorSlot slot={LoopSlots.footer} props={{ workspace }} />
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
