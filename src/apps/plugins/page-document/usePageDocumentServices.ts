/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The services and the kernel the conversation's document runs its cells on:
 * the page's kernel (`usePageKernel`), as one service manager and one kernel
 * id that both of its editors join — the panel's, where the person runs a
 * cell, and the in-memory one, where the agent's tools do. A workspace
 * sandbox reached by URL gets a service manager built here; a kernel id the
 * services do not know (or none) is replaced by a kernel started on them, so
 * the two editors never end up on two kernels.
 *
 * @module apps/plugins/page-document/usePageDocumentServices
 */

import { useEffect, useMemo, useState } from 'react';
import { ServerConnection, ServiceManager } from '@jupyterlab/services';
import { disposeServiceManager } from '@datalayer/jupyter-react';
import { usePageKernel, type PageKernel } from '../../pageTools/usePageKernel';
import type { PageDocumentServices } from './memoryDocument';

export type PageDocumentKernel = {
  source: PageKernel['source'];
  /** None until the services are up and their kernel known. */
  services?: PageDocumentServices;
};

/** A service manager for a Jupyter server reached by URL, owned by the hook. */
function useServerManager(
  override: PageKernel['runtimeOverride'],
): ServiceManager.IManager | undefined {
  const baseUrl = override?.baseUrl;
  const token = override?.token ?? '';
  const [manager, setManager] = useState<ServiceManager.IManager>();
  useEffect(() => {
    if (!baseUrl) {
      setManager(undefined);
      return;
    }
    const built = new ServiceManager({
      serverSettings: ServerConnection.makeSettings({
        baseUrl,
        wsUrl: baseUrl.replace(/^http/, 'ws'),
        token,
        appendToken: true,
      }),
    });
    setManager(built);
    return () => {
      disposeServiceManager(built);
    };
  }, [baseUrl, token]);
  return manager;
}

/** The id of a kernel running on `manager`: `wanted` if it runs there. */
async function kernelOn(
  manager: ServiceManager.IManager,
  wanted: string | undefined,
): Promise<string> {
  await manager.ready;
  if (wanted) {
    await manager.kernels.refreshRunning();
    for (const model of manager.kernels.running()) {
      if (model.id === wanted) {
        return wanted;
      }
    }
  }
  const started = await manager.kernels.startNew();
  return started.id;
}

export function usePageDocumentServices(): PageDocumentKernel {
  const kernel = usePageKernel();
  const built = useServerManager(
    kernel.serviceManager ? undefined : kernel.runtimeOverride,
  );
  const manager = kernel.serviceManager ?? built;
  const [resolved, setResolved] = useState<{
    manager: ServiceManager.IManager;
    wanted?: string;
    kernelId: string;
  }>();
  useEffect(() => {
    if (!manager) {
      return;
    }
    let current = true;
    kernelOn(manager, kernel.kernelId).then(
      kernelId => {
        if (current) {
          setResolved({ manager, wanted: kernel.kernelId, kernelId });
        }
      },
      reason => {
        console.error(
          '[agent-runtimes] The document found no kernel on its services.',
          reason,
        );
      },
    );
    return () => {
      current = false;
    };
  }, [manager, kernel.kernelId]);
  const kernelId =
    resolved &&
    resolved.manager === manager &&
    resolved.wanted === kernel.kernelId
      ? resolved.kernelId
      : undefined;
  const services = useMemo(
    () =>
      manager && kernelId ? { serviceManager: manager, kernelId } : undefined,
    [manager, kernelId],
  );
  return { source: kernel.source, services };
}

export default usePageDocumentServices;
