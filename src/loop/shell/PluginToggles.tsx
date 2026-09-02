/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A checkbox per plugin.
 *
 * An extension model is a claim until someone can turn a plugin off and watch
 * the workspace carry on. This is the smallest surface that makes the claim
 * checkable: the list comes from the reactor rather than from a hard-coded
 * array, so it cannot lie about how many plugins there are.
 *
 * Not part of the workspace itself — the workspace has one navigation element
 * and no settings tree (§3.5). This belongs to the examples that demonstrate it.
 *
 * @module loop/shell/PluginToggles
 */

import type { JSX } from 'react';
import { useCallback, useSyncExternalStore } from 'react';
import { Box, Text } from '@primer/react';
import { useReactorPlatform } from '@datalayer/reactor/react';

export type PluginTogglesProps = {
  /** Extensions the example does not let you switch off (the shell's own). */
  locked?: readonly string[];
  title?: string;
};

/** Trim the package scope so the list reads as names rather than paths. */
function shortName(name: string): string {
  return name
    .replace(/^@datalayer\/loop-plugin-/, '')
    .replace(/^@datalayer\//, '');
}

export function PluginToggles({
  locked = [],
  title = 'Plugins',
}: PluginTogglesProps): JSX.Element {
  const reactor = useReactorPlatform();
  // The revision changes on every enable/disable, so the list follows the
  // reactor rather than a copy of it.
  useSyncExternalStore(reactor.subscribe, () => reactor.getRevision());

  const toggle = useCallback(
    (name: string, next: boolean) => {
      if (next) {
        reactor.enable(name);
      } else {
        reactor.disable(name);
      }
    },
    [reactor],
  );

  return (
    <Box
      sx={{
        p: 3,
        borderBottom: '1px solid',
        borderColor: 'border.default',
        bg: 'canvas.subtle',
      }}
    >
      <Text sx={{ fontSize: 0, fontWeight: 'bold', color: 'fg.muted' }}>
        {title}
      </Text>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mt: 2 }}>
        {reactor.listPlugins().map(name => {
          const isLocked = locked.includes(name);
          return (
            <Box
              as="label"
              key={name}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                fontSize: 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                opacity: isLocked ? 0.6 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={reactor.isEnabled(name)}
                disabled={isLocked}
                onChange={event => toggle(name, event.target.checked)}
              />
              {shortName(name)}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default PluginToggles;
