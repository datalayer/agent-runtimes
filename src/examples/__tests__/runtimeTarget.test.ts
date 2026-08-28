/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The four targets, and the one question that follows from them.
 *
 * "Where does this run?" and "is there an agent?" used to be the same question
 * because there were only two answers. With four, they are not, and these hold
 * the pairing in place: whether a target has an agent decides whether the chat
 * is usable, and every target without one has to say why.
 */

import { describe, expect, it } from 'vitest';

import {
  RUNTIME_TARGETS,
  runtimeTargetCapabilities,
  targetHasAgent,
  type ExampleRuntimeTarget,
} from '../utils/runtimeTargetStore';

describe('the runtime targets', () => {
  it('offers four, nearest the person first', () => {
    expect([...RUNTIME_TARGETS]).toEqual([
      'browser',
      'local',
      'jupyter',
      'datalayer',
    ]);
  });

  it('describes every one of them', () => {
    for (const target of RUNTIME_TARGETS) {
      const capabilities = runtimeTargetCapabilities(target);
      expect(capabilities.label, target).toBeTruthy();
      expect(capabilities.hint, target).toBeTruthy();
    }
  });

  it('runs an agent on local and datalayer, and nowhere else', () => {
    expect(RUNTIME_TARGETS.filter(targetHasAgent)).toEqual([
      'local',
      'datalayer',
    ]);
  });

  it('asks for a sign-in only where one is needed', () => {
    const needsAuth = RUNTIME_TARGETS.filter(
      target => runtimeTargetCapabilities(target).requiresAuth,
    );
    expect(needsAuth).toEqual(['datalayer']);
  });
});

describe('the reason the chat is off', () => {
  it('is given wherever there is no agent', () => {
    for (const target of RUNTIME_TARGETS) {
      const { hasAgent, noAgentReason } = runtimeTargetCapabilities(target);
      if (!hasAgent) {
        // A dead input box with no explanation is the thing this avoids.
        expect(noAgentReason, target).toBeTruthy();
      }
    }
  });

  it('is empty where there is one, so nothing is shown', () => {
    for (const target of RUNTIME_TARGETS.filter(targetHasAgent)) {
      expect(runtimeTargetCapabilities(target).noAgentReason, target).toBe('');
    }
  });

  it('says what is missing, not what went wrong', () => {
    // "No agent in the browser" is a fact about where you are; "failed to
    // connect" would be a lie, since nothing was attempted.
    for (const target of RUNTIME_TARGETS.filter(t => !targetHasAgent(t))) {
      const reason = runtimeTargetCapabilities(target).noAgentReason;
      expect(reason.toLowerCase(), target).toContain('no agent');
    }
  });
});

describe('an unknown target', () => {
  it('falls back to local rather than throwing', () => {
    // Not a compatibility path — a name that is not one of the four is a bug,
    // and the shell should still come up so the bug is visible.
    const capabilities = runtimeTargetCapabilities(
      'nonsense' as ExampleRuntimeTarget,
    );
    expect(capabilities.label).toBe('Local');
  });
});
