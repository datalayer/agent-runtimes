/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application, as a React component of the host's own page (the user,
 * 16 November 2026: "make sure the Application is a first class React
 * component"): what `<datalayer-app>` draws in its shadow root, drawn here
 * in the page itself — no custom element, no script of its own to load —
 * and what the element is a thin wrapper around.
 *
 *   <Application app="demo-marketer" runsOn={{ kind: 'visitor', maxTurns: 10 }} />
 *
 *   <Application
 *     app={agentAppspec(spec)}
 *     runsOn={{ kind: 'runtime', url, agentId: 'default', thread }}
 *   />
 *
 * **What** it shows (`app`): an Appspec, or a name — an example of the
 * catalogue (`web-research`), an application at its address on Datalayer
 * (`demo-marketer`), or a decision's id, framed from Datalayer's run page. A
 * name is read as the element reads one (`readVisitorApp`), a skeleton in its
 * place meanwhile, never a sentence that says it loads; what cannot be run
 * is said in one sentence, in place (fail fast).
 *
 * **Where** it runs (`runsOn`):
 *
 * - `visitor` — signed out, on the visitors' runtime beside ai-agents, with
 *   a visitor's token the chat mints from ai-inference for that one
 *   application; in agent-runtimes' anonymous mode unless
 *   `anonymous: false`: the limited preview, the turns left (`maxTurns`),
 *   the temporary key's clock, *Sign in* (`signInUrl` or `onSignIn`, or the
 *   host's own words and action in its place, `callToAction`), and
 *   what its agent would bring that needs a connection of the visitor's
 *   locked in the title bar;
 * - `runtime` — an agent already running on a runtime: a person's own
 *   (its agent-runtimes address `url`, the agent by its name there
 *   `agentId`), or an always-on deployment (no `agentId`: the
 *   application's own agent); the session to go on with (`thread`); spoken
 *   to with the signed-in person's token (core's IAM store), nothing
 *   launched;
 * - `server` — an agent-runtimes server of the host's own (`url`), with the
 *   visit's embed token when it has one;
 * - `datalayer` — launched on a Datalayer runtime with the signed-in
 *   person's credentials.
 *
 * **How** it looks: in the host's primer-addons theme (`theme: 'host'`, the
 * default) — the page's colours and mode, the application's accent over
 * them in its conversation — unless its Appspec names a theme
 * (`interface.theme`) or the host says a mode or a face; `theme: 'own'`
 * draws it in its own theme (`loop` unless it names one), as the element
 * does. Inline, it fills its container (`height`, `100%` by default); `mode`
 * floats it as a bubble, a panel or an avatar instead. `renderer` hands its
 * renderer what a host's own page adds: its plugins, the UI plugins its
 * organization turned off, its computer, the caret (Datalayer's page at an
 * application's address, `/apps/<slug>`).
 *
 * @module apps/Application
 */

import { useEffect, useMemo, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { SkeletonText } from '@primer/react/experimental';
import { Box } from '@datalayer/primer-addons';
import { coreStore } from '@datalayer/core/lib/state/substates/CoreState';
import type { Agentspec, AppSpec } from '../types/agentspecs';
import type { ResumedThread } from '../types/chat';
import type { ChatCallToAction } from '../chat/anonymous/anonymousMode';
import { getApp } from '../specs/apps';
import { emptyAppspec } from './apps/appspec';
import type { DatalayerVisitors } from './apps/visitorToken';
import { agentUiChoicesOf } from './agentUiPlugins';
import { AppEmbed, type AppEmbedProps } from './embed/AppEmbed';
import { frameInLanguage, frameSrcOf } from './embed/embedConfig';
import {
  DEFAULT_API,
  DEFAULT_INFERENCE,
  MISSING_SENTENCE,
  readVisitorApp,
  visitorsAt,
} from './embed/visitorApp';

/** Signed out, on the visitors' runtime. */
export type ApplicationVisitor = {
  kind: 'visitor';
  /**
   * ai-agents, where an address is read and beside which the visitors'
   * runtime answers: the platform's configuration unless given, else the AI
   * plane. Given, it is ai-inference's too unless `inference` says it.
   */
  api?: string;
  /** ai-inference, which mints the visitor's token. */
  inference?: string;
  /** Where Datalayer's run page is, for a decision framed: the page's origin unless given. */
  origin?: string;
  /**
   * Where the conversation runs and what the visitor's token is for, when
   * the host has read it already (the element): a name read here otherwise.
   */
  visitors?: DatalayerVisitors;
  /** The limited preview (agent-runtimes' anonymous mode); on unless false. */
  anonymous?: boolean;
  /** The turns a visitor has today, as the preview counts them. */
  maxTurns?: number;
  /** Where *Sign in* goes. */
  signInUrl?: string;
  /** What *Sign in* does, in place of `signInUrl`. */
  onSignIn?: () => void;
  /**
   * The preview's call to action in the host's words, in place of *Sign in*:
   * for a viewer the host knows is signed in, who tries the demo on the
   * visitors' runtime all the same (*Open your own Shopper*).
   */
  callToAction?: ChatCallToAction;
  /**
   * The application is one of this bundle's (a demo agent of the landing):
   * drawn from the catalogue this bundle carries, never from a deployment's
   * copy — one the bundle does not carry is refused in a sentence rather
   * than read from elsewhere (`readVisitorApp`'s `bundled`).
   */
  bundled?: boolean;
};

/** A person's own agent, already running on a runtime of theirs. */
export type ApplicationRuntime = {
  kind: 'runtime';
  /** The runtime's agent-runtimes address (`…/agent-runtimes/<pool>/<name>`). */
  url: string;
  /**
   * The agent that answers, by its name on that runtime (`default`): a
   * person's own agent, made from its agentspec. Unsaid, the application's
   * own agent, made there under its id — an always-on deployment.
   */
  agentId?: string;
  /** The runtime's name. */
  name?: string;
  /** The session to go on with: one it holds, or one resumed onto it (`fromRuntime`). */
  thread?: ResumedThread;
};

/** An agent-runtimes server of the host's own. */
export type ApplicationServer = {
  kind: 'server';
  url: string;
  /** The visit's embed token. */
  embedToken?: string;
};

/** Launched on a Datalayer runtime, with the signed-in person's credentials. */
export type ApplicationDatalayer = {
  kind: 'datalayer';
  /** A conversation to go on with, read from its runtime (`fromRuntime`): one opened from the person's history. */
  thread?: ResumedThread;
};

export type ApplicationRunsOn =
  | ApplicationVisitor
  | ApplicationRuntime
  | ApplicationServer
  | ApplicationDatalayer;

/** What a name, or an Appspec, comes to where it runs. */
export type ResolvedApplication =
  /** An Appspec to draw; with `visitors`, on the visitors' runtime. */
  | { kind: 'spec'; app: AppSpec; visitors?: DatalayerVisitors }
  /** A decision: Datalayer's run page, framed. */
  | { kind: 'frame'; src: string }
  /** Not run, and why, in a sentence. */
  | { kind: 'said'; text: string }
  /** Nothing at the address: said to the person in one sentence, the detail to the developer. */
  | { kind: 'missing'; detail: string };

/** ai-agents for a visitor: the host's, else the platform's, else the AI plane's. */
export function visitorApiOf(runsOn: Pick<ApplicationVisitor, 'api'>): string {
  return (
    runsOn.api ||
    coreStore.getState().configuration?.aiAgentsUrl ||
    DEFAULT_API
  ).replace(/\/+$/, '');
}

/**
 * ai-inference for a visitor: the host's, else its `api` (as the element's
 * `api` attribute is both), else the platform's, else the AI plane's — never
 * the control plane, where none answers.
 */
export function visitorInferenceOf(
  runsOn: Pick<ApplicationVisitor, 'api' | 'inference'>,
): string {
  return (
    runsOn.inference ||
    runsOn.api ||
    coreStore.getState().configuration?.aiInferenceUrl ||
    DEFAULT_INFERENCE
  ).replace(/\/+$/, '');
}

const pageOrigin = (): string =>
  typeof window === 'undefined' ? '' : window.location.origin;

/**
 * What an Appspec comes to where it runs, at once: for a visitor, on the
 * visitors' runtime — the one the host read, else the example's of its id.
 */
export function resolvedSpec(
  app: AppSpec,
  runsOn: ApplicationRunsOn,
): ResolvedApplication {
  if (runsOn.kind !== 'visitor') {
    return { kind: 'spec', app };
  }
  return {
    kind: 'spec',
    app,
    visitors:
      runsOn.visitors ??
      visitorsAt(
        visitorApiOf(runsOn),
        app.id,
        undefined,
        visitorInferenceOf(runsOn),
      ),
  };
}

/**
 * Read what a named application is where it runs: for a visitor, as the
 * element reads one (`readVisitorApp`: an example kept warm, an address open
 * to visitors, a decision framed, a refusal said); elsewhere, an
 * application of the catalogue by its id.
 */
export async function resolveApplication({
  app,
  runsOn,
  fetcher,
}: {
  app: AppSpec | string;
  runsOn: ApplicationRunsOn;
  fetcher?: typeof fetch;
}): Promise<ResolvedApplication> {
  if (typeof app !== 'string') {
    return resolvedSpec(app, runsOn);
  }
  if (runsOn.kind === 'visitor') {
    const visitor = await readVisitorApp({
      api: visitorApiOf(runsOn),
      inference: visitorInferenceOf(runsOn),
      app,
      ...(runsOn.bundled ? { bundled: true } : {}),
      ...(fetcher ? { fetcher } : {}),
    });
    if (visitor.kind === 'decision') {
      return {
        kind: 'frame',
        src: frameSrcOf(runsOn.origin || pageOrigin(), visitor.app),
      };
    }
    if (visitor.kind === 'said' || visitor.kind === 'missing') {
      return visitor;
    }
    return { kind: 'spec', app: visitor.app, visitors: visitor.visitors };
  }
  const found = getApp(app.trim());
  return found
    ? { kind: 'spec', app: found }
    : {
        kind: 'said',
        text: `“${app}” is not an application of the catalogue: give its Appspec.`,
      };
}

/**
 * A person's own agent as an application (the Personal page): a chat whose
 * name, face, welcome, starters and UI are its agentspec's, answered by the
 * agent made from that spec on the person's runtime — nothing of its own
 * enforced there, since the runtime runs the agent as its spec says.
 */
export function agentAppspec(
  spec: Pick<
    Agentspec,
    | 'id'
    | 'name'
    | 'description'
    | 'emoji'
    | 'welcomeMessage'
    | 'suggestions'
    | 'presentation'
  >,
): AppSpec {
  const app = emptyAppspec('chat');
  app.id = spec.id;
  app.name = spec.name;
  app.description = spec.description;
  app.agent = spec.id;
  app.owner = 'Datalayer <info@datalayer.io>';
  if (spec.emoji) {
    app.emoji = spec.emoji;
  }
  // How it presents itself, for a host that adds a panel for it (`LoopSlots.leftPanel`).
  if (spec.presentation) {
    app.presentation = spec.presentation;
  }
  app.interface.layout = 'chat';
  app.interface.welcome = spec.welcomeMessage || spec.description;
  app.interface.starters = (spec.suggestions ?? []).map(suggestion => ({
    label: suggestion.summary || suggestion.text,
    message: suggestion.text,
  }));
  // Its own UI and that of the MCP servers, skills and tools it uses: the
  // Marketer's post previews, *Sign in to LinkedIn* (15 November 2026).
  app.ui = [...app.ui, ...agentUiChoicesOf(spec.id)];
  return app;
}

export type ApplicationProps = Pick<
  AppEmbedProps,
  | 'mode'
  | 'accent'
  | 'colorMode'
  | 'font'
  | 'language'
  | 'speech'
  | 'host'
  | 'plugins'
  | 'ownPortal'
  | 'resume'
  | 'instance'
  | 'renderer'
> & {
  /** The application: an Appspec, a catalogue example's id, an address on Datalayer, or a decision's id. */
  app: AppSpec | string;
  /** Where it runs. */
  runsOn: ApplicationRunsOn;
  /** In the host's primer-addons theme (the default), or in its own (the element's). */
  theme?: 'host' | 'own';
  /** Inline, its height: it fills its container (`100%`) unless given. */
  height?: number | string;
  /** What holds its place while a name is read; a skeleton unless given. */
  skeleton?: ReactNode;
};

/** The skeleton of a conversation while its application is read. */
export function ApplicationSkeleton({
  height = '100%',
}: {
  height?: number | string;
}): JSX.Element {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading the application"
      className="datalayer-app-waiting"
      style={{
        height,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        boxSizing: 'border-box',
      }}
      data-application-skeleton=""
    >
      <SkeletonText lines={1} />
      <SkeletonText lines={3} />
      <SkeletonText lines={2} />
    </div>
  );
}

/**
 * Where no application is at the address: one sentence, centred in the
 * application's frame in the theme's muted ink — no internal name, no
 * prefix. The detail (which examples are kept for visitors, the embed
 * token) goes to the developer, in the console.
 */
export function ApplicationMissing({
  height,
  detail,
}: {
  height: number | string;
  detail: string;
}): JSX.Element {
  useEffect(() => {
    console.warn(detail);
  }, [detail]);
  return (
    <Box
      role="status"
      className="datalayer-app-missing"
      height={height}
      minHeight="160px"
      p={3}
      display="flex"
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      color="fg.muted"
      fontSize={1}
      sx={{ boxSizing: 'border-box' }}
      data-application-missing=""
    >
      {MISSING_SENTENCE}
    </Box>
  );
}

export function Application({
  app,
  runsOn,
  theme = 'host',
  height = '100%',
  skeleton,
  ...look
}: ApplicationProps): JSX.Element {
  // An Appspec is drawn at once; a name is read first.
  const given = typeof app === 'string' ? undefined : app;
  const named = typeof app === 'string' ? app : '';
  // Where it runs, by what it is: a host that writes it inline must not read it again.
  const where = JSON.stringify({ ...runsOn, onSignIn: undefined });
  const atOnce = useMemo(
    () => (given ? resolvedSpec(given, runsOn) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [given, where],
  );
  const [read, setRead] = useState<{
    key: string;
    resolved: ResolvedApplication;
  }>();
  const key = `${named}\n${where}`;
  useEffect(() => {
    if (!named) {
      return undefined;
    }
    let current = true;
    resolveApplication({ app: named, runsOn })
      .catch((error: unknown): ResolvedApplication => ({
        kind: 'said',
        text: error instanceof Error ? error.message : String(error),
      }))
      .then(resolved => {
        if (current) {
          setRead({ key, resolved });
        }
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const resolved = atOnce ?? (read?.key === key ? read.resolved : undefined);
  if (!resolved) {
    return <>{skeleton ?? <ApplicationSkeleton height={height} />}</>;
  }
  if (resolved.kind === 'missing') {
    return <ApplicationMissing height={height} detail={resolved.detail} />;
  }
  if (resolved.kind === 'said') {
    return (
      <p role="status" className="datalayer-app-said">
        {resolved.text}
      </p>
    );
  }
  if (resolved.kind === 'frame') {
    return (
      <iframe
        className="datalayer-app-frame"
        src={frameInLanguage(resolved.src, look.language)}
        title="Datalayer app"
        style={{ width: '100%', height, border: 0 }}
        allow="clipboard-write"
      />
    );
  }
  const visitor = runsOn.kind === 'visitor' ? runsOn : undefined;
  const anonymous = Boolean(visitor && visitor.anonymous !== false);
  return (
    <AppEmbed
      app={resolved.app}
      {...look}
      height={height}
      followHost={theme === 'host'}
      {...(resolved.visitors ? { visitors: resolved.visitors } : {})}
      {...(visitor && anonymous
        ? {
            runAsAnonymous: true,
            ...(visitor.maxTurns ? { maxTurns: visitor.maxTurns } : {}),
            ...(visitor.signInUrl ? { signInUrl: visitor.signInUrl } : {}),
            ...(visitor.onSignIn ? { onSignIn: visitor.onSignIn } : {}),
            ...(visitor.callToAction
              ? { callToAction: visitor.callToAction }
              : {}),
          }
        : {})}
      {...(runsOn.kind === 'runtime'
        ? {
            kept: {
              url: runsOn.url.replace(/\/+$/, ''),
              ...(runsOn.name ? { name: runsOn.name } : {}),
            },
            ...(runsOn.agentId ? { agentId: runsOn.agentId } : {}),
            ...(runsOn.thread ? { thread: runsOn.thread } : {}),
          }
        : {})}
      {...(runsOn.kind === 'datalayer' && runsOn.thread
        ? { thread: runsOn.thread }
        : {})}
      {...(runsOn.kind === 'server'
        ? {
            serverUrl: runsOn.url,
            ...(runsOn.embedToken ? { embedToken: runsOn.embedToken } : {}),
          }
        : {})}
    />
  );
}

export default Application;
