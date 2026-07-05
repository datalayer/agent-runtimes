/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { ServerConnection } from '@jupyterlab/services';

/**
 * Create a settings object given a subset of options.
 *
 * TODO This is already present somewhere else?
 *
 * @param options - An optional partial set of options.
 *
 * @returns The full settings object.
 */
export function makeDatalayerSettings(
  baseUrl: string,
  token: string,
  wsUrl?: string,
): ServerConnection.ISettings {
  const serverSettings = ServerConnection.makeSettings({
    baseUrl,
    wsUrl: wsUrl || baseUrl.replace(/^http/, 'ws'),
    token,
    appendToken: true,
    init: {
      mode: 'cors',
      credentials: 'include',
      cache: 'no-store',
    },
  });
  return serverSettings;
}

export default {
  makeDatalayerSettings,
};
