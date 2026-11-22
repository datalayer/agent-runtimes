/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Composer's own content, where its host contributes none
 * (`LoopSlots.composerView`): the application read three ways under one
 * switch, as the Studio's Composer tab has them — its **Canvas** (its parts:
 * who does the work, its layout, the UI it brings, how it starts), its
 * **YAML** (the Appspec written out, `writeAppspecYaml`) and its **Python**
 * (its own `app.py` when it was built in Python, otherwise the file `loop apps
 * eject` writes from its spec, as the catalogue generates it: `APP_PYTHON`).
 * Read only.
 *
 * @module apps/plugins/composer-portal/ComposerSource
 */

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { Heading, Label, SegmentedControl, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { getAgentspecs } from '../../../specs/agents';
import { APP_BUILT, APP_CATALOGUE, APP_PYTHON } from '../../../specs/apps';
import { UI_CATALOGUE } from '../../../specs/ui';
import type { AppSpec } from '../../../types/agentspecs';
import { writeAppspecYaml } from '../../apps/yaml';
import { placementOf } from '../../agentUiChoices';
import { COMPOSER_PORTAL_WORDS as WORDS } from './words';

/** The three ways to read it, in the switch's order. */
export const COMPOSER_VIEWS = ['canvas', 'spec', 'python'] as const;

export type ComposerView = (typeof COMPOSER_VIEWS)[number];

/** Its Python, and what that file is: its own, ejected from its spec, or none known here. */
export function composerPython(
  app: Pick<AppSpec, 'id'>,
): { code: string; how: 'built' | 'ejected' } | { code: null; how: 'none' } {
  const code = APP_CATALOGUE[app.id] ? APP_PYTHON[app.id] : undefined;
  if (code === undefined) {
    return { code: null, how: 'none' };
  }
  return { code, how: APP_BUILT[app.id] === 'python' ? 'built' : 'ejected' };
}

function Code({
  text,
  label,
  kind,
}: {
  text: string;
  label: string;
  kind: 'yaml' | 'python';
}): JSX.Element {
  return (
    <Box
      as="pre"
      // A region that scrolls: reached with the keyboard.
      tabIndex={0}
      aria-label={label}
      data-composer-code={kind}
      m={0}
      p={3}
      border="1px solid"
      borderColor="border.default"
      borderRadius={2}
      bg="canvas.subtle"
      overflow="auto"
      maxHeight="70vh"
      sx={{
        fontFamily: 'mono',
        fontSize: 1,
        lineHeight: 1.5,
        whiteSpace: 'pre',
      }}
    >
      {text}
    </Box>
  );
}

function Part({
  title,
  children,
}: {
  title: string;
  children: JSX.Element | JSX.Element[] | string;
}): JSX.Element {
  return (
    <Box
      as="section"
      p={3}
      border="1px solid"
      borderColor="border.default"
      borderRadius={2}
    >
      <Heading as="h3" sx={{ fontSize: 1, mt: 0, mb: 2 }}>
        {title}
      </Heading>
      {children}
    </Box>
  );
}

/** Its parts, read only: what the Canvas lays out. */
export function ComposerCanvas({ app }: { app: AppSpec }): JSX.Element {
  const agentId = app.agent ? app.agent.split(':')[0] : '';
  const agent = agentId ? getAgentspecs(agentId) : undefined;
  const starters = app.interface?.starters ?? [];
  return (
    <Box
      display="grid"
      gridTemplateColumns={['1fr', '1fr 1fr']}
      gridGap={3}
      data-composer-canvas={app.id}
    >
      <Part title="Agent">
        <Text as="p" sx={{ m: 0 }}>
          {agent ? `${agent.emoji ?? ''} ${agent.name}`.trim() : agentId || '—'}
        </Text>
      </Part>
      <Part title="Configuration">
        <Text as="p" sx={{ m: 0 }}>
          {`${app.kind}, ${app.interface?.layout ?? 'chat'}`}
        </Text>
      </Part>
      <Part title="UI">
        <Box display="flex" flexWrap="wrap" sx={{ gap: 1 }}>
          {app.ui.map(choice => (
            <Label key={choice.plugin} variant="secondary">
              {`${UI_CATALOGUE[choice.plugin]?.name ?? choice.plugin} · ${placementOf(choice)}`}
            </Label>
          ))}
        </Box>
      </Part>
      <Part title="Starters">
        {starters.length > 0 ? (
          <Box as="ul" m={0} pl={3}>
            {starters.map(starter => (
              <li key={starter.label}>{starter.label}</li>
            ))}
          </Box>
        ) : (
          '—'
        )}
      </Part>
    </Box>
  );
}

/** The application read three ways, under one switch. */
export function ComposerSource({ app }: { app: AppSpec }): JSX.Element {
  const [view, setView] = useState<ComposerView>('canvas');
  const yaml = useMemo(() => writeAppspecYaml(app), [app]);
  const python = useMemo(() => composerPython(app), [app]);
  const says =
    view === 'canvas'
      ? WORDS.canvasSays
      : view === 'spec'
        ? WORDS.specSays
        : python.how === 'built'
          ? WORDS.pythonBuilt
          : python.how === 'ejected'
            ? WORDS.pythonEjected
            : WORDS.pythonNone;
  return (
    <Box display="flex" flexDirection="column" sx={{ gap: 3 }}>
      <Box>
        <SegmentedControl
          aria-label={WORDS.views}
          aria-describedby="composer-portal-says"
          onChange={index => setView(COMPOSER_VIEWS[index])}
        >
          {COMPOSER_VIEWS.map(name => (
            <SegmentedControl.Button key={name} selected={view === name}>
              {WORDS[name]}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
        <Text
          as="p"
          id="composer-portal-says"
          sx={{ color: 'fg.muted', fontSize: 0, mt: 1, mb: 0 }}
        >
          {says}
        </Text>
      </Box>
      {view === 'canvas' ? <ComposerCanvas app={app} /> : null}
      {view === 'spec' ? (
        <Code text={yaml} label={`${app.name}: its YAML`} kind="yaml" />
      ) : null}
      {view === 'python' && python.code !== null ? (
        <Code
          text={python.code}
          label={`${app.name}: its Python`}
          kind="python"
        />
      ) : null}
    </Box>
  );
}

export default ComposerSource;
