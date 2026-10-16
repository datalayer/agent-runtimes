/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Signed requests (Web Bot Auth) in the browser (EX-10): a
 * key generated in the page signs one request; the page shows the three
 * headers, the signature base the key signed, and what a website's check
 * finds — verified, then the same request replayed and one with its path
 * changed, both refused. The key never leaves the page and is never shown.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { Button, Flash, Heading, Label, Text } from '@primer/react';
import { ThemedProvider } from './utils/themedProvider';
import {
  signedRequestDemo,
  type SignedRequestDemo,
} from './protocols/signedRequestsDemo';

setupPrimerPortals();

const Mono: React.FC<{ children: React.ReactNode; label: string }> = ({
  children,
  label,
}) => (
  <Box mb={3}>
    <Text as="div" sx={{ fontWeight: 'semibold', fontSize: 1, mb: 1 }}>
      {label}
    </Text>
    <Box
      as="pre"
      p={2}
      m={0}
      bg="canvas.subtle"
      borderRadius={2}
      sx={{ fontSize: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
    >
      {children}
    </Box>
  </Box>
);

const OUTCOME_VARIANT = {
  verified: 'success',
  invalid: 'danger',
  unverified: 'attention',
} as const;

const ProtocolSignedRequestsExample: React.FC = () => {
  const [demo, setDemo] = useState<SignedRequestDemo | null>(null);
  const [error, setError] = useState('');
  const run = useCallback(() => {
    setError('');
    signedRequestDemo()
      .then(setDemo)
      .catch(failure => setError(String(failure?.message ?? failure)));
  }, []);
  useEffect(run, [run]);

  return (
    <ThemedProvider>
      <Box p={4} maxWidth={880} mx="auto">
        <Heading as="h2" sx={{ fontSize: 3, mb: 1 }}>
          Signed requests
        </Heading>
        <Text as="p" sx={{ color: 'fg.muted', mt: 0 }}>
          Web Bot Auth (draft-ietf-webbotauth-httpsig-protocol-00): a key
          generated in this page signs a request to a shop; the shop checks it
          against the agent&apos;s key directory. The private key is never
          shown.
        </Text>
        <Button onClick={run} sx={{ mb: 3 }}>
          Sign again with a new key
        </Button>
        {error ? <Flash variant="danger">{error}</Flash> : null}
        {demo ? (
          <>
            <Mono label="Request">GET {demo.url}</Mono>
            <Mono label="Signature-Agent">
              {demo.headers['Signature-Agent']}
            </Mono>
            <Mono label="Signature-Input">
              {demo.headers['Signature-Input']}
            </Mono>
            <Mono label="Signature">{demo.headers.Signature}</Mono>
            <Mono label="Signature base (what the key signed)">
              {demo.base}
            </Mono>
            <Mono label="Public key in the directory (keyid: its thumbprint)">
              {JSON.stringify(demo.publicJwk, null, 2)}
            </Mono>
            <Box display="grid" gap={2}>
              {(
                [
                  ['The shop checks it', demo.verified],
                  ['The same request again', demo.replayed],
                  ['Its path changed', demo.tampered],
                ] as const
              ).map(([what, found]) => (
                <Box key={what} display="flex" gap={2} alignItems="baseline">
                  <Label variant={OUTCOME_VARIANT[found.outcome]}>
                    {found.outcome}
                  </Label>
                  <Text sx={{ fontSize: 1 }}>
                    {what}
                    {found.reason ? `: ${found.reason}` : ''}
                  </Text>
                </Box>
              ))}
            </Box>
          </>
        ) : null}
      </Box>
    </ThemedProvider>
  );
};

export default ProtocolSignedRequestsExample;
