/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the environment dropdown shows a person (PLAN_ENV.md, E1-19).
 *
 * The list the rules produce, drawn: three headings in the order they should
 * read — what is yours, your organizations', the platform's — each entry with
 * its version, size class and rate, and an entry that cannot be launched shown
 * rather than withheld, greyed, with the one thing to do about it beside it.
 *
 * Read through `codeSandboxEnvironmentOptions` rather than hand-written
 * options, so the picker and the launcher cannot agree with this test and
 * disagree with each other.
 */

import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { ThemeProvider } from '@primer/react';
import { CodeSandboxEnvironmentSelect } from '../CodeSandboxEnvironmentSelect';
import { codeSandboxEnvironmentOptions } from '../codeSandboxEnvironments';
import type { IDatalayerEnvironment } from '../../../models';

const VIEWER = { uid: '01ADA', handle: 'ada' };

function anEnvironment(
  overrides: Partial<IDatalayerEnvironment>,
): IDatalayerEnvironment {
  return {
    name: 'ada/geo',
    title: 'Geo',
    origin: 'user',
    burning_rate: 0.0008,
    sizeClass: 'small',
    ...overrides,
  } as IDatalayerEnvironment;
}

/** Yours, an organization's and the platform's — in the wrong order on purpose. */
const ENVIRONMENTS: IDatalayerEnvironment[] = [
  anEnvironment({
    name: 'python-cpu-env',
    title: 'Python CPU',
    origin: 'platform',
    sizeClass: undefined,
    burning_rate: 0.008,
  }),
  anEnvironment({
    uid: '01TEAM',
    name: 'acme/etl',
    title: 'ETL',
    owner: '01ACME',
    promotedVersion: { version: 7 } as any,
    availableVariants: ['datalayer'],
  }),
  anEnvironment({
    uid: '01GEO',
    owner: '01ADA',
    promotedVersion: { version: 3 } as any,
    availableVariants: ['datalayer'],
  }),
  anEnvironment({
    uid: '01OCEAN',
    name: 'ada/ocean',
    title: 'Ocean',
    owner: '01ADA',
    promotedVersion: { version: 1 } as any,
    // Built for Modal, never for here: launchable at its provider, not from
    // this dropdown.
    availableVariants: ['modal'],
  }),
];

/*
 * Primer's overlay reads the theme out of context, so an unwrapped dropdown
 * renders its trigger and throws the moment it opens.
 */
function aSelect(onSelect: (key: string) => void) {
  return render(
    <ThemeProvider>
      <CodeSandboxEnvironmentSelect
        options={codeSandboxEnvironmentOptions(ENVIRONMENTS, VIEWER)}
        selectedKey="ada/geo"
        onSelect={onSelect}
      />
    </ThemeProvider>,
  );
}

/*
 * The overlay is drawn in a portal, so what is on screen is the body's text
 * and not the container's — and the trigger repeats the chosen entry, so a row
 * is found among the rows rather than by its text anywhere.
 */
function anOpenSelect(onSelect = vi.fn()) {
  const rendered = aSelect(onSelect);
  fireEvent.click(rendered.getByRole('button'));
  const rows = rendered.getAllByRole('menuitemradio');
  const rowOf = (title: string) => {
    const row = rows.find(item => item.textContent?.includes(title));
    if (!row) {
      throw new Error(`No row for ${title}: ${rows.map(r => r.textContent)}`);
    }
    return row;
  };
  const screen = () => document.body.textContent ?? '';
  return { ...rendered, onSelect, rows, rowOf, screen };
}

describe('the environment dropdown', () => {
  // Vitest runs without globals here, so testing-library's own teardown never
  // registers: without this the previous test's dropdown is still mounted and
  // every query finds two of everything.
  afterEach(cleanup);

  it('reads the chosen entry on the trigger, with its version', () => {
    const { getByRole } = aSelect(vi.fn());
    const trigger = getByRole('button').textContent ?? '';
    expect(trigger).toContain('Geo');
    expect(trigger).toContain('v3');
    expect(trigger).toContain('small');
    expect(trigger).toContain('0.0008 credits/second');
  });

  it('draws the three groups in the order they should read', () => {
    const { screen } = anOpenSelect();
    const at = (heading: string) => screen().indexOf(heading);
    expect(at('Your environments')).toBeGreaterThan(-1);
    expect(at('Your environments')).toBeLessThan(
      at("Your organizations' environments"),
    );
    expect(at("Your organizations' environments")).toBeLessThan(
      at('Platform environments'),
    );
  });

  it('lists each entry under the group it belongs to', () => {
    const { rows, rowOf } = anOpenSelect();
    const at = (title: string) => rows.indexOf(rowOf(title));
    // Both of yours first — the unbuilt one included, which is the point of
    // grouping: an environment awaiting its first build is unpriced, and would
    // otherwise have been listed below the platform's.
    expect(at('Geo')).toBeLessThan(at('ETL'));
    expect(at('Ocean')).toBeLessThan(at('ETL'));
    expect(at('ETL')).toBeLessThan(at('Python CPU'));
  });

  it('greys the variant nobody built here and offers the build beside it', () => {
    const { getByRole, rowOf } = anOpenSelect();
    expect(rowOf('Ocean')).toHaveAttribute('aria-disabled', 'true');
    const build = getByRole('link', { name: 'Build for this variant' });
    expect(build).toHaveAttribute('href', '/environments/01OCEAN/versions/1');
  });

  it('offers no build beside an entry that has its artifact', () => {
    const { rowOf } = anOpenSelect();
    const row = rowOf('Geo');
    expect(row.textContent).not.toContain('Build for this variant');
    expect(row).not.toHaveAttribute('aria-disabled', 'true');
    expect(row.textContent).toContain('v3');
  });

  it('chooses an entry that can be launched, and not one that cannot', () => {
    const { onSelect, rowOf } = anOpenSelect();
    fireEvent.click(rowOf('Ocean'));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(rowOf('ETL'));
    expect(onSelect).toHaveBeenCalledWith('acme/etl');
  });
});
