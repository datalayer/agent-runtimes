/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A checkbox per plugin, beside the work.
 *
 * An extension model is a claim until someone can switch a plugin off and
 * watch the workspace carry on. This is the smallest surface that makes the
 * claim checkable, and it sits in the sidebar rather than in a settings page so
 * that what a checkbox does is visible in the same glance as the checkbox.
 *
 * The list comes from `usePluginManifests` rather than a hard-coded array,
 * so it cannot lie about how many plugins there are — and metadata is defined
 * for a lazy extension before its module lands, so the list is complete from
 * the first frame.
 *
 * @module loop/plugins/plugins-panel/PluginsPanel
 */

import { useRef } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  Text,
  Truncate,
} from '@primer/react';
import {
  useGroupedPluginManifests,
  useReactorPlatform,
} from '@datalayer/reactor/react';
import type { PluginManifest } from '@datalayer/reactor';
import { LoopViewType, type LoopWorkspaceContext } from '../../core';

/** Trim the scope so the list reads as names rather than paths. */
function shortName(name: string): string {
  return name
    .replace(/^@datalayer\/loop-plugin-/, '')
    .replace(/^@datalayer\//, '');
}

function label(metadata: PluginManifest): string {
  return metadata.displayName ?? shortName(metadata.name);
}

export type PluginsPanelProps = {
  /** Plugins this host does not let you switch off. */
  locked?: readonly string[];
  /** The workspace, so the panel can move it to the graph and back. */
  workspace?: LoopWorkspaceContext;
};

/** The view the graph plugin contributes, when it is mounted. */
const GRAPH_VIEW_TYPE = 'graph';

export default function PluginsPanel({
  locked = [],
  workspace,
}: PluginsPanelProps): JSX.Element {
  const reactor = useReactorPlatform();
  const groups = useGroupedPluginManifests();

  // Where to go back to. Remembered rather than assumed: "back" should return
  // to what the person was looking at, not to whichever view happens to be
  // first.
  const previous = useRef<string>('');
  const onGraph = workspace?.activeViewType === GRAPH_VIEW_TYPE;
  // Only offered when the graph plugin is actually mounted — a button that
  // opens nothing is worse than no button.
  const hasGraph = reactor
    .getContributions(LoopViewType)
    .some(entry => entry.value.viewType === GRAPH_VIEW_TYPE);

  return (
    <Box sx={{ p: 3, display: 'grid', gap: 3 }}>
      {workspace && hasGraph ? (
        <Button
          sx={{ width: '100%' }}
          onClick={() => {
            if (onGraph) {
              workspace.setActiveViewType(previous.current);
              return;
            }
            previous.current = workspace.activeViewType;
            workspace.setActiveViewType(GRAPH_VIEW_TYPE);
          }}
        >
          {onGraph ? 'Back to the workspace' : 'View plugin graph'}
        </Button>
      ) : null}
      <Box sx={{ display: 'grid', gap: 1 }}>
        <Text sx={{ fontWeight: 'semibold' }}>Plugins</Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          Everything above the blank workspace. Untick one and what it
          contributed goes with it.
        </Text>
      </Box>

      <Box sx={{ display: 'grid', gap: 3 }}>
        {groups.map(group => (
          <Box
            key={group.extension?.name ?? 'ungrouped'}
            sx={{ display: 'grid', gap: 2 }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {group.extension?.emoji ? (
                <span>{group.extension.emoji}</span>
              ) : null}
              <Text
                sx={{
                  fontSize: 0,
                  fontWeight: 'semibold',
                  color: 'fg.muted',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
                title={group.extension?.description ?? undefined}
              >
                {/* An extension is a package, so its members are named under
                    its heading. Plugins that came on their own get a heading
                    that says exactly that rather than being quietly appended
                    to the last group. */}
                {group.extension?.displayName ?? 'On their own'}
              </Text>
            </Box>
            <Box sx={{ display: 'grid', gap: 2, pl: 2 }}>
              {group.plugins.map(metadata => {
                const enabled = reactor.isEnabled(metadata.name);
                const isLocked = locked.includes(metadata.name);
                // `disabled` belongs to the `FormControl`, not to the input
                // inside it: Primer disables the whole control — label and
                // caption with it — and warns when the input is told
                // separately.
                return (
                  <FormControl key={metadata.name} disabled={isLocked}>
                    <Checkbox
                      checked={enabled}
                      onChange={() =>
                        enabled
                          ? reactor.disable(metadata.name)
                          : reactor.enable(metadata.name)
                      }
                    />
                    <FormControl.Label>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        {metadata.emoji ? <span>{metadata.emoji}</span> : null}
                        <Truncate title={metadata.name} maxWidth="16ch">
                          {label(metadata)}
                        </Truncate>
                        {/* Waiting is not the same as loading, and neither is
                            the same as broken: a plugin held by an activation
                            event has cost nothing yet and will arrive when
                            something asks. */}
                        {!metadata.activated ? (
                          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                            · on demand
                          </Text>
                        ) : metadata.lazy && !metadata.loaded ? (
                          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                            · lazy
                          </Text>
                        ) : null}
                      </Box>
                    </FormControl.Label>
                    {metadata.description ? (
                      <FormControl.Caption>
                        {metadata.description}
                      </FormControl.Caption>
                    ) : null}
                  </FormControl>
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
