/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-app-rules` — an application's rules and the
 * approvals it waits on, as a plugin (LOOP R-01b, U-19): a card in the
 * workspace's sidebar (`LoopSlots.sidebar`), beside its page.
 *
 * @module loop/plugins/app-rules
 */

import type { JSX } from 'react';
import { definePlugin, type ReactorPlugin } from '@datalayer/reactor';
import type { AppSpec } from '../../../types/agentspecs';
import { LoopSlots } from '../../core';
import { AppRulesCard } from './AppRulesCard';

export const APP_RULES_PLUGIN_NAME = '@datalayer/loop-plugin-app-rules';

/** The plugin that lists an application's rules and the approvals waiting for the person. */
export function defineAppRulesPlugin(
  app: AppSpec,
): ReactorPlugin<Record<string, never>, unknown, unknown> {
  // One component per plugin: the slot keeps it, and the application with it.
  function Card(): JSX.Element {
    return <AppRulesCard app={app} />;
  }
  const plugin = definePlugin({
    name: `${APP_RULES_PLUGIN_NAME}-${app.id}`,
    displayName: `${app.name}: rules and approvals`,
    description: `When ${app.name} acts alone, when it asks, and what waits for your yes.`,
    octicon: 'shield-check',
    build: () => ({
      components: [
        {
          id: 'app-rules',
          slot: LoopSlots.sidebar,
          order: 10,
          Component: Card,
        },
      ],
    }),
  });
  return plugin as unknown as ReactorPlugin<
    Record<string, never>,
    unknown,
    unknown
  >;
}

export {
  AppRulesCard,
  APP_RULES_WORDS,
  ruleInWords,
  ruleOfApproval,
  approvalsOfApp,
} from './AppRulesCard';
export default defineAppRulesPlugin;
