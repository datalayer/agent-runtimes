/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A recommendation's card: what `record_recommendation` answers is drawn by
 * the a2ui-surface renderer, and its Approve and Dismiss send the person's
 * decision back as the form submission the runtime reads and keeps.
 *
 * The fixture is the tool's answer as `agent_runtimes.tools.recommendations`
 * writes it (its Python test checks it still is).
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { AGENTSPECS } from '../../specs/agents';
import {
  encodeFormSubmission,
  parseFormSubmission,
} from '../../chat/messages/formSubmission';
import {
  readA2uiToolResult,
  validateA2uiSubmission,
} from '../plugins/a2ui-surface/toolResult';

const card: unknown = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'recommendationCard.json'), 'utf8'),
);

type Node = {
  id: string;
  component: string;
  text?: string;
  child?: string;
  action?: {
    event: { name: string; context: Record<string, unknown> };
  };
};

function components(): Record<string, Node> {
  const parsed = readA2uiToolResult(card, 'datalayer');
  const update = (parsed?.messages ?? []).find(
    message => 'updateComponents' in (message as object),
  ) as { updateComponents: { components: Node[] } } | undefined;
  return Object.fromEntries(
    (update?.updateComponents.components ?? []).map(node => [node.id, node]),
  );
}

describe('a recommendation’s card', () => {
  it('is drawn by the a2ui-surface renderer for Datalayer Steward for AWS', () => {
    expect(AGENTSPECS['worker-steward-aws'].frontendRenderTools).toContainEqual(
      { tool: 'record_recommendation', renderer: 'a2ui-surface' },
    );
  });

  it('reads as a surface of the recommendation, in the page’s catalog', () => {
    const parsed = readA2uiToolResult(card, 'datalayer');
    expect(parsed?.surfaceId).toBe('rec-000000000001');
    expect(
      (parsed?.messages?.[0] as { createSurface: { catalogId: string } })
        .createSurface.catalogId,
    ).toBe('datalayer');
  });

  it('says what Approve means: the change handed over, nothing applied', () => {
    const texts = Object.values(components())
      .map(node => node.text ?? '')
      .join(' ');
    expect(texts).toContain('changes nothing in your account');
    expect(texts).toContain('aws ec2 delete-volume');
    expect(texts).toContain('Rollback:');
  });

  it('sends Approve and Dismiss as the submission the runtime keeps', () => {
    const nodes = components();
    for (const [decision, label] of [
      ['approved', 'Approve'],
      ['dismissed', 'Dismiss'],
    ]) {
      const button = nodes[`${decision}-button`];
      expect(nodes[button.child ?? ''].text).toBe(label);
      const event = button.action?.event;
      // The one action the surface renderer submits.
      expect(event?.name).toBe('submit_a2ui_form');
      const values = event?.context ?? {};
      // No field rules: nothing stops the press.
      expect(validateA2uiSubmission([], values)).toEqual([]);
      const turn = encodeFormSubmission({
        title: 'Recommendation',
        surfaceId: 'rec-000000000001',
        values,
      });
      expect(parseFormSubmission(turn)?.values).toEqual({
        recommendation: 'rec-000000000001',
        decision,
      });
    }
  });
});
