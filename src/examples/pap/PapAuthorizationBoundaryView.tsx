/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, Text } from '@primer/react';
import {
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
      const tokenEndpoint = 'https://shop.example/oauth/token';
      const claims = buildSessionAssertionClaims({
        clientId,
        pairwiseUserId: generatePairwiseUserId(),
        tokenEndpoint,
      });
      const request = await buildDirectSignInRequest({
        authorizationEndpoint: 'https://shop.example/oauth/authorize',
        issuer: 'https://shop.example',
        clientId,
        redirectUri: 'https://assistant.example/callback',
        scopes: ['poppy:read', 'poppy:act'],
      });
      setSummary({
        session: {
          issuerBoundToClient: claims.iss === clientId,
          audienceBoundToTokenEndpoint: claims.aud === tokenEndpoint,
          lifetimeSeconds: claims.exp - claims.iat,
          pairwiseSubjectWithheld: true,
          uniqueRequestIdWithheld: true,
          unsignedAssertionWithheld: true,
        },
        directSignIn: {
          requestedScopes: request.scopes,
          pkceMethod: 'S256',
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
      description="This example creates a real pairwise Session identity, unique assertion ID, OAuth state and S256 PKCE verifier. None crosses the Reactor view boundary. Studio hands the authorization URL directly to a user-owned browser and stores tokens behind opaque references."
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
