/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Traveller's map (the user, 19 November 2026: "for traveller add also
 * maps with https://overturemaps.org/"): `show_trip_map` read, its places
 * numbered by day, Overture's basemap as a MapLibre style in light and dark,
 * its release from Overture's catalogue, and the card: a placeholder while
 * the map loads, the places listed with their links, both attributions.
 */

import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider, BaseStyles } from '@primer/react';
import type { ToolCallRenderContext } from '../../types/chat';
import { AGENT_UI_PLUGINS } from '../agentUiPlugins';
import {
  OVERTURE_BASEMAP_ATTRIBUTION,
  TRIP_MAP_PLUGIN_NAME,
  TRIP_MAP_WORDS,
  TripMapCard,
  readTripMap,
} from '../plugins/trip-map';
import {
  DARK,
  GLYPHS,
  LIGHT,
  THEMES,
  forgetOvertureRelease,
  latestOvertureRelease,
  overtureStyle,
  themeUrl,
} from '../plugins/trip-map/style';

// The map itself is MapLibre in a browser; the card is what is tested here.
vi.mock('../plugins/trip-map/TripMapView', () => ({
  default: () => <div data-testid="trip-map-canvas" />,
  TripMapView: () => <div data-testid="trip-map-canvas" />,
}));

afterEach(() => cleanup());

const ATTRIBUTION =
  'Places: Overture Maps Foundation (overturemaps.org), release 2026-11-18.0; from meta (CDLA-Permissive-2.0).';

const SHOWN = {
  shown: 'trip-map',
  title: 'Lisbon · 12–15 Mar',
  attribution: ATTRIBUTION,
  options: [
    {
      id: 'best',
      title: 'Best balance',
      places: [
        {
          name: 'Tower of Belém',
          lat: 38.6916,
          lon: -9.216,
          kind: 'sight',
          day: 2,
        },
        {
          name: 'Casa Portuguesa do Pastel de Bacalhau',
          lat: 38.710182,
          lon: -9.137451,
          kind: 'food',
          day: 1,
          url: 'https://www.openstreetmap.org/?mlat=38.710182&mlon=-9.137451',
        },
        { name: 'Hotel Rio Baixa', lat: 38.7112, lon: -9.1385, kind: 'stay' },
        { name: 'Nowhere', lat: 120, lon: 0 },
      ],
    },
    {
      id: 'cheapest',
      title: 'Cheapest',
      places: [{ name: 'Alfama', lat: 38.7118, lon: -9.13, kind: 'walk' }],
    },
  ],
};

const contextOf = (
  status: ToolCallRenderContext['status'],
  result?: unknown,
): ToolCallRenderContext =>
  ({
    toolCallId: 'map-1',
    toolName: 'show_trip_map',
    args: SHOWN,
    status,
    result,
    defaultUI: <span>default</span>,
  }) as unknown as ToolCallRenderContext;

const drawn = (context: ToolCallRenderContext) =>
  render(
    <ThemeProvider>
      <BaseStyles>
        <TripMapCard context={context} />
      </BaseStyles>
    </ThemeProvider>,
  );

