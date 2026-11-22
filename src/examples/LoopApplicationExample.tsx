/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An extensible AI application: `AIApplication`, the React component that
 * draws an application in the host's own page, given an Appspec, where it
 * runs, and the plugins the host adds to it.
 *
 * - **What** it shows: an Appspec written here (Web Research of the
 *   catalogue, renamed, with a presentation of its own), or a catalogue
 *   application by its id (`web-research`), read before it is drawn.
 * - **Where** it runs: where the examples' header says (its runtime target,
 *   no selector of this page's own). *Local* is the local agent-runtimes
 *   server (`npm run examples` starts it on :8765; `runsOn: { kind: 'server' }`),
 *   *Datalayer* a runtime launched on Datalayer with the examples'
 *   credentials (`runsOn: { kind: 'datalayer' }`). `AIApplication` has no
 *   browser or bare Jupyter mode: on *Browser* or *Jupyter*, the page says to
 *   pick *Local* or *Datalayer*.
 * - **What it is made of**: the plugins it composes, each named in the page
 *   and shown by the plugins manager (the plug button in the chat's footer,
 *   the `plugin-manager` UI plugin that every application has unless its spec
 *   leaves it out), which lists every plugin the workspace runs and switches
 *   them on and off:
 *   - from the Appspec: the chat and its UI plugins, the plugins manager
 *     (named in the Appspec here), the Composer portal;
 *   - added by this page (`renderer.plugins`, made once, outside a render —
 *     a new plugin restarts the workspace): the library's
 *     `AgentPresentationPlugin`, which fills the left panel with the
 *     Appspec's `presentation`, and a plugin of this example's own, written
 *     with Reactor's `definePlugin`: a chip in the chat's title bar
 *     (`LoopSlots.chatHeader`) and a right panel (`LoopSlots.rightPanel`)
 *     that lists the plugins the workspace runs (`listPlugins` of the
 *     page's Reactor platform) and what the application is made of
 *     (`useWorkspaceApplication`).
 *
 * @module examples/LoopApplicationExample
 */

import React, { useMemo, useState } from 'react';
import { Heading, Label, SegmentedControl, Text } from '@primer/react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { definePlugin } from '@datalayer/reactor';
import {
  useOptionalReactorPlatform,
  type ReactorReactOutput,
} from '@datalayer/reactor/react';
import { AIApplication, type AIApplicationRunsOn } from '../apps/AIApplication';
import { LoopSlots } from '../apps/core';
import { AgentPresentationPlugin } from '../apps/plugins/agent-presentation';
import { useWorkspaceApplication } from '../apps/plugins/composer-portal';
import { PLUGIN_MANAGER } from '../apps/apps/appspec';
import { APP_CATALOGUE } from '../specs/apps';
import type { AppSpec } from '../types/agentspecs';
import { ThemedProvider } from './utils/themedProvider';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import {
  runtimeTargetCapabilities,
  useRuntimeTargetStore,
  type ExampleRuntimeTarget,
} from './utils/runtimeTargetStore';

setupPrimerPortals();

/** Web Research of the catalogue, as this page's own application: a new name, a presentation, the plugins manager named. */
function ownAppspec(): AppSpec {
  const base = APP_CATALOGUE['web-research'];
  return {
    ...base,
    id: 'extensible-research',
    name: 'Extensible Research',
    emoji: '🧩',
    // Every application has the plugins manager unless its spec leaves it
    // out; named here to say it, in the chat's footer.
    ui: [
      ...base.ui.filter(choice => choice.plugin !== PLUGIN_MANAGER),
      { plugin: PLUGIN_MANAGER, placement: 'footer' },
    ],
    presentation: [
      'Researches a question on the web and answers with its sources, drawn by `AIApplication` with the plugins this page adds.',
      '',
      '- The left panel is the library’s presentation plugin',
      '- The plug button in the chat’s footer is the plugins manager: every plugin the application runs, switched on and off',
      '- The chip in the title bar and the right panel are this example’s own plugin',
      '',
      '*Open the right panel to see the plugins the workspace runs.*',
      '',
      '**[Read the AIApplication guide](https://agent-runtimes.datalayer.tech/apps/ai-application)**',
    ].join('\n'),
  };
}

/** A chip in the chat's title bar: the host's plugin is in the workspace. */
function ExtendedChip(): React.JSX.Element {
  return (
    <Label variant="accent" data-example-extended-chip="">
      Extended
    </Label>
  );
}

/** A right panel: the plugins the workspace runs, and what the application is made of. */
function Anatomy(): React.JSX.Element {
  const application = useWorkspaceApplication();
  const platform = useOptionalReactorPlatform();
  const plugins = platform?.listPlugins() ?? [];
  if (!application) {
    return (
      <Text sx={{ color: 'fg.muted' }}>No application in the workspace.</Text>
    );
  }
  const rows: Array<[string, string]> = [
    ['Id', application.id],
    ['Agent', String(application.agent || '—')],
    ['Layout', String(application.interface.layout || '—')],
    ['Starters', String(application.interface.starters?.length ?? 0)],
    [
      'UI plugins',
      (application.ui ?? []).map(choice => choice.plugin).join(', ') || '—',
    ],
  ];
  return (
    <Box display="grid" gap={2} p={3} data-example-anatomy="">
      <Heading as="h3" sx={{ fontSize: 2, m: 0 }}>
        {application.emoji} {application.name}
      </Heading>
      {rows.map(([name, value]) => (
        <Box key={name} display="grid" gridTemplateColumns="96px 1fr" gap={2}>
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>{name}</Text>
          <Text sx={{ fontSize: 1, wordBreak: 'break-word' }}>{value}</Text>
        </Box>
      ))}
      <Heading as="h4" sx={{ fontSize: 1, m: 0, mt: 2 }}>
        The {plugins.length} plugins the workspace runs
      </Heading>
      <Box
        as="ul"
        m={0}
        pl={3}
        sx={{ fontSize: 0, fontFamily: 'mono' }}
        data-example-plugins=""
      >
        {plugins.map(name => (
          <li key={name}>{name}</li>
        ))}
      </Box>
      <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
        The plug button in the chat’s footer opens the plugins manager: the same
        list, each with its switch.
      </Text>
    </Box>
  );
}

/** This example's own plugin: two components in the workspace's slots. */
const AnatomyPlugin = definePlugin<
  Record<string, never>,
  unknown,
  ReactorReactOutput
>({
  name: '@datalayer/example-plugin-anatomy',
  displayName: 'Anatomy',
  description:
    'A chip in the title bar, and a right panel that lists the plugins the workspace runs.',
  octicon: 'telescope',
  emoji: '\u{1F52D}',
  build: () => ({
    components: [
      {
        slot: LoopSlots.chatHeader,
        id: 'anatomy-chip',
        Component: ExtendedChip as never,
      },
      {
        slot: LoopSlots.rightPanel,
        id: 'anatomy-panel',
        Component: Anatomy as never,
        panel: { label: 'What it is made of' },
      },
    ],
  }),
});

/** What the host adds, made once: a new plugin on a render would restart the workspace. */
const RENDERER = { plugins: [AgentPresentationPlugin, AnatomyPlugin] };

/** The plugins the application composes, as the page names them. */
const COMPOSED: Array<[string, string]> = [
  [
    'From its Appspec',
    'the chat and its UI plugins, the plugins manager, the Composer portal',
  ],
  [
    'Added by this page',
    'AgentPresentationPlugin (left panel), AnatomyPlugin (title-bar chip, right panel)',
  ],
];

/** Where the header's target runs an `AIApplication`; none where it has no mode for it. */
const runsOnOf = (
  target: ExampleRuntimeTarget,
): AIApplicationRunsOn | undefined =>
  target === 'local'
    ? { kind: 'server', url: resolveExampleAgentRuntimesUrl('local') }
    : target === 'datalayer'
      ? { kind: 'datalayer' }
      : undefined;

type What = 'own' | 'catalogue';

const LoopApplicationExample: React.FC = () => {
  // Where it runs is the examples' header's choice: one control for the page.
  const target = useRuntimeTargetStore(state => state.target);
  const [what, setWhat] = useState<What>('own');
  const own = useMemo(ownAppspec, []);
  const app = what === 'own' ? own : 'web-research';
  const runsOn = useMemo(() => runsOnOf(target), [target]);
  return (
    <ThemedProvider>
      {/* The viewport's height, no more: the chat's prompt and footer stay in view. */}
      <Box
        height="100%"
        minHeight={0}
        overflow="hidden"
        display="flex"
        flexDirection="column"
      >
        <Box
          flex="0 0 auto"
          display="flex"
          flexWrap="wrap"
          alignItems="center"
          columnGap={3}
          rowGap={1}
          px={3}
          py={2}
          borderBottom="1px solid"
          borderColor="border.default"
        >
          <Text sx={{ fontWeight: 'bold' }}>AIApplication</Text>
          <SegmentedControl
            aria-label="What it shows"
            size="small"
            onChange={index => setWhat(index === 0 ? 'own' : 'catalogue')}
          >
            <SegmentedControl.Button selected={what === 'own'}>
              Appspec written here
            </SegmentedControl.Button>
            <SegmentedControl.Button selected={what === 'catalogue'}>
              Catalogue: web-research
            </SegmentedControl.Button>
          </SegmentedControl>
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            Runs on: {runtimeTargetCapabilities(target).label}
          </Text>
          <Text
            as="p"
            sx={{ fontSize: 1, m: 0, flexBasis: '100%' }}
            data-example-composed=""
          >
            {COMPOSED.map(([where, names], index) => (
              <React.Fragment key={where}>
                {index > 0 ? ' · ' : null}
                <Text sx={{ color: 'fg.muted' }}>{where}: </Text>
                {names}
              </React.Fragment>
            ))}
          </Text>
        </Box>
        <Box
          flex="1 1 0"
          minHeight={0}
          display="flex"
          flexDirection="column"
          data-example-ai-application=""
        >
          {runsOn ? (
            // Keyed by what and where: another of either is another application.
            <AIApplication
              key={`${what}-${target}`}
              app={app}
              runsOn={runsOn}
              renderer={RENDERER}
            />
          ) : (
            <Text as="p" sx={{ p: 3, color: 'fg.muted' }} role="status">
              An AIApplication runs on an agent-runtimes server or on a
              Datalayer runtime: pick Local or Datalayer in the header.
            </Text>
          )}
        </Box>
      </Box>
    </ThemedProvider>
  );
};

export default LoopApplicationExample;
