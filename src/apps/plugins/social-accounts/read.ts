/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The person's linked social accounts, as `social_accounts` answers them
 * (IAM's `/social/accounts`, through `agent_runtimes.tools.social`). Pure.
 *
 * @module apps/plugins/social-accounts/read
 */

import { record, safeUrl, words, type Data } from '../../toolCards/kit';

export type SocialNetwork = 'x' | 'bluesky' | 'linkedin';

export const SOCIAL_NETWORKS: readonly SocialNetwork[] = [
  'x',
  'bluesky',
  'linkedin',
];

export const SOCIAL_NETWORK_NAMES: Record<SocialNetwork, string> = {
  x: 'X',
  bluesky: 'Bluesky',
  linkedin: 'LinkedIn',
};

/**
 * One network's state:
 * - `linked`: linked with everything the agent uses;
 * - `posting-only`: linked before its reads were asked (X or Bluesky), or
 *   without likes (X): link it again for the rest;
 * - `reconnect`: LinkedIn's 60-day grant lapsed;
 * - `not-linked`.
 */
export type SocialAccountState =
  'linked' | 'posting-only' | 'reconnect' | 'not-linked';

export type SocialAccount = {
  network: SocialNetwork;
  state: SocialAccountState;
  /** `@handle` or the name, as IAM says it. */
  who: string;
  url: string;
  expiresAt: string;
};

export function readSocialAccounts(data: Data): SocialAccount[] {
  return SOCIAL_NETWORKS.map(network => {
    const account = record(data[network]) ?? {};
    const linked = account.linked === true;
    const handle = words(account.username) || words(account.handle);
    const who = handle ? `@${handle.replace(/^@/, '')}` : words(account.name);
    let state: SocialAccountState = linked ? 'linked' : 'not-linked';
    if (linked && account.reconnect === true) {
      state = 'reconnect';
    } else if (linked && account.reads === false) {
      state = 'posting-only';
    }
    return {
      network,
      state,
      who: linked ? who : '',
      url: safeUrl(account.url),
      expiresAt: words(account.expires_at),
    };
  });
}
