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
 * @module apps/plugins/app-rules/AppRulesCard
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import { Button, Heading, Label, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useIAMStore } from '@datalayer/core/lib/state/substates/IAMState';
import type { AppRuleSpec, AppSpec } from '../../../types/agentspecs';
import { BEHAVIOUR_WORDS, coverOf } from '../../apps/rules';
import { SAVE_WORDS, draftOfApproval, type Draft } from '../../apps/saved';
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

/**
 * The rule or Gate an approval was asked under, as the runtime wrote it in
 * its arguments: `_rule` for a rule, `_check` for a Gate (LOOP U-19).
 */
export const ruleOfApproval = (approval: ApprovalRecord): string => {
  const said = approval.tool_args?._rule ?? approval.tool_args?._check;
  return typeof said === 'string' ? said : '';
};

/**
 * The approvals of one application: those its agent asked under its id, and
 * those the runtime marked as its own (`_app`) — a deployment's agent, a
 * Gate's, or a review its drift asked (LOOP U-19). Answered anywhere, an
 * approval leaves every list at once: each decision is broadcast to all the
 * person's pages over the same `/ws`.
 */
export function approvalsOfApp(
  approvals: ApprovalRecord[],
  appId: string,
): ApprovalRecord[] {
  return approvals.filter(
    approval =>
      approval.agent_id === appId || approval.tool_args?._app === appId,
  );
}

const PENDING = { status: 'pending' as const };

/** A result it wants to keep, shown whole before it is (LOOP R-24). */
export function DraftShown({ draft }: { draft: Draft }): JSX.Element {
  return (
    <Box data-testid="app-draft" mt={1}>
      <Text as="p" sx={{ m: 0, fontSize: 0, color: 'fg.muted' }}>
        {SAVE_WORDS.where(draft.space)}
      </Text>
      <Text as="p" sx={{ m: 0, fontWeight: 'semibold' }}>
        {draft.title}
      </Text>
      <Box
        as="pre"
        m={0}
        mt={1}
        p={2}
        maxHeight={240}
        overflow="auto"
        whiteSpace="pre-wrap"
        fontFamily="inherit"
        fontSize={0}
        bg="canvas.subtle"
        borderRadius={2}
      >
        {draft.content}
      </Box>
    </Box>
  );
}

function Approvals({ app }: { app: AppSpec }): JSX.Element {
  const query = useToolApprovalsQuery(PENDING);
  const approve = useApproveToolRequest();
  const reject = useRejectToolRequest();
  const waiting = useMemo(
    () => approvalsOfApp(query.data?.approvals ?? [], app.id),
    [query.data, app.id],
  );
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
        <Box as="ul" listStyle="none" p={0} m={0}>
          {waiting.map(approval => {
            const draft = draftOfApproval(approval);
            return (
              <Box
                as="li"
                key={approval.id}
                py={2}
                borderTop="1px solid"
                borderColor="border.muted"
                fontSize={1}
              >
                <Text sx={{ fontWeight: 'semibold' }}>
                  {approval.tool_name}
                </Text>
                {ruleOfApproval(approval) ? (
                  <Text as="p" sx={{ m: 0, color: 'fg.muted', fontSize: 0 }}>
                    {ruleOfApproval(approval)}
                  </Text>
                ) : null}
                {draft ? <DraftShown draft={draft} /> : null}
                <Box display="flex" gap={2} mt={1}>
                  <Button
                    size="small"
                    variant="primary"
                    disabled={approve.isPending}
                    onClick={() => approve.mutate({ id: approval.id })}
                  >
                    {draft ? SAVE_WORDS.approve : APP_RULES_WORDS.approve}
                  </Button>
                  <Button
                    size="small"
                    disabled={reject.isPending}
                    onClick={() => reject.mutate({ id: approval.id })}
                  >
                    {draft ? SAVE_WORDS.decline : APP_RULES_WORDS.reject}
                  </Button>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export function AppRulesCard({ app }: { app: AppSpec }): JSX.Element {
  const signedIn = Boolean(useIAMStore(state => state.token));
  return (
    <Box data-testid="app-rules" mb={4}>
      <Heading as="h3" sx={{ fontSize: 2, mb: 2 }}>
        {APP_RULES_WORDS.title}
      </Heading>
      {app.rules.length === 0 ? (
        <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', m: 0 }}>
          {APP_RULES_WORDS.none}
        </Text>
      ) : (
        <Box as="ul" listStyle="none" p={0} m={0}>
          {app.rules.map(ruleInWords).map((rule, index) => (
            <Box as="li" key={index} py={1} fontSize={1}>
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
