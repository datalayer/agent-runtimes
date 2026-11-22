/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-agent-presentation` — what the application is,
 * from its own spec, in the workspace's left panel (`LoopSlots.leftPanel`):
 * its emoji and name, and its spec's `presentation`, one Markdown document
 * (`AgentPresentation`). A host adds it to the application it shows
 * (`<AIApplication renderer={{ plugins: [AgentPresentationPlugin] }} />`);
 * no Appspec names it.
 *
 * The panel is the shell's: closed to start with, opened by its icon button
 * in the chat's title bar, beside the chat on a wide screen and over it on a
 * phone. This plugin names the toggle and says whether there is anything to
 * show: an application whose spec says no presentation has no toggle and no
 * panel, and the host writes no words in its place. Open, the toggle is gone
 * and the plugin's own Close cross closes it: an X icon button at the
 * panel's top right, level with the heading, named *Close*, which calls the
 * shell's `close` — the one Close control of the panel (`panel.closes`), the
 * shell drawing none.
 *
 * `AgentPresentationPlugin` opens an address of the site by navigating to
 * it; `agentPresentationPlugin({ open, visual })` makes one that lets the
 * host open its addresses its own way first (a docs panel) and put an icon
 * before a link. Make it once, outside a render: a new plugin restarts the
 * workspace. The panel's code loads on its first opening.
 *
 * @module apps/plugins/agent-presentation
 */

import { lazy, Suspense, type JSX } from 'react';
import { IconButton } from '@primer/react';
import { XIcon } from '@primer/octicons-react';
import { SkeletonText } from '@primer/react/experimental';
import { Box } from '@datalayer/primer-addons';
import { definePlugin } from '@datalayer/reactor';
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import type { AppSpec } from '../../../types/agentspecs';
import { LoopSlots } from '../../core';
import type {
  LoopLeftPanelComponent,
  LoopLeftPanelProps,
} from '../../shell/LeftPanel';
import type { PresentationLinks } from './AgentPresentation';

export type { PresentationLinks } from './AgentPresentation';
export {
  actionsOf,
  isNote,
  isSiteLink,
  type MarkdownNode,
  type PresentationAction,
} from './presentationBlocks';

export const AGENT_PRESENTATION_PLUGIN_NAME =
  '@datalayer/loop-plugin-agent-presentation';

/** Loaded when the panel first opens, not with the page. */
const AgentPresentation = lazy(() => import('./AgentPresentation'));

/** The application's presentation, as its spec says it; none when it says none. */
export const presentationOf = (
  application: Pick<AppSpec, 'presentation'> | undefined,
): string => (application?.presentation ?? '').trim();

/** The toggle's name: what the panel says, of whom. */
export const presentationLabel = (
  application: Pick<AppSpec, 'name'> | undefined,
): string =>
  application?.name ? `${application.name}: what it does` : 'What it does';

/** The heading's height (the application's emoji): the Close cross is centred on it. */
export const PRESENTATION_HEADING_HEIGHT = 48;

/**
 * The panel's Close cross, at its top right, level with the heading and over
 * nothing it would push down: 32px to hit, 44px on a phone. Drawn with the
 * panel itself, not with its lazily loaded presentation, so that the focus
 * finds it when the panel opens (`data-loop-left-panel-close`).
 */
function CloseCross({ close }: { close: () => void }): JSX.Element {
  return (
    <Box
      position="absolute"
      top={0}
      right={0}
      height={PRESENTATION_HEADING_HEIGHT}
      display="flex"
      alignItems="center"
      zIndex={1}
    >
      <IconButton
        icon={XIcon}
        aria-label="Close"
        variant="invisible"
        onClick={close}
        sx={{ width: ['44px', '32px'], height: ['44px', '32px'] }}
        data-loop-left-panel-close=""
        data-agent-presentation-close=""
      />
    </Box>
  );
}

/** The left panel's component for what a host says of the links. */
export function agentPresentationComponent(
  links?: PresentationLinks,
): LoopLeftPanelComponent {
  function AgentPresentationPanel({
    application,
    close,
  }: Pick<LoopLeftPanelProps, 'application' | 'close'>): JSX.Element | null {
    const presentation = presentationOf(application);
    if (!application || !presentation) {
      return null;
    }
    return (
      <Box position="relative" data-agent-presentation-panel="">
        <CloseCross close={close} />
        <Suspense
          fallback={
            <Box
              role="status"
              aria-label={`Loading ${application.name}`}
              display="grid"
              gap={2}
            >
              <SkeletonText lines={1} />
              <SkeletonText lines={3} />
            </Box>
          }
        >
          <AgentPresentation
            emoji={application.emoji}
            name={application.name}
            presentation={presentation}
            links={links}
          />
        </Suspense>
      </Box>
    );
  }
  return {
    id: 'agent-presentation',
    slot: LoopSlots.leftPanel,
    Component: AgentPresentationPanel as LoopLeftPanelComponent['Component'],
    panel: {
      label: presentationLabel,
      when: application => presentationOf(application) !== '',
      // Its own Close cross: the shell draws none.
      closes: true,
    },
  };
}

const pluginOf = (component: LoopLeftPanelComponent) =>
  definePlugin<Record<string, never>, unknown, ReactorReactOutput>({
    name: AGENT_PRESENTATION_PLUGIN_NAME,
    displayName: 'Agent presentation',
    description:
      'What the application is, from its own spec: its presentation, in the left panel.',
    octicon: 'info',
    emoji: '\u{2139}\u{FE0F}',
    build: () => ({ components: [component] }),
  });

/** The plugin, for what a host says of the links: make it once, outside a render. */
export const agentPresentationPlugin = (links?: PresentationLinks) =>
  pluginOf(agentPresentationComponent(links));

/** The left panel's component with no word of a host's: addresses of the site navigated to. */
export const AGENT_PRESENTATION_COMPONENT = agentPresentationComponent();

/** The plugin with no word of a host's. */
export const AgentPresentationPlugin = pluginOf(AGENT_PRESENTATION_COMPONENT);

export default AgentPresentationPlugin;
