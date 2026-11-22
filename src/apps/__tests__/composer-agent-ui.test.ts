/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Canvas offers an application's agent's own UI, and adds nothing by
 * itself (the user, 18 November 2026: Studio applications do not inherit
 * their agent's header; the Maker is offered it as a plugin). A UI part says
 * where in the chat it goes, when it may go in more than one place.
 */

import { describe, expect, it } from 'vitest';
import { APPSPEC_SCHEMA } from '../../specs/appspecSchema';
import { agentUiIdsOf } from '../agentUiChoices';
import { UI_PARTS } from '../plugins/canvas-parts';
import { emptyAppspec, dumpAppspec } from '../apps/appspec';
import {
  AGENTS_OWN_UI,
  PLACEMENT_WORDS,
  partFamilies,
  uiChoiceRoot,
  withAgentsOwnUiFirst,
  withPartAdded,
} from '../composer/appDesign';

const plugin = (part: { example: unknown }): string =>
  String((part.example as { plugin?: unknown }).plugin ?? '');

describe('the toolbox’s UI parts for an application with an agent', () => {
  it('lists the agent’s own first, as its agent’s, the others after', () => {
    const own = agentUiIdsOf('worker-shopper:0.0.1');
    expect(own).toContain('shop-header');
    const parts = withAgentsOwnUiFirst(UI_PARTS, own);
    const families = partFamilies(parts);
    expect(families[0].label).toBe(AGENTS_OWN_UI.label);
    expect(families[0].note).toBe(AGENTS_OWN_UI.note);
    expect(families[0].parts.map(plugin)).toContain('shop-header');
    expect(families[0].parts.every(part => own.includes(plugin(part)))).toBe(
      true,
    );
    // Every UI part is still offered, once.
    expect(parts.map(plugin).sort()).toEqual(UI_PARTS.map(plugin).sort());
  });

  it('offers the Analyst its title bar and the sheet it builds', () => {
    const families = partFamilies(
      withAgentsOwnUiFirst(UI_PARTS, agentUiIdsOf('jupyter-data-analyst')),
    );
    expect(families[0].parts.map(plugin)).toEqual(
      expect.arrayContaining(['notebook-header', 'page-sheet']),
    );
  });

  it('changes nothing without an agent, and adds nothing to the application by itself', () => {
    expect(withAgentsOwnUiFirst(UI_PARTS, [])).toEqual(UI_PARTS);
    const app = emptyAppspec('chat');
    app.agent = 'worker-shopper:0.0.1';
    // The application lists what its kind is drawn with: no header until the Maker drops one.
    expect(app.ui.map(choice => choice.plugin)).not.toContain('shop-header');
    const header = withAgentsOwnUiFirst(UI_PARTS, agentUiIdsOf(app.agent)).find(
      part => plugin(part) === 'shop-header',
    )!;
    const placed = withPartAdded(dumpAppspec(app), header).data as {
      ui: Array<{ plugin: string }>;
    };
    expect(placed.ui.map(choice => choice.plugin)).toContain('shop-header');
  });
});

describe('a UI part’s properties', () => {
  const choiceOf = (ui: Array<Record<string, string>>) => {
    const app = emptyAppspec('chat');
    const data = { ...(dumpAppspec(app) as Record<string, unknown>), ui };
    const root = uiChoiceRoot(APPSPEC_SCHEMA, data, { path: ['ui', 0] });
    return (
      root.$defs as Record<
        string,
        {
          properties: Record<
            string,
            { oneOf?: Array<{ const: string; title: string }> }
          >;
        }
      >
    ).UiChoice.properties;
  };

  it('say where in the chat it goes, its default first, when it may go in more than one place', () => {
    const deck = choiceOf([{ plugin: 'page-deck' }]);
    expect(deck.placement.oneOf).toEqual([
      { const: 'message', title: `${PLACEMENT_WORDS.message} (its default)` },
      { const: 'right', title: PLACEMENT_WORDS.right },
      { const: 'left', title: PLACEMENT_WORDS.left },
    ]);
    const header = choiceOf([{ plugin: 'shop-header' }]);
    expect(header.placement.oneOf?.map(option => option.const)).toEqual([
      'header',
      'right',
      'left',
    ]);
    // One place, or none (a part of the workspace itself): nothing to choose.
    expect(choiceOf([{ plugin: 'chat' }]).placement).toBeUndefined();
  });
});
