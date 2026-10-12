/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** A2A card extensions in TypeScript, as `test_protocols_a2a_extensions.py` (PR-02). */

import { contribution, definePlugin } from '@datalayer/reactor';
import { describe, expect, it } from 'vitest';
import fixture from '../../../agent_runtimes/protocols/a2a/fixtures/extensions.json';
import { buildProtocolsReactor } from '../agentProtocols';
import {
  A2AOrchestrationExtensions,
  A2AOtherExtensions,
  FACE_URI,
  ORCHESTRATION_URI,
  cardExtensions,
  extensionsOf,
  findExtension,
  negotiateExtensions,
  unsupportedRequired,
  type A2AExtension,
} from './index';
import type { AppA2ASpec } from '../../types/agentspecs';

const LOYALTY = 'https://example.com/ext/loyalty/v1';
const CARD = {
  capabilities: {
    extensions: [
      { uri: FACE_URI, params: { emoji: '🛍' } },
      { uri: LOYALTY, required: true },
    ],
  },
};
const loyalty: A2AExtension = {
  uri: LOYALTY,
  description: 'Points for each order.',
  required: false,
  params: context => ({ program: `${context.agentId}-points` }),
};
const withLoyalty = definePlugin({
  name: 'loyalty',
  contributes: [
    contribution(A2AOtherExtensions, loyalty, { id: LOYALTY, order: 50 }),
  ],
});

describe('A2A card extensions', () => {
  it('reads a card', () => {
    expect(extensionsOf(CARD).map(e => e.uri)).toEqual([FACE_URI, LOYALTY]);
    expect(findExtension(CARD, FACE_URI)?.params).toEqual({ emoji: '🛍' });
    expect(unsupportedRequired(CARD, [])).toEqual([LOYALTY]);
    expect(extensionsOf({})).toEqual([]);
    expect(() =>
      extensionsOf({
        capabilities: {
          extensions: [
            { uri: 'https://a.test/x' },
            { uri: 'https://a.test/x' },
          ],
        },
      }),
    ).toThrow('twice');
    expect(() =>
      extensionsOf({ capabilities: { extensions: [{ uri: 'loyalty' }] } }),
    ).toThrow('URI');
  });

  it('publishes what is contributed, then what the card declares', () => {
    const plain = cardExtensions(buildProtocolsReactor(), {
      agentId: 'shop',
      apiPrefix: '/api/v1',
    });
    expect(plain).toEqual([
      {
        uri: ORCHESTRATION_URI,
        description: expect.any(String),
        required: false,
        params: { pause: '/api/v1/a2a/pause', steer: '/api/v1/a2a/steer' },
      },
    ]);
    const reactor = buildProtocolsReactor([withLoyalty]);
    const published = cardExtensions(
      reactor,
      { agentId: 'shop', face: { emoji: '🛍' } },
      [{ uri: 'https://b.test/x' }],
    );
    expect(published.map(e => e.uri)).toEqual([
      ORCHESTRATION_URI,
      FACE_URI,
      LOYALTY,
      'https://b.test/x',
    ]);
    expect(() =>
      cardExtensions(reactor, { agentId: 'shop' }, [{ uri: LOYALTY }]),
    ).toThrow('published twice');
  });

  it("publishes the extensions an application's Appspec declares", () => {
    // `a2a.extensions` as agentspecs writes it (AGENT_PROTOCOLS PR-02).
    const a2a: AppA2ASpec = {
      extensions: [
        {
          uri: 'https://shop.example/extensions/gift-wrap/v1',
          description: 'Wraps an order as a gift.',
          required: false,
          params: { papers: ['red', 'gold'] },
        },
      ],
    };
    const card = {
      capabilities: {
        extensions: cardExtensions(
          buildProtocolsReactor(),
          { agentId: 'shop', face: { emoji: '🛍' } },
          a2a.extensions,
        ),
      },
    };
    expect(extensionsOf(card).map(e => e.uri)).toEqual([
      ORCHESTRATION_URI,
      FACE_URI,
      'https://shop.example/extensions/gift-wrap/v1',
    ]);
    expect(
      findExtension(card, 'https://shop.example/extensions/gift-wrap/v1')
        ?.params,
    ).toEqual({ papers: ['red', 'gold'] });
  });

  it('a host replaces an extension by a lower order', () => {
    const reactor = buildProtocolsReactor([
      definePlugin({
        name: 'host',
        contributes: [
          contribution(
            A2AOrchestrationExtensions,
            {
              uri: ORCHESTRATION_URI,
              description: 'Pause only.',
              required: false,
              params: () => ({ pause: '/pause' }),
            },
            { id: 'host', order: 10 },
          ),
        ],
      }),
    ]);
    expect(cardExtensions(reactor, { agentId: 'a' })[0].params).toEqual({
      pause: '/pause',
    });
  });

  it('negotiates with an agent', () => {
    expect(() => negotiateExtensions(CARD, buildProtocolsReactor())).toThrow(
      LOYALTY,
    );
    expect(
      negotiateExtensions(CARD, buildProtocolsReactor([withLoyalty])),
    ).toEqual([FACE_URI, LOYALTY]);
  });
});

describe('the paired fixture (PR-51, EX-09)', () => {
  it('reads as test_protocols_a2a_extensions.py reads it', () => {
    expect(extensionsOf(fixture.card)).toEqual(fixture.extensions);
    expect(findExtension(fixture.card, fixture.find.uri)?.uri).toBe(
      fixture.find.uri,
    );
    expect(findExtension(fixture.card, fixture.find.absent)).toBeUndefined();
    for (const { supported, missing } of fixture.unsupported) {
      expect(unsupportedRequired(fixture.card, supported)).toEqual(missing);
    }
    for (const refused of fixture.refused) {
      expect(() => extensionsOf(refused)).toThrow();
    }
    expect(extensionsOf(fixture.none)).toEqual([]);
  });
});
