/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { URLExt } from '@jupyterlab/coreutils';
import { Signal } from '@lumino/signaling';
import type {
  ICollaborationProvider,
  ICollaborationProviderEvents,
} from '@datalayer/jupyter-react';
import { WebsocketProvider } from 'y-websocket';

import { requestDatalayerCollaborationSessionId } from './DatalayerCollaboration';

export enum CollaborationStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

type SharedModel = Parameters<ICollaborationProvider['connect']>[0];
type ConnectOptions = Parameters<ICollaborationProvider['connect']>[2];

/**
 * Configuration for Datalayer collaboration provider.
 */
export interface IDatalayerCollaborationConfig {
  /**
   * Base URL for the Datalayer server (optional, uses config from store if not provided).
   */
  runUrl?: string;
  /**
   * Authentication token (optional, uses config from store if not provided).
   */
  token?: string;
  /**
   * Custom fetch function to use for HTTP requests.
   * Useful for proxying requests in environments with CORS restrictions (e.g., VS Code webviews).
   */
  fetchFn?: typeof fetch;
}

/**
 * Datalayer collaboration provider.
 */
export class DatalayerCollaborationProvider implements ICollaborationProvider {
  readonly type = 'datalayer';

  private _status: CollaborationStatus = CollaborationStatus.Disconnected;
  private _provider: WebsocketProvider | null = null;
  private _sharedModel: SharedModel | null = null;
  private _statusChanged = new Signal<
    ICollaborationProvider,
    CollaborationStatus
  >(this);
  private _errorOccurred = new Signal<ICollaborationProvider, Error>(this);
  private _syncStateChanged = new Signal<ICollaborationProvider, boolean>(this);
  private _isDisposed = false;

  private _config: IDatalayerCollaborationConfig;
  private _onSync: ((isSynced: boolean) => void) | null = null;
  private _onConnectionClose: ((event: CloseEvent | null) => void) | null =
    null;

  constructor(config: IDatalayerCollaborationConfig) {
    this._config = config;
  }

  get status(): CollaborationStatus {
    return this._status;
  }

  get isConnected(): boolean {
    return this._status === CollaborationStatus.Connected;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get events(): ICollaborationProviderEvents {
    return {
      statusChanged: this._statusChanged,
      errorOccurred: this._errorOccurred,
      syncStateChanged: this._syncStateChanged,
    };
  }

  private setStatus(status: CollaborationStatus): void {
    if (this._status !== status) {
      this._status = status;
      this._statusChanged.emit(status);
    }
  }

  async connect(
    sharedModel: SharedModel,
    documentId: string,
    options?: ConnectOptions,
  ): Promise<void> {
    if (this.isConnected) {
      console.warn('Already connected to Datalayer collaboration service');
      return;
    }

    this.setStatus(CollaborationStatus.Connecting);

    try {
      const runUrl = this._config.runUrl;
      const token = this._config.token;

      if (!runUrl) {
        throw new Error(
          'Datalayer runUrl is not configured - must be explicitly provided in DatalayerCollaborationProvider config',
        );
      }
      if (!token) {
        throw new Error(
          'Datalayer token is not configured - must be explicitly provided in DatalayerCollaborationProvider config',
        );
      }

      const { ydoc, awareness } = sharedModel;

      const documentURL = URLExt.join(runUrl, '/api/spacer/v1/documents');
      const wsUrl = URLExt.join(runUrl, '/api/spacer/v1/documents/ws').replace(
        /^http/,
        'ws',
      );

      const sessionId = await requestDatalayerCollaborationSessionId({
        url: URLExt.join(documentURL, documentId),
        token,
        fetchFn: this._config.fetchFn,
      });

      this._provider = new WebsocketProvider(wsUrl, documentId, ydoc, {
        disableBc: true,
        params: {
          sessionId,
          token,
        },
        awareness,
        ...options,
      });

      this._sharedModel = sharedModel;

      this._onSync = (isSynced: boolean) => {
        this.handleSync(isSynced);
      };
      this._onConnectionClose = (event: CloseEvent | null) => {
        if (event) {
          this.handleConnectionClose(event);
        }
      };

      this._provider.on('sync', this._onSync);
      this._provider.on('connection-close', this._onConnectionClose);

      console.log('Connected to Datalayer collaboration service');
    } catch (error) {
      this.setStatus(CollaborationStatus.Error);
      this._errorOccurred.emit(error as Error);
      throw error;
    }
  }

  disconnect(): void {
    if (this._provider) {
      if (this._onSync) {
        this._provider.off('sync', this._onSync);
      }
      if (this._onConnectionClose) {
        this._provider.off('connection-close', this._onConnectionClose);
      }
      this._provider.disconnect();
      this._provider = null;
    }
    this._sharedModel = null;
    this.setStatus(CollaborationStatus.Disconnected);
  }

  getProvider(): WebsocketProvider | null {
    return this._provider;
  }

  getSharedModel(): SharedModel | null {
    return this._sharedModel;
  }

  handleConnectionClose(event: CloseEvent): void {
    console.warn('Collaboration connection closed:', event);
    this.setStatus(CollaborationStatus.Disconnected);

    if (event.code === 4002) {
      console.warn('Datalayer collaboration session expired');
    }
  }

  handleSync(isSynced: boolean): void {
    this._syncStateChanged.emit(isSynced);
    if (isSynced) {
      this.setStatus(CollaborationStatus.Connected);
    }
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this.disconnect();
    this._isDisposed = true;
  }
}

export default DatalayerCollaborationProvider;
