/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Overture Maps' open basemap, as a MapLibre style. Pure.
 *
 * The Overture Maps Foundation publishes each release's themes as PMTiles
 * (https://tiles.overturemaps.org/<release>/<theme>.pmtiles), read by range
 * requests straight from the browser: no tile server, no key. This style
 * draws four of them — base (land use, water), buildings, transportation
 * (roads, rail) and divisions (boundaries, place names) — in the page's
 * light or dark colours, labels in Noto Sans from Protomaps' public glyphs.
 * The release is the one Overture's STAC catalogue names latest.
 *
 * @module apps/plugins/trip-map/style
 */

/** Where Overture publishes its tiles. */
export const OVERTURE_TILES = 'https://tiles.overturemaps.org';

/** Overture's release catalogue (CORS open). */
export const OVERTURE_STAC = 'https://stac.overturemaps.org/catalog.json';

/** The labels' glyphs: Protomaps' public font assets (CORS open). */
export const GLYPHS =
  'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';

const FONT = ['Noto Sans Regular'];

/** The links the map's corner credits. */
export const BASEMAP_ATTRIBUTION_HTML =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>, ' +
  '<a href="https://docs.overturemaps.org/attribution/" target="_blank" rel="noreferrer">Overture Maps Foundation</a>';

export type BasemapColors = {
  background: string;
  park: string;
  water: string;
  building: string;
  road: string;
  roadMajor: string;
  roadCasing: string;
  rail: string;
  boundary: string;
  label: string;
  halo: string;
};

export const LIGHT: BasemapColors = {
  background: '#f6f8fa',
  park: '#dcefd9',
  water: '#b9d8ee',
  building: '#e4e2de',
  road: '#ffffff',
  roadMajor: '#fde7b2',
  roadCasing: '#d0d7de',
  rail: '#afb8c1',
  boundary: '#8c959f',
  label: '#424a53',
  halo: '#ffffff',
};

export const DARK: BasemapColors = {
  background: '#161b22',
  park: '#1f2d22',
  water: '#0f2a43',
  building: '#262c36',
  road: '#30363d',
  roadMajor: '#4d4224',
  roadCasing: '#0d1117',
  rail: '#484f58',
  boundary: '#6e7681',
  label: '#c9d1d9',
  halo: '#0d1117',
};

/** The themes the style reads, each a PMTiles source. */
export const THEMES = [
  'base',
  'buildings',
  'transportation',
  'divisions',
] as const;

/** A theme's PMTiles, for MapLibre's `pmtiles://` protocol. */
export function themeUrl(release: string, theme: string): string {
  return `pmtiles://${OVERTURE_TILES}/${release}/${theme}.pmtiles`;
}

const MAJOR = ['motorway', 'trunk', 'primary', 'secondary'];
const MINOR = [
  'tertiary',
  'residential',
  'living_street',
  'unclassified',
  'service',
];
const PATHS = ['pedestrian', 'footway', 'path', 'steps', 'cycleway'];

function classIn(names: string[]): unknown[] {
  return ['in', ['get', 'class'], ['literal', names]];
}

/** The basemap as a MapLibre style (its JSON form: no MapLibre import here). */
export function overtureStyle(
  release: string,
  dark = false,
): Record<string, unknown> {
  const c = dark ? DARK : LIGHT;
  const sources = Object.fromEntries(
    THEMES.map(theme => [
      theme,
      {
        type: 'vector',
        url: themeUrl(release, theme),
        attribution: BASEMAP_ATTRIBUTION_HTML,
      },
    ]),
  );
  const road = (
    id: string,
    names: string[],
    color: string,
    widths: [number, number, number],
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    type: 'line',
    source: 'transportation',
    'source-layer': 'segment',
    filter: ['all', ['==', ['get', 'subtype'], 'road'], classIn(names)],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-width': [
        'interpolate',
        ['exponential', 1.6],
        ['zoom'],
        10,
        widths[0],
        14,
        widths[1],
        18,
        widths[2],
      ],
      ...extra,
    },
  });
  return {
    version: 8,
    glyphs: GLYPHS,
    sources,
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': c.background },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'base',
        'source-layer': 'land_use',
        filter: [
          'in',
          ['get', 'subtype'],
          ['literal', ['park', 'recreation', 'cemetery', 'golf']],
        ],
        paint: { 'fill-color': c.park },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'base',
        'source-layer': 'water',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': c.water },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'buildings',
        'source-layer': 'building',
        minzoom: 13,
        paint: { 'fill-color': c.building, 'fill-opacity': 0.9 },
      },
      road('road-path', PATHS, c.roadCasing, [0.3, 0.8, 2], {
        'line-dasharray': [2, 1],
      }),
      road('road-casing', [...MAJOR, ...MINOR], c.roadCasing, [1, 4, 18]),
      road('road-minor', MINOR, c.road, [0.5, 2.5, 14]),
      road('road-major', MAJOR, c.roadMajor, [1, 3.5, 16]),
      {
        id: 'rail',
        type: 'line',
        source: 'transportation',
        'source-layer': 'segment',
        filter: ['==', ['get', 'subtype'], 'rail'],
        paint: {
          'line-color': c.rail,
          'line-width': 1,
          'line-dasharray': [3, 2],
        },
      },
      {
        id: 'boundary',
        type: 'line',
        source: 'divisions',
        'source-layer': 'division_boundary',
        paint: {
          'line-color': c.boundary,
          'line-width': 1,
          'line-dasharray': [4, 2],
        },
      },
      {
        id: 'road-label',
        type: 'symbol',
        source: 'transportation',
        'source-layer': 'segment',
        minzoom: 14,
        filter: [
          'all',
          ['==', ['get', 'subtype'], 'road'],
          classIn([...MAJOR, ...MINOR]),
        ],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', '@name'],
          'text-font': FONT,
          'text-size': 11,
        },
        paint: {
          'text-color': c.label,
          'text-halo-color': c.halo,
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'place-label',
        type: 'symbol',
        source: 'divisions',
        'source-layer': 'division',
        filter: ['==', ['geometry-type'], 'Point'],
        layout: {
          'text-field': ['get', '@name'],
          'text-font': FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 12, 14],
          'symbol-sort-key': ['-', 0, ['coalesce', ['get', '@prominence'], 0]],
        },
        paint: {
          'text-color': c.label,
          'text-halo-color': c.halo,
          'text-halo-width': 1.5,
        },
      },
    ],
  };
}

let latest: Promise<string> | null = null;

/** The release Overture's catalogue names latest, asked once a page. */
export function latestOvertureRelease(
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (!latest) {
    latest = fetcher(OVERTURE_STAC)
      .then(answer => {
        if (!answer.ok) {
          throw new Error(`Overture's catalogue answered ${answer.status}`);
        }
        return answer.json();
      })
      .then((catalog: { latest?: unknown }) => {
        if (typeof catalog.latest !== 'string' || !catalog.latest) {
          throw new Error("Overture's catalogue names no latest release");
        }
        return catalog.latest;
      })
      .catch(error => {
        latest = null;
        throw error;
      });
  }
  return latest;
}

/** Forget the release asked (tests). */
export function forgetOvertureRelease(): void {
  latest = null;
}
