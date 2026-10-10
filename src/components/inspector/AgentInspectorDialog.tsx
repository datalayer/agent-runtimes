/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agent Inspector over the page: a large dialog, the inspector loaded
 * only when it opens, drawing the spans the agent's chat or team records
 * into its tracer. Esc closes it.
 *
 * @module components/inspector/AgentInspectorDialog
 */

import type { JSX } from 'react';
import { Suspense, lazy } from 'react';
import { Dialog } from '@primer/react';
import { Text } from '@primer/react';
import type { OtelLiveTracer } from '@datalayer/core/lib/otel/live';

const AgentInspector = lazy(() => import('./AgentInspector'));

export type AgentInspectorDialogProps = {
  tracer: OtelLiveTracer | null;
  /** The dialog's title. */
  title?: string;
  /** One agent's own spans (`AgentInspector`'s `agent`); all of them without. */
  agent?: string;
  onClose: () => void;
};

export function AgentInspectorDialog({
  tracer,
  title = 'Agent Inspector',
  agent,
  onClose,
}: AgentInspectorDialogProps): JSX.Element {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width="xlarge"
      height="large"
      data-agent-inspector-dialog=""
    >
      <Suspense
        fallback={
          <Text sx={{ color: 'fg.muted' }}>Loading the Agent Inspector…</Text>
        }
      >
        <AgentInspector
          tracer={tracer}
          agent={agent}
          maxHeight="calc(80vh - 140px)"
          emptyText="Nothing recorded yet: what the agent does shows here as it does it."
        />
      </Suspense>
    </Dialog>
  );
}

export default AgentInspectorDialog;
