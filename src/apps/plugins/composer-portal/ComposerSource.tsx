/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Composer's own content, where its host contributes none
 * (`AgentSlots.composerView`): the application read three ways under one
 * switch, as a Composer has them — its **Canvas** (`AppCanvasEditor` as a
 * picture: the agent and its parts on their graph, a part selected shows its
 * properties, nothing dropped is kept), its **YAML** (the Appspec written out,
 * `writeAppspecYaml`, in `AppYamlEditor`) and its **Python** (its own
 * `app.py` when it was built in Python, otherwise the file `agent apps eject`
 * writes from its spec, as the catalogue generates it: `APP_PYTHON`, in
 * `AppPythonEditor`). Read only. Each editor loads when its view is first
 * chosen.
 *
 * @module apps/plugins/composer-portal/ComposerSource
 */

import type { JSX } from 'react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { SegmentedControl, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  APP_BUILT,
  APP_CATALOGUE,
  APP_PYTHON,
  APP_SOURCES,
} from '../../../specs/apps';
import type { AppSpec } from '../../../types/agentspecs';
import { dumpAppspec } from '../../apps/appspec';
import { writeAppspecYaml } from '../../apps/yaml';
import { draftOfAppspec } from '../../composer/draft';
import { COMPOSER_PORTAL_WORDS as WORDS } from './words';

const AppCanvasEditor = lazy(() => import('../../composer/AppCanvasEditor'));
const AppYamlEditor = lazy(() => import('../../composer/AppYamlEditor'));
const AppPythonEditor = lazy(() => import('../../composer/AppPythonEditor'));

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

/** Where an editor stands while its code loads. */
const LOADING = <Box minHeight={420} aria-busy="true" />;

/** Its parts on the Canvas, read only: a catalogue example as it ships, any other read from its Appspec. */
export function ComposerCanvas({ app }: { app: AppSpec }): JSX.Element {
  const draft = useMemo(
    () => (APP_SOURCES[app.id] ? undefined : draftOfAppspec(dumpAppspec(app))),
    [app],
  );
  return (
    <Box data-composer-canvas={app.id}>
      <Suspense fallback={LOADING}>
        {draft ? (
          <AppCanvasEditor mock definition={draft} />
        ) : (
          <AppCanvasEditor mock example={app.id} />
        )}
      </Suspense>
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
        <Box data-composer-code="yaml">
          <Suspense fallback={LOADING}>
            <AppYamlEditor
              value={yaml}
              checks={false}
              height="70vh"
              ariaLabel={`${app.name}: its YAML`}
            />
          </Suspense>
        </Box>
      ) : null}
      {view === 'python' && python.code !== null ? (
        <Box data-composer-code="python">
          <Suspense fallback={LOADING}>
            <AppPythonEditor
              code={{ file: 'app.py', text: python.code }}
              height="70vh"
            />
          </Suspense>
        </Box>
      ) : null}
    </Box>
  );
}

export default ComposerSource;
