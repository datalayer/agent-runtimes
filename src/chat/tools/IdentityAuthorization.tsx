/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A third party's grant a tool waits for, drawn as an approval (ID-10).
 *
 * The runtime emits `identity.authorization_required` (an AG-UI custom event)
 * while a tool waits for the person to grant a provider (GitHub, Google…):
 * the agent, the provider, the scopes and the authorization URL. *Connect*
 * opens the URL in a new window, where the person grants it, and the tool
 * carries on once they have; *Decline* ends the tool call with a sentence.
 *
 * @module chat/tools/IdentityAuthorization
 */

import { Box } from '@datalayer/primer-addons';
import { Button, Text } from '@primer/react';
import { KeyIcon, LinkExternalIcon, XIcon } from '@primer/octicons-react';
import { useChatWords } from '../ChatLanguage';

/** The custom event's name the runtime emits. */
export const IDENTITY_AUTHORIZATION_REQUIRED =
  'identity.authorization_required';

/** A grant a tool waits for. */
export interface IdentityAuthorization {
  /** The id the decline is sent with. */
  id: string;
  /** The agent that asks. */
  agent: string;
  /** The provider to connect (`github`, `google`). */
  provider: string;
  /** The scopes asked for. */
  scopes: string[];
  /** Where the person grants it. */
  url: string;
}

/**
 * The authorization a custom event's value carries, or `null` when it is not
 * one (a URL that is not http(s) is never opened).
 */
export function identityAuthorizationOf(
  value: unknown,
): IdentityAuthorization | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const v = value as Record<string, unknown>;
  const url = typeof v.url === 'string' ? v.url : '';
  if (
    typeof v.id !== 'string' ||
    !v.id ||
    typeof v.provider !== 'string' ||
    !v.provider ||
    !/^https?:\/\//.test(url)
  ) {
    return null;
  }
  return {
    id: v.id,
    agent: typeof v.agent === 'string' ? v.agent : '',
    provider: v.provider,
    scopes: Array.isArray(v.scopes)
      ? v.scopes.filter((s): s is string => typeof s === 'string')
      : [],
    url,
  };
}

/** Props of {@link IdentityAuthorizationPanel}. */
export interface IdentityAuthorizationPanelProps {
  /** The grants the turn waits for. */
  authorizations: IdentityAuthorization[];
  /** The agent's name when the event does not carry one. */
  agentName?: string;
  /** Called with an authorization the person declines. */
  onDecline: (authorization: IdentityAuthorization) => void;
  /** Opens a URL in a new window (`window.open` by default). */
  openWindow?: (url: string) => void;
}

function openInNewWindow(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * The grants a turn waits for, each with *Connect* and *Decline*.
 */
export function IdentityAuthorizationPanel({
  authorizations,
  agentName,
  onDecline,
  openWindow = openInNewWindow,
}: IdentityAuthorizationPanelProps) {
  const words = useChatWords();
  if (authorizations.length === 0) {
    return null;
  }
  return (
    <Box
      borderBottom="1px solid"
      borderColor="attention.muted"
      bg="attention.subtle"
      px={3}
      py={2}
    >
      {authorizations.map(authorization => (
        <Box
          key={authorization.id}
          role="alertdialog"
          aria-label={words.connectToContinue(authorization.provider)}
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap={2}
          py={1}
        >
          <Box display="flex" alignItems="flex-start" gap={2}>
            <KeyIcon size={16} />
            <Box>
              <Text as="p" sx={{ fontWeight: 'semibold', fontSize: 1, m: 0 }}>
                {words.connectToContinue(authorization.provider)}
              </Text>
              <Text as="p" sx={{ color: 'fg.muted', fontSize: 0, m: 0 }}>
                {words.connectAsks(
                  authorization.agent || agentName || 'The agent',
                  authorization.scopes.join(', ') || authorization.provider,
                )}
              </Text>
            </Box>
          </Box>
          <Box display="flex" gap={1}>
            <Button
              size="small"
              variant="primary"
              leadingVisual={LinkExternalIcon}
              onClick={() => openWindow(authorization.url)}
            >
              {words.connect}
            </Button>
            <Button
              size="small"
              variant="default"
              leadingVisual={XIcon}
              onClick={() => onDecline(authorization)}
            >
              {words.decline}
            </Button>
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/**
 * Tell the runtime the person declined: the tool call ends with a sentence.
 *
 * `baseUrl` is the runtime's (no `/api/v1`).
 */
export async function declineIdentityAuthorization(
  baseUrl: string,
  id: string,
  authToken?: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(
    `${baseUrl}/api/v1/configure/identity/authorizations/${encodeURIComponent(id)}/decline`,
    {
      method: 'POST',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    },
  );
  if (!response.ok) {
    throw new Error(
      `The decline of ${id} was refused (${response.status}): the tool may already have its answer.`,
    );
  }
}
