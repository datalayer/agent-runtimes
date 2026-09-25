/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where an example's code runs, and whether an agent runs with it.
 *
 * Four positions rather than two, because "local or cloud" hid a second
 * question a person actually has: is there an agent here at all? One of these
 * targets is a sandbox and nothing else — an anonymous Jupyter server — and an
 * example mounted on it can execute code but has nobody to talk to. Saying so
 * in the model means the chat can be shown and switched off with a reason,
 * rather than each example guessing.
 *
 * The browser used to be the second such target. It has an agent now: the loop
 * turns in the page with the Vercel AI SDK, which needs no server behind it.
 * The spec's own `harness` does not decide that — the location does, because
 * the browser cannot turn a pydantic-ai loop whatever a spec asks for.
 *
 * The examples shell owns launching and switching. An example reads the target
 * and what it offers; it never creates a runtime itself.
 *
 * @module examples/utils/runtimeTargetStore
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

/** Where the code runs. */
export type ExampleRuntimeTarget =
  /** Pyodide in this page, and the agent loop with it. */
  | 'browser'
  /** A local agent-runtimes server and the Jupyter server beside it. */
  | 'local'
  /** An anonymous Jupyter server on prod1.datalayer.run. Sandbox only. */
  | 'jupyter'
  /** An authenticated Datalayer agent runtime. */
  | 'datalayer';

/** What a target offers, so callers ask rather than special-case. */
export interface RuntimeTargetCapabilities {
  /** How to name it in the control. */
  readonly label: string;
  /** One line for the tooltip: what this actually is. */
  readonly hint: string;
  /** Whether an agent runs alongside the sandbox. */
  readonly hasAgent: boolean;
  /** Whether reaching it needs the person to be signed in. */
  readonly requiresAuth: boolean;
  /** Why the chat is off here, when it is. Empty when there is an agent. */
  readonly noAgentReason: string;
}

/**
 * The four targets, in the order the control shows them: nearest the person
 * first, furthest last.
 */
export const RUNTIME_TARGETS: ReadonlyArray<ExampleRuntimeTarget> = [
  'browser',
  'local',
  'jupyter',
  'datalayer',
];

const CAPABILITIES: Record<ExampleRuntimeTarget, RuntimeTargetCapabilities> = {
  browser: {
    label: 'Browser',
    hint: 'Python in this page (Pyodide), with the agent loop running here too — no runtime to allocate. Only the model is asked over the network.',
    hasAgent: true,
    // The agent needs none, but the model it asks does: the inference service
    // holds the provider credentials and admits signed-in members only.
    requiresAuth: true,
    noAgentReason: '',
  },
  local: {
    label: 'Local',
    hint: 'An agent on your machine, with the Jupyter server beside it.',
    hasAgent: true,
    requiresAuth: false,
    noAgentReason: '',
  },
  jupyter: {
    label: 'Jupyter',
    hint: 'An anonymous Jupyter server on prod1.datalayer.run. Sandbox only — no agent.',
    hasAgent: false,
    requiresAuth: false,
    noAgentReason: 'No agent on an anonymous Jupyter server',
  },
  datalayer: {
    label: 'Datalayer',
    hint: 'An authenticated Datalayer agent runtime, with its sandbox.',
    hasAgent: true,
    requiresAuth: true,
    noAgentReason: '',
  },
};

/** What a target offers. */
export function runtimeTargetCapabilities(
  target: ExampleRuntimeTarget,
): RuntimeTargetCapabilities {
  return CAPABILITIES[target] ?? CAPABILITIES.local;
}

/** Whether an agent runs on this target — the question the chat asks. */
export function targetHasAgent(target: ExampleRuntimeTarget): boolean {
  return runtimeTargetCapabilities(target).hasAgent;
}

const STORAGE_KEY = 'agent-runtimes.examples.runtime-target';

const isTarget = (value: unknown): value is ExampleRuntimeTarget =>
  typeof value === 'string' &&
  (RUNTIME_TARGETS as readonly string[]).includes(value);

const readStoredTarget = (): ExampleRuntimeTarget => {
  if (typeof window === 'undefined') {
    return 'local';
  }
  const value = window.localStorage.getItem(STORAGE_KEY);
  return isTarget(value) ? value : 'local';
};

interface RuntimeTargetState {
  target: ExampleRuntimeTarget;
  setTarget: (target: ExampleRuntimeTarget) => void;
}

export const runtimeTargetStore = createStore<RuntimeTargetState>(set => ({
  target: readStoredTarget(),
  setTarget: (target: ExampleRuntimeTarget) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, target);
    }
    set({ target });
  },
}));

export function useRuntimeTargetStore(): RuntimeTargetState;
export function useRuntimeTargetStore<T>(
  selector: (state: RuntimeTargetState) => T,
): T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useRuntimeTargetStore(selector?: any) {
  return useStore(runtimeTargetStore, selector);
}

/**
 * The current target and what it offers, in one read.
 *
 * This is what an example uses: it asks what it has, not where it is.
 */
export function useRuntimeTarget(): {
  target: ExampleRuntimeTarget;
} & RuntimeTargetCapabilities {
  const target = useRuntimeTargetStore(state => state.target);
  return { target, ...runtimeTargetCapabilities(target) };
}
