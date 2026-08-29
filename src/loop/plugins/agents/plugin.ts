/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agents plugin: where the agent runs, and the sandbox that comes with it.
 *
 * It was the "code sandbox" plugin, and the rename follows what the choice
 * came to mean. Picking a target used to say only where *code* ran; now it
 * decides where the *agent* runs too — in this page with the Vercel AI SDK, or
 * on a server with pydantic-ai — because the location is what a harness can
 * be, whatever a spec asks for. One control, one answer.
 *
 * It owns the sandbox and publishes it as a service; the notebook and document
 * plugins depend on this plugin rather than on a connection of their own.
 *
 * Which agentspec the session runs is a different question, and belongs to
 * `@datalayer/loop-plugin-agentspecs`.
 *
 * @module loop/plugins/agents/plugin
 */

import { ServerIcon } from '@primer/octicons-react';
import { contribution, definePlugin } from '@datalayer/reactor';
import type { ReactorSlotComponent } from '@datalayer/reactor/react';
import {
  LoopAgentGate,
  LoopCommand,
  LoopSlots,
  LoopViewType,
} from '../../core';
import { SandboxStatusBridge } from './SandboxStatusBridge';
import type { ServiceManagerSource } from './browserService';
import { SandboxSelector } from './SandboxSelector';
import {
  createSwitchableSandboxService,
  type SandboxTarget,
  type SwitchableSandboxService,
  TARGET_SPECS,
  targetHasAgent,
} from './switchable';

export const AGENTS_PLUGIN_NAME = '@datalayer/loop-plugin-agents';

export type AgentsConfig = {
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
  /** Agent creation payload used by the Local target. */
  localAgent?: { createPayload: Record<string, unknown> };
  /**
   * Where the in-page kernel comes from, when the host has one of its own.
   *
   * JupyterLab supplies `suppliedSource(app.serviceManager)`, so the agent runs
   * in the kernel the user is already looking at.
   */
  kernelSource?: ServiceManagerSource;
  /**
   * Whether a reader may choose where the agent runs.
   *
   * True by default: the control in the header is the thing that makes
   * "browser, local or cloud" a choice rather than a build-time decision.
   *
   * A host that has already decided passes `false`, and then only the browser
   * is offered — no control, and the target pinned to the one location that
   * needs nothing behind it. That is what a public page wants: a visitor with
   * no account cannot reach a local server or a Datalayer runtime, so offering
   * them is offering three doors of which two are locked.
   */
  showAgentVariants?: boolean;
};

export type AgentsOutput = {
  sandbox: SwitchableSandboxService;
  /** Rendered by `ReactorSlot`; see `ReactorReactOutput`. */
  components: ReactorSlotComponent[];
};

export const AgentsPlugin = definePlugin<
  AgentsConfig,
  unknown,
  AgentsOutput
>({
  name: AGENTS_PLUGIN_NAME,
  displayName: 'Agents',
  description:
    'Where the agent and its code run: this page, a local server, or a Datalayer runtime.',
  octicon: 'container',
  emoji: '\u{1F4E6}',
  config: { serverUrl: '', target: 'local' },
  // This plugin owns a sandbox — a kernel, a WebSocket, an execution history.
  // Rebuilding it on enable would hand every view a fresh service while the
  // old one kept the connection: toggling the checkbox would silently detach
  // the notebook from the kernel it is showing.
  preserveOutput: true,
  build({ config }) {
    // Read once: it decides both what is offered and where the sandbox starts,
    // and those two must not be able to disagree.
    const showVariants = config.showAgentVariants ?? true;
    return {
      sandbox: createSwitchableSandboxService({
        serverUrl: config.serverUrl,
        // Pinned when there is no choice to make: a host that hid the control
        // must not be started on a target the reader cannot move off.
        initialTarget: showVariants ? config.target : 'browser',
        kernelSource: config.kernelSource,
        localAgent: config.localAgent,
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
        // In the header, where the reader can see where their code is running
        // and move it. Left out entirely rather than disabled when the host
        // gave no choice: a control with one option is furniture.
        ...(showVariants
          ? [
              {
                slot: LoopSlots.header,
                id: 'sandbox-selector',
                Component: SandboxSelector as never,
              },
            ]
          : []),
      ],
    };
  },
  /**
   * Tell the chat whether there is anything to talk to.
   *
   * Through `ctx.contribute` rather than the declarative `contributes` list,
   * because the answer depends on the service this plugin *built* — the target
   * it is currently on. This is the whole of the coupling between the two
   * plugins: the chat imports no sandbox, the sandbox imports no chat, and the
   * reactor carries the one fact that has to cross.
   */
  register({ contribute, state }) {
    const sandbox = state.getOutput()?.sandbox;
    if (!sandbox) {
      return;
    }
    return contribute(
      LoopAgentGate,
      {
        // Read from the workspace, not from the signal: this is called during
        // the chat's render, and the workspace is what React re-runs it for.
        check: workspace => {
          const target =
            (workspace.sandbox.target as SandboxTarget) ??
            sandbox.target.peek();
          return targetHasAgent(target) || TARGET_SPECS[target].noAgentReason;
        },
      },
      { id: 'sandbox-target' },
    );
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

export default AgentsPlugin;
