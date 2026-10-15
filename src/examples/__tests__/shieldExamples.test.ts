/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Shield's examples (SHIELD SH-23): registered under *Shield*; the policy
 * page draws what `@datalayer/agent-shield` says, in `describeDecision`'s
 * words; the harness page connects to what `examples/shield/
 * harness_on_the_runtime.py --serve` serves, and offers what the fake agent
 * answers — so neither page can describe an example that no longer runs.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import { EXAMPLES, getExampleEntries } from '../example-selector';
import { getExampleGroup } from '../exampleGroups';
import {
  DECISIONS,
  classRows,
  decisionRows,
  kindRows,
  limitRows,
  loadAgentShield,
} from '../shield/shieldPolicyDemo';
import {
  SHIELD_HARNESS_AGENT,
  SHIELD_HARNESS_OPENERS,
} from '../shield/shieldHarness';

const ROOT = join(__dirname, '..', '..', '..');

/** `@datalayer/agent-shield` from the sibling checkout; absent in agent-runtimes' own CI. */
const shield = await loadAgentShield();
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

describe('the Shield examples', () => {
  it('are registered, loadable and grouped under Shield', () => {
    for (const id of ['ShieldHarnessExample', 'ShieldPolicyExample']) {
      const entry = getExampleEntries().find(item => item.id === id);
      expect(entry?.description, id).toBeTruthy();
      expect(EXAMPLES[id], id).toBeTypeOf('function');
      expect(getExampleGroup(id)).toBe('Shield');
    }
  });

  it('connects to what the runtime example serves, and offers what the fake agent answers', () => {
    const script = read('examples/shield/harness_on_the_runtime.py');
    expect(script).toContain('"--serve"');
    expect(script).toContain('8765');
    expect(script).toContain(
      `os.environ["AGENT_RUNTIMES_AGENT_NAME"] = "${SHIELD_HARNESS_AGENT}"`,
    );
    const fake = read('agent_runtimes/tests/fixtures/acp_fake_agent.py');
    for (const [opener, word] of [
      [SHIELD_HARNESS_OPENERS[0], '"edit" in text'],
      [SHIELD_HARNESS_OPENERS[1], '"run " in text'],
      [SHIELD_HARNESS_OPENERS[2], '"outside" in text'],
    ] as const) {
      expect(fake, opener.title).toContain(word);
    }
  });
});

describe.skipIf(shield === null)(
  'the policy page, on @datalayer/agent-shield from the sibling checkout',
  () => {
    it('draws the organization’s document by class, strictest words first', () => {
      const rows = Object.fromEntries(
        classRows(shield!).map(row => [row.actionClass, row.says]),
      );
      expect(rows.execute).toBe("ask me first — 'commands ask'");
      expect(rows.delete).toBe(
        "leave it to me — 'nothing deleted outside' (outside the workspace)",
      );
      expect(rows.read).toBe('nothing said: the next level decides');
    });

    it('classes the tool kinds as the Shield does', () => {
      const kinds = Object.fromEntries(
        kindRows(shield!).map(row => [row.kind, row.actionClass]),
      );
      expect(kinds).toMatchObject({
        fetch: 'read',
        move: 'write',
        other: 'write',
        think: 'nothing to decide',
      });
    });

    it('says the limits soft then hard, in the sentences’ words', () => {
      expect(limitRows(shield!)).toEqual([
        { limit: 'tool calls', soft: '200', hard: '400' },
        { limit: 'model tokens spent', soft: '200000', hard: '500000' },
        { limit: 'credits spent', soft: '500', hard: '1000' },
      ]);
    });

    it('says each decision in describeDecision’s words', () => {
      expect(decisionRows(shield!).map(row => row.words)).toEqual(
        DECISIONS.map(decision => shield!.describeDecision(decision)),
      );
      expect(decisionRows(shield!)[1].words).toBe(
        "ask me first — organization rule 'commands ask'",
      );
      expect(decisionRows(shield!)[3].words).toBe(
        'ask me first — nothing names it',
      );
    });
  },
);
