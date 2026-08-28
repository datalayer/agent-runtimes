/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Code Sandbox plugin: the base every other view leans on.
 *
 * It owns the sandbox and publishes it as a service; the notebook and document
 * plugins depend on this extension rather than on a connection of their own.
 *
 * @module loop/plugins/code-sandbox/extension
 */

import { ServerIcon } from '@primer/octicons-react';
import { contribution, defineExtension } from '@datalayer/reactor';
import type { ReactorSlotComponent } from '@datalayer/reactor/react';
import { LoopCommand, LoopSlots, LoopViewType } from '../../core';
import { SandboxStatusBridge } from './SandboxStatusBridge';
import type { ServiceManagerSource } from './browserService';
import { SandboxSelector } from './SandboxSelector';
import {
  createSwitchableSandboxService,
  type SandboxTarget,
  type SwitchableSandboxService,
} from './switchable';

export const CODE_SANDBOX_EXTENSION_NAME = '@datalayer/loop-plugin-code-sandbox';

export type CodeSandboxConfig = {
  /** Server the server-backed targets are reached through. */
  serverUrl: string;
  /**
   * Where the sandbox starts.
   *
   * `browser` runs Python in the page through a Pyodide kernel; `local` and
   * `cloud` are server-backed and differ in the variant the server runs. A
   * reader can move it afterwards from the header — the same interface, three
   * things behind it, which is the test of whether it is an interface at all.
   */
  target?: SandboxTarget;
  /**
   * Where the in-page kernel comes from, when the host has one of its own.
   *
   * JupyterLab supplies `suppliedSource(app.serviceManager)`, so the agent runs
   * in the kernel the user is already looking at.
   */
  kernelSource?: ServiceManagerSource;
};

export type CodeSandboxOutput = {
  sandbox: SwitchableSandboxService;
  /** Rendered by `ReactorSlot`; see `ReactorReactOutput`. */
  components: ReactorSlotComponent[];
};

export const CodeSandboxExtension = defineExtension<
  CodeSandboxConfig,
  unknown,
  CodeSandboxOutput
>({
  name: CODE_SANDBOX_EXTENSION_NAME,
  config: { serverUrl: '', target: 'local' },
  // This plugin owns a sandbox — a kernel, a WebSocket, an execution history.
  // Rebuilding it on enable would hand every view a fresh service while the
  // old one kept the connection: toggling the checkbox would silently detach
  // the notebook from the kernel it is showing.
  preserveOutput: true,
  build({ config }) {
    return {
      sandbox: createSwitchableSandboxService({
        serverUrl: config.serverUrl,
        initialTarget: config.target,
        kernelSource: config.kernelSource,
      }),
      // In a slot rather than inside the sandbox view: the sandbox does not
      // stop existing when someone switches to the chat tab, and neither
      // should the connection that tracks it.
      components: [
        {
          slot: LoopSlots.status,
          id: 'sandbox-status',
          Component: SandboxStatusBridge as never,
        },
        {
          // In the header, where the reader can see where their code is
          // running and move it — the one control that makes "browser, local
          // or cloud" a choice rather than a build-time decision.
          slot: LoopSlots.header,
          id: 'sandbox-selector',
          Component: SandboxSelector as never,
        },
      ],
    };
  },
  contributes: [
    contribution(
      LoopViewType,
      {
        viewType: 'sandbox',
        title: 'Sandbox',
        icon: ServerIcon,
        order: 40,
        load: () => import('./SandboxView'),
      },
      { id: 'sandbox', order: 40 },
    ),
    contribution(
      LoopCommand,
      {
        name: 'sandbox',
        aliases: ['code-sandbox'],
        description: 'Show the code sandbox: variant, kernel, Jupyter server',
        group: 'Capabilities',
        run: async ({ workspace }) => {
          workspace.setActiveViewType('sandbox');
        },
      },
      { id: 'sandbox' },
    ),
  ],
});

export default CodeSandboxExtension;
