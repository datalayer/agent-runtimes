/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/agent-plugin-social-accounts` — which of X, Bluesky and
 * LinkedIn the person linked, as whom, and what each can do: linked,
 * posting only (link it again for reading), reconnect (LinkedIn's grant
 * lapsed) or not linked, with where to fix it. Draws `social_accounts`,
 * which the Marketer reads before it drafts. No token ever reaches the
 * page or the agent: IAM answers who, never how.
 *
 * @module apps/plugins/social-accounts
 */

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useCoreStore } from '@datalayer/core';
import { useIAMStore } from '@datalayer/core/lib/state';
import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import { Chip, defineChromePlugin } from '../../toolCards/chrome';
import { Label, Link, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  cardData,
  defineToolCardPlugin,
} from '../../toolCards/kit';
import {
  SOCIAL_NETWORK_NAMES,
  readSocialAccounts,
  type SocialAccountState,
} from './read';

export const SOCIAL_ACCOUNTS_PLUGIN_NAME =
  '@datalayer/agent-plugin-social-accounts';

export const SOCIAL_ACCOUNTS_WORDS = {
  title: 'Your social accounts',
  writing: 'Reading your linked accounts…',
  states: {
    linked: 'Linked',
    'posting-only': 'Posting only',
    reconnect: 'Reconnect',
    'not-linked': 'Not linked',
  } satisfies Record<SocialAccountState, string>,
  fix: {
    'posting-only':
      'Link it again in Settings to let the agent read and react.',
    reconnect: 'Its grant lapsed: connect it again in Settings.',
    'not-linked': 'Link it in Settings to post there.',
  } as Partial<Record<SocialAccountState, string>>,
  until: (date: string) => `until ${date.slice(0, 10)}`,
} as const;

const VARIANT: Record<
  SocialAccountState,
  'success' | 'attention' | 'danger' | 'secondary'
> = {
  linked: 'success',
  'posting-only': 'attention',
  reconnect: 'danger',
  'not-linked': 'secondary',
};

export function SocialAccountsCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  if (!read.done) {
    return <CardSkeleton label={SOCIAL_ACCOUNTS_WORDS.writing} />;
  }
  const accounts = readSocialAccounts(read.data);
  return (
    <CardFrame title={SOCIAL_ACCOUNTS_WORDS.title} maxWidth={480}>
      <Box as="ul" m={0} p={0} sx={{ listStyle: 'none' }}>
        {accounts.map(account => (
          <Box
            as="li"
            key={account.network}
            py={1}
            display="flex"
            flexDirection="column"
            data-social-account={account.network}
          >
            <Box display="flex" alignItems="center" gap={2}>
              <Text sx={{ fontSize: 1, fontWeight: 'semibold', minWidth: 72 }}>
                {SOCIAL_NETWORK_NAMES[account.network]}
              </Text>
              <Label variant={VARIANT[account.state]}>
                {SOCIAL_ACCOUNTS_WORDS.states[account.state]}
              </Label>
              {account.who ? (
                account.url ? (
                  <Link
                    href={account.url}
                    target="_blank"
                    rel="noreferrer"
                    sx={{ fontSize: 1 }}
                  >
                    {account.who}
                  </Link>
                ) : (
                  <Text sx={{ fontSize: 1 }}>{account.who}</Text>
                )
              ) : null}
              {account.expiresAt && account.state === 'linked' ? (
                <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                  {SOCIAL_ACCOUNTS_WORDS.until(account.expiresAt)}
                </Text>
              ) : null}
            </Box>
            {SOCIAL_ACCOUNTS_WORDS.fix[account.state] ? (
              <Text sx={{ fontSize: 0, color: 'fg.muted', pl: '80px' }}>
                {SOCIAL_ACCOUNTS_WORDS.fix[account.state]}
              </Text>
            ) : null}
          </Box>
        ))}
      </Box>
    </CardFrame>
  );
}

/** In a message: drawn where `social_accounts` answers. */
export const SocialAccountsMessagePlugin = defineToolCardPlugin({
  id: 'social-accounts',
  displayName: 'Linked social accounts',
  description:
    'Which of X, Bluesky and LinkedIn the person linked, as whom, and whether each posts, reads or needs connecting again.',
  octicon: 'person',
  emoji: '\u{1FAAA}',
  tools: ['social_accounts'],
  Card: SocialAccountsCard,
});

/**
 * In the chat's title bar (its default placement): one chip per network,
 * read from IAM's `/social/accounts` with the person's own token (no token
 * is ever named there); nothing for a visitor nor while it is read.
 */
export function SocialAccountsChips(): JSX.Element | null {
  const { configuration } = useCoreStore();
  const { token } = useIAMStore();
  const iamUrl = String(configuration?.iamUrl || '');
  const [answer, setAnswer] = useState<Record<string, unknown> | null>();
  useEffect(() => {
    if (!token || !iamUrl) {
      return undefined;
    }
    const controller = new AbortController();
    requestDatalayerAPI<Record<string, unknown>>({
      url: `${iamUrl.replace(/\/$/, '')}/api/iam/v1/social/accounts`,
      method: 'GET',
      token,
      signal: controller.signal,
    })
      .then(setAnswer)
      .catch(() => {
        if (!controller.signal.aborted) {
          setAnswer(null);
        }
      });
    return () => controller.abort();
  }, [token, iamUrl]);
  if (!token || !answer) {
    return null;
  }
  return (
    <Box display="inline-flex" gap={1} data-social-accounts-chips="">
      {readSocialAccounts(answer).map(account => (
        <Chip
          key={account.network}
          attention={account.state !== 'linked'}
          title={`${SOCIAL_NETWORK_NAMES[account.network]}: ${SOCIAL_ACCOUNTS_WORDS.states[account.state]}${account.who ? ` (${account.who})` : ''}`}
          data={account.network}
        >
          {`${SOCIAL_NETWORK_NAMES[account.network]} ${account.state === 'linked' ? '✓' : account.state === 'not-linked' ? '–' : '!'}`}
        </Chip>
      ))}
    </Box>
  );
}

/** The plugin for a placement: `header` (its default); `message` is `SocialAccountsMessagePlugin`. */
export const socialAccountsPlugin = defineChromePlugin({
  id: 'social-accounts',
  displayName: 'Linked social accounts',
  description:
    'Which of X, Bluesky and LinkedIn the person linked, in the chat’s title bar.',
  octicon: 'person',
  emoji: '\u{1FAAA}',
  Component: SocialAccountsChips,
});

export const SocialAccountsPlugin = socialAccountsPlugin('header');

export {
  SOCIAL_NETWORKS,
  SOCIAL_NETWORK_NAMES,
  readSocialAccounts,
  type SocialAccount,
  type SocialAccountState,
  type SocialNetwork,
} from './read';
export default SocialAccountsPlugin;
