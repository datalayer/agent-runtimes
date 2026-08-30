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
 * @module loop/plugins/agents/SandboxSelector
 */

import { useCallback, useState } from 'react';
import { Box, SegmentedControl, Spinner, Text } from '@primer/react';
import {
  KernelIndicator,
  type ExecutionState,
} from '@datalayer/jupyter-react/kernel-indicator';
import { useSignalValue } from '@datalayer/reactor/react';
import type { LoopWorkspaceContext } from '../../core';
import { IDLE_SANDBOX_SNAPSHOT_SIGNAL } from '../../core';
import { useOptionalSandboxService } from './useSandboxService';
import {
  SANDBOX_TARGETS,
  TARGET_SPECS,
  type SandboxTarget,
} from './switchable';

export function SandboxSelector(_props: {
  workspace: LoopWorkspaceContext;
}): JSX.Element | null {
  const service = useOptionalSandboxService();
  const [moving, setMoving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Hooks run before the early return, so a workspace without the sandbox
  // plugin does not change hook order on the next render.
  const snapshot = useSignalValue(
    service?.snapshot ?? IDLE_SANDBOX_SNAPSHOT_SIGNAL,
  );
  const status = useSignalValue(service?.status ?? EMPTY_STATUS);
  const target = useSignalValue(service?.target ?? DEFAULT_TARGET);

  const choose = useCallback(
    async (next: SandboxTarget) => {
      if (!service || next === target) {
        return;
      }
      setMoving(true);
      setFailure(null);
      try {
        await service.setTarget(next);
      } catch (error) {
        // Said where the person clicked. A switch that fails silently leaves
        // them looking at a control that did nothing and no reason why.
        setFailure(error instanceof Error ? error.message : String(error));
      } finally {
        setMoving(false);
      }
    },
    [service, target],
  );

  if (!service) {
    return null;
  }

  const index = Math.max(0, SANDBOX_TARGETS.indexOf(target));

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      {/* The spinner's room is held whether or not it is spinning: appearing
          and disappearing mid-switch reflowed the whole header, so the control
          a person had just clicked moved out from under the pointer. */}
      <Box
        sx={{
          width: 16,
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {moving ? <Spinner size="small" /> : null}
      </Box>
      <KernelIndicator
        state={toKernelIndicatorState(
          snapshot.state,
          status?.execution_state,
          status?.is_executing,
        )}
        kernelId={snapshot.kernelId ?? status?.kernel_id}
        kernelName={status?.kernel_name}
        serverUrl={snapshot.jupyterUrl ?? status?.jupyter_url}
        websocketUrl={toWebsocketUrl(
          snapshot.jupyterUrl ?? status?.jupyter_url,
        )}
        /*
          The target that was chosen, not the variant last reported.

          `snapshot.variant` is whatever the sandbox most recently said it
          was, and it lags a switch — so the indicator sat next to a segmented
          control reading "Datalayer" and named a Jupyter server, which is two
          answers to one question. The chosen target is the one the reader
          just gave; the variant is a detail, and it is in the overlay.
        */
        environmentName={TARGET_SPECS[target].label}
        overlayTitle={`${TARGET_SPECS[target].label} Kernel`}
        position="se"
        bordered={false}
      />
      <SegmentedControl
        aria-label="Where code runs"
        size="small"
        // Inline, deliberately. `sx` compiles to a class, and the examples
        // page applies its typography list styles *after* Primer's sheet — so
        // a class loses on order and the markers come back. An inline style
        // outranks both. Primer does not type `style` on this component but
        // forwards it to the element, hence the cast.
        {...({ style: { listStyle: 'none', margin: 0, padding: 0 } } as object)}
        sx={{
          // SegmentedControl is a list. Some example-page typography styles
          // restore list markers globally, so reset both the list and its
          // direct items here instead of leaking a page-specific CSS fix into
          // the plugin.
          listStyle: 'none',
          m: 0,
          p: 0,
          '& > li': { listStyle: 'none' },
          '& > li::marker': { content: 'none' },
        }}
      >
        {SANDBOX_TARGETS.map((entry, position) => (
          <SegmentedControl.Button
            key={entry}
            selected={position === index}
            sx={{ listStyle: 'none' }}
            title={TARGET_SPECS[entry].hint}
            onClick={() => void choose(entry)}
          >
            {TARGET_SPECS[entry].label}
          </SegmentedControl.Button>
        ))}
      </SegmentedControl>
      {/* A status readout, not a control. Primer's `Tooltip` requires its
          child to *be* the interactive element and throws otherwise, so the
          hint rides on the native attribute. */}
      {failure || snapshot.errorReason ? (
        // The reason, in the header, in full. It used to read "switch failed"
        // with the cause hidden in a `title` — which is why a switch that
        // could not reach the server looked like a click that did nothing.
        // A failure the person has to hover to read is a failure they will
        // not read.
        <Text
          sx={{
            fontSize: 0,
            color: 'danger.fg',
            lineHeight: 1.3,
            /*
              Bounded, and allowed to shrink.
              
              At 460px with nothing to stop it growing, a failure message was
              wider than everything else in the header put together — so the
              row it shares compressed to fit it, and the segmented control
              the reader had just clicked shifted out from under the pointer.
              Two lines here cost nothing; a reflowed header costs the click.
            */
            maxWidth: 280,
            minWidth: 0,
          }}
          title={failure ?? snapshot.errorReason}
        >
          {/* A switch this control attempted, or a failure the sandbox
              reported on its own — the Datalayer runtime failing to start is
              the second kind, and it used to reach the reader as
              "connected-dead" with every field unknown. */}
          {failure ?? snapshot.errorReason}
        </Text>
      ) : (
        <Text
          sx={{ fontSize: 0, color: 'fg.muted' }}
          title={TARGET_SPECS[SANDBOX_TARGETS[index]].hint}
        >
          {/* What the sandbox is doing, not what it last called itself.
              Which target is selected is said twice already — by the control
              and by the indicator — and `variant` lags a switch, so a third
              answer here was only ever a chance to disagree with them. */}
          {snapshot.state}
        </Text>
      )}
    </Box>
  );
}

function toKernelIndicatorState(
  state: LoopWorkspaceContext['sandbox']['state'],
  executionState?: string,
  isExecuting?: boolean,
): ExecutionState {
  if (state === 'error') return 'connected-dead';
  if (state === 'starting') return 'connected-starting';
  if (state === 'stopping') return 'disconnecting';
  if (state !== 'running') return 'disconnected';
  return executionState === 'busy' || isExecuting
    ? 'connected-busy'
    : 'connected-idle';
}

function toWebsocketUrl(url?: string): string | undefined {
  return url?.replace(/^http/, 'ws');
}

const EMPTY_STATUS = {
  value: null,
  peek: () => null,
} as never;

const DEFAULT_TARGET = {
  value: 'local' as SandboxTarget,
  peek: () => 'local' as SandboxTarget,
} as never;

export default SandboxSelector;
