/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application in another product's page, as a React component (LOOP
 * D-07, D-09, D-11): what the `<datalayer-app>` element draws, and what a
 * host that uses React mounts itself.
 *
 * Four modes, as the Appspec says (`deployment.embedded.mode`) or the host:
 *
 * - **inline** — the application where the component is: `AppRenderer`, its
 *   page beside its conversation when it has one;
 * - **bubble** — a round button in the corner that opens the conversation in
 *   a popup, the copilot pattern;
 * - **panel** — the conversation at the right edge of the page, at full
 *   height;
 * - **assistant** — the application's character on the page, speaking in a
 *   balloon (§6.9): the one its Appspec names (`interface.assistant`), else
 *   the paper clip, looked up in what is contributed — Datalayer's four and
 *   the host's own plugins (T-24); an id nothing contributes is said, never
 *   replaced.
 *
 * The three floating modes are `ChatFloating`'s, given the application's
 * name, welcome, starters and accent, and its agent's endpoint — created
 * with the application's spec in its payload, so the runtime enforces its
 * rules there as it does inline.
 *
 * In the `loop` theme with the application's accent (T-12, T-05), which the
 * host may override with the face and the mode (D-11) — around the
 * conversation and inside it, where the chat sets its theme again.
 *
 * @module loop/embed/AppEmbed
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX, ReactNode } from 'react';
import type { PluginRef } from '@datalayer/reactor';
import { registerPortalRoot } from '@primer/react';
import { DatalayerThemeProvider, loopTheme } from '@datalayer/primer-addons';
import { useIAMStore } from '@datalayer/core/lib/state/substates/IAMState';
import type { AppAccent, AppEmbedMode, AppSpec } from '../../types/agentspecs';
import type { ProtocolConfig } from '../../types/protocol';
import type { ThemeOverrides } from '../../types/chat';
import type { AssistantCharacter } from '../../chat/assistant/characters';
import type { AssistantCharacterData } from '../../chat/assistant/formats/types';
import { ChatFloating } from '../../chat/ChatFloating';
import { useAgentRuntimes } from '../../hooks/useAgentRuntimes';
import {
  AppRenderer,
  DATALAYER_BOOTSTRAP_AGENTSPEC,
  appDatalayerCreatePayload,
  defineAppPlugin,
  type AppInstance,
} from '../apps/AppRenderer';
import { LoopAgentBlueprint } from '../core';
import { ensureServerAgent } from '../plugins/agents/switchable';
import {
  AssistantCharactersPlugin,
  assistantCharacterFor,
  assistantCharactersFrom,
  type AssistantCharacterChosen,
} from '../plugins/assistant-characters';
import { floatingViewOf, type EmbedColorMode } from './embedConfig';
import { embedThemeOverrides, embedThemeStyles } from './embedTheme';

export type AppEmbedProps = {
  /** The application. */
  app: AppSpec;
  /** How it sits in the page; the Appspec's `deployment.embedded.mode` by default. */
  mode?: AppEmbedMode;
  /** The host's accent; the application's own by default. */
  accent?: AppAccent;
  /** Light, dark, or the visitor's system. */
  colorMode?: EmbedColorMode;
  /** The host's face, a CSS font family; the theme's by default. */
  font?: string;
  /**
   * An agent-runtimes server the application's agent runs on. Without one,
   * it runs on a Datalayer runtime, launched with the visitor's Datalayer
   * credentials.
   */
  serverUrl?: string;
  /** What its record is kept under, on Datalayer. */
  instance?: AppInstance;
  /** Height of an inline application. */
  height?: number | string;
  /**
   * Draw overlays — menus, dialogs — inside the embed's own root rather than
   * in Primer's, in the host's `<body>`: what the element asks for, since a
   * shadow root's styles stop at its edge. A React host leaves it off.
   */
  ownPortal?: boolean;
  /**
   * The host's plugins, for the assistant's character: what they contribute
   * to `loop.assistant.character` is there beside Datalayer's four. The
   * element passes none.
   */
  plugins?: PluginRef[];
};

/** No host plugins: one array, so that it never reads as a change. */
const NO_PLUGINS: PluginRef[] = [];

/**
 * The character the assistant mode draws (T-24, D-07): the application's own
 * (`interface.assistant`), else the paper clip, from what Datalayer's
 * characters and the host's plugins contribute — as a page decides it, with
 * no person's choice, since a visitor to another product has none here.
 */
export function embedAssistantCharacter(
  app: AppSpec,
  plugins: PluginRef[] = NO_PLUGINS,
): AssistantCharacterChosen {
  return assistantCharacterFor(
    assistantCharactersFrom([AssistantCharactersPlugin, ...plugins]),
    { app: app.interface.assistant },
  );
}

/** The application's agent as `ChatFloating` addresses it. */
type AgentEndpoint = {
  protocol?: ProtocolConfig;
  /** Why there is none yet, or why there will be none. */
  waiting?: string;
  error?: string;
};

