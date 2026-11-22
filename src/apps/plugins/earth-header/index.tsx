/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-earth-header` — Terra's title bar: a Sensor drop-
 * down (any, Sentinel-2, Landsat) told to the agent with every turn, and the
 * cloud cover of the scene it reads as a meter.
 *
 * What it draws is its UI spec's `header` (`agentspecs/ui/earth-header.yaml`):
 * the items, the frontend tool `set_earth_header` the agent sets them with,
 * and what each drop-down tells the agent (`toolCards/headerItems`).
 *
 * @module apps/plugins/earth-header
 */

import { defineHeaderPlugin } from '../../toolCards/headerItems';

export const EARTH_HEADER_PLUGIN_NAME = '@datalayer/agent-plugin-earth-header';

/** The plugin, built for a workspace: what a person picked is that workspace's. */
export const earthHeaderPlugin = defineHeaderPlugin({
  id: 'earth-header',
});

export default earthHeaderPlugin;
