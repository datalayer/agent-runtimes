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

  it('matches a pattern literally but for its stars', () => {
    expect(matchesPattern('search_gmail_messages', '*gmail*')).toBe(true);
    expect(matchesPattern('search_drive_files', '*gmail*')).toBe(false);
    expect(matchesPattern('a.b', 'a.b')).toBe(true);
    expect(matchesPattern('axb', 'a.b')).toBe(false);
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
