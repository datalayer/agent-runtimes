/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-linkedin-link` — *Link LinkedIn in Settings*,
 * above the conversation (its `banner` placement; or the title bar), while the person's LinkedIn is not linked through
 * Datalayer (IAM's `/social/accounts`) or its 60-day grant lapsed
 * (*Reconnect LinkedIn in Settings*). Brought by the `datalayer-social`
 * LinkedIn tools (`social-post-linkedin`, `social-comment-linkedin`, the
 * user, 15 November 2026), not by an agent: any agent posting to LinkedIn
 * through IAM gets it. Nothing drawn once linked, nor for a visitor (no
 * token: *Sign in to LinkedIn* is drawn locked in its place, `locked-ui`). The `linkedin` MCP server's own sign-in is `browser-session`'s.
 *
 * @module apps/plugins/linkedin-link
 */

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Button } from '@primer/react';
import { LinkIcon } from '@primer/octicons-react';
import { useCoreStore } from '@datalayer/core';
import { useIAMStore } from '@datalayer/core/lib/state';
import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import { defineChromePlugin } from '../../toolCards/chrome';
import { record } from '../../toolCards/kit';

export const LINKEDIN_LINK_PLUGIN_NAME = '@datalayer/loop-plugin-linkedin-link';

/** Where Settings › LinkedIn is, on Datalayer's pages. */
export const LINKEDIN_SETTINGS_PATH = '/settings/linkedin';

export const LINKEDIN_LINK_WORDS = {
  link: 'Link LinkedIn in Settings',
  reconnect: 'Reconnect LinkedIn in Settings',
  why: 'The agent posts to LinkedIn as you through Datalayer: link your LinkedIn account first.',
  whyReconnect:
    'LinkedIn’s grant lapsed after 60 days: connect it again to post.',
} as const;

/** What LinkedIn's line of IAM's answer asks of the person: nothing, `link` or `reconnect`. */
export function linkedInAsks(answer: unknown): 'none' | 'link' | 'reconnect' {
  const linkedin = record(record(answer)?.linkedin);
  if (!linkedin || linkedin.linked !== true) {
    return 'link';
  }
  return linkedin.reconnect === true ? 'reconnect' : 'none';
}

export function LinkedInLinkButton({
  settingsUrl = LINKEDIN_SETTINGS_PATH,
}: {
  settingsUrl?: string;
}): JSX.Element | null {
  const { configuration } = useCoreStore();
  const { token } = useIAMStore();
  const iamUrl = String(configuration?.iamUrl || '');
  // undefined while read; the button only once IAM said what is missing.
  const [asks, setAsks] = useState<'none' | 'link' | 'reconnect'>();
  useEffect(() => {
    if (!token || !iamUrl) {
      return undefined;
    }
    const controller = new AbortController();
    requestDatalayerAPI({
      url: `${iamUrl.replace(/\/$/, '')}/api/iam/v1/social/accounts`,
      method: 'GET',
      token,
      signal: controller.signal,
    })
      .then(answer => setAsks(linkedInAsks(answer)))
      .catch(() => {
        // Not read: say nothing rather than a button that may be wrong.
        if (!controller.signal.aborted) {
          setAsks('none');
        }
      });
    return () => controller.abort();
  }, [token, iamUrl]);
  if (!token || !iamUrl || asks === undefined || asks === 'none') {
    return null;
  }
  return (
    <Button
      as="a"
      href={settingsUrl}
      size="small"
      leadingVisual={LinkIcon}
      title={
        asks === 'reconnect'
          ? LINKEDIN_LINK_WORDS.whyReconnect
          : LINKEDIN_LINK_WORDS.why
      }
      data-linkedin-link={asks}
    >
      {asks === 'reconnect'
        ? LINKEDIN_LINK_WORDS.reconnect
        : LINKEDIN_LINK_WORDS.link}
    </Button>
  );
}

/** The button in the chat's title-bar slot. */
export function LinkedInLinkSlot(): JSX.Element | null {
  return <LinkedInLinkButton />;
}

/** The plugin for a placement: `banner` (its default) or `header`. */
export const linkedInLinkPlugin = defineChromePlugin({
  id: 'linkedin-link',
  displayName: 'Link LinkedIn',
  description:
    'Link LinkedIn in Settings, above the conversation, while the person’s LinkedIn is not linked through Datalayer or needs connecting again.',
  octicon: 'link',
  emoji: '\u{1F517}',
  Component: () => LinkedInLinkButton({}),
});

export const LinkedInLinkPlugin = linkedInLinkPlugin('banner');

export default LinkedInLinkPlugin;
