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
 * The three floating modes are `ChatFloating`'s chrome around the same
 * `AppRenderer` (R-01): the application's preset per kind and its layout in
 * the window, its agent created with its spec in its payload and spoken to
 * at its session endpoint (R-04), so the runtime enforces its rules there as
 * it does inline; the chrome told by the workspace what it is doing and
 * what it last said, for the balloon and the blink.
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
import { Text, registerPortalRoot } from '@primer/react';
import { useIAMStore } from '@datalayer/core/lib/state/substates/IAMState';
import { FluentEmoji } from '@datalayer/core/lib/components/emoji';
import { DatalayerThemeProvider, loopTheme } from '@datalayer/primer-addons';
import type { AppAccent, AppEmbedMode, AppSpec } from '../../types/agentspecs';
import type { ThemeOverrides } from '../../types/chat';
import type { AssistantCharacter } from '../../chat/assistant/characters';
import type { AssistantCharacterData } from '../../chat/assistant/formats/types';
import { ChatFloating } from '../../chat/ChatFloating';
import type { PresenceState } from '../../chat/presence/presenceStatus';
import {
  AppRenderer,
  type AppInstance,
  type AppRendererProps,
} from '../apps/AppRenderer';
import type { ChatSaid } from '../plugins/chat';
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
  /**
   * The embed token the host's server was issued for this visit (LOOP R-20):
   * what the chat speaks to the application's session with on the
   * agent-runtimes server that runs its deployment (`serverUrl`). It runs a
   * session of that deployment, and reaches nothing else.
   */
  embedToken?: string;
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

/** What a floating application says to a visitor Datalayer does not know. */
export const signedOutSentence = (app: Pick<AppSpec, 'name'>): string =>
  `${app.name} runs on Datalayer, which needs you signed in. An application embedded for visitors who are not needs its embed token (LOOP D-14), or an agent-runtimes server of the host's own (the "server" attribute).`;

/** The application's face, as the floating window's button and header draw it. */
function Face({ emoji }: { emoji: string }): JSX.Element {
  // In Fluent Emoji, at a line's size (T-19, T-20).
  return <FluentEmoji emoji={emoji} size={20} label="" />;
}

export type AppFloatingProps = {
  app: AppSpec;
  view: 'floating-small' | 'panel' | 'assistant';
  colorMode: 'light' | 'dark';
  /** The accent and face inside the conversation. */
  themeOverrides: ThemeOverrides;
  /** The assistant's character, in the assistant mode. */
  character?: AssistantCharacter | AssistantCharacterData;
  /** The host's agent-runtimes server, when it names one. */
  serverUrl?: string;
  instance?: AppInstance;
  /** The visit's embed token, on the host's server (R-20). */
  embedToken?: string;
  /**
   * What else the host gives the application's `AppRenderer`: Datalayer's
   * own page at an application's address (T-21) passes the UI plugins its
   * organization turned off, the visitors' runtime and the one kept on.
   */
  renderer?: Partial<
    Pick<AppRendererProps, 'pluginsOff' | 'datalayerVisitors' | 'datalayerKept'>
  >;
};

/**
 * The bubble, the panel and the assistant: `ChatFloating`'s chrome in that
 * mode — the button, its blink and its balloon, the panel at the edge, the
 * character dragged about and sent away — holding the application as
 * `AppRenderer` draws it inline (R-01): its kind's preset, its layout, its
 * agent created with its spec and spoken to at its session endpoint (R-04).
 * The workspace tells the chrome what the application is doing and what it
 * last said (`onPresence`, `onSaying`).
 */
export function AppFloating({
  app,
  view,
  colorMode,
  themeOverrides,
  character,
  serverUrl,
  instance,
  embedToken,
  renderer,
}: AppFloatingProps): JSX.Element {
  const [presence, setPresence] = useState<PresenceState>('idle');
  const [said, setSaid] = useState<ChatSaid>({ answering: false });
  const welcome = app.interface.welcome || app.description;
  // A runtime is somebody's to pay for: on Datalayer, only for a visitor
  // Datalayer knows — said, and nothing launched, for one it does not.
  const token = useIAMStore(state => state.token);
  // Signed out on the visitors' runtime (R-30) is somebody's too.
  const signedOut = !serverUrl && !token && !renderer?.datalayerVisitors;
  return (
    <ChatFloating
      defaultViewMode={view}
      {...(character ? { assistantCharacter: character } : {})}
      {...(app.interface.balloon
        ? { balloonDisplay: app.interface.balloon }
        : {})}
      title={app.name}
      description={welcome}
      brandIcon={<Face emoji={app.emoji} />}
      buttonIcon={<Face emoji={app.emoji} />}
      buttonTooltip={`Talk to ${app.name}`}
      colorMode={colorMode}
      useStore={false}
      conversation={{
        body: signedOut ? (
          <Text as="p" role="status" sx={{ p: 3, m: 0, fontSize: 1 }}>
            {signedOutSentence(app)}
          </Text>
        ) : (
          <AppRenderer
            app={app}
            target={serverUrl ? 'local' : 'datalayer'}
            {...(serverUrl ? { serverUrl } : {})}
            {...(serverUrl && embedToken ? { embedToken } : {})}
            instance={instance}
            // The host's accent and face over the application's own, inside
            // its conversation too, in the embed's mode.
            themeOverrides={themeOverrides}
            colorMode={colorMode}
            // The window draws its face, its name and close.
            hideChatHeader
            // Mounted closed: the caret goes in when the window opens.
            autoFocusPrompt={false}
            onPresence={setPresence}
            onSaying={setSaid}
            {...renderer}
          />
        ),
        presence,
        saying: said.saying,
        answering: said.answering,
      }}
    />
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
  embedToken,
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
      {view ? (
        <AppFloating
          app={app}
          view={view}
          serverUrl={serverUrl}
          instance={instance}
          embedToken={embedToken}
          colorMode={resolvedMode}
          themeOverrides={themeOverrides}
          character={character}
        />
      ) : (
        <AppRenderer
          app={app}
          target={serverUrl ? 'local' : 'datalayer'}
          {...(serverUrl ? { serverUrl } : {})}
          // Only on the host's server: a Datalayer runtime is launched with
          // a person's credentials, which an embed token never stands for.
          {...(serverUrl && embedToken ? { embedToken } : {})}
          instance={instance}
          // The host's accent and face over the application's own, inside
          // its conversation too, in the embed's mode: the host's or its
          // visitor's system's, not a Datalayer setting.
          themeOverrides={themeOverrides}
          colorMode={resolvedMode}
        />
      )}
    </EmbedThemed>
  );
}

export default AppEmbed;
