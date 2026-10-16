/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Sign in at a company*, in the chat (PI-56): where the
 * gateway's `pap_sign_in` answers, the company's page as a button opening a
 * new tab, the code large and copyable with a code to scan for Device
 * Sign-In, Datalayer's own page for Mediated Sign-In (where the person types
 * what the company asks, never in the chat) with where a code was sent,
 * until when, and *I have signed in: check again* — sent as the
 * person's next message — when the chat can send one, otherwise a line
 * asking them to say so. What it reads is `signIn`'s.
 *
 * @module apps/plugins/pap-sign-in/PapSignInCard
 */

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Button, Flash, Heading, Text } from '@primer/react';
import { CopyIcon, LinkExternalIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import QRCode from 'react-qr-code';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  PAP_SIGN_IN_CHANNEL,
  PAP_SIGN_IN_WORDS,
  readPapSignIn,
  signInReturnOf,
  type PapSignInReturn,
} from './signIn';

export type PapSignInCardProps = {
  context: ToolCallRenderContext;
  /** The chat's send, when the chat lets a card send the person's next message. */
  send?: (message: string) => boolean;
};

export function PapSignInCard({
  context,
  send,
}: PapSignInCardProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [returned, setReturned] = useState<PapSignInReturn | null>(null);
  const read =
    context.status === 'complete' ? readPapSignIn(context.result) : null;
  // A Direct Sign-In: Datalayer's `/pap/signed-in`, in the tab the company sent the person
  // back to, says how it came back (P-04); the conversation goes on here.
  const company =
    read && !('refused' in read) && read.mode === 'direct'
      ? (read.company ?? '')
      : '';
  useEffect(() => {
    if (!company || typeof BroadcastChannel === 'undefined') {
      return;
    }
    const channel = new BroadcastChannel(PAP_SIGN_IN_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      const outcome = signInReturnOf(event.data, company);
      if (outcome) {
        setReturned(outcome);
        // One return per card: a card that heard its sign-in come back (a denial
        // too) leaves the next one at that company to the card that started it,
        // never sending twice into a run under way (found on :3063, 13 October 2026).
        channel.close();
      }
    };
    return () => channel.close();
  }, [company]);
  useEffect(() => {
    if (returned === 'signed_in' && send && !sent) {
      setSent(send(PAP_SIGN_IN_WORDS.checkMessage(company)));
    }
  }, [returned, send, sent, company]);
  if (!read) {
    // Running, or another answer: the chat's own row says it.
    return <>{context.defaultUI}</>;
  }
  if ('refused' in read) {
    return (
      <Flash variant="danger" role="alert" sx={{ my: 2 }}>
        {read.refused}
      </Flash>
    );
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(read.code ?? '');
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  // Who the person signs in at: the company itself for a Direct Sign-In (P-04), the page's host otherwise.
  const named = read.company ?? read.host;
  const title =
    read.mode === 'mediated'
      ? PAP_SIGN_IN_WORDS.mediatedTitle(read.host)
      : PAP_SIGN_IN_WORDS.title(named);
  return (
    <Box
      as="section"
      aria-label={title}
      my={2}
      p={3}
      border="1px solid"
      borderColor="border.default"
      borderRadius={2}
      bg="canvas.subtle"
      maxWidth={480}
    >
      <Heading as="h4" sx={{ fontSize: 2, mb: 1 }}>
        {title}
      </Heading>
      <Text as="p" sx={{ mt: 0, mb: 2, color: 'fg.muted', fontSize: 1 }}>
        {read.mode === 'device'
          ? PAP_SIGN_IN_WORDS.device
          : read.mode === 'mediated'
            ? PAP_SIGN_IN_WORDS.mediated
            : PAP_SIGN_IN_WORDS.direct}
      </Text>
      {read.needs ? (
        <Text as="p" sx={{ mt: 0, mb: 2, fontSize: 1 }}>
          {PAP_SIGN_IN_WORDS.needs(read.needs)}
        </Text>
      ) : null}
      {read.sentTo ? (
        <Text as="p" sx={{ mt: 0, mb: 2, fontSize: 1 }}>
          {PAP_SIGN_IN_WORDS.sentTo(read.sentTo)}
        </Text>
      ) : null}
      {read.code ? (
        <Box display="flex" gap={3} alignItems="center" flexWrap="wrap" mb={2}>
          <Box>
            <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
              {PAP_SIGN_IN_WORDS.code}
            </Text>
            <Text
              as="div"
              aria-live="polite"
              sx={{
                fontFamily: 'mono',
                fontSize: 5,
                fontWeight: 'bold',
                letterSpacing: '0.15em',
              }}
            >
              {read.code}
            </Text>
            <Button
              size="small"
              leadingVisual={CopyIcon}
              onClick={() => void copy()}
            >
              {copied ? PAP_SIGN_IN_WORDS.copied : PAP_SIGN_IN_WORDS.copy}
            </Button>
          </Box>
          <Box bg="#ffffff" p={2} borderRadius={2} lineHeight={0}>
            <QRCode
              value={read.open}
              size={112}
              title={PAP_SIGN_IN_WORDS.qr(read.host)}
            />
          </Box>
        </Box>
      ) : null}
      <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
        <Button
          as="a"
          href={read.open}
          target="_blank"
          rel="noopener noreferrer"
          variant="primary"
          trailingVisual={LinkExternalIcon}
        >
          {PAP_SIGN_IN_WORDS.open(named)}
        </Button>
        {send ? (
          <Button
            disabled={sent}
            onClick={() => setSent(send(PAP_SIGN_IN_WORDS.checkMessage(named)))}
          >
            {PAP_SIGN_IN_WORDS.checkAgain}
          </Button>
        ) : null}
      </Box>
      {returned ? (
        <Text as="p" role="status" sx={{ mt: 2, mb: 0, fontSize: 1 }}>
          {PAP_SIGN_IN_WORDS.returned[returned](named)}
        </Text>
      ) : null}
      {read.expiresAt ? (
        <Text as="p" sx={{ mt: 2, mb: 0, fontSize: 0, color: 'fg.muted' }}>
          {PAP_SIGN_IN_WORDS.until(read.expiresAt)}
        </Text>
      ) : null}
      {send ? null : (
        <Text as="p" sx={{ mt: 1, mb: 0, fontSize: 1 }}>
          {PAP_SIGN_IN_WORDS.tellMe}
        </Text>
      )}
    </Box>
  );
}

export default PapSignInCard;
