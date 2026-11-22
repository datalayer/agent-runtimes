/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An optional connection (agentspecs 0.0.189, the marketer application's
 * Discord since 0.0.194): read, written back and checked as agentspecs and
 * the Python side do — the application starts without that server, and only
 * a server its agent says optional may be.
 */

import { describe, expect, it } from 'vitest';
import { dumpAppspec, parseAppspec } from '../apps/appspec';
import { checkAppspec } from '../apps/checks';
import { APP_CATALOGUE } from '../../specs/apps';

const app = (connections: unknown[]) => ({
  schema: 'agent.app/v1',
  id: 'posting',
  name: 'Posting',
  kind: 'chat',
  agent: 'worker-marketer:0.0.1',
  connections,
  ui: [{ plugin: 'chat' }],
});

describe('an optional connection', () => {
  it('is read and written back, and left out when not optional', () => {
    const { app: read, problems } = parseAppspec(
      app([
        { server: 'discord:0.0.1', access: 'write', optional: true },
        { server: 'github:0.0.1' },
      ]),
    );
    expect(problems).toEqual([]);
    expect(read.connections.map(connection => connection.optional)).toEqual([
      true,
      false,
    ]);
    expect(dumpAppspec(read).connections).toEqual([
      { server: 'discord:0.0.1', access: 'write', optional: true },
      { server: 'github:0.0.1' },
    ]);
  });

  it('is carried for the catalogue’s marketer application', () => {
    const marketer = APP_CATALOGUE['marketer'];
    expect(
      marketer.connections.find(connection =>
        connection.server.startsWith('discord'),
      )?.optional,
    ).toBe(true);
  });

  it('is only a server its agent starts without', () => {
    const ok = checkAppspec(
      app([{ server: 'discord:0.0.1', access: 'write', optional: true }]),
    );
    expect(ok.problems.join(' ')).not.toContain('is optional');
    const refused = checkAppspec(
      app([{ server: 'github:0.0.1', optional: true }]),
    );
    expect(refused.problems).toContain(
      'The connection “github:0.0.1” is optional, and its agent does not start without it: only a server the agent says optional may be.',
    );
  });

  it('is true or false', () => {
    const wrong = checkAppspec(
      app([{ server: 'discord:0.0.1', optional: 'yes' }]),
    );
    expect(wrong.problems.join(' ')).toContain('optional: is true or false');
  });
});