/** What the application's agent is created with on an agent-runtimes server. */
function serverCreatePayload(app: AppSpec): Record<string, unknown> {
  const blueprint = (defineAppPlugin(app).contributes ?? []).find(
    (item: { point?: unknown }) => item.point === LoopAgentBlueprint,
  ) as { value: { createPayload?: Record<string, unknown> } } | undefined;
  return blueprint?.value.createPayload ?? { name: app.id };
}

/**
 * The application's agent on the host's agent-runtimes server: created
 * there with the application's spec unless it is there already, as the
 * workspace's Local target does.
 */
function useServerAgent(app: AppSpec, serverUrl: string): AgentEndpoint {
  const [state, setState] = useState<AgentEndpoint>({
    waiting: 'Starting…',
  });
  const source = JSON.stringify(app);
  useEffect(() => {
    let cancelled = false;
    const base = serverUrl.replace(/\/+$/, '');
    setState({ waiting: 'Starting…' });
    ensureServerAgent(base, app.id, serverCreatePayload(app)).then(
      () => {
        if (!cancelled) {
          setState({
            protocol: {
              type: 'ag-ui',
              // Its session API: each thread a session (LOOP R-04).
              endpoint: `${base}/api/v1/apps/agents/${encodeURIComponent(app.id)}/ag-ui/`,
              agentId: app.id,
            },
          });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, source]);
  return state;
}

/**
 * The application's agent on a Datalayer runtime: allocated with a plain
 * agentspec, the agent created there with the application's spec — the
 * runtime `AppRenderer` launches inline (R-03, R-05).
 */
function useDatalayerAgent(
  app: AppSpec,
  instance?: AppInstance,
): AgentEndpoint {
  const token = useIAMStore(state => state.token);
  const source = JSON.stringify(app);
  const agentConfig = useMemo(
    () => ({
      name: app.id,
      protocol: 'ag-ui' as const,
      agentSpecId: DATALAYER_BOOTSTRAP_AGENTSPEC,
      createPayload: appDatalayerCreatePayload(app, instance),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, instance?.appUid, instance?.deploymentUid, instance?.version],
  );
  const { runtime, error } = useAgentRuntimes({
    agentSpecId: DATALAYER_BOOTSTRAP_AGENTSPEC,
    agentConfig,
    variant: 'cloud-pydanticai',
    // Only for a visitor Datalayer knows: a runtime is somebody's to pay for.
    autoStart: Boolean(token),
    autoCreateAgent: Boolean(token),
  });
  if (!token) {
    return {
      error: `${app.name} runs on Datalayer, which needs you signed in. An application embedded for visitors who are not needs its embed token (LOOP D-14), or an agent-runtimes server of the host's own (the "server" attribute).`,
    };
  }
  if (error) {
    return { error };
  }
  if (!runtime?.agentBaseUrl) {
    return { waiting: 'Starting…' };
  }
  return {
    protocol: {
      type: 'ag-ui',
      // Its session API: each thread a session (LOOP R-04).
      endpoint: `${runtime.agentBaseUrl}/api/v1/apps/agents/${encodeURIComponent(app.id)}/ag-ui/`,
      agentId: app.id,
      authToken: token,
    },
  };
}

/** The application's face, as the floating chat's button and header draw it. */
function Face({ emoji }: { emoji: string }): JSX.Element {
  return (
    <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
      {emoji}
    </span>
  );
}

type FloatingProps = {
  app: AppSpec;
  view: 'floating-small' | 'panel' | 'assistant';
  colorMode: 'light' | 'dark';
  /** The accent and face inside the conversation. */
  themeOverrides: ThemeOverrides;
  /** The assistant's character, in the assistant mode. */
  character?: AssistantCharacter | AssistantCharacterData;
};

/** The bubble, the panel and the assistant: `ChatFloating` in that mode. */
function FloatingChat({
  app,
  view,
  colorMode,
  themeOverrides,
  character,
  agent,
}: FloatingProps & { agent: AgentEndpoint }): JSX.Element {
  const welcome = app.interface.welcome || app.description;
  return (
    <ChatFloating
      // A new agent is a new conversation.
      key={agent.protocol?.endpoint ?? 'waiting'}
      defaultViewMode={view}
      {...(character ? { assistantCharacter: character } : {})}
      protocol={agent.protocol}
      authToken={agent.protocol?.authToken}
      title={app.name}
      description={welcome}
      brandIcon={<Face emoji={app.emoji} />}
      buttonIcon={<Face emoji={app.emoji} />}
      buttonTooltip={`Talk to ${app.name}`}
      suggestions={app.interface.starters.map(starter => ({
        title: starter.label,
        message: starter.message,
      }))}
      themeVariant="loop"
      themeOverrides={themeOverrides}
      colorMode={colorMode}
      showTokenUsage={false}
      showSettingsButton={false}
      showPoweredBy={false}
      useStore={false}
      launching={!agent.protocol && !agent.error}
      launchingMessage={agent.waiting}
      disabled={Boolean(agent.error)}
      disableReason={agent.error}
    />
  );
}

/** Floating, its agent on the host's agent-runtimes server. */
function ServerFloating({
  serverUrl,
  ...props
}: FloatingProps & { serverUrl: string }): JSX.Element {
  return (
    <FloatingChat {...props} agent={useServerAgent(props.app, serverUrl)} />
  );
}

/** Floating, its agent on a Datalayer runtime. */
function DatalayerFloating({
  instance,
  ...props
}: FloatingProps & { instance?: AppInstance }): JSX.Element {
  return (
    <FloatingChat {...props} agent={useDatalayerAgent(props.app, instance)} />
  );
}

/**
 * Overlays — menus, dialogs — drawn inside the embed's own root, under the
 * theme's element, so that they wear its theme: what the element asks for,
 * since Primer's own portal root is in the host's `<body>`, outside the
 * shadow root and its styles.
 */
function OwnPortalRoot(): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) {
      registerPortalRoot(ref.current);
    }
  }, []);
  return <div ref={ref} className="datalayer-app-portal" />;
}

