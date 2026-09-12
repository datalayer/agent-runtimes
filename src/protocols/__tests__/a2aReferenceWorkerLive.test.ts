/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `A2AAdapter` against a real, separately-running
 * `agent_teams.a2a.reference_worker` process — a genuine cross-process,
 * cross-language drill, not a mock of either side (ORCHESTRATOR.md, O3-03,
 * closing the one gap its own note named: "not proven end to end against
 * a live, running reference worker, because no reference worker exists
 * yet" — O3-04 built one, this is that drill).
 *
 * Real HTTP, real sockets, a real Python process this file spawns and
 * tears down — `fetch` is not mocked anywhere in this file. Skips itself,
 * rather than failing the suite, where `python3` or `agent_teams` is not
 * on this machine (this package's own CI does not install Python; a
 * developer's machine with the monorepo checked out — where `agent_teams`
 * is editable-installed — does).
 *
 * @module protocols/__tests__/a2aReferenceWorkerLive
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { A2AAdapter } from '../A2AAdapter';
import { createUserMessage } from '../../types/messages';
import type { ProtocolEvent } from '../../types/protocol';

/** A TCP port nothing is listening on right now, for this process to hand the worker. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function canRunReferenceWorker(): Promise<boolean> {
  return new Promise(resolve => {
    const probe = spawn(
      'python3',
      ['-c', 'import agent_teams.a2a.reference_worker'],
      {
        stdio: 'ignore',
      },
    );
    probe.on('error', () => resolve(false));
    probe.on('exit', code => resolve(code === 0));
  });
}

async function waitForReady(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/.well-known/agent-card.json`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`reference worker never became ready at ${baseUrl}`);
}

const available = await canRunReferenceWorker();

describe.skipIf(!available)(
  'A2AAdapter against a live reference-worker process',
  () => {
    let worker: ChildProcessWithoutNullStreams;
    let baseUrl: string;

    beforeAll(async () => {
      const port = await freePort();
      baseUrl = `http://127.0.0.1:${port}`;
      worker = spawn('python3', ['-m', 'agent_teams.a2a.reference_worker'], {
        env: {
          ...process.env,
          REFERENCE_WORKER_HOST: '127.0.0.1',
          REFERENCE_WORKER_PORT: String(port),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }) as ChildProcessWithoutNullStreams;
      await waitForReady(baseUrl, 15_000);
    }, 20_000);

    afterAll(() => {
      worker?.kill('SIGTERM');
    });

    it('negotiates the extension and renders a real reply, over a real socket', async () => {
      const adapter = new A2AAdapter({
        type: 'a2a',
        baseUrl,
      } as never);

      await adapter.connect();
      expect(adapter.supportsOrchestrationExtension).toBe(true);

      const events: ProtocolEvent[] = [];
      adapter.subscribe(event => events.push(event));
      await adapter.sendMessage(
        createUserMessage('What is the capital of France?'),
      );

      const stateUpdate = events.find(e => e.type === 'state-update');
      expect(stateUpdate).toBeDefined();
      const data = stateUpdate?.data as Record<string, unknown>;
      expect(data.state).toBe('completed');
      expect(data.final).toBe(true);
      // The reference worker prices every turn deterministically — proof
      // this ran the real worker, not a fixture standing in for one.
      expect(data.datalayerUsage).toBeDefined();
    });

    it('degrades cleanly against the same worker when the extension is not activated', async () => {
      // A fresh adapter that never calls connect(): supportsOrchestrationExtension
      // stays false, so sendMessage sends no A2A-Extensions header — proving
      // the *default*, not only the advertised-and-used path, is safe
      // against a real worker.
      const adapter = new A2AAdapter({
        type: 'a2a',
        baseUrl,
      } as never);

      const events: ProtocolEvent[] = [];
      adapter.subscribe(event => events.push(event));
      await adapter.sendMessage(
        createUserMessage('hello with no extension activated'),
      );

      expect(events.some(e => e.type === 'error')).toBe(false);
      const stateUpdate = events.find(e => e.type === 'state-update');
      expect(stateUpdate).toBeDefined();
      const data = stateUpdate?.data as Record<string, unknown>;
      expect(data.state).toBe('completed');
      // No datalayer envelope was ever activated for this request, so the
      // worker's own usage report is never read — this is the reduced
      // guarantee, demonstrated against a live process, not stated in prose.
      expect(data.datalayerUsage).toBeUndefined();
    });
  },
);
