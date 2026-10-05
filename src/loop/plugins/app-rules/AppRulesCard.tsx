/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's rules, and the approvals it waits on, beside its page
 * (LOOP R-01b, U-19).
 *
 * The rules in words — each action, what it covers, what it does about it —
 * and, under them, what is waiting for the person's yes: the approvals its
 * agent asked for, as the existing tool-approvals path carries them (the
 * ai-agents `/ws` stream, the Tool Approvals page's), answered here with
 * *Approve* or *Reject* over the same socket.
 *
 * @module loop/plugins/app-rules/AppRulesCard
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import { Button, Heading, Label, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useIAMStore } from '@datalayer/core/lib/state/substates/IAMState';
import type { AppRuleSpec, AppSpec } from '../../../types/agentspecs';
import { BEHAVIOUR_WORDS, coverOf } from '../../apps/rules';
import {
  useApproveToolRequest,
  useRejectToolRequest,
  useToolApprovalsQuery,
  type ApprovalRecord,
} from '../../../hooks/useToolApprovals';

/** What the card says. */
export const APP_RULES_WORDS = {
  title: 'Rules and approvals',
  byDefault:
    'With no rule of its own: reading is done, anything else waits for you.',
  none: 'It has no rule of its own.',
  waiting: 'Waiting for you',
  nothingWaiting: 'Nothing is waiting for your yes.',
  signedOut:
    'Its approvals reach you here once you are signed in to Datalayer.',
  offline:
    'Approvals are not connected yet: what you approve or reject is not sent until they are.',
  approve: 'Approve',
  reject: 'Reject',
} as const;

/** One rule, in words: its action, what it covers, and what it does about it. */
export function ruleInWords(rule: AppRuleSpec): {
  action: string;
  covers: string;
  says: string;
  means: string;
} {
  const words = BEHAVIOUR_WORDS[rule.behaviour];
  return {
    action: rule.action,
    covers: rule.appliesTo.map(coverOf).join(', '),
    says: words.says,
    means: words.means,
  };
}

/** The rule an approval was asked under, as the runtime wrote it in its arguments. */
export const ruleOfApproval = (approval: ApprovalRecord): string =>
  typeof approval.tool_args?._rule === 'string' ? approval.tool_args._rule : '';

function Approvals({ app }: { app: AppSpec }): JSX.Element {
  // Its agent is created under the application's id: what it asks is under it.
  const filters = useMemo(
    () => ({ agentId: app.id, status: 'pending' as const }),
    [app.id],
  );
  const query = useToolApprovalsQuery(filters);
  const approve = useApproveToolRequest();
  const reject = useRejectToolRequest();
  const waiting = query.data?.approvals ?? [];
  return (
    <Box data-testid="app-approvals">
      <Heading as="h4" sx={{ fontSize: 1, mt: 3, mb: 1 }}>
        {APP_RULES_WORDS.waiting}
      </Heading>
      {approve.connectionState !== 'connected' ? (
        <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', m: 0, mb: 1 }}>
          {APP_RULES_WORDS.offline}
        </Text>
      ) : null}
      {waiting.length === 0 ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
          {APP_RULES_WORDS.nothingWaiting}
        </Text>
      ) : (
        <Box as="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {waiting.map(approval => (
            <Box
              as="li"
              key={approval.id}
              sx={{
                py: 2,
                borderTop: '1px solid',
                borderColor: 'border.muted',
                fontSize: 1,
              }}
            >
              <Text sx={{ fontWeight: 'semibold' }}>{approval.tool_name}</Text>
              {ruleOfApproval(approval) ? (
                <Text as="p" sx={{ m: 0, color: 'fg.muted', fontSize: 0 }}>
                  {ruleOfApproval(approval)}
                </Text>
              ) : null}
              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <Button
                  size="small"
                  variant="primary"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate({ id: approval.id })}
                >
                  {APP_RULES_WORDS.approve}
                </Button>
                <Button
                  size="small"
                  disabled={reject.isPending}
                  onClick={() => reject.mutate({ id: approval.id })}
                >
                  {APP_RULES_WORDS.reject}
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export function AppRulesCard({ app }: { app: AppSpec }): JSX.Element {
  const signedIn = Boolean(useIAMStore(state => state.token));
  return (
    <Box data-testid="app-rules" sx={{ mb: 4 }}>
      <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
        {APP_RULES_WORDS.title}
      </Heading>
      {app.rules.length === 0 ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
          {APP_RULES_WORDS.none}
        </Text>
      ) : (
        <Box as="ul" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {app.rules.map(ruleInWords).map((rule, index) => (
            <Box as="li" key={index} sx={{ py: 1, fontSize: 1 }}>
              <Text>{rule.action}</Text>{' '}
              <Label title={rule.means}>{rule.says}</Label>
              <Text as="p" sx={{ m: 0, color: 'fg.muted', fontSize: 0 }}>
                {rule.covers}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mt: 1, mb: 0 }}>
        {APP_RULES_WORDS.byDefault}
      </Text>
      {signedIn ? (
        <Approvals app={app} />
      ) : (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', mt: 3, mb: 0 }}>
          {APP_RULES_WORDS.signedOut}
        </Text>
      )}
    </Box>
  );
}

export default AppRulesCard;
