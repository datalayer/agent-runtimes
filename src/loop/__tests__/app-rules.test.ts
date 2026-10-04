/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an application does when its agent calls a tool.
 *
 * The decision is written three times — in agentspecs, in the runtime, and
 * here, where it is shown before it is made. `APP_BEHAVIOURS` is what
 * agentspecs decided for every application of the catalogue: this one has to
 * agree with it, tool for tool.
 */

import { describe, expect, it } from 'vitest';
import {
  APP_BEHAVIOURS,
  APP_ESCALATIONS,
  SERVER_ACTIONS,
  TOOL_ACTIONS,
} from '../../specs/actions';
import { APP_CATALOGUE } from '../../specs/apps';
import type {
  ActionClass,
  AppBehaviour,
  AppSpec,
} from '../../types/agentspecs';
import {
  BEHAVIOURS,
  DEFAULT_BEHAVIOURS,
  behaviourFor,
  classesOf,
  conditionHolds,
  gives,
  isComparable,
  isPattern,
  isReadOnly,
  matchesPattern,
  splitRef,
  strictest,
  toolBehaviours,
  toolEscalations,
} from '../apps/rules';

const app = (
  changes: Partial<AppSpec> = {},
): Pick<AppSpec, 'connections' | 'rules'> => ({
  connections: [
    {
      server: 'google-workspace:0.0.1',
      access: 'write',
      as: 'owner',
      only: [],
    },
  ],
  rules: [],
  ...changes,
});

const rule = (appliesTo: string[], behaviour: AppBehaviour) => ({
  action: `The rule on ${appliesTo.join(', ')}`,
  appliesTo,
  behaviour,
});

describe('action classes', () => {
  it('every tool of the catalogue has a class', () => {
    for (const [tool, classes] of Object.entries(TOOL_ACTIONS)) {
      expect(classes.length, tool).toBeGreaterThan(0);
    }
  });

  it('a server that was checked classes its tools, and one that was not classes nothing', () => {
    for (const [server, actions] of Object.entries(SERVER_ACTIONS)) {
      expect(Boolean(actions.checked), server).toBe(
        Object.keys(actions.tools).length > 0,
      );
    }
  });

  it('reads a class by reference, with or without a version', () => {
    expect(classesOf('tavily.tavily_search')).toEqual(['read']);
    expect(classesOf('google-workspace:0.0.1.send_gmail_message')).toEqual([
      'send',
    ]);
    expect(classesOf('runtime-send-mail:0.0.1')).toEqual(['send']);
    expect(classesOf('chart.generate_pie_chart')).toEqual(['read']);
    expect(splitRef('runtime-send-mail')).toEqual([
      undefined,
      'runtime-send-mail',
    ]);
  });

  it('gives an unknown tool no class, and never takes it for a reader', () => {
    expect(classesOf('github.create_issue')).toEqual([]);
    expect(classesOf('google-workspace.a_tool_added_tomorrow')).toEqual([]);
    expect(classesOf('constructor.toString')).toEqual([]);
    expect(classesOf('toString')).toEqual([]);
    expect(isReadOnly([])).toBe(false);
    expect(isReadOnly(['read'])).toBe(true);
    expect(isReadOnly(['read', 'write'])).toBe(false);
  });

  it('reads a pattern as Python does: stars, question marks, and nothing else', () => {
    // The table of `agent_runtimes/tests/test_apps_specs.py`, word for word.
    const patterns: Array<[string, string, boolean]> = [
      ['search_gmail_messages', '*gmail*', true],
      ['search_drive_files', '*gmail*', false],
      ['get_a', 'get_?', true],
      ['get_ab', 'get_?', false],
      ['a.b', 'a.b', true],
      ['axb', 'a.b', false],
      ['a[1]', 'a[1]', true],
      ['a1', 'a[1]', false],
      ['a[!b]c', 'a[!b]c', true],
      ['axc', 'a[!b]c', false],
      ['[', '[', true],
      ['a{b}', 'a{b}', true],
      ['a|b', 'a|b', true],
      ['a', 'a|b', false],
      ['a+', 'a+', true],
      ['aa', 'a+', false],
      ['Search', 'search', false],
      ['', '*', true],
      ['line\nbreak', 'line*', true],
    ];
    for (const [name, pattern, expected] of patterns) {
      expect(matchesPattern(name, pattern), `${name} ~ ${pattern}`).toBe(
        expected,
      );
    }
    expect(isPattern('generate_*') && isPattern('get_?')).toBe(true);
    expect(isPattern('a[1]') || isPattern('plain_name')).toBe(false);
  });

  it('compares an argument with a word, a number, true or false', () => {
    const condition = {
      argument: 'mode',
      equals: ['Delete', 3, true],
      classes: [],
    };
    expect(conditionHolds(condition, { mode: 'delete' })).toBe(true);
    expect(conditionHolds(condition, { mode: 3 })).toBe(true);
    expect(conditionHolds(condition, { mode: true })).toBe(true);
    // True is not 1, and a list is not a word.
    expect(conditionHolds(condition, { mode: 1 })).toBe(false);
    expect(conditionHolds(condition, { mode: ['delete'] })).toBe(false);
    expect(conditionHolds(condition, { other: 'delete' })).toBe(false);
    // A number no reader holds exactly equals nothing: not itself, not its neighbour.
    const exact = {
      argument: 'amount',
      equals: [Number.MAX_SAFE_INTEGER],
      classes: [],
    };
    expect(conditionHolds(exact, { amount: Number.MAX_SAFE_INTEGER })).toBe(
      true,
    );
    expect(conditionHolds(exact, { amount: Number.MAX_SAFE_INTEGER + 1 })).toBe(
      false,
    );
    expect(isComparable(Number.MAX_SAFE_INTEGER + 2)).toBe(false);
    expect(
      isComparable(1e20) || isComparable(Infinity) || isComparable(NaN),
    ).toBe(false);
    expect(isComparable(2.5) && isComparable(-3) && isComparable('word')).toBe(
      true,
    );
    expect(isComparable(null) || isComparable(['x'])).toBe(false);
    const among = { argument: 'ids', includes: ['TRASH'], classes: [] };
    expect(conditionHolds(among, { ids: ['INBOX', 'trash'] })).toBe(true);
    expect(conditionHolds(among, { ids: 'TRASH' })).toBe(true);
    expect(conditionHolds(among, { ids: ['INBOX'] })).toBe(false);
  });
});

