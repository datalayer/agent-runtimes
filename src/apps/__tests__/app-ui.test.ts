/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The UI plugins an application is drawn with (R8), one mapping
 * in two languages: `uiFor` and agentspecs' `ui_for` are held to the same
 * cases, the fixture `agent_runtimes/tests/fixtures/app_ui.json`, which the
 * Python test (`agent_runtimes/tests/test_app_ui.py`) reads too. A new blank
 * application starts with its kind's, and each application of the catalogue
 * lists what `uiOf` says of its spec.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  APP_KINDS,
  emptyAppspec,
  uiFor,
  uiOf,
  uiProblems,
} from '../apps/appspec';
import { APP_CATALOGUE } from '../../specs/apps';
import { UI_CATALOGUE } from '../../specs/ui';
import type { AppKind, AppLayout, UiChoice } from '../../types/agentspecs';

interface UiCase {
  name: string;
  kind: AppKind;
  layout?: AppLayout;
  outputs: string[];
  signs_in: boolean;
  own_components: boolean;
  ui: UiChoice[];
}

const CASES = (
  JSON.parse(
    readFileSync(
      join(__dirname, '../../../agent_runtimes/tests/fixtures/app_ui.json'),
      'utf8',
    ),
  ) as { cases: UiCase[] }
).cases;

describe('the UI plugins an application is drawn with (R8)', () => {
  it.each(CASES.map(c => [c.name, c] as const))('%s', (_name, c) => {
    expect(
      uiFor(c.kind, {
        layout: c.layout,
        outputs: c.outputs,
        signsIn: c.signs_in,
        ownComponents: c.own_components,
      }),
    ).toEqual(c.ui);
  });

  it.each(APP_KINDS)('a blank %s starts with its kind’s', kind => {
    const app = emptyAppspec(kind);
    expect(app.ui).toEqual(uiFor(kind));
    expect(uiProblems(app)).toEqual([]);
  });

  it.each(Object.keys(APP_CATALOGUE))(
    '%s lists what its spec says it is drawn with',
    id => {
      // A header UI is the application's own addition (its agent's title
      // bar), beside what its kind is drawn with.
      expect(
        APP_CATALOGUE[id].ui.filter(
          choice => !UI_CATALOGUE[choice.plugin]?.header,
        ),
      ).toEqual(uiOf(APP_CATALOGUE[id]));
    },
  );
});
