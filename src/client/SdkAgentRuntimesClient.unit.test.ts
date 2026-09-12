/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect, vi } from 'vitest';

import { SdkAgentRuntimesClient } from './SdkAgentRuntimesClient';
import type { AgentsSdkLike } from './SdkAgentRuntimesClient';

function createSdkStub(): AgentsSdkLike {
  return {
    getRunningAgents: vi.fn().mockResolvedValue([]),
    getAgentStatus: vi.fn().mockResolvedValue({ runtime_name: 'p' } as any),
    pauseAgent: vi.fn().mockResolvedValue(undefined),
    resumeAgent: vi.fn().mockResolvedValue(undefined),
    getAgentCheckpoints: vi.fn().mockResolvedValue([]),
    getAgentUsage: vi.fn().mockResolvedValue({} as any),
    getNotifications: vi.fn().mockResolvedValue([]),
    markNotificationRead: vi.fn().mockResolvedValue(undefined),
    markAllNotificationsRead: vi.fn().mockResolvedValue(undefined),
    createEvent: vi.fn().mockResolvedValue({ success: true, event: {} as any }),
    listEvents: vi.fn().mockResolvedValue({ events: [] } as any),
    getEvent: vi.fn().mockResolvedValue({} as any),
    updateEvent: vi.fn().mockResolvedValue({} as any),
    getAgentOutputs: vi.fn().mockResolvedValue([]),
    getAgentOutput: vi.fn().mockResolvedValue({} as any),
    generateAgentOutput: vi.fn().mockResolvedValue({} as any),
    runEvals: vi.fn().mockResolvedValue({} as any),
    listEvals: vi.fn().mockResolvedValue([]),
    getEval: vi.fn().mockResolvedValue({} as any),
    getContextUsage: vi.fn().mockResolvedValue({} as any),
    getCostUsage: vi.fn().mockResolvedValue({} as any),
    createAgentRuntime: vi.fn().mockResolvedValue({} as any),
  };
}

