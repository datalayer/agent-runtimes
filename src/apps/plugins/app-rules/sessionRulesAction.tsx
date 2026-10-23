/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Rules for this session…* on a thread's menu (SHIELD SH-54): the session
 * section of the application's Rules card — what decides the session now,
 * the rules the person added, the presets and a rule to add — shown over the
 * thread, so an application whose layout is the conversation alone (`chat`,
 * no rail) offers it too. The card itself (`SessionRules`), never a copy.
 *
 * @module apps/plugins/app-rules/sessionRulesAction
 */

import type { SessionActionContribution } from '../../core';
import { SessionRules } from './AppRulesCard';

export const SESSION_RULES_ACTION_WORDS = {
  label: 'Rules for this session…',
  title: 'Rules for this session',
  noPanel:
    'Showing the session’s rules needs a panel this page has not: use the Rules card of the application’s page.',
  signedOut: 'Sign in to see and add the rules of this session.',
} as const;

export const SESSION_RULES: SessionActionContribution = {
  id: 'session-rules',
  label: SESSION_RULES_ACTION_WORDS.label,
  order: 25,
  // A rule is added to a running session, in force at once and gone with it.
  when: session => session.state === 'open',
  run: (session, context) => {
    if (!context.show) {
      context.say(SESSION_RULES_ACTION_WORDS.noPanel);
      return;
    }
    const token = context.client.accessToken() ?? '';
    if (!token) {
      context.say(SESSION_RULES_ACTION_WORDS.signedOut);
      return;
    }
    context.show({
      title: SESSION_RULES_ACTION_WORDS.title,
      render: () => (
        <SessionRules
          agentServerUrl={context.client.serverUrl}
          token={token}
          sessionUid={session.uid}
        />
      ),
    });
  },
};
