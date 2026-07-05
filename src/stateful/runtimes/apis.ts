/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Runtimes APIs.
 */
import { ISessionContext } from '@jupyterlab/apputils';
import { ServiceManager, Kernel, ServerConnection } from '@jupyterlab/services';
import { IDisposable } from '@lumino/disposable';
import { ISignal } from '@lumino/signaling';
import type {
  ICodeSandboxSnapshot,
  IRuntimeCapabilities,
  IRuntimeModel,
  IDatalayerEnvironment,
  IRuntimeType,
  IRuntimeLocation,
} from '../../models';

/**
 * Abstract interface for the Datalayer session context.
 * It extends the JupyterLab session context
 * to include the runtime location.
 */
export interface IDatalayerSessionContext extends ISessionContext {
  get location(): IRuntimeLocation;
}

/**
 * Runtime creation options
 */
export interface IRuntimeOptions {
  /**
   * Environment name
   */
  environmentName: string;
  /**
   * Credits limit to be consumed by the kernel
   */
  creditsLimit: number;
  /**
   * Runtime type
   */
  type?: IRuntimeType;
  /**
   * Runtime given name
   */
  givenName?: string;
  /**
   * Kernel capabilities
   */
  capabilities?: IRuntimeCapabilities[];
  /**
   * Kernel snapshot to restore
   */
  snapshot?: string;
}

/**
 * Interface for the Environments Manager
 */
export interface IEnvironmentsManager extends IDisposable {
  /**
   * Signal emitted when the environments changes.
   */
  readonly changed: ISignal<
    IEnvironmentsManager,
    readonly IDatalayerEnvironment[]
  >;

  /**
   * A signal emitted when there is a connection failure.
   */
  readonly connectionFailure: ISignal<IEnvironmentsManager, Error>;

  /**
   * Test whether the manager is ready.
   */
  readonly isReady: boolean;

  /**
   * A promise that fulfills when the manager is ready.
   */
  readonly ready: Promise<void>;

  /**
   * Get the list of environments.
   */
  get(): readonly IDatalayerEnvironment[];

  /**
   * Refresh the environment list.
   */
  refresh(): Promise<void>;

  /**
   * Refresh the environments.
   */
  refreshEnvironments(): Promise<void>;
}

/**
 * Interface for the Remote Runtimes Manager
 */
export interface IRemoteRuntimesManager extends IDisposable {
  /**
   * A signal emitted when there is a connection failure.
   */
  readonly connectionFailure: ISignal<IRemoteRuntimesManager, Error>;

  /**
   * Test whether the manager is ready.
   */
  readonly isReady: boolean;

  /**
   * A promise that fulfills when the manager is ready.
   */
  readonly ready: Promise<void>;

  /**
   * Remote kernels changed
   */
  readonly changed: ISignal<IRemoteRuntimesManager, readonly IRuntimeModel[]>;

  /**
   * The server settings.
   */
  readonly serverSettings: ServerConnection.ISettings;

  /**
   * Get the list of remote kernels.
   */
  get(): readonly IRuntimeModel[];

  /**
   * Get the service manager for a remote server
   *
   * @param serverName Remote kernel server name
   * @returns Service manager for the remote server
   */
  getServices(serverName: string): any | undefined;

  /**
   * Refresh the environment list
   */
  refresh(): Promise<void>;

  /**
   * Launch a Kernel.
   *
   * @param createOptions - The kernel creation options
   *
   * @param connectOptions - The kernel connection options
   *
   * @returns A promise that resolves with the kernel connection.
   */
  startNew(
    createOptions: IRuntimeOptions,
    connectOptions?: Omit<
      Kernel.IKernelConnection.IOptions,
      'model' | 'serverSettings'
    >,
  ): Promise<Kernel.IKernelConnection>;

  /**
   * Find a kernel by id.
   *
   * @param id - The id of the target kernel.
   *
   * @returns A promise that resolves with the kernel's model, or undefined if not found.
   */
  findById(id: string): Promise<IRuntimeModel | undefined>;

  /**
   * Connect to an existing kernel.
   *
   * @param options - The connection options.
   *
   * @returns A promise that resolves with the new kernel instance.
   */
  connectTo(
    options: Kernel.IKernelConnection.IOptions,
  ): Kernel.IKernelConnection;

  /**
   * Shut down a kernel by id.
   *
   * @param id - The id of the target kernel.
   *
   * @returns A promise that resolves when the operation is complete.
   */
  shutdown(id: string): Promise<void>;

  /**
   * Shut down all kernels.
   *
   * @returns A promise that resolves when all of the kernels are shut down.
   */
  shutdownAll(): Promise<void>;

  /**
   * @deprecated Use {@link refresh} instead.
   */
  refreshKernels(): Promise<void>;

  /**
   * Snapshot a runtime
   *
   * The runtime may be given by its `id` or `podName`.
   * A custom description for the snapshot can be provided.
   *
   * @returns The snapshot description
   */
  snapshotRuntime(options: {
    /**
     * The runtime id to snapshot
     */
    id?: string;
    /**
     * The kernel pod name to snapshot
     */
    podName?: string;
    /**
     * The snapshot name
     */
    name?: string;
    /**
     * The snapshot description
     */
    description?: string;
    /**
     * Whether to stop the kernel after the snapshot completion or not.
     */
    stop?: boolean;
  }): Promise<ICodeSandboxSnapshot | undefined>;

  /**
   * Load a snapshot within a runtim
   *
   * The runtime may be given by its `id` or `podName`.
   */
  loadSandboxSnapshot(options: {
    /**
     * The kernel id
     */
    id?: string;
    /**
     * The kernel pod name
     */
    podName?: string;
    /**
     * The snapshot UID
     */
    snapshot: string;
  }): Promise<void>;
}

/**
 * Interface for the Remote Services Manager
 */
export interface IRemoteServicesManager extends IDisposable {
  /**
   * The environments manager.
   */
  readonly environments: IEnvironmentsManager;

  /**
   * The remote runtimes manager.
   */
  readonly runtimesManager: IRemoteRuntimesManager;

  /**
   * The server settings.
   */
  readonly serverSettings: ServerConnection.ISettings;

  /**
   * A signal emitted when there is a connection failure with the kernel.
   */
  readonly connectionFailure: ISignal<IRemoteServicesManager, Error>;

  /**
   * Test whether the service manager is disposed.
   */
  readonly isDisposed: boolean;

  /**
   * Whether the remote manager is ready or not.
   */
  readonly isReady: boolean;

  /**
   * Wait for the remote manager to be ready.
   */
  readonly ready: Promise<void>;
}

/**
 * Interface for the Service Manager that manages multiple Jupyter service managers.
 */
export interface IMultiServiceManager extends ServiceManager.IManager {
  /**
   * Service manager for browser kernels.
   *
   * The kernels managed by this service manager
   * are fully executed in a service worker with
   * browser.
   */
  browser: ServiceManager.IManager | undefined;

  /**
   * Signal emitted when the browser services changes.
   */
  readonly browserChanged: ISignal<
    ServiceManager.IManager,
    ServiceManager.IManager | undefined
  >;

  /**
   * Classical Service manager on the Local Jupyter server.
   */
  readonly local: ServiceManager.IManager;

  /**
   * Service manager on a Remote Jupyter server.
   */
  remote: IRemoteServicesManager | undefined;

  /**
   * Signal emitted when the remote services changes.
   */
  readonly remoteChanged: ISignal<
    ServiceManager.IManager,
    IRemoteServicesManager | undefined
  >;
}
