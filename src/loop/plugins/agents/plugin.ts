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
import { DatalayerAgentMount } from './DatalayerAgentMount';
import type { ServiceManagerSource } from './browserService';
import { AgentSummaryPanel } from './AgentSummaryPanel';
import { AnonymousKeyBadge } from './AnonymousKeyBadge';
import { SandboxSelector } from './SandboxSelector';
import { TeamMemberPicker } from './TeamMemberPicker';
import { createTeamSelection, type TeamSelection } from './team';
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
   * Whether the workspace header carries the agent summary badge.
   *
   * True by default: the badge is how the workspace says what it is talking
   * to. False for a host whose page already introduces the agent — a landing
   * page names it in the copy around the embed, and a second summary inside
   * is the introduction made twice.
   */
  showAgentSummary?: boolean;
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
  /**
   * The team this workspace works with, by id.
   *
   * A team is a group of agents with one front door — `jupyter-notebook` is a
   * tutor and a compactor behind a supervising tutor. Given one, the header
   * gains a control for choosing which member the next prompt reaches, and the
   * teamspec decides what each of them is told about the conversation.
   */
  teamId?: string;
  /**
   * The agentspec the Datalayer target runs.
   *
   * That target allocates a runtime and creates an agent on it from this spec.
   * The other targets take their agent from wherever they already run one.
   */
  datalayerAgentSpecId?: string;
};

export type AgentsOutput = {
  sandbox: SwitchableSandboxService;
  /**
   * Who the next prompt goes to, when this workspace runs a team.
   *
   * Absent for the ordinary case of one agent: a workspace with nothing to
   * choose between should not have to carry a selection, and a picker with one
   * option is furniture.
   */
  team?: TeamSelection;
  /** Rendered by `ReactorSlot`; see `ReactorReactOutput`. */
  components: ReactorSlotComponent[];
};

export const AgentsPlugin = definePlugin<AgentsConfig, unknown, AgentsOutput>({
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
    // Undefined for a workspace with no team, or a team id that names nothing:
    // a picker is worth having only when there is a choice to make.
    const team = config.teamId ? createTeamSelection(config.teamId) : undefined;
    return {
      team,
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
        {
          // Renders nothing; it launches the Datalayer target's agent and
          // reports the runtime. In the status slot because that is where the
          // things that keep the workspace informed live. It reads the spec
          // from this plugin's config itself, so no closure is needed here,
          // and it is loaded lazily so the runtime stack it needs stays out
          // of every host's module graph.
          slot: LoopSlots.status,
          id: 'datalayer-agent',
          Component: DatalayerAgentMount as never,
        },
        // In the header, where the reader can see where their code is running
        // and move it. Left out entirely rather than disabled when the host
        // gave no choice: a control with one option is furniture.
        // Beside the sandbox control: one says where the agent runs, the
        // other which agent it is, and a person reads them together. The
        // footer under the prompt offers the same choice for a workspace
        // mounted without a header.
        ...(team
          ? [
              {
                slot: LoopSlots.header,
                id: 'team-member-picker',
                Component: TeamMemberPicker as never,
              },
            ]
          : []),
        ...(showVariants
          ? [
              {
                slot: LoopSlots.header,
                id: 'sandbox-selector',
                Component: SandboxSelector as never,
              },
            ]
          : []),
        // What the workspace is talking to. Contributed here rather than drawn
        // by whichever page embeds the workspace: the agent is chosen inside
        // it, by this plugin, so this plugin is the only thing that can
        // describe it without going stale. Left out entirely when the host
        // has said no — an unmounted component costs nothing.
        ...(config.showAgentSummary === false
          ? []
          : [
              {
                slot: LoopSlots.header,
                id: 'agent-summary',
                Component: AgentSummaryPanel as never,
              },
            ]),
        // How long a visitor with no account has left. In both headers,
        // because a host shows at most one of them and the clock must survive
        // either choice: the landing page used to hide the workspace header
        // and keep the chat's, and now does the opposite. The badge renders
        // nothing without an anonymous key, so the workspace that shows both
        // rows costs a duplicate only in the one anonymous case.
        {
          slot: LoopSlots.chatHeader,
          id: 'anonymous-key',
          Component: AnonymousKeyBadge as never,
        },
        {
          slot: LoopSlots.header,
          id: 'anonymous-key-header',
          Component: AnonymousKeyBadge as never,
        },
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
