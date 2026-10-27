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
  buildDirectSignInRequest,
  buildSessionAssertionClaims,
  generatePairwiseUserId,
} from '@datalayer/personal-agent-protocol';
import { PapExamplePage, PapResult } from './PapExamplePage';

type BoundarySummary = {
  session: Record<string, unknown>;
  directSignIn: Record<string, unknown>;
};

/** Generate real security material and reveal only its non-secret policy. */
const PapAuthorizationBoundaryView: React.FC = () => {
  const [summary, setSummary] = useState<BoundarySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setError(null);
    try {
      const clientId = 'https://assistant.example/agent.json';
      // PAP §4.2: the assertion names the company's issuer, not its token endpoint.
      const issuer = 'https://shop.example';
      // Draft 0.3 §4.3: the Session has its own DPoP key, the Session Key; the
      // Direct Sign-In code is bound to its thumbprint (`dpop_jkt`).
      const proofs = new JoseDpopProofProvider({
        keys: new InMemorySessionKeys(),
      });
      const sessionKey = await proofs.newSessionKey({
        tenantId: 'example-tenant',
        issuer,
      });
      const claims = buildSessionAssertionClaims({
        clientId,
        pairwiseUserId: generatePairwiseUserId(),
        issuer,
      });
      const request = await buildDirectSignInRequest({
        authorizationEndpoint: 'https://shop.example/oauth/authorize',
        issuer: 'https://shop.example',
        clientId,
        redirectUri: 'https://assistant.example/callback',
        scopes: ['orders:read', 'orders:write'],
        sessionKey,
      });
      setSummary({
        session: {
          issuerBoundToClient: claims.iss === clientId,
          audienceBoundToIssuer: claims.aud === issuer,
          lifetimeSeconds: claims.exp - claims.iat,
          pairwiseSubjectWithheld: true,
          uniqueRequestIdWithheld: true,
          unsignedAssertionWithheld: true,
        },
        directSignIn: {
          requestedScopes: request.scopes,
          pkceMethod: 'S256',
          codeBoundToSessionKey:
            request.sessionKey === sessionKey &&
            new URL(request.authorizationUrl.reveal()).searchParams.get(
              'dpop_jkt',
            ) === sessionKey,
          sessionKeyWithheld: true,
          randomState: true,
          userOwnedBrowserRequired: true,
          authorizationUrlWithheld: true,
          stateWithheld: true,
          codeVerifierWithheld: true,
        },
      });
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <PapExamplePage
      eyebrow="PAP · Authorization boundary"
      title="Generate secrets in the host; return policy to the agent"
      description="This example creates a real pairwise identity, a Session Key (the Session's own DPoP key, PAP draft 0.3), unique assertion ID, OAuth state and S256 PKCE verifier, the code bound to the Session Key. None crosses the Reactor view boundary. Studio hands the authorization URL directly to a user-owned browser and stores tokens behind opaque references."
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
          Generate a fresh Session and Direct Sign-In request inside this host.
        </Text>
        <Button variant="primary" onClick={() => void generate()}>
          Generate safely
        </Button>
      </Box>
      {error ? <Text sx={{ color: 'danger.fg' }}>{error}</Text> : null}
      {summary ? (
        <PapResult title="Model-safe boundary result" value={summary} />
      ) : null}
    </PapExamplePage>
  );
};

export default PapAuthorizationBoundaryView;
