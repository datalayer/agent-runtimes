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
 * - **Where** it runs: the local agent-runtimes server (`npm run examples`
 *   starts it on :8765; `runsOn: { kind: 'server' }`), or a runtime launched
 *   on Datalayer with the credentials of the examples' configuration
 *   (`runsOn: { kind: 'datalayer' }`).
 * - **What the host adds** (`renderer.plugins`, made once, outside a
 *   render — a new plugin restarts the workspace): the library's
 *   `AgentPresentationPlugin`, which fills the left panel with the Appspec's
 *   `presentation`, and a plugin of this example's own, written with
 *   Reactor's `definePlugin`, that contributes two components to the
 *   workspace's slots: a chip in the chat's title bar
 *   (`LoopSlots.chatHeader`) and a right panel (`LoopSlots.rightPanel`) that
 *   says what the application is made of, read from the workspace
 *   (`useWorkspaceApplication`).
 *
 * @module examples/AIApplicationExample
 */

import React, { useMemo, useState } from 'react';
import { Heading, Label, SegmentedControl, Text } from '@primer/react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { definePlugin } from '@datalayer/reactor';
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import { AIApplication, type AIApplicationRunsOn } from '../apps/AIApplication';
import { LoopSlots } from '../apps/core';
import { AgentPresentationPlugin } from '../apps/plugins/agent-presentation';
import { useWorkspaceApplication } from '../apps/plugins/composer-portal';
import { APP_CATALOGUE } from '../specs/apps';
import type { AppSpec } from '../types/agentspecs';
import { ThemedProvider } from './utils/themedProvider';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';

setupPrimerPortals();

/** Web Research of the catalogue, as this page's own application: a new name, a presentation. */
function ownAppspec(): AppSpec {
  const base = APP_CATALOGUE['web-research'];
  return {
    ...base,
    id: 'extensible-research',
    name: 'Extensible Research',
    emoji: '🧩',
    presentation: [
      'Researches a question on the web and answers with its sources, drawn by `AIApplication` with the plugins this page adds.',
      '',
      '- The left panel is the library’s presentation plugin',
      '- The chip in the title bar is this example’s own plugin',
      '- So is the right panel, which reads the application from the workspace',
      '',
      '*Open the right panel to see what the application is made of.*',
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

/** A right panel: what the application the workspace draws is made of. */
function Anatomy(): React.JSX.Element {
  const application = useWorkspaceApplication();
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
    'A chip in the title bar, and a right panel that says what the application is made of.',
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

type Where = 'local' | 'datalayer';
type What = 'own' | 'catalogue';

const AIApplicationExample: React.FC = () => {
  const [where, setWhere] = useState<Where>('local');
  const [what, setWhat] = useState<What>('own');
  const own = useMemo(ownAppspec, []);
  const app = what === 'own' ? own : 'web-research';
  const runsOn = useMemo(
    (): AIApplicationRunsOn =>
      where === 'local'
        ? { kind: 'server', url: resolveExampleAgentRuntimesUrl('local') }
        : { kind: 'datalayer' },
    [where],
  );
  return (
    <ThemedProvider>
      <Box height="100vh" minHeight={0} display="flex" flexDirection="column">
        <Box
          display="flex"
          flexWrap="wrap"
          alignItems="center"
          gap={3}
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
          <SegmentedControl
            aria-label="Where it runs"
            size="small"
            onChange={index => setWhere(index === 0 ? 'local' : 'datalayer')}
          >
            <SegmentedControl.Button selected={where === 'local'}>
              Local server
            </SegmentedControl.Button>
            <SegmentedControl.Button selected={where === 'datalayer'}>
              Datalayer
            </SegmentedControl.Button>
          </SegmentedControl>
        </Box>
        <Box flex={1} minHeight={0} data-example-ai-application="">
          {/* Keyed by what and where: another of either is another application. */}
          <AIApplication
            key={`${what}-${where}`}
            app={app}
            runsOn={runsOn}
            renderer={RENDERER}
          />
        </Box>
      </Box>
    </ThemedProvider>
  );
};

export default AIApplicationExample;
