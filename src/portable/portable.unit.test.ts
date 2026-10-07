/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { messageOfApproval, normalizeApproval, whyAsked } from './index';

describe('normalizeApproval', () => {
  it('reads either naming and keeps both', () => {
    const approval = normalizeApproval({
      approval_id: 'a1',
      agentId: 'agent',
      tool_name: 'send_email',
      toolArgs: { to: 'ada@example.com' },
      status: 'approved',
      updated_at: '2026-10-07T10:00:00Z',
      read: true,
    });
    expect(approval).toMatchObject({
      id: 'a1',
      agent_id: 'agent',
      agentId: 'agent',
      tool_name: 'send_email',
      toolName: 'send_email',
      tool_args: { to: 'ada@example.com' },
      toolArgs: { to: 'ada@example.com' },
      read: true,
    });
    // Decided without a resolution time: its last update says when.
    expect(approval?.resolvedAt).toBe('2026-10-07T10:00:00Z');
  });

  it('is null without an id', () => {
    expect(normalizeApproval({ tool_name: 'x' })).toBeNull();
    expect(normalizeApproval(null)).toBeNull();
  });
});

describe('messageOfApproval', () => {
  it('shows a send whole, under either key', () => {
    const args = {
      to: ['ada@example.com', 'bob@example.com'],
      cc: 'cy@example.com',
      subject: 'Report',
      body: 'Attached.',
      thread_id: 't1',
    };
    const expected = {
      to: 'ada@example.com, bob@example.com',
      cc: 'cy@example.com',
      bcc: '',
      subject: 'Report',
      body: 'Attached.',
      forwards: false,
      replies: true,
    };
    expect(messageOfApproval({ tool_args: args })).toEqual(expected);
    expect(messageOfApproval({ toolArgs: args })).toEqual(expected);
  });

  it('is null for anything that is not a message', () => {
    expect(messageOfApproval({ toolArgs: { query: 'x' } })).toBeNull();
    expect(messageOfApproval({ toolArgs: { to: 'a@b.c' } })).toBeNull();
    expect(messageOfApproval({})).toBeNull();
  });

  it('says why it was asked', () => {
    expect(whyAsked({ toolArgs: { _rule: 'Mail asks first' } })).toBe(
      'Mail asks first',
    );
    expect(whyAsked({ tool_args: { _check: 'Spend' } })).toBe('Spend');
  });
});

describe('the portable entry', () => {
  it('imports nothing but its own modules', () => {
    for (const file of readdirSync(__dirname).filter(
      name => name.endsWith('.ts') && !name.includes('.test.'),
    )) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
      expect(
        imports.filter(path => !path.startsWith('./')),
        file,
      ).toEqual([]);
    }
  });
});
