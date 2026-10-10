/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Scenes example (LOOP A-15): the catalogue's scenes in tabs, each
 * drawn from its scene spec — its face and name, its `assumes` line, its
 * members where its stage puts them, its cues as the entry's suggestions —
 * and a member that is not reached drawn all the same, with what it needs.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  listSceneSpecs,
  SCENE_CATALOGUE,
  DISASTER_ASSESSMENT_SCENE_0_0_1,
  SALES_AND_ACCOUNTING_SCENE_0_0_1,
} from '../../specs/scenes';
import { DISASTER_ASSESSMENT_TEAM_SPEC_0_0_1 } from '../../specs/teams/teams';
import { EVENT_RESPONSE_APP_0_0_1 } from '../../specs/apps';
import {
  sceneCuesOf,
  sceneMemberUrl,
  sceneRuntimeMembers,
  sceneRuntimePorts,
  sceneStageOf,
  teamLinksOf,
} from '../../components/teams/sceneStage';
import { placeMembers } from '../../components/teams/A2ATeamGraph';
import { getExampleGroup } from '../exampleGroups';
import { EXAMPLES, getExampleEntries } from '../example-selector';

// No runtime answers: every member on a runtime is not reached.
vi.mock('../../runtimes/browser/a2aPeer', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../runtimes/browser/a2aPeer')>();
  return {
    ...actual,
    connectA2APeer: async () => {
      throw new Error('fetch failed');
    },
  };
});
vi.mock('../../runtimes/browser/model', () => ({
  createBrowserModel: () => ({ specificationVersion: 'v2' }),
}));
// The examples' theme brings jupyter-react, which the page does not need here.
vi.mock('../utils/themedProvider', async () => {
  const { ThemeProvider } = await import('@primer/react');
  return {
    ThemedProvider: ({ children }: { children: React.ReactNode }) => (
      <ThemeProvider>{children}</ThemeProvider>
    ),
  };
});
// The entry in the browser, on a visitor's key: no service is asked here.
vi.mock('../../hooks/useBrowserInference', () => ({
  useBrowserInference: () => ({
    inference: { inferenceUrl: 'http://inference.test', token: 'visitor' },
    needsSignIn: false,
    anonymous: { status: 'idle' },
    inferenceUrl: 'http://inference.test',
  }),
}));

beforeAll(() => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer);
  if (!('DOMMatrixReadOnly' in window)) {
    vi.stubGlobal(
      'DOMMatrixReadOnly',
      class {
        m22 = 1;
        constructor() {}
      },
    );
  }
});

afterEach(() => cleanup());

describe('the stage of a scene', () => {
  it('reads the cast with its applications, the entry and whom it asks', () => {
    const stage = sceneStageOf(DISASTER_ASSESSMENT_SCENE_0_0_1);
    expect(stage.entry.id).toBe('event-response');
    expect(stage.entry.app).toBe(EVENT_RESPONSE_APP_0_0_1);
    expect(stage.entry.runsIn).toBe('browser');
    expect(stage.peers.map(peer => peer.id)).toEqual([
      'disaster-assessment',
      'change-detection',
    ]);
    expect(stage.peers.map(peer => peer.addressVariable)).toEqual([
      'DATALAYER_DEMO_SCENE_DISASTER_ASSESSMENT_DISASTER_ASSESSMENT_A2A_URL',
      'DATALAYER_DEMO_SCENE_DISASTER_ASSESSMENT_CHANGE_DETECTION_A2A_URL',
    ]);
    expect(stage.links).toEqual([
      { from: 'event-response', to: 'disaster-assessment' },
      { from: 'event-response', to: 'change-detection' },
    ]);
    expect(stage.opensFirst).toBe('event-response');
    expect(stage.assumes).toBe(DISASTER_ASSESSMENT_SCENE_0_0_1.setting.assumes);
    // The team says the same links.
    expect(teamLinksOf(DISASTER_ASSESSMENT_TEAM_SPEC_0_0_1)).toEqual(
      stage.links,
    );
  });

  it('places the members as the stage directions say: columns and rows', () => {
    const stage = sceneStageOf(DISASTER_ASSESSMENT_SCENE_0_0_1);
    expect(stage.positions).toEqual({
      'event-response': { x: 0.5, y: 0.2 },
      'disaster-assessment': { x: 0.25, y: 0.75 },
      'change-detection': { x: 0.75, y: 0.75 },
    });
    const placed = placeMembers(
      'event-response',
      ['disaster-assessment', 'change-detection'],
      stage.positions,
    );
    expect(placed).toEqual({
      columns: 3,
      rows: 2,
      places: {
        'event-response': { column: 1, row: 0 },
        'disaster-assessment': { column: 0, row: 1 },
        'change-detection': { column: 2, row: 1 },
      },
    });
    // Sales and Accounting stand side by side, as the layout puts a pair.
    const pair = placeMembers(
      'sales',
      ['accounting'],
      SALES_AND_ACCOUNTING_SCENE_0_0_1.stage.positions,
    );
    expect(pair).toEqual(placeMembers('sales', ['accounting']));
  });

  it('offers the script’s cues as the entry’s suggestions, labelled by its starters', () => {
    const starters = EVENT_RESPONSE_APP_0_0_1.interface.starters ?? [];
    const cues = sceneCuesOf(DISASTER_ASSESSMENT_SCENE_0_0_1, starters);
    expect(cues.map(cue => cue.prompt)).toEqual(
      DISASTER_ASSESSMENT_SCENE_0_0_1.script.map(beat => beat.cue.say),
    );
    for (const cue of cues) {
      const starter = starters.find(one => one.message === cue.prompt);
      expect(cue.label).toBe(
        starter?.label ?? cue.prompt.split(/\s+/).slice(0, 4).join(' '),
      );
    }
    expect(sceneCuesOf(undefined, starters)).toEqual(
      starters.map(one => ({ label: one.label, prompt: one.message })),
    );
  });

  it('serves each member on a runtime on a local port of its own, Accounting on 8767', () => {
    expect(sceneRuntimeMembers()).toEqual([
      'crop-monitoring',
      'disaster-assessment',
      'change-detection',
      'month-end-close',
      'accounting',
    ]);
    // What serve_scenes.py gives by the same rule.
    expect(sceneRuntimePorts()).toEqual({
      'crop-monitoring': 8768,
      'disaster-assessment': 8769,
      'change-detection': 8770,
      'month-end-close': 8771,
      accounting: 8767,
    });
    expect(sceneMemberUrl('change-detection', {})).toBe(
      'http://127.0.0.1:8770/api/v1/a2a/agents/change-detection',
    );
    expect(
      sceneMemberUrl('change-detection', {
        VITE_A2A_CHANGE_DETECTION_URL: 'https://r1.datalayer.run/x',
      }),
    ).toBe('https://r1.datalayer.run/x');
    expect(() => sceneMemberUrl('sales', {})).toThrow('VITE_A2A_SALES_URL');
  });
});

