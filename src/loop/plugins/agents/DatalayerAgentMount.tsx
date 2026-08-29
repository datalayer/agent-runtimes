/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Datalayer agent bridge, loaded only when something renders it.
 *
 * The bridge itself uses the agent hook, and that hook reaches the whole
 * runtime stack — JupyterLab services, Lumino, the web components. Imported
 * statically by the plugin, all of it lands in the module graph of every host
 * that merely *mounts* the plugin, which is a large bill for a target most
 * workspaces never pick, and enough to break anything loading the plugin
 * outside a browser.
 *
 * So the plugin refers to this, and this defers the rest. It renders nothing
 * either way.
 *
 * @module loop/plugins/agents/DatalayerAgentMount
 */

import { Suspense, lazy } from 'react';

const DatalayerAgentBridge = lazy(async () => {
  const module = await import('./DatalayerAgentBridge');
  return { default: module.DatalayerAgentBridge };
});

export function DatalayerAgentMount(): JSX.Element {
  // No fallback: there is nothing to show while it loads, because there is
  // nothing to show afterwards either.
  return (
    <Suspense fallback={null}>
      <DatalayerAgentBridge />
    </Suspense>
  );
}

export default DatalayerAgentMount;