describe('SdkAgentRuntimesClient', () => {
  describe('requireSdk()', () => {
    it('returns a rejected promise when constructed with null SDK', async () => {
      const client = new SdkAgentRuntimesClient(null);
      await expect(client.listRunningAgents()).rejects.toThrow(
        /Control-plane operations require an SDK instance/,
      );
    });

    it('rejects (not sync-throws) on every method when SDK is null', async () => {
      const client = new SdkAgentRuntimesClient(null);
      // Methods are async, so `requireSdk()`'s throw becomes a rejection —
      // ensures callers can rely on `.catch(...)` / `await` for error handling.
      await expect(client.getAgentStatus('p')).rejects.toThrow();
      await expect(client.pauseAgent('p')).rejects.toThrow();
      await expect(client.resumeAgent('p')).rejects.toThrow();
      await expect(client.markAllNotificationsRead()).rejects.toThrow();
      await expect(client.createAgentRuntime({} as any)).rejects.toThrow();
    });

    it('does not throw synchronously when SDK is null', () => {
      const client = new SdkAgentRuntimesClient(null);
      // The method must return a Promise (even a rejected one) — calling it
      // synchronously must not throw, otherwise `.catch(...)` chains break.
      expect(() => {
        // Swallow the expected rejection so it doesn't leak as an unhandled
        // promise rejection in the test runner.
        client.listRunningAgents().catch(() => {});
      }).not.toThrow();
    });
  });

  describe('method forwarding', () => {
    it('forwards listRunningAgents to sdk.getRunningAgents', async () => {
      const sdk = createSdkStub();
      const client = new SdkAgentRuntimesClient(sdk);
      await client.listRunningAgents();
      expect(sdk.getRunningAgents).toHaveBeenCalledTimes(1);
    });

    it('forwards getAgentStatus with pod and agentId', async () => {
      const sdk = createSdkStub();
      const client = new SdkAgentRuntimesClient(sdk);
      await client.getAgentStatus('pod-1', 'agent-1');
      expect(sdk.getAgentStatus).toHaveBeenCalledWith('pod-1', 'agent-1');
    });

    it('forwards pauseAgent and resumeAgent', async () => {
      const sdk = createSdkStub();
      const client = new SdkAgentRuntimesClient(sdk);
      await client.pauseAgent('pod-1');
      await client.resumeAgent('pod-1');
      expect(sdk.pauseAgent).toHaveBeenCalledWith('pod-1');
      expect(sdk.resumeAgent).toHaveBeenCalledWith('pod-1');
    });

    it('forwards getAgentCheckpoints and getAgentUsage', async () => {
      const sdk = createSdkStub();
      const client = new SdkAgentRuntimesClient(sdk);
      await client.getAgentCheckpoints('pod-1', 'agent-1');
      await client.getAgentUsage('pod-1');
      expect(sdk.getAgentCheckpoints).toHaveBeenCalledWith('pod-1', 'agent-1');
      expect(sdk.getAgentUsage).toHaveBeenCalledWith('pod-1', undefined);
    });

    it('forwards listNotifications to sdk.getNotifications with filters', async () => {
      const sdk = createSdkStub();
      const client = new SdkAgentRuntimesClient(sdk);
      await client.listNotifications({ unread_only: true });
      expect(sdk.getNotifications).toHaveBeenCalledWith({ unread_only: true });
    });

    it('forwards markNotificationRead and markAllNotificationsRead', async () => {
      const sdk = createSdkStub();
      const client = new SdkAgentRuntimesClient(sdk);
      await client.markNotificationRead('n-1');
      await client.markAllNotificationsRead();
      expect(sdk.markNotificationRead).toHaveBeenCalledWith('n-1');
      expect(sdk.markAllNotificationsRead).toHaveBeenCalledTimes(1);
    });

    it('forwards event CRUD methods', async () => {
      const sdk = createSdkStub();
      const client = new SdkAgentRuntimesClient(sdk);
      await client.createEvent({ agent_id: 'a' } as any);
      await client.listEvents('a', { limit: 10 } as any);
      await client.getEvent('a', 'e-1');
      await client.updateEvent('a', 'e-1', { status: 'done' } as any);
      expect(sdk.createEvent).toHaveBeenCalledWith({ agent_id: 'a' });
      expect(sdk.listEvents).toHaveBeenCalledWith('a', { limit: 10 });
      expect(sdk.getEvent).toHaveBeenCalledWith('a', 'e-1');
      expect(sdk.updateEvent).toHaveBeenCalledWith('a', 'e-1', {
        status: 'done',
      });
    });

    it('forwards output methods', async () => {
      const sdk = createSdkStub();
      const client = new SdkAgentRuntimesClient(sdk);
      await client.getAgentOutputs('a');
      await client.getAgentOutput('a', 'o-1');
      await client.generateAgentOutput('a', 'pdf', { foo: 1 });
      expect(sdk.getAgentOutputs).toHaveBeenCalledWith('a');
      expect(sdk.getAgentOutput).toHaveBeenCalledWith('a', 'o-1');
      expect(sdk.generateAgentOutput).toHaveBeenCalledWith('a', 'pdf', {
        foo: 1,
      });
    });

    it('forwards eval methods', async () => {
      const sdk = createSdkStub();
      const client = new SdkAgentRuntimesClient(sdk);
      await client.runEvals('a', {} as any);
      await client.listEvals('a');
      await client.getEval('a', 'ev-1');
      expect(sdk.runEvals).toHaveBeenCalledWith('a', {});
      expect(sdk.listEvals).toHaveBeenCalledWith('a');
      expect(sdk.getEval).toHaveBeenCalledWith('a', 'ev-1');
    });

    it('forwards context and cost usage methods', async () => {
      const sdk = createSdkStub();
      const client = new SdkAgentRuntimesClient(sdk);
      await client.getContextUsage('a');
      await client.getCostUsage('a');
      expect(sdk.getContextUsage).toHaveBeenCalledWith('a');
      expect(sdk.getCostUsage).toHaveBeenCalledWith('a');
    });

    it('forwards createAgentRuntime', async () => {
      const sdk = createSdkStub();
      const client = new SdkAgentRuntimesClient(sdk);
      await client.createAgentRuntime({ agentId: 'a' } as any);
      expect(sdk.createAgentRuntime).toHaveBeenCalledWith({ agentId: 'a' });
    });

    it('returns the underlying SDK promise resolution', async () => {
      const sdk = createSdkStub();
      (sdk.getRunningAgents as any).mockResolvedValue([
        { runtime_name: 'p1' } as any,
      ]);
      const client = new SdkAgentRuntimesClient(sdk);
      await expect(client.listRunningAgents()).resolves.toEqual([
        { runtime_name: 'p1' },
      ]);
    });

    it('propagates SDK rejections', async () => {
      const sdk = createSdkStub();
      (sdk.getAgentStatus as any).mockRejectedValue(new Error('boom'));
      const client = new SdkAgentRuntimesClient(sdk);
      await expect(client.getAgentStatus('p')).rejects.toThrow('boom');
    });
  });
});
