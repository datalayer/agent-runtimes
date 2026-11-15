/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent's header UI as items of the chat header's toolbar.
 *
 * Each header chrome UI (`AGENT_UI_PLUGINS[id].Chrome`, placed `header` by
 * its spec) is one item, and so is each UI a visitor could sign in for (the
 * locked chips): a narrow chat moves them into the toolbar's "…" menu one by
 * one, before the chat's own controls (`priority: -1`).
 *
 * @module chat/header/uiChromeItems
 */

import type { ToolbarItem } from '@datalayer/primer-addons';
import { Box } from '@datalayer/primer-addons';
import { AGENT_UI_PLUGINS } from '../../apps/agentUiPlugins';
import { LockedUiChips } from '../../apps/plugins/locked-ui';

export function uiChromeHeaderItems(
  ids: readonly string[],
  lockedUi: readonly string[] = [],
): ToolbarItem[] {
  const items: ToolbarItem[] = ids
    .filter(id => id !== 'browser-session' && AGENT_UI_PLUGINS[id]?.Chrome)
    .map(id => {
      const Chrome = AGENT_UI_PLUGINS[id].Chrome!;
      return {
        key: `ui-${id}`,
        type: 'custom' as const,
        priority: -1,
        render: () => (
          <Box
            display="inline-flex"
            alignItems="center"
            data-chat-ui-placement="header"
            data-chat-ui={id}
          >
            <Chrome placement="header" />
          </Box>
        ),
      };
    });
  for (const label of lockedUi) {
    items.push({
      key: `locked-${label}`,
      type: 'custom',
      priority: -1,
      render: () => <LockedUiChips labels={[label]} />,
    });
  }
  return items;
}
