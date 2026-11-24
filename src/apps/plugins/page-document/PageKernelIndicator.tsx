/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the conversation's document runs its cells on, on its toolbar (the
 * user, 24 November 2026: "show also the kernel indicator in the toolbar"):
 * which kernel — Python in this browser, or the workspace's runtime — and
 * its state, starting, idle or busy. The light is the notebook toolbar's
 * (`KernelIndicator`, with its details on hover); the words beside it say
 * the same for someone who does not read lights.
 *
 * @module apps/plugins/page-document/PageKernelIndicator
 */

import { useEffect, useState, type JSX } from 'react';
import type { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
import type { ToolbarItem } from '@datalayer/primer-addons';
import { Box } from '@datalayer/primer-addons';
import { Text } from '@primer/react';
import { KernelIndicator } from '@datalayer/jupyter-react';
import type { PageKernel } from '../../pageTools/usePageKernel';

export type PageKernelState =
  | 'starting'
  | 'connecting'
  | 'idle'
  | 'busy'
  | 'restarting'
  | 'dead'
  | 'unknown';

const STATE_LABELS: Record<PageKernelState, string> = {
  starting: 'Starting',
  connecting: 'Connecting',
  idle: 'Idle',
  busy: 'Busy',
  restarting: 'Restarting',
  dead: 'Stopped',
  unknown: 'Connected',
};

/** Where the cells run, in words. */
export function kernelPlace(source: PageKernel['source']): string {
  return source === 'workspace' ? 'Runtime' : 'Python in this browser';
}

/** The state of `kernel`, followed as it changes; `starting` with none. */
export function useKernelState(
  kernel: IKernelConnection | null,
): PageKernelState {
  const read = (): PageKernelState => {
    if (!kernel) {
      return 'starting';
    }
    if (kernel.connectionStatus !== 'connected') {
      return 'connecting';
    }
    switch (kernel.status) {
      case 'starting':
        return 'starting';
      case 'idle':
        return 'idle';
      case 'busy':
        return 'busy';
      case 'restarting':
      case 'autorestarting':
        return 'restarting';
      case 'dead':
      case 'terminating':
        return 'dead';
      default:
        return 'unknown';
    }
  };
  const [state, setState] = useState<PageKernelState>(read);
  useEffect(() => {
    const update = () => setState(read());
    update();
    if (!kernel) {
      return;
    }
    kernel.statusChanged.connect(update);
    kernel.connectionStatusChanged.connect(update);
    return () => {
      kernel.statusChanged.disconnect(update);
      kernel.connectionStatusChanged.disconnect(update);
    };
    // `read` closes over `kernel` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kernel]);
  return state;
}

export function PageKernelIndicator({
  source,
  kernel,
}: {
  source: PageKernel['source'];
  kernel: IKernelConnection | null;
}): JSX.Element {
  const state = useKernelState(kernel);
  const place = kernelPlace(source);
  return (
    <Box
      display="flex"
      alignItems="center"
      gap={1}
      data-page-kernel-state={state}
      aria-label={`Kernel: ${place}, ${STATE_LABELS[state]}`}
    >
      <KernelIndicator
        kernel={kernel}
        state={kernel ? undefined : 'connected-starting'}
        environmentName={place}
        overlayTitle="Document kernel"
        bordered={false}
      />
      <Text sx={{ fontSize: 0, color: 'fg.muted', whiteSpace: 'nowrap' }}>
        {place} · {STATE_LABELS[state]}
      </Text>
    </Box>
  );
}

/** Trailing edge of the document's toolbar, past the Lexical items. */
const KERNEL_ORDER = 1000;

/** The toolbar items that put the indicator on the document's toolbar. */
export function pageKernelToolbarItems(
  source: PageKernel['source'],
  kernel: IKernelConnection | null,
): ToolbarItem[] {
  return [
    {
      key: 'page-document-kernel-spacer',
      type: 'spacer',
      order: KERNEL_ORDER - 1,
    },
    {
      key: 'page-document-kernel',
      type: 'custom',
      order: KERNEL_ORDER,
      group: 'kernel',
      render: () => <PageKernelIndicator source={source} kernel={kernel} />,
    },
  ];
}

export default PageKernelIndicator;
