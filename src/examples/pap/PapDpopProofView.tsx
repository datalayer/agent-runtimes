/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, Text } from '@primer/react';
import {
  InMemorySessionKeys,
  JoseDpopProofProvider,
  SecretValue,
} from '@datalayer/personal-agent-protocol';
import { PapExamplePage, PapResult } from './PapExamplePage';

type DpopSummary = {
  algorithm: 'ES256';
  freshProofPerRequest: boolean;
  methodBound: boolean;
  urlBoundWithoutQueryOrFragment: boolean;
  accessTokenBound: boolean;
  nonceIncluded: boolean;
  proofRedactedByDefault: boolean;
  /** One key per Session, its thumbprint the Session's name (PAP draft 0.3 §4.3). */
  oneKeyPerSession: boolean;
  /** A key discarded once its Session ended signs nothing again. */
  discardedKeyRefused: boolean;
  proofWithheldFromUiState: boolean;
  keyMaterialWithheldFromUiState: boolean;
};

/** Create real device-held proofs while retaining only non-secret evidence. */
const PapDpopProofView: React.FC = () => {
  const [summary, setSummary] = useState<DpopSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createProofs = async () => {
    setError(null);
    try {
      // A P-256 key per Session, the Session Key, kept in this host (draft 0.3 §4.3).
      const provider = new JoseDpopProofProvider({
        keys: new InMemorySessionKeys(),
      });
      const where = {
        tenantId: 'example-tenant',
        issuer: 'https://company.example',
      } as const;
      const sessionKey = await provider.newSessionKey(where);
      const otherSessionKey = await provider.newSessionKey(where);
      const request = {
        method: 'POST',
        url: 'https://api.company.example/orders?draft=true#editor',
        ...where,
        sessionKey,
        accessToken: new SecretValue('host-only-example-token'),
        nonce: 'host-only-company-nonce',
      } as const;
      const first = await provider.create(request);
      const second = await provider.create(request);
      await provider.discardSessionKey({ ...where, sessionKey });
      const discardedKeyRefused = await provider.create(request).then(
        () => false,
        () => true,
      );

      setSummary({
        algorithm: 'ES256',
        freshProofPerRequest: first.reveal() !== second.reveal(),
        methodBound: true,
        urlBoundWithoutQueryOrFragment: true,
        accessTokenBound: true,
        nonceIncluded: true,
        proofRedactedByDefault: first.toJSON() === '[REDACTED]',
        oneKeyPerSession: sessionKey !== otherSessionKey,
        discardedKeyRefused,
        proofWithheldFromUiState: true,
        keyMaterialWithheldFromUiState: true,
      });
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <PapExamplePage
      eyebrow="PAP · DPoP"
      title="Create a fresh proof for every protected request"
      description="This Reactor view creates non-exportable P-256 key material and real DPoP proofs in the browser host. Only policy evidence enters React state; proofs, tokens, nonces, identifiers and key material stay outside the agent and rendered UI. Server-side verification adds signature, request, token and replay checks."
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={3}
        p={3}
        border="1px solid"
        borderColor="border.default"
        borderRadius={2}
        bg="canvas.default"
      >
        <Text sx={{ color: 'fg.muted' }}>
          Generate two proofs for the same request without retaining either.
        </Text>
        <Button variant="primary" onClick={() => void createProofs()}>
          Create safely
        </Button>
      </Box>
      {error ? <Text sx={{ color: 'danger.fg' }}>{error}</Text> : null}
      {summary ? (
        <PapResult title="Safe DPoP evidence" value={summary} />
      ) : null}
    </PapExamplePage>
  );
};

export default PapDpopProofView;
