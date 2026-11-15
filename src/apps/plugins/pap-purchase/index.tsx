/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-pap-purchase` — a company's operation the person
 * approves, in the chat: the company by its name and domain, its own
 * summary, every term, what the terms check found, the operation and its
 * exact revision, until when it holds. Drawn above the chat's own approval
 * row for `pap_confirm`, with or without the gateway's prefix — the Approve
 * and Reject are the chat's, never this card's.
 *
 * What is shown is what the hosts show (`portable/hosts` `renderApproval`,
 * its `pap-confirm` renderer, decided by the user on 28 October 2026): one
 * reading of the operation for Slack, the phone and the web chat. A field it
 * cannot show says so, and the reason is drawn.
 *
 * @module apps/plugins/pap-purchase
 */

import type { JSX } from 'react';
import { Flash, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  renderApproval,
  type RenderedAction,
} from '../../../portable/hosts/approvalRenderers';
import {
  CardFrame,
  defineToolCardPlugin,
  record,
  words,
} from '../../toolCards/kit';

export const PAP_PURCHASE_PLUGIN_NAME = '@datalayer/loop-plugin-pap-purchase';

export const PAP_PURCHASE_WORDS = {
  title: (company: string) => `Approve at ${company}`,
  aCompany: 'a company',
  exact:
    'Your approval holds for this exact revision only: if anything changes, you are asked again.',
} as const;

/** The operation, as the hosts render a `pap_confirm` approval. */
export function readPapPurchase(
  toolName: string,
  args: Record<string, unknown>,
): RenderedAction {
  return renderApproval({
    version: 1,
    approval_id: 'chat',
    status: 'pending',
    owner_uid: '',
    tool_name: toolName,
    action_class: 'financial',
    session_uid: '',
    fields: [],
    arguments: args,
    secret_fields: [],
    complete: false,
    host_may_decide: false,
    reasons: [],
    digest: '0'.repeat(64),
  });
}

export function PapPurchaseCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const args = record(context.args) ?? {};
  const rendered = readPapPurchase(context.toolName, args);
  const company = words(args.company_name) || words(args.company);
  if (rendered.fields.length === 0) {
    return <>{context.defaultUI}</>;
  }
  return (
    <Box width="100%">
      <CardFrame
        title={PAP_PURCHASE_WORDS.title(company || PAP_PURCHASE_WORDS.aCompany)}
        subtitle={PAP_PURCHASE_WORDS.exact}
      >
        <Box as="dl" m={0}>
          {rendered.fields.map((field, index) => (
            <Box key={`${field.label}-${index}`} display="flex" gap={2} mb={1}>
              <Text
                as="dt"
                sx={{ fontSize: 1, color: 'fg.muted', minWidth: 120 }}
              >
                {field.label}
              </Text>
              <Text as="dd" sx={{ fontSize: 1, m: 0, whiteSpace: 'pre-wrap' }}>
                {field.value}
              </Text>
            </Box>
          ))}
        </Box>
        {rendered.reasons.map(reason => (
          <Flash key={reason} variant="warning" sx={{ mt: 2, fontSize: 1 }}>
            {reason}
          </Flash>
        ))}
      </CardFrame>
      {context.defaultUI}
    </Box>
  );
}

export const PapPurchasePlugin = defineToolCardPlugin({
  id: 'pap-purchase',
  displayName: 'Approve a purchase',
  description:
    'A company’s operation the person approves: the company, its terms, the exact revision and until when it holds.',
  octicon: 'credit-card',
  emoji: '\u{1F4B3}',
  tools: ['pap_confirm'],
  Card: PapPurchaseCard,
});

export default PapPurchasePlugin;
