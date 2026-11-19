/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The map itself: MapLibre over Overture Maps' open basemap, one option's
 * places as numbered pins. Loaded only when a trip map is drawn (its card
 * imports it lazily), so MapLibre and PMTiles stay out of every other page.
 *
 * @module apps/plugins/trip-map/TripMapView
 */

import { useEffect, useRef, useState, type JSX } from 'react';
// maplibre-gl 5: one bundle with its worker inlined, so no worker file to
// serve (6 loads maplibre-gl-worker.mjs beside itself, which a host's bundler
// does not emit); its types name the exports, there is no default.
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  addProtocol,
  type StyleSpecification,
} from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { boundsOf, type TripMapBounds, type TripMapPlace } from './read';
import { latestOvertureRelease, overtureStyle } from './style';

/** Each kind's pin colour (Primer's scale, readable in both modes). */
export const KIND_COLORS: Record<TripMapPlace['kind'], string> = {
  stay: '#8250df',
  food: '#bf3989',
  sight: '#0969da',
  transport: '#1a7f37',
  other: '#6e7781',
};

let protocolAdded = false;

/** `pmtiles://` for MapLibre, once a page. */
function addPmtilesProtocol(): void {
  if (!protocolAdded) {
    addProtocol('pmtiles', new Protocol().tile);
    protocolAdded = true;
  }
}

function pin(place: TripMapPlace): HTMLElement {
  const element = document.createElement('div');
  element.textContent = String(place.number);
  element.setAttribute('aria-label', `${place.number}. ${place.name}`);
  element.title = place.name;
  Object.assign(element.style, {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: KIND_COLORS[place.kind],
    color: '#ffffff',
    border: '2px solid #ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
    font: '600 12px/20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    textAlign: 'center',
    cursor: 'pointer',
  });
  return element;
}

function fit(map: MapLibreMap, bounds: TripMapBounds | undefined): void {
  if (!bounds) {
    return;
  }
  const [west, south, east, north] = bounds;
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: 40, maxZoom: 16, duration: 0 },
  );
}

export function TripMapView({
  places,
  dark,
  height = 320,
}: {
  places: TripMapPlace[];
  dark: boolean;
  height?: number;
}): JSX.Element {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [release, setRelease] = useState<string>('');
  const [failed, setFailed] = useState<string>('');
  // Bumped once the map's style has loaded: the pins and the fit follow it.
  const [loaded, setLoaded] = useState(0);

  useEffect(() => {
    let alive = true;
    latestOvertureRelease()
      .then(found => alive && setRelease(found))
      .catch(error => alive && setFailed(String(error?.message ?? error)));
    return () => {
      alive = false;
    };
  }, []);

  // The map, made once the release is known; its style follows the mode.
  useEffect(() => {
    if (!release || !container.current) {
      return;
    }
    addPmtilesProtocol();
    const made = new MapLibreMap({
      container: container.current,
      style: overtureStyle(release, dark) as StyleSpecification,
      center: [0, 20],
      zoom: 1,
      attributionControl: { compact: true },
      cooperativeGestures: true,
    });
    made.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    made.once('load', () => {
      made.resize();
      setLoaded(count => count + 1);
    });
    // The card's width settles after the map is made (a chat column, a side
    // panel): the canvas follows its box, not only the window.
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => made.resize());
    observer?.observe(container.current);
    map.current = made;
    return () => {
      observer?.disconnect();
      markers.current.forEach(marker => marker.remove());
      markers.current = [];
      made.remove();
      map.current = null;
    };
  }, [release, dark]);

  // The option's pins, and the map fitted to them.
  useEffect(() => {
    const current = map.current;
    if (!current) {
      return;
    }
    markers.current.forEach(marker => marker.remove());
    markers.current = places.map(place =>
      new Marker({ element: pin(place) })
        .setLngLat([place.lon, place.lat])
        .setPopup(
          new Popup({ offset: 14, closeButton: false }).setText(
            [place.name, place.time, place.address].filter(Boolean).join(' · '),
          ),
        )
        .addTo(current),
    );
    fit(current, boundsOf(places));
  }, [places, loaded]);

  if (failed) {
    return (
      <Box
        height={height}
        display="flex"
        alignItems="center"
        justifyContent="center"
        bg="canvas.subtle"
        borderRadius={2}
      >
        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
          The map could not load Overture's release ({failed}): the places are
          listed below.
        </Text>
      </Box>
    );
  }
  return (
    <Box
      ref={container}
      height={height}
      borderRadius={2}
      overflow="hidden"
      bg="canvas.subtle"
      aria-label="Map of the option's places"
      role="region"
      data-testid="trip-map-canvas"
    />
  );
}

export default TripMapView;