describe('what a rule decides', () => {
  it('agrees with agentspecs on every tool of every application of the catalogue', () => {
    for (const [id, expected] of Object.entries(APP_BEHAVIOURS)) {
      expect(toolBehaviours(APP_CATALOGUE[id]), id).toEqual(expected);
    }
    for (const [id, expected] of Object.entries(APP_ESCALATIONS)) {
      expect(toolEscalations(APP_CATALOGUE[id]), id).toEqual(expected);
    }
    expect(Object.keys(APP_ESCALATIONS['inbox-triage']).length).toBeGreaterThan(
      0,
    );
    expect(Object.keys(APP_BEHAVIOURS).sort()).toEqual(
      Object.keys(APP_CATALOGUE).sort(),
    );
  });

  it('does the reading, and waits for a person on anything that acts', () => {
    expect(DEFAULT_BEHAVIOURS.read).toBe('do_it');
    for (const acting of [
      'write',
      'send',
      'buy',
      'delete',
      'publish',
    ] as ActionClass[]) {
      expect(DEFAULT_BEHAVIOURS[acting]).toBe('ask_first');
    }
    expect(behaviourFor(app(), 'google-workspace.search_gmail_messages')).toBe(
      'do_it',
    );
    expect(behaviourFor(app(), 'google-workspace.draft_gmail_message')).toBe(
      'ask_first',
    );
    expect(behaviourFor(app(), 'google-workspace.send_gmail_message')).toBe(
      'ask_first',
    );
  });

  it('lets a rule on a class decide every tool of that class', () => {
    for (const action of Object.keys(DEFAULT_BEHAVIOURS) as ActionClass[]) {
      for (const behaviour of BEHAVIOURS) {
        const ruled = app({ rules: [rule([action], behaviour)] });
        expect(
          behaviourFor(ruled, 'google-workspace.some_tool', {
            classes: [action],
          }),
        ).toBe(behaviour);
      }
    }
  });

  it('takes the most restricted class of a tool that does several things', () => {
    expect(strictest(['do_it', 'ask_first', 'if_asked'])).toBe('ask_first');
    const ruled = app({
      rules: [rule(['write'], 'do_it'), rule(['delete'], 'leave_to_me')],
    });
    expect(behaviourFor(ruled, 'google-workspace.manage_event')).toBe(
      'leave_to_me',
    );
    expect(behaviourFor(ruled, 'google-workspace.draft_gmail_message')).toBe(
      'do_it',
    );
  });

  it('lets a rule that names a tool win over the rule on its class', () => {
    const ruled = app({
      rules: [
        rule(['write'], 'ask_first'),
        rule(['google-workspace:0.0.1.modify_gmail_message_labels'], 'do_it'),
      ],
    });
    const label = 'google-workspace.modify_gmail_message_labels';
    expect(
      behaviourFor(ruled, label, {
        arguments: { remove_label_ids: ['INBOX'] },
      }),
    ).toBe('do_it');
    expect(behaviourFor(ruled, 'google-workspace.draft_gmail_message')).toBe(
      'ask_first',
    );
  });

  it('decides on what the tool is asked, and on the worst when nobody says', () => {
    const label = 'google-workspace.modify_gmail_message_labels';
    const drive = 'google-workspace.update_drive_file';
    expect(classesOf(label, { remove_label_ids: ['INBOX'] })).toEqual([
      'write',
    ]);
    expect(classesOf(label, { add_label_ids: ['STARRED', 'trash'] })).toEqual([
      'write',
      'delete',
    ]);
    expect(classesOf(label)).toEqual(['write', 'delete']);
    expect(classesOf(drive, { trashed: 1 })).toEqual(['write']);
    expect(classesOf(drive, { trashed: true })).toEqual(['write', 'delete']);
    const ruled = app({ rules: [rule([label], 'do_it')] });
    const trash = { arguments: { add_label_ids: ['TRASH'] } };
    expect(
      behaviourFor(ruled, label, { arguments: { add_label_ids: ['STARRED'] } }),
    ).toBe('do_it');
    expect(behaviourFor(ruled, label, trash)).toBe('ask_first');
    expect(behaviourFor(ruled, label)).toBe('ask_first');
    const forbidden = app({
      rules: [rule([label], 'do_it'), rule(['delete'], 'leave_to_me')],
    });
    expect(behaviourFor(forbidden, label, trash)).toBe('leave_to_me');
  });

  it('leaves a tool nobody classed to the person, unless a rule names it', () => {
    expect(behaviourFor(app(), 'google-workspace.a_tool_added_tomorrow')).toBe(
      'leave_to_me',
    );
    const named = app({
      rules: [rule(['google-workspace.a_tool_added_tomorrow'], 'ask_first')],
    });
    expect(behaviourFor(named, 'google-workspace.a_tool_added_tomorrow')).toBe(
      'ask_first',
    );
  });

  it('reaches nothing the application does not name', () => {
    expect(behaviourFor(app(), 'tavily.tavily_search')).toBe('leave_to_me');
    const scoped = app({
      connections: [
        {
          server: 'google-workspace',
          access: 'write',
          as: 'user',
          only: ['*gmail*'],
        },
      ],
    });
    expect(behaviourFor(scoped, 'google-workspace.search_gmail_messages')).toBe(
      'do_it',
    );
    expect(behaviourFor(scoped, 'google-workspace.search_drive_files')).toBe(
      'leave_to_me',
    );
  });

  it('carries no tool that acts on a connection that only reads', () => {
    const reader = app({
      connections: [
        { server: 'google-workspace', access: 'read', as: 'owner', only: [] },
      ],
      rules: [rule(['send'], 'do_it')],
    });
    expect(behaviourFor(reader, 'google-workspace.search_gmail_messages')).toBe(
      'do_it',
    );
    expect(behaviourFor(reader, 'google-workspace.send_gmail_message')).toBe(
      'leave_to_me',
    );
  });

  it('has Inbox triage read and draft alone, send on approval, and delete nothing', () => {
    const decided = toolBehaviours(APP_CATALOGUE['inbox-triage']);
    expect(decided['google-workspace.search_gmail_messages']).toBe('do_it');
    expect(decided['google-workspace.draft_gmail_message']).toBe('do_it');
    expect(decided['google-workspace.send_gmail_message']).toBe('ask_first');
    expect(decided['google-workspace.manage_gmail_filter']).toBe('ask_first');
    const triage = APP_CATALOGUE['inbox-triage'];
    expect(
      behaviourFor(triage, 'google-workspace.modify_gmail_message_labels', {
        arguments: { add_label_ids: ['TRASH'] },
      }),
    ).toBe('leave_to_me');
    expect(
      behaviourFor(triage, 'google-workspace.manage_gmail_label', {
        arguments: { action: 'delete' },
      }),
    ).toBe('leave_to_me');
    expect(decided['google-workspace.search_drive_files']).toBe('leave_to_me');
    for (const [tool, behaviour] of Object.entries(decided)) {
      if (behaviour === 'do_it') {
        expect(tool).toContain('gmail');
        expect(
          classesOf(tool, {}).every(
            item => item === 'read' || item === 'write',
          ),
          tool,
        ).toBe(true);
      }
    }
  });
});

