/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-social-header` — the Marketer's title bar: a
 * Network drop-down (all, X, Bluesky, LinkedIn, Discord) told to the agent
 * with every turn, and how many drafts wait for the person's approval. Needs
 * no connection of the person's: a visitor's demo has it too.
 *
 * What it draws is its UI spec's `header` (`agentspecs/ui/social-header.yaml`):
 * the items, the frontend tool `set_social_header` the agent sets them with,
 * and what each drop-down tells the agent (`toolCards/headerItems`).
 *
 * @module apps/plugins/social-header
 */

import { defineHeaderPlugin } from '../../toolCards/headerItems';

export const SOCIAL_HEADER_PLUGIN_NAME = '@datalayer/loop-plugin-social-header';

/** The plugin, built for a workspace: what a person picked is that workspace's. */
export const socialHeaderPlugin = defineHeaderPlugin({
  id: 'social-header',
});

export default socialHeaderPlugin;
