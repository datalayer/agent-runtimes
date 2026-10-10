/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent an application runs, turned in the page (LOOP H-01, E-11): its
 * agent's spec — a Cog's through the Cogs catalogue — and the application's
 * own instructions on top, as a runtime builds it; an agent that resolves to
 * nothing is refused rather than run bare.
 */

import { describe, expect, it } from 'vitest';
import { LoopAgentBlueprint } from '../core';
import { APP_CATALOGUE } from '../../specs/apps';
import { getCog } from '../../specs/cogs';
import { getAgentspecs } from '../../specs/agents';
import { defineAppPlugin } from '../apps/AppRenderer';
import {
  agentInstructions,
  inPageAgentRefusal,
  resolveAgentspec,
} from '../apps/agent';

const blueprintOf = (plugin: ReturnType<typeof defineAppPlugin>) =>
  (plugin.contributes ?? []).find(
    (item: { point?: unknown }) => item.point === LoopAgentBlueprint,
  ) as unknown as {
    value: { specId: string; instructions?: string; model?: string };
  };

/** What the page tells an application's agent, as ChatView builds it. */
const inPage = (app: (typeof APP_CATALOGUE)[string]) => {
  const blueprint = blueprintOf(defineAppPlugin(app)).value;
  const spec = resolveAgentspec(blueprint.specId);
  return {
    spec,
    instructions: agentInstructions(spec, blueprint.instructions),
    model: blueprint.model ?? spec?.model,
    refusal: inPageAgentRefusal(blueprint.specId, spec),
  };
};

describe('an application’s agent in the page', () => {
  it('resolves a Cog through the Cogs catalogue, which the agentspecs do not hold', () => {
    expect(getAgentspecs('cog-crawler')).toBeUndefined();
    expect(resolveAgentspec('cog-crawler:0.0.1')).toBe(
      getCog('cog-crawler')?.spec,
    );
  });

  it('gives a Cog-agent application the Cog’s instructions, Frames and model', () => {
    const research = APP_CATALOGUE['web-research'];
    expect(research.agent.startsWith('cog-crawler')).toBe(true);
    const cog = getCog('cog-crawler')!.spec;
    const { instructions, model, refusal } = inPage(research);
    expect(refusal).toBeUndefined();
    expect(instructions).toContain(cog.systemPrompt!.trim());
    expect(instructions).toContain('You work under these Frames.');
    expect(model).toBe(cog.model);
  });

  it('tells the agent the application’s own instructions after its agent’s, as a runtime does', () => {
    const interview = APP_CATALOGUE['customer-interview'];
    expect(interview.instructions.trim()).not.toBe('');
    const cog = getCog('cog-customer-interviewer')!.spec;
    const { instructions } = inPage(interview);
    expect(instructions).toBe(
      `${cog.systemPrompt!.trim()}\n\n${interview.instructions.trim()}`,
    );
  });

  it('runs on the application’s model when it names one', () => {
    const research = APP_CATALOGUE['web-research'];
    const { model, instructions } = inPage({
      ...research,
      model: 'openai:gpt-4.1',
      instructions: 'Answer in French.',
    });
    expect(model).toBe('openai:gpt-4.1');
    expect(instructions?.endsWith('Answer in French.')).toBe(true);
  });

  it('refuses an agent that resolves to nothing, in a sentence', () => {
    const research = APP_CATALOGUE['web-research'];
    const { spec, instructions, refusal } = inPage({
      ...research,
      agent: 'no-such-agent:0.0.1',
    });
    expect(spec).toBeUndefined();
    expect(instructions).toBeUndefined();
    expect(refusal).toBe(
      'There is no agent or Cog named “no-such-agent” in this page, so it cannot answer here.',
    );
  });
});