describe('show_trip_map, read', () => {
  it('numbers each option’s places by day and keeps only real points', () => {
    const map = readTripMap(SHOWN);
    const [best, cheapest] = map.options;
    expect(best.places.map(p => [p.number, p.name])).toEqual([
      [1, 'Casa Portuguesa do Pastel de Bacalhau'],
      [2, 'Tower of Belém'],
      [3, 'Hotel Rio Baixa'],
    ]);
    // An unknown kind is a sight; a link is kept https only.
    expect(cheapest.places[0].kind).toBe('sight');
    expect(best.places[0].url).toMatch(/^https:\/\/www\.openstreetmap\.org\//);
    expect(map.attribution).toBe(ATTRIBUTION);
    // The box the map opens on holds every option's places.
    expect(map.bounds).toEqual([-9.216, 38.6916, -9.13, 38.7118]);
  });

  it('keeps three options at most, and none without a place', () => {
    const many = readTripMap({
      options: [1, 2, 3, 4].map(n => ({
        title: `O${n}`,
        places: [{ name: 'x', lat: 1, lon: n }],
      })),
    });
    expect(many.options.map(o => o.id)).toEqual([
      'option-1',
      'option-2',
      'option-3',
    ]);
    expect(
      readTripMap({ options: [{ title: 'a', places: [] }] }).options,
    ).toEqual([]);
  });
});

describe('Overture’s basemap', () => {
  it('reads four themes of a release as PMTiles, credited, with public glyphs', () => {
    const style = overtureStyle('2026-11-18.0') as {
      glyphs: string;
      sources: Record<string, { url: string; attribution: string }>;
      layers: { id: string; paint?: Record<string, unknown> }[];
    };
    expect(Object.keys(style.sources)).toEqual([...THEMES]);
    expect(style.sources.base.url).toBe(
      'pmtiles://https://tiles.overturemaps.org/2026-11-18.0/base.pmtiles',
    );
    expect(themeUrl('r', 'divisions')).toBe(
      'pmtiles://https://tiles.overturemaps.org/r/divisions.pmtiles',
    );
    for (const source of Object.values(style.sources)) {
      expect(source.attribution).toContain('OpenStreetMap contributors');
      expect(source.attribution).toContain('Overture Maps Foundation');
    }
    expect(style.glyphs).toBe(GLYPHS);
    expect(style.layers.map(l => l.id)).toEqual(
      expect.arrayContaining([
        'water',
        'building',
        'road-major',
        'place-label',
      ]),
    );
  });

  it('is drawn in the page’s light or dark colours', () => {
    const background = (dark: boolean) =>
      (
        overtureStyle('r', dark) as {
          layers: { paint?: Record<string, unknown> }[];
        }
      ).layers[0].paint?.['background-color'];
    expect(background(false)).toBe(LIGHT.background);
    expect(background(true)).toBe(DARK.background);
  });

  it('takes its release from Overture’s catalogue, once', async () => {
    forgetOvertureRelease();
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ latest: '2026-11-18.0' })),
    );
    expect(
      await latestOvertureRelease(fetcher as unknown as typeof fetch),
    ).toBe('2026-11-18.0');
    expect(
      await latestOvertureRelease(fetcher as unknown as typeof fetch),
    ).toBe('2026-11-18.0');
    expect(fetcher).toHaveBeenCalledTimes(1);
    forgetOvertureRelease();
    const silent = vi.fn(async () => new Response(JSON.stringify({})));
    await expect(
      latestOvertureRelease(silent as unknown as typeof fetch),
    ).rejects.toThrow('names no latest release');
    forgetOvertureRelease();
  });
});

describe('the trip-map card', () => {
  it('holds the map’s place while the call is written', () => {
    drawn(contextOf('executing'));
    expect(screen.getByTestId('trip-map-placeholder').textContent).toBe(
      TRIP_MAP_WORDS.writing,
    );
    expect(screen.queryByTestId('trip-map-canvas')).toBeNull();
  });

  it('draws the map once done, lists the places and credits both sources', async () => {
    drawn(contextOf('complete', SHOWN));
    expect(await screen.findByTestId('trip-map-canvas')).toBeTruthy();
    expect(screen.getByText('Lisbon · 12–15 Mar')).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: 'Casa Portuguesa do Pastel de Bacalhau',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Best balance')).toBeTruthy();
    expect(screen.getByText('Cheapest')).toBeTruthy();
    const credit = screen.getByText(content =>
      content.includes(OVERTURE_BASEMAP_ATTRIBUTION),
    );
    expect(credit.textContent).toContain(ATTRIBUTION);
  });

  it('shows the default UI for a refusal', () => {
    drawn(
      contextOf(
        'complete',
        'Refused: the trip map was not shown (no option has a place).',
      ),
    );
    expect(screen.getByText('default')).toBeTruthy();
  });

  it('is one of the agents’ UI plugins, needing no connection', () => {
    const plugin = AGENT_UI_PLUGINS['trip-map'];
    expect(plugin.needsConnection).toBe(false);
    expect((plugin.message as { name: string }).name).toBe(
      TRIP_MAP_PLUGIN_NAME,
    );
  });
});
