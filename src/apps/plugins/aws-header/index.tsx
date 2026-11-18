/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-aws-header` — the Steward's title bar: the savings
 * found (a counter: recommendations, and their monthly sum as its words), a
 * Region drop-down told to the agent with every turn, and the Savings Plans
 * coverage as a meter. Stands in for `aws-savings-badge`: until the agent's
 * tool says the savings, it reads the recommendations listed or recorded.
 *
 * What it draws is its UI spec's `header` (`agentspecs/ui/aws-header.yaml`):
 * the items, the frontend tool `set_aws_header` the agent sets them with,
 * and what each drop-down tells the agent (`toolCards/headerItems`).
 *
 * @module apps/plugins/aws-header
 */

import { defineHeaderPlugin } from '../../toolCards/headerItems';
import { useLatestToolCall, useToolCalls } from '../../toolCards/toolResults';
import { money } from '../../toolCards/kit';
import { savingsFoundOf } from '../aws-savings-badge';

export const AWS_HEADER_PLUGIN_NAME = '@datalayer/loop-plugin-aws-header';

/** The savings of the recommendations listed or recorded, for the indicator its tool has not set. */
function useFoundSavings() {
  const listed = useLatestToolCall(['list_recommendations']);
  const recorded = useToolCalls(['record_recommendation']);
  const found = savingsFoundOf(listed, recorded);
  return found
    ? {
        value: found.count,
        label: `${money(found.monthly, 'USD')}/month`,
        order: Math.max(
          listed?.order ?? 0,
          recorded[recorded.length - 1]?.order ?? 0,
        ),
      }
    : undefined;
}

/** The plugin, built for a workspace: what a person picked is that workspace's. */
export const awsHeaderPlugin = defineHeaderPlugin({
  id: 'aws-header',
  derive: { savings: useFoundSavings },
});

export default awsHeaderPlugin;
