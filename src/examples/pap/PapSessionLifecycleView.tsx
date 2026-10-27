/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { contribution, definePlugin } from '@datalayer/reactor';
import { Button, Text } from '@primer/react';
import {
  DpopProofProviders,
  InMemorySessionKeys,
  JoseDpopProofProvider,
  SecretValue,
  SessionClient,
  Signers,
  buildPapReactor,
  type DpopProofRequest,
} from '@datalayer/personal-agent-protocol';
import { PapExamplePage, PapResult } from './PapExamplePage';

type SessionSummary = {
  startStatus: 'created';
  renewStatus: 'renewed';
  signedIn: false;
  tokenType: 'DPoP';
  scopes: readonly string[];
  sameSession: boolean;
  nonceRetry: boolean;
  freshAssertions: boolean;
  freshProofs: boolean;
  /** Every proof signed with the Session's own key, the Session Key (PAP draft 0.3 §4.3). */
  provedWithSessionKey: boolean;
  /** Nothing names the Session on the wire but its key: no `session_id` (draft 0.3). */
  noSessionIdOnTheWire: boolean;
  sessionKeyWithheld: true;
  credentialsWithheld: true;
};

/** Exercise the real Session client and retain only safe lifecycle evidence. */
const PapSessionLifecycleView: React.FC = () => {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runLifecycle = async () => {
    setError(null);
    let calls = 0;
    const forms: URLSearchParams[] = [];
    const purposes: string[] = [];
    const proofRequests: DpopProofRequest[] = [];
    const proofs = new JoseDpopProofProvider({
      keys: new InMemorySessionKeys(),
    });
    const localFetch: typeof globalThis.fetch = async (_input, init) => {
      calls += 1;
      forms.push(new URLSearchParams(String(init?.body ?? '')));
      if (calls === 1) {
        return new Response(JSON.stringify({ error: 'use_dpop_nonce' }), {
          status: 400,
          headers: {
            'content-type': 'application/json',
            'DPoP-Nonce': 'host-only-company-nonce',
          },
        });
      }
      return new Response(
        JSON.stringify({
          access_token: `host-only-session-token-${calls}`,
          token_type: 'DPoP',
          expires_in: 300,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const securityPlugin = definePlugin({
      name: '@datalayer/loop-example-pap-session-security',
      contributes: [
        contribution(
          Signers,
          {
            async sign(_claims, options) {
              purposes.push(options.purpose);
              return new SecretValue(
                `host-only-${options.purpose}-${purposes.length}`,
              );
            },
          },
          { id: 'example-signer' },
        ),
        contribution(
          DpopProofProviders,
          {
            // A real P-256 key per Session (the Session Key), its private half
            // kept here; each proof is recorded for the evidence only.
            newSessionKey: options => proofs.newSessionKey(options),
            discardSessionKey: options => proofs.discardSessionKey(options),
            async create(request) {
              proofRequests.push(request);
              return proofs.create(request);
            },
          },
          { id: 'example-dpop' },
        ),
      ],
    });
    const reactor = buildPapReactor({ fetch: localFetch }, [securityPlugin]);
    try {
      const client = new SessionClient({ reactor, fetch: localFetch });
      const options = {
        clientId: 'https://assistant.example/agent.json',
        pairwiseUserId: 'usr_host_only_example',
        issuer: 'https://company.example',
        tokenEndpoint: 'https://company.example/oauth/token',
        tenantId: 'example-tenant',
      } as const;
      const started = await client.start(options);
      const renewed = await client.renew({
        ...options,
        sessionKey: started.sessionKey,
      });
      setSummary({
        startStatus: 'created',
        renewStatus: 'renewed',
        signedIn: false,
        tokenType: 'DPoP',
        scopes: renewed.scopes,
        sameSession: started.sessionKey === renewed.sessionKey,
        nonceRetry:
          proofRequests.length === 3 &&
          proofRequests[0]?.nonce === undefined &&
          proofRequests[1]?.nonce === 'host-only-company-nonce' &&
          proofRequests[2]?.nonce === undefined,
        freshAssertions: purposes.length === 6,
        freshProofs: proofRequests.length === 3,
        provedWithSessionKey: proofRequests.every(
          request => request.sessionKey === started.sessionKey,
        ),
        noSessionIdOnTheWire: forms.every(form => !form.has('session_id')),
        sessionKeyWithheld: true,
        credentialsWithheld: true,
      });
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      reactor.stop();
    }
  };

  return (
    <PapExamplePage
      eyebrow="PAP · Signed-out Session"
      title="Start and renew without giving credentials to the agent"
      description="This Reactor view drives the real PAP SessionClient (draft 0.3) against a deterministic company transport. The Session has its own DPoP key, the Session Key, whose thumbprint names it: no session_id is sent or read. It handles a DPoP nonce challenge, generates fresh assertions and proofs with that key, and renews the same Session. Only lifecycle evidence enters React state."
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
          Exercise start, nonce retry, and renewal entirely inside this host.
        </Text>
        <Button variant="primary" onClick={() => void runLifecycle()}>
          Run lifecycle
        </Button>
      </Box>
      {error ? <Text sx={{ color: 'danger.fg' }}>{error}</Text> : null}
      {summary ? (
        <PapResult title="Safe Session evidence" value={summary} />
      ) : null}
    </PapExamplePage>
  );
};

export default PapSessionLifecycleView;
