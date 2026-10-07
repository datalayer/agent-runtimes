/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application, rendered: the LOOP workspace configured from an Appspec
 * (LOOP R-01).
 *
 * One renderer for every place an application appears — the Studio's
 * Preview, its hosted page, an embed, the home page — so that what a builder
 * sees while building is what its users get. It is not a second shell: it is
 * `LoopEmbed`, given
 *
 * - an **application plugin** (`defineAppPlugin`): the agent that answers,
 *   created with the application in its payload — so the runtime reaches only
 *   what the application connects to and enforces its rules before every tool
 *   call — and the application's starters as the openers of the empty chat;
 * - its **layout**, as `interface.layout` says (`appLayoutOptions`, LOOP
 *   T-07), on the workspace's own `page-layout` plugin: `chat` is the
 *   conversation alone, with the A2UI surfaces its answers draw; `page` is
 *   the page on a sheet with the composer over it and the conversation in a
 *   panel the composer's display modes open; `split` is the conversation and
 *   the page side by side, a hairline between them to drag;
 * - its **page**, when it has one (`hasAppPage`: a chat, a widget or a worker
 *   with a `page` or `split` layout): its A2UI surface drawn by the
 *   `app-page` plugin, in place of the notebook and the document, fed from
 *   the conversation and answered through it (`APP_KIND_PATHS`), with the
 *   Canvas's block plugins (`CANVAS_BLOCK_PLUGINS`), whose blocks are what
 *   the page draws (R-01b);
 * - a **decision**: a workspace without a conversation whose one view is the
 *   page its host draws (`page`, R-02) — the Studio's run page, at its
 *   address and embedded;
 * - its **frame**, when the host asks (`frame`): the `window-frame` plugin's
 *   window, its title the application's face and name;
 * - its **language** (LOOP P-26): what a person reads of it — its name,
 *   welcome, starters, settings, commands, modes and profiles — in the first
 *   language they prefer that its Appspec is translated into (`language`,
 *   else the browser's), its own words otherwise (`translatedAppspec`);
 *   what it does is the same in every language;
 * - its **sidebar**, when the host asks (`sidebar`, R-01b): its rules and
 *   the approvals waiting for the person (`app-rules`), what it did
 *   (`app-activity`), and its computer, live (`app-computer`, R-23), beside
 *   its page — what its builder reads in the Studio's Preview.
 *
 * Which plugins a kind needs, and how its workspace is laid out, is one
 * function: `appPreset`, the preset per kind, as `loopPlugins` is for the
 * examples.
 *
 * @module loop/apps/AppRenderer
 */

import { useMemo, type ComponentType } from 'react';
import type { PluginRef, ReactorPlugin } from '@datalayer/reactor';
import {
  loopAccentStyles,
  useSystemColorMode,
  useThemeStore,
} from '@datalayer/primer-addons';
import type { AppSpec } from '../../types/agentspecs';
import type { ThemeOverrides } from '../../types/chat';
import { defineAgentCapacityPlugin } from '../plugins/agent-capacity';
import {
  APP_PAGE_SURFACE,
  defineAppHostPagePlugin,
  defineAppPagePlugin,
  hasAppPage,
  type AppHostPageProps,
} from '../plugins/app-page';
import {
  CANVAS_BLOCK_PLUGINS,
  canvasBlocksPluginName,
} from '../plugins/canvas-blocks';
import { LoopEmbed, type LoopEmbedProps } from '../embed/LoopEmbed';
import type { LoopPresetOptions } from '../presets';
import { dumpAppspec } from './appspec';
import { defineAppActivityPlugin } from '../plugins/app-activity';
import { AppElementsPlugin } from '../plugins/app-elements';
import {
  defineAppComponentsPlugin,
  hasCustomComponents,
} from '../plugins/app-components';
import { defineAppComputerPlugin } from '../plugins/app-computer';
import { defineAppRulesPlugin } from '../plugins/app-rules';
import type { ChatSaid } from '../plugins/chat';
import {
  defineAppComposerPlugin,
  needsAppComposer,
  startersAsOpeners,
} from './AppComposer';
import { modeEffect } from './composer';
import { preferredLanguages, translatedAppspec } from './language';
import { defineAppFeedbackPlugin } from './AppFeedback';
import { defineAppKeptPlugin } from './AppKept';
import { keepsFeedback } from './feedback';
import { keptBeforeFirstMessage } from './kept';
import type { PresenceState } from '../../chat/presence/presenceStatus';
import { ChatLanguage } from '../../chat/ChatLanguage';

/** The id of an agent or a Cog, without its version. */
export const agentIdOf = (app: Pick<AppSpec, 'agent' | 'team'>): string => {
  const reference = app.agent || app.team;
  const at = reference.lastIndexOf(':');
  return at > 0 && reference.slice(at + 1).includes('.')
    ? reference.slice(0, at)
    : reference;
};

/**
 * The plugin that makes a LOOP workspace run an application.
 *
 * The agent is created with the application's own document (`app_spec`) in
 * its payload; a runtime that knows applications configures the agent from
 * it, and one that does not creates the agent alone — the application is
 * then shown and not enforced, which is why a hosted application only runs
 * on a runtime that does.
 *
 * An application run by a team is not supported in the workspace yet: a team
 * is not an agent spec, and is refused here rather than launched as one.
 */
export function defineAppPlugin(
  app: AppSpec,
  shown: AppSpec = app,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  if (!app.agent) {
    throw new Error(
      `“${app.name}” is run by a team, which the workspace does not run as an application yet.`,
    );
  }
  return defineAgentCapacityPlugin({
    key: `app-${app.id}`,
    // What a person reads is in their language (P-26); what it is created
    // with is its own Appspec.
    displayName: shown.name,
    description: shown.description || `The ${shown.name} application`,
    specId: agentIdOf(app),
    emoji: app.emoji,
    createPayload: {
      name: app.id,
      app_spec: dumpAppspec(app),
      // Its shell is its code: Codemode's `execute_code`, only when it is on
      // (LOOP R-23), as on Datalayer (`appDatalayerCreatePayload`).
      enable_codemode: Boolean(app.permissions?.computer?.shell),
      ...(app.model ? { model: app.model } : {}),
    },
    // Its starters, each under its category (P-20); with profiles, the
    // composer offers the profile's in their place.
    suggestions: startersAsOpeners(shown.interface.starters),
    // In the page, the agent is told what a runtime tells it: its own
    // spec's prompt, then the application's instructions; on the
    // application's model when it names one (`loop/apps/agent`).
    instructions: app.instructions,
    model: app.model,
    // Its modes and its profiles (LOOP P-19, P-20), as the session API
    // applies them: the profile's instructions and those of the options
    // chosen, and the model one names, for the run they are sent with.
    ...((app.interface.modes ?? []).length > 0 ||
    (app.interface.profiles ?? []).length > 0
      ? {
          modeEffect: (chosen: Record<string, string>, profile?: string) =>
            modeEffect(app, chosen, profile),
        }
      : {}),
  });
}

/** Which instance of an application runs, as the platform knows it (LOOP R-07). */
export type AppInstance = {
  /** Its `app` item. */
  appUid?: string;
  /** The deployment it runs as, when it is one. */
  deploymentUid?: string;
  /** The version that runs. */
  version?: number;
  /**
   * The organization it belongs to: its agent keeps to that organization's
   * contexts, read by the runtime from IAM (LOOP U-31); unsaid for an
   * application of nobody's organization.
   */
  organizationUid?: string;
};

export type AppRendererProps = Omit<LoopEmbedProps, 'agentId'> & {
  /** The application to render. */
  app: AppSpec;
  /** What its record is kept under, on Datalayer: the application, its deployment. */
  instance?: AppInstance;
  /**
   * Told what the application is doing — idle, thinking, working, waiting for
   * you — for a host that draws its face in a frame of its own (T-08). A
   * stable function, such as a state setter.
   */
  onPresence?: (state: PresenceState) => void;
  /**
   * Its deployment is paused (LOOP R-17), as its host knows it: its chat
   * says *Paused* beside its face and its assistant dozes (T-08, T-22).
   */
  paused?: boolean;
  /**
   * Told what the application last said, and whether its newest words are
   * an answer — for a host that says them outside the conversation: the
   * embed's floating chrome, its balloon and its blink (R-01). A stable
   * function, such as a state setter.
   */
  onSaying?: (said: ChatSaid) => void;
  /**
   * Draw its rules and the approvals waiting for the person, and its
   * activity, beside its page (R-01b): what its builder reads in the
   * Studio's Preview. The activity is read from its record, kept under
   * `instance.appUid`.
   */
  sidebar?: boolean;
  /**
   * Draw its computer alone beside its page (R-23): what a deployment's
   * owner and the editors of its application see of it at its address — its
   * runtime shows it to them only (decided 2026-10-06). Implied by `sidebar`.
   */
  computer?: boolean;
  /**
   * Draw the application in a window (the `window-frame` plugin), its title
   * the application's face and name. A host's own `frameTitle` wins.
   */
  frame?: boolean;
  /**
   * The page a host draws for a kind the workspace has no page for: a
   * decision's (R-02). The workspace's one view. A component defined once,
   * outside the host's render: a new one would be a new plugin, and restart
   * the workspace.
   */
  page?: ComponentType<AppHostPageProps>;
  /**
   * The UI plugins its organization has turned off (`plugins_off`, catalogue
   * ids such as 'a2ui'): their blocks are off its page as they are off its
   * Canvas's palette. Compared by content.
   */
  pluginsOff?: readonly string[];
  /**
   * The language the person reads it in, as BCP 47 tags it (`fr`, `pt-BR`):
   * the platform's setting when the host knows it. The browser's languages
   * when unsaid (LOOP P-26).
   */
  language?: string;
};

/** What `interface.layout` sets on the workspace. */
export type AppLayoutOptions = Pick<
  LoopPresetOptions,
  | 'editors'
  | 'showViewSelector'
  | 'defaultEditor'
  | 'pageLayout'
  | 'pageLayoutArrangement'
  | 'pageLayoutPrompt'
  | 'pageLayoutPromptAnchor'
  | 'pageLayoutTurnPanelFooter'
>;

/**
 * The workspace an application's layout asks for (LOOP T-07).
 *
 * - `chat`: the conversation alone — no editor, no page, no strip.
 * - `page`: the page layout — its page (or, without one, the editors) on the
 *   sheet; the composer a card over it, starting at the bottom, whose display
 *   modes put it in the conversation panel beside, over or in the corner of
 *   the page; the current turn under the composer, its copy and dismiss only.
 * - `split`: the page layout's split — the conversation on the left with its
 *   composer, the page on the right, a hairline between them to drag.
 *
 * With a page, the page is the one editor, opened, without a strip to swap
 * it; without one (a decision, whose page is the Studio's), the editors stay.
 */
export function appLayoutOptions(
  app: Pick<AppSpec, 'kind' | 'interface' | 'agent'>,
): AppLayoutOptions {
  const layout = app.interface.layout;
  if (layout === 'chat') {
    return { editors: false, showViewSelector: false };
  }
  const withPage = hasAppPage(app);
  return {
    editors: !withPage,
    showViewSelector: !withPage,
    ...(withPage ? { defaultEditor: APP_PAGE_SURFACE } : {}),
    pageLayout: true,
    pageLayoutArrangement: layout === 'split' ? 'split' : 'page',
    pageLayoutPrompt: 'floating',
    pageLayoutPromptAnchor: 'bottom',
    pageLayoutTurnPanelFooter: 'actions',
  };
}

/** What a kind of application is drawn with: its plugins, and its workspace. */
export type AppPreset = {
  plugins: PluginRef[];
  workspace: AppLayoutOptions & Pick<LoopPresetOptions, 'conversation'>;
};

/**
 * The plugins an application's kind needs, and how its workspace is laid
 * out (LOOP R-01): the preset per kind, as `loopPlugins` is for the examples.
 *
 * - a **chat**, a **widget**, a **worker**: its agent (`defineAppPlugin`);
 *   its page (`app-page`) when it has one, with the Canvas's block plugins
 *   but those of the UI plugins its organization turned off (`pluginsOff`),
 *   whose contributions are the blocks it may draw (R-01b); a thumb and a
 *   comment on each answer when its record keeps feedback (V-18); its
 *   commands in the composer's `/` menu and its modes beside it (P-19); the
 *   side panel and the pages its code opens (`app-elements`, P-18); the
 *   components its developer wrote (`app-components`, P-17); what it
 *   keeps and for how long, under its prompt before the first message, when
 *   `kept` says it (R-31); with
 *   `sidebar`, its rules and approvals card, its activity feed and its
 *   computer (R-01b, R-23); with `computer`, its computer alone — at its
 *   address, for its owner and the editors of its application;
 *   laid out as `interface.layout` says;
 * - a **decision**: the page its host draws (`page`), as the one view of a
 *   workspace without a conversation (R-02).
 *
 * An application that cannot be drawn is refused with a sentence: a
 * decision without its host's page, an application run by a team.
 */
export function appPreset(
  app: AppSpec,
  options: {
    page?: ComponentType<AppHostPageProps>;
    pluginsOff?: readonly string[];
    /** Its rules and approvals, its activity and its computer, beside its page. */
    sidebar?: boolean;
    /** Its computer alone beside its page (R-23): for its owner and editors at its address. */
    computer?: boolean;
    /** What its record is kept under: its activity's. */
    appUid?: string;
    /**
     * The application as the person reads it (P-26): its words in their
     * language. Its own when unsaid.
     */
    shown?: AppSpec;
    /**
     * Say what it keeps before the first message (R-31): at its address and
     * embedded, not in its builder's Preview — to a `visitor` not signed
     * in, that nothing is kept (R-30).
     */
    kept?: { visitor: boolean };
  } = {},
): AppPreset {
  if (app.kind === 'decision') {
    if (!options.page) {
      throw new Error(
        `“${app.name}” is a decision, whose page is drawn by where it runs: none was given here.`,
      );
    }
    return {
      plugins: [defineAppHostPagePlugin(app, options.page)],
      workspace: {
        conversation: false,
        editors: false,
        showViewSelector: false,
      },
    };
  }
  const withPage = hasAppPage(app);
  const shown = options.shown ?? app;
  // The blocks its Canvas offers: those of the UI plugins not turned off.
  const off = new Set((options.pluginsOff ?? []).map(canvasBlocksPluginName));
  const blocks = CANVAS_BLOCK_PLUGINS.filter(plugin => !off.has(plugin.name));
  return {
    plugins: [
      defineAppPlugin(app, shown),
      ...(withPage ? [defineAppPagePlugin(shown), ...blocks] : []),
      // The components its developer wrote (LOOP P-17): blocks of its page
      // and renderers of its page, its elements and its answers — its own.
      ...(hasCustomComponents(app) ? [defineAppComponentsPlugin(app)] : []),
      // Its commands in the composer's `/` menu, its modes and its profiles
      // beside the composer (LOOP P-19, P-20) and what a person may attach
      // there (P-21): only for an application that has some.
      ...(needsAppComposer(app) ? [defineAppComposerPlugin(shown)] : []),
      // A thumb and a comment on each answer, kept in its record (LOOP
      // V-18): only for an application whose record keeps feedback.
      ...(keepsFeedback(app) ? [defineAppFeedbackPlugin(app)] : []),
      // What it keeps, and for how long, before anything is said (R-31).
      ...(options.kept
        ? [defineAppKeptPlugin(app, keptBeforeFirstMessage(app, options.kept))]
        : []),
      // What its builder reads beside its page (R-01b): its rules and the
      // approvals waiting, and what it did.
      ...(options.sidebar
        ? [
            defineAppRulesPlugin(app),
            defineAppActivityPlugin(app, options.appUid),
            // Its computer, live (R-23).
            defineAppComputerPlugin(app),
          ]
        : options.computer
          ? [defineAppComputerPlugin(app)]
          : []),
      // What its code opens beside the conversation (LOOP P-18): a side
      // panel, a page of its own; nothing drawn while nothing is open.
      AppElementsPlugin,
    ],
    workspace: appLayoutOptions(app),
  };
}

/**
 * What an application's agent is created with on a Datalayer runtime: under
 * the application's id, over AG-UI, with the application's own document —
 * so that the runtime registers it and decides every tool call by its rules
 * (LOOP R-03, R-05), as `loop apps run --cloud` does. One payload for every
 * place it runs, all of them the workspace (`AppRenderer`): the Studio's
 * Preview, the hosted page, and the embed inline and floating.
 */
export function appDatalayerCreatePayload(
  app: AppSpec,
  instance?: AppInstance,
): Record<string, unknown> {
  return {
    // Under the application's id, over AG-UI: what the workspace's
    // chat addresses (`AppRenderer` gives it as `agentId`).
    name: app.id,
    transport: 'ag-ui',
    agent_spec_id: agentIdOf(app),
    app_spec: dumpAppspec(app),
    // Codemode calls every tool through `execute_code`, which an
    // application without a shell is refused: its tools are called
    // one by one instead, each decided by its rules.
    enable_codemode: Boolean(app.permissions?.computer?.shell),
    ...(instance
      ? {
          app_instance: {
            app_uid: instance.appUid ?? '',
            deployment_uid: instance.deploymentUid ?? '',
            version: instance.version ?? 0,
            ...(instance.organizationUid
              ? { organization_uid: instance.organizationUid }
              : {}),
          },
        }
      : {}),
  };
}

/**
 * An application in a LOOP workspace: its agent, its starters, its layout.
 *
 * Every other prop is `LoopEmbed`'s, and wins over what the application
 * implies — a host that wants the editors beside a chat still says so.
 */
/** No host plugins: one array, so that it never reads as a change. */
/** The agentspec a runtime is allocated with before an application's agent is created on it. */
export const DATALAYER_BOOTSTRAP_AGENTSPEC = 'example-simple';

const NO_PLUGINS: PluginRef[] = [];

/**
 * The application's accent over the theme its conversation wears, in both
 * modes (LOOP T-05): its bubbles and its one button in its own colour, and
 * not in the theme's default — the chat sets its theme again inside it, so
 * what the page around it set does not reach in. The accents are `loop`'s
 * colours: over another theme (T-30) nothing is laid, the theme's own rule.
 */
export function appThemeOverrides(
  app: AppSpec,
  variant: string,
): ThemeOverrides | undefined {
  const accent = app.interface?.accent;
  return accent && variant === 'loop'
    ? {
        light: loopAccentStyles(accent, 'light'),
        dark: loopAccentStyles(accent, 'dark'),
      }
    : undefined;
}

export function AppRenderer({
  app,
  plugins = NO_PLUGINS,
  instance,
  onPresence,
  onSaying,
  paused = false,
  sidebar = false,
  computer = false,
  frame = false,
  page,
  pluginsOff,
  language,
  ...embed
}: AppRendererProps): React.JSX.Element {
  /*
   * The kind's plugins, made once per application. `LoopEmbed` rebuilds its
   * whole reactor when its plugins change, so a new plugin on every render
   * of the host would restart the running workspace. The key is the
   * application as its file holds it: a change to it is a new application.
   */
  const source = JSON.stringify(dumpAppspec(app));
  const off = [...(pluginsOff ?? [])].sort().join(',');
  /*
   * What the person reads, in their language (P-26): the host's, else the
   * browser's. Read once per language: a new one is a new workspace.
   */
  const preferred = (language ? [language] : preferredLanguages()).join(',');
  const shown = useMemo(
    () => translatedAppspec(app, preferred.split(',').filter(Boolean)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source, preferred],
  );
  /*
   * What it keeps, said before the first message (R-31): run as a
   * deployment — at its address, embedded — and not in its builder's
   * Preview; to a visitor not signed in, that nothing is kept (R-30).
   */
  const deployed = Boolean(instance?.deploymentUid);
  const visitor = Boolean(embed.datalayerVisitors);
  const preset = useMemo(
    (): AppPreset | { problem: string } => {
      try {
        return appPreset(app, {
          page,
          pluginsOff,
          sidebar,
          computer,
          appUid: instance?.appUid,
          shown,
          ...(deployed ? { kept: { visitor } } : {}),
        });
      } catch (error) {
        return {
          problem: error instanceof Error ? error.message : String(error),
        };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      source,
      shown,
      page,
      off,
      sidebar,
      computer,
      instance?.appUid,
      deployed,
      visitor,
    ],
  );
  const allPlugins = useMemo(
    () => ('problem' in preset ? plugins : [...preset.plugins, ...plugins]),
    [preset, plugins],
  );
  /*
   * On Datalayer, the application runs on a runtime: allocated with a plain
   * agentspec, its agent created there with the application's spec — so that
   * the runtime registers it and decides every tool call by its rules (LOOP
   * R-03, R-05), as `loop apps run --cloud` does.
   */
  const conversation =
    !('problem' in preset) && preset.workspace.conversation !== false;
  const datalayerCreatePayload = useMemo(
    () => (conversation ? appDatalayerCreatePayload(app, instance) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      source,
      conversation,
      instance?.appUid,
      instance?.deploymentUid,
      instance?.version,
    ],
  );
  /*
   * The theme it runs in (T-30): the one its host says, else the one its
   * Appspec names, else the page's — the person's own. Its mode likewise;
   * `auto` is the device's.
   */
  const pageTheme = useThemeStore(state => state.theme);
  const system = useSystemColorMode();
  const named = app.interface?.theme;
  const worn = embed.themeVariant ?? named?.variant ?? pageTheme;
  const namedMode: 'light' | 'dark' | undefined =
    named?.mode === 'auto'
      ? system
      : named?.mode === 'light' || named?.mode === 'dark'
        ? named.mode
        : undefined;
  const accent = app.interface?.accent;
  const themeOverrides = useMemo(
    () => appThemeOverrides(app, worn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accent, worn],
  );
  if ('problem' in preset) {
    return (
      <div role="status" style={{ padding: 16 }}>
        {preset.problem}
      </div>
    );
  }
  return (
    // The chat's own words in the person's language too (P-26): the host's,
    // else the browser's.
    <ChatLanguage language={language}>
      <LoopEmbed
        // The application's own agent: created under its id, so that its
        // spec is applied to an agent of its own, never to the one it extends.
        agentId={app.id}
        // Drawn as its kind and its layout say: the conversation alone, the
        // page with the conversation over it, the two side by side, or — a
        // decision — its host's page alone.
        {...preset.workspace}
        {...(frame
          ? {
              frameTitle: [app.emoji, shown.name].filter(Boolean).join(' '),
            }
          : {})}
        // Its rules, activity and computer on a rail, one at a time (T-07).
        sidebarRail={sidebar || computer}
        teamPicker={false}
        showAgentVariants={false}
        graph={false}
        pluginsPanel={false}
        datalayerAgentSpecId={DATALAYER_BOOTSTRAP_AGENTSPEC}
        // Where an application runs is decided by its host — the Studio's
        // Preview, the hosted page — not offered to its user.
        targetFixed
        // The theme its Appspec names (T-30), else the page's, the person's
        // own; a host may say otherwise.
        {...(named ? { themeVariant: named.variant } : {})}
        {...(namedMode ? { colorMode: namedMode } : {})}
        themeOverrides={themeOverrides}
        // Its own face, name and welcome in the chat (T-08); no counters: a
        // person using an application is not asking about tokens.
        presence={{
          name: shown.name,
          face: app.emoji,
          welcome: shown.interface.welcome || shown.description,
          paused,
          onPresence,
          onSaying,
        }}
        showTokenUsage={false}
        datalayerCreatePayload={datalayerCreatePayload}
        {...embed}
        plugins={allPlugins}
      />
    </ChatLanguage>
  );
}

export default AppRenderer;
