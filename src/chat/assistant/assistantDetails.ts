/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the assistant's menu knows of its agent and of its code sandbox, for
 * *Agent Details…* and *Code Sandbox Details…*.
 *
 * Light on purpose: types and pure helpers only. The dialogs that draw them
 * — `AgentDetails`, jupyter-react's `KernelVariables` — are loaded when one
 * is opened, never with the character.
 *
 * @module chat/assistant/assistantDetails
 */

import type { Kernel } from '@jupyterlab/services';
import type { KernelVariablesExecution } from '@datalayer/jupyter-react';

/** Where a sandbox runs. */
export type AssistantSandboxKind =
  /** Pyodide, in this page. */
  | 'browser'
  /** A Jupyter server on this machine, the agent's own. */
  | 'local'
  /** A Jupyter server elsewhere. */
  | 'jupyter'
  /** A Datalayer cloud runtime. */
  | 'cloud'
  /** In the agent runtime's process, or at a provider (`eval`, `e2b`, …). */
  | 'runtime';

/** A code sandbox, as much of it as its host knows. */
export type AssistantSandbox = {
  kind: AssistantSandboxKind;
  /** `running`, `starting`, `idle`, `stopped`, `error`. */
  status?: string;
  /** The sandbox manager's variant: `jupyter-server`, `eval`, `datalayer`, a provider. */
  variant?: string;
  /** The Jupyter server, or the base the sandbox is reached at. Shown without its tokens. */
  url?: string;
  /** The token the Jupyter server wants: used to connect, never shown. */
  token?: string;
  /** The kernel the sandbox runs, on that server. */
  kernelId?: string;
  /** The agent whose sandbox it is (a local server's per-agent sandbox). */
  agentId?: string;
  /** The environment it runs in. */
  environment?: string;
  /** A cloud runtime's identity: its uid, never its pod's name. */
  runtimeUid?: string;
  /** When a cloud runtime ends; `null` when it is not metered. */
  expiresAt?: string | number | null;
  /** What a cloud runtime burns, in credits per hour. */
  burningRate?: number;
  startedAt?: string | number;
  lastActivity?: string | number;
  /** The kernel, when the page talks to it: listed live, widgets drawn. */
  connection?: Kernel.IKernelConnection | null;
  /**
   * The agent-runtimes server whose `/api/v1/sandbox/execute` runs code in
   * the agent's sandbox, when the page has no kernel connection to it.
   */
  serverUrl?: string;
};

/** The statuses of a sandbox that has something to read. */
const LIVE = new Set(['running', 'idle', 'busy', 'starting']);

/** Whether a sandbox is up: one with no status is taken to be. */
export function sandboxIsLive(sandbox: AssistantSandbox): boolean {
  return sandbox.status === undefined || LIVE.has(sandbox.status);
}

/** What the dialog says of a sandbox that is not running yet. */
export const NO_SANDBOX_YET =
  'No sandbox is running yet: run a cell or ask the agent to execute code.';

/** What each kind is called. */
export const SANDBOX_KIND_LABELS: Record<AssistantSandboxKind, string> = {
  browser: 'Python in your browser (Pyodide)',
  local: 'Local Jupyter server',
  jupyter: 'Jupyter server',
  cloud: 'Datalayer cloud runtime',
  runtime: 'In the agent runtime',
};

/** Whether a URL is on this machine. */
export function isLocalUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    const host = new URL(url).hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

/** Query parameters that carry a secret. */
const SECRET_PARAMS =
  /^(token|access_token|api_key|apikey|key|auth|password|secret|signature|sig|jwt)$/i;

/** A URL fit to show: no credentials, no token in its query. */
export function displayUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    for (const name of [...parsed.searchParams.keys()]) {
      if (SECRET_PARAMS.test(name)) {
        parsed.searchParams.delete(name);
      }
    }
    return parsed.toString();
  } catch {
    // Not a URL: shown up to its query, which is where a token would be.
    return url.split('?')[0];
  }
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

/**
 * A sandbox from the status its server reports — the Loop's sandbox
 * service, or the agent's codemode status — and what the host adds.
 */
export function assistantSandboxOf(
  status: Record<string, unknown> | null | undefined,
  options: { agentId?: string; serverUrl?: string; state?: string } = {},
): AssistantSandbox | undefined {
  if (!status) {
    return undefined;
  }
  const variant = text(status.variant);
  const url = text(status.jupyter_url) ?? text(status.agent_base_url);
  const running =
    status.sandbox_running === true || status.jupyter_connected === true;
  if (!variant && !running) {
    return undefined;
  }
  const kind: AssistantSandboxKind =
    variant === 'datalayer'
      ? 'cloud'
      : variant === 'jupyter-server' || variant === 'jupyter'
        ? isLocalUrl(text(status.jupyter_url))
          ? 'local'
          : 'jupyter'
        : 'runtime';
  return {
    kind,
    status: options.state ?? (running ? 'running' : 'stopped'),
    variant,
    url,
    token: text(status.jupyter_token),
    kernelId: text(status.kernel_id),
    agentId: options.agentId,
    environment: text(status.environment_name),
    serverUrl: options.serverUrl,
  };
}

/**
 * Run code in an agent's sandbox through its agent-runtimes server
 * (`POST /api/v1/sandbox/execute`), whatever the variant: what a page with
 * no kernel connection to the sandbox lists its variables with.
 */
export function sandboxExecuteOverHttp(
  serverUrl: string,
  agentId?: string,
): (code: string) => Promise<KernelVariablesExecution> {
  const base = serverUrl.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  return async code => {
    const response = await fetch(`${base}/api/v1/sandbox/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, agent_id: agentId }),
    });
    if (!response.ok) {
      return {
        stdout: '',
        error: `The sandbox did not run the code (HTTP ${response.status}).`,
      };
    }
    const payload = (await response.json()) as {
      stdout?: string;
      error?: string | null;
    };
    return { stdout: payload.stdout ?? '', error: payload.error ?? undefined };
  };
}

/** How long until a moment, for a reader: `1 h 20 min`, `never`. */
export function timeLeft(
  expiresAt: string | number | null | undefined,
  now: number = Date.now(),
): string | undefined {
  if (expiresAt === null) {
    return 'never';
  }
  if (expiresAt === undefined || expiresAt === '') {
    return undefined;
  }
  const at =
    typeof expiresAt === 'number'
      ? expiresAt < 1e12
        ? expiresAt * 1000
        : expiresAt
      : Date.parse(expiresAt);
  if (!Number.isFinite(at)) {
    return undefined;
  }
  const minutes = Math.round((at - now) / 60000);
  if (minutes <= 0) {
    return 'ended';
  }
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}
