/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, Text } from '@primer/react';
import {
  DelegatedSessionSigner,
  InMemoryDelegatedKeys,
  SecretValue,
  newSessionId,
  type SessionJwtRequest,
} from '@datalayer/personal-agent-protocol';
import { PapExamplePage, PapResult } from './PapExamplePage';

type SessionJwtSummary = {
  algorithm: unknown;
  type: unknown;
  freshJwtPerRequest: boolean;
  methodBound: boolean;
  urlBoundWithoutQueryOrFragment: boolean;
  accessTokenBound: boolean;
  namesItsSession: boolean;
  carriesItsDelegation: boolean;
  /** One delegated key per User ID at one company, never shared. */
  oneKeyPerUserId: boolean;
  jwtRedactedByDefault: boolean;
  jwtWithheldFromUiState: boolean;
  keyMaterialWithheldFromUiState: boolean;
};

/** One part of a compact JWT, read here because nothing verifies it in this view. */
const part = (jwt: string, index: number): Record<string, unknown> =>
  JSON.parse(
    atob((jwt.split('.')[index] ?? '').replace(/-/g, '+').replace(/_/g, '/')),
  ) as Record<string, unknown>;

/** Create real Session JWTs while retaining only non-secret evidence. */
const PapSessionJwtView: React.FC = () => {
  const [summary, setSummary] = useState<SessionJwtSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createJwts = async () => {
    setError(null);
    try {
      // A delegated P-256 key per User ID, kept in this host. A key from the
      // agent's `jwks_uri` signs each delegation; here a stand-in does, and the
      // company's verification is the server's half.
      const signer = new DelegatedSessionSigner({
        custody: new InMemoryDelegatedKeys(),
        signer: {
          sign: async (_claims, options) =>
            new SecretValue(`host-only-${options.purpose}`),
        },
      });
      const request: SessionJwtRequest = {
        method: 'POST',
        url: 'https://api.company.example/orders?draft=true#editor',
        tenantId: 'example-tenant',
        issuer: 'https://company.example',
        clientId: 'https://assistant.example/agent.json',
        sid: newSessionId(),
        sub: 'usr_host_only_example',
        accessToken: new SecretValue('host-only-example-token'),
      };
      const first = await signer.sign(request);
      const second = await signer.sign(request);
      const other = await signer.sign({
        ...request,
        sub: 'usr_host_only_other',
      });
      const header = part(first.reveal(), 0);
      const claims = part(first.reveal(), 1);

      setSummary({
        algorithm: header.alg,
        type: header.typ,
        freshJwtPerRequest: first.reveal() !== second.reveal(),
        methodBound: claims.htm === 'POST',
        urlBoundWithoutQueryOrFragment:
          claims.htu === 'https://api.company.example/orders',
        accessTokenBound: typeof claims.ath === 'string',
        namesItsSession: claims.sid === request.sid,
        carriesItsDelegation: typeof header.pap_dlg === 'string',
        oneKeyPerUserId: header.kid !== part(other.reveal(), 0).kid,
        jwtRedactedByDefault: first.toJSON() === '[REDACTED]',
        jwtWithheldFromUiState: true,
        keyMaterialWithheldFromUiState: true,
      });
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <PapExamplePage
      eyebrow="PAP · Session JWT"
      title="Create a fresh Session JWT for every request"
      description="This Reactor view creates a non-exportable delegated P-256 key and real Poppy-Session JWTs in the browser host. Only policy evidence enters React state; JWTs, tokens, identifiers and key material stay outside the agent and rendered UI. Server-side verification adds the delegation, signature, request, token and replay checks."
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
          Generate two Session JWTs for the same request without retaining
          either.
        </Text>
        <Button variant="primary" onClick={() => void createJwts()}>
          Create safely
        </Button>
      </Box>
      {error ? <Text sx={{ color: 'danger.fg' }}>{error}</Text> : null}
      {summary ? (
        <PapResult title="Safe Session JWT evidence" value={summary} />
      ) : null}
    </PapExamplePage>
  );
};

export default PapSessionJwtView;