/** The visitor's system mode, followed while it changes. */
function useSystemMode(): 'light' | 'dark' {
  const query =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  const [dark, setDark] = useState(Boolean(query?.matches));
  useEffect(() => {
    if (!query) {
      return undefined;
    }
    const follow = () => setDark(query.matches);
    query.addEventListener?.('change', follow);
    return () => query.removeEventListener?.('change', follow);
  }, [query]);
  return dark ? 'dark' : 'light';
}

/** The `loop` theme, with the application's (or the host's) accent and face. */
export function EmbedThemed({
  accent,
  colorMode,
  font,
  children,
  style,
}: {
  accent: AppAccent;
  colorMode: 'light' | 'dark';
  font?: string;
  children: ReactNode;
  style?: CSSProperties;
}): JSX.Element {
  const themeStyles = useMemo(
    () => embedThemeStyles({ accent, font }),
    [accent, font],
  );
  return (
    /*
     * Marked as themed above the provider, so that the provider counts
     * itself nested and leaves the host's <body> and Primer's portal root
     * alone: it would otherwise write the theme's tokens, colour and face on
     * the host's page (T-13). A wrapper of no box.
     */
    <div data-color-mode={colorMode} style={{ display: 'contents' }}>
      <DatalayerThemeProvider
        colorMode={colorMode}
        theme={loopTheme}
        themeStyles={themeStyles}
        baseStyles={style}
      >
        {children}
      </DatalayerThemeProvider>
    </div>
  );
}

export function AppEmbed({
  app,
  mode,
  accent,
  colorMode = 'auto',
  font,
  serverUrl,
  instance,
  height = 640,
  ownPortal = false,
  plugins = NO_PLUGINS,
}: AppEmbedProps): JSX.Element {
  const system = useSystemMode();
  const resolvedMode = colorMode === 'auto' ? system : colorMode;
  const shownAs = mode ?? app.deployment.embedded?.mode ?? 'inline';
  const view = floatingViewOf(shownAs);
  const worn = accent ?? app.interface.accent;
  const themeOverrides = useMemo(
    () => embedThemeOverrides({ accent: worn, font }),
    [worn, font],
  );
  const named = app.interface.assistant;
  const assistant = useMemo(
    () =>
      view === 'assistant' ? embedAssistantCharacter(app, plugins) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, named, plugins],
  );
  if (assistant && 'problem' in assistant) {
    return (
      <p role="status" className="datalayer-app-said">
        {assistant.problem}
      </p>
    );
  }
  const character = assistant?.character;
  return (
    <EmbedThemed
      accent={worn}
      colorMode={resolvedMode}
      font={font}
      style={
        view
          ? // Floating: nothing in the page's flow, nothing painted behind.
            { backgroundColor: 'transparent' }
          : { height, display: 'flex', flexDirection: 'column' }
      }
    >
      {ownPortal ? <OwnPortalRoot /> : null}
      {view && serverUrl ? (
        <ServerFloating
          app={app}
          view={view}
          serverUrl={serverUrl}
          colorMode={resolvedMode}
          themeOverrides={themeOverrides}
          character={character}
        />
      ) : view ? (
        <DatalayerFloating
          app={app}
          view={view}
          instance={instance}
          colorMode={resolvedMode}
          themeOverrides={themeOverrides}
          character={character}
        />
      ) : (
        <AppRenderer
          app={app}
          target={serverUrl ? 'local' : 'datalayer'}
          {...(serverUrl ? { serverUrl } : {})}
          instance={instance}
          // The host's accent and face over the application's own, inside
          // its conversation too.
          themeOverrides={themeOverrides}
        />
      )}
    </EmbedThemed>
  );
}

export default AppEmbed;