describe('the Scenes example', () => {
  it('is registered in the Apps group, open without an account', () => {
    const entry = getExampleEntries().find(one => one.id === 'ScenesExample');
    expect(entry?.title).toBe('Scenes');
    expect(EXAMPLES.ScenesExample).toBeTypeOf('function');
    expect(getExampleGroup('ScenesExample')).toBe('Apps');
  });

  it('shows the catalogue’s scenes as tabs, each its face and name, and the first one drawn', async () => {
    const { ScenesExample } = await import('../ScenesExample');
    const { container } = render(<ScenesExample />);
    const tabs = [...container.querySelectorAll('[data-scene-tab]')];
    expect(tabs.map(tab => tab.getAttribute('data-scene-tab'))).toEqual(
      Object.keys(SCENE_CATALOGUE),
    );
    for (const scene of listSceneSpecs()) {
      const tab = container.querySelector(`[data-scene-tab="${scene.id}"]`);
      expect(tab?.textContent).toBe(`${scene.emoji} ${scene.name}`);
    }
    const first = listSceneSpecs()[0];
    const box = container.querySelector('[data-scene-example]');
    expect(box?.getAttribute('data-scene-example')).toBe(first.id);
    expect(container.querySelector('[data-scene-assumes]')?.textContent).toBe(
      first.setting.assumes,
    );
  });

  it('draws a scene of three with its graph, its cues, and what a member not reached needs', async () => {
    const { ScenesExample } = await import('../ScenesExample');
    const { container } = render(<ScenesExample />);
    await act(async () => {
      fireEvent.click(
        container.querySelector('[data-scene-tab="disaster-assessment"]')!,
      );
    });
    const box = container.querySelector('[data-scene-example]');
    expect(box?.getAttribute('data-scene-example')).toBe('disaster-assessment');
    const graph = container.querySelector('[data-a2a-team-graph]');
    expect(graph?.getAttribute('data-a2a-members')).toBe('3');
    for (const id of [
      'event-response',
      'disaster-assessment',
      'change-detection',
    ]) {
      expect(
        container.querySelector(`[data-team-member="${id}"]`),
      ).not.toBeNull();
    }
    expect(
      container.querySelector('.react-flow')?.getAttribute('aria-label'),
    ).toBe(
      'Event response and Disaster Assessment, Change detection, over A2A',
    );
    // Earthdata under each specialist.
    expect(
      container.querySelectorAll('[data-team-connection="earthdata"]'),
    ).toHaveLength(2);
    // The entry in the browser, the specialists on their local runtimes.
    expect(
      container.querySelector('[data-team-member="event-response"]')
        ?.textContent,
    ).toContain('in your browser');
    expect(
      container.querySelector('[data-team-member="change-detection"]')
        ?.textContent,
    ).toContain('127.0.0.1:8770');
    // Not reached: drawn all the same, and what each needs said.
    await act(async () => {
      await Promise.resolve();
    });
    const needs = [...container.querySelectorAll('[data-scene-needs]')];
    expect(needs.map(one => one.getAttribute('data-scene-needs'))).toEqual([
      'disaster-assessment',
      'change-detection',
    ]);
    expect(needs[0].textContent).toContain(
      'Disaster Assessment is not reachable at http://127.0.0.1:8769/api/v1/a2a/agents/disaster-assessment: fetch failed',
    );
    expect(needs[0].textContent).toContain(
      "The agent 'worker-disaster-assessment:0.0.1' is not enabled.",
    );
    expect(needs[0].textContent).toContain('serve_scenes.py');
    // What the scene needs, from the catalogue.
    expect(
      container.querySelector('[data-scene-setup]')?.textContent,
    ).toContain("The agent 'worker-event-response:0.0.1' is not enabled.");
    // The composer offers the first cue.
    expect(
      container.querySelector('textarea')?.getAttribute('placeholder'),
    ).toBe(DISASTER_ASSESSMENT_SCENE_0_0_1.script[0].cue.say);
  });
});
