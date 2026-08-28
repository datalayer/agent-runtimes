/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where the code runs: browser, local, or cloud.
 *
 * Three positions rather than a settings page, in the header rather than a
 * menu, because "where is my code running?" is a question a person asks while
 * they are working — and the honest answer changes what they can do.
 *
 * Contributed by the sandbox plugin, so every workspace that mounts it gets the
 * control: the examples, the standalone page, and the Datalayer app.
 *
 * @module loop/plugins/code-sandbox/SandboxSelector
 */

import { useCallback, useState } from 'react';
import { Box, SegmentedControl, Spinner, Text, Tooltip } from '@primer/react';
import { useSignalValue } from '@datalayer/reactor/react';
import type { LoopWorkspaceContext } from '../../core';
import { useOptionalSandboxService } from './useSandboxService';
import type { SandboxTarget } from './switchable';

const TARGETS: ReadonlyArray<{
  target: SandboxTarget;
  label: string;
  hint: string;
}> = [
  {
    target: 'browser',
    label: 'Browser',
    hint: 'Python in this page (Pyodide). Nothing leaves your machine.',
  },
  {
    target: 'local',
    label: 'Local',
    hint: 'A Jupyter server beside you.',
  },
  {
    target: 'cloud',
    label: 'Cloud',
    hint: 'A Datalayer runtime.',
  },
];

export function SandboxSelector(_props: {
  workspace: LoopWorkspaceContext;
}): JSX.Element | null {
  const service = useOptionalSandboxService();
  const [moving, setMoving] = useState(false);

  // Hooks run before the early return, so a workspace without the sandbox
  // plugin does not change hook order on the next render.
  const snapshot = useSignalValue(service?.snapshot ?? IDLE);
  const target = useSignalValue(service?.target ?? DEFAULT_TARGET);

  const choose = useCallback(
    async (next: SandboxTarget) => {
      if (!service || next === target) {
        return;
      }
      setMoving(true);
      try {
        await service.setTarget(next);
      } finally {
        setMoving(false);
      }
    },
    [service, target],
  );

  if (!service) {
    return null;
  }

  const index = Math.max(
    0,
    TARGETS.findIndex(entry => entry.target === target),
  );

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {moving ? <Spinner size="small" /> : null}
      <Text
        sx={{
          fontSize: 0,
          color: snapshot.state === 'running' ? 'success.fg' : 'fg.muted',
        }}
        aria-label={`Sandbox ${snapshot.state}`}
      >
        ●
      </Text>
      <SegmentedControl aria-label="Where code runs" size="small">
        {TARGETS.map((entry, position) => (
          <SegmentedControl.Button
            key={entry.target}
            selected={position === index}
            onClick={() => void choose(entry.target)}
          >
            {entry.label}
          </SegmentedControl.Button>
        ))}
      </SegmentedControl>
      <Tooltip text={TARGETS[index]?.hint ?? ''} direction="s">
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          {snapshot.variant ?? snapshot.state}
        </Text>
      </Tooltip>
    </Box>
  );
}

/** Read when the plugin is absent, so the hook order never changes. */
const IDLE = {
  value: { state: 'idle' as const },
  peek: () => ({ state: 'idle' as const }),
} as never;

const DEFAULT_TARGET = {
  value: 'local' as SandboxTarget,
  peek: () => 'local' as SandboxTarget,
} as never;

export default SandboxSelector;