describe('what a connection gives (U-15)', () => {
  const at = (server: string, access: 'read' | 'write') =>
    app({ connections: [{ server, access, as: 'owner', only: [] }] });

  it('a read connection gives no tool that writes, anywhere in the catalogue', () => {
    for (const [server, actions] of Object.entries(SERVER_ACTIONS)) {
      for (const name of Object.keys(actions.tools)) {
        const ref = `${server}.${name}`;
        expect(gives(at(server, 'read'), ref), ref).toBe(
          isReadOnly(classesOf(ref)),
        );
        expect(gives(at(server, 'write'), ref), ref).toBe(true);
      }
    }
  });

  it('takes a tool nobody classed to write', () => {
    expect(gives(at('github', 'read'), 'github.create_issue')).toBe(false);
    expect(gives(at('github', 'write'), 'github.create_issue')).toBe(true);
  });

  it('gives nothing without a connection, nor outside its only', () => {
    const triage = APP_CATALOGUE['inbox-triage'];
    expect(gives(triage, 'tavily.tavily_search')).toBe(false);
    expect(gives(triage, 'google-workspace.search_drive_files')).toBe(false);
    expect(gives(triage, 'google-workspace.send_gmail_message')).toBe(true);
    expect(() => gives(triage, 'runtime-echo')).toThrow(
      'not a tool of a server',
    );
  });
});
