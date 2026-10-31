/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { contribution, definePlugin } from '@datalayer/reactor';
import { Button, Text } from '@primer/react';
import {
  DelegatedSessionSigner,
  InMemoryDelegatedKeys,
  SecretValue,
  SessionClient,
  SessionFetchClient,
  SessionSigners,
  buildPapReactor,
} from '@datalayer/personal-agent-protocol';
import { PapExamplePage, PapResult } from './PapExamplePage';

type SessionSummary = {
  startStatus: 'created';
  requestsToStartASession: number;
  /** A fresh Session JWT on every request, naming the `sid`. */
  sessionHeaderOnEveryRequest: boolean;
  freshJwtPerRequest: boolean;
  /** `invalid_session` starts a new Session once, and the request is sent again. */
  restartedOnce: boolean;
  resentRequestStatus: number;
  sameUserAfterRestart: boolean;
  sidWithheld: true;
  credentialsWithheld: true;
};

/** Exercise the real Session client and retain only safe lifecycle evidence. */
const PapSessionLifecycleView: React.FC = () => {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runLifecycle = async () => {
    setError(null);
    const jwts: string[] = [];
    let calls = 0;
    const localFetch: typeof globalThis.fetch = async (_input, init) => {
      calls += 1;
      jwts.push(new Headers(init?.headers).get('Poppy-Session') ?? '');
      return calls === 1
        ? new Response(JSON.stringify({ error: 'invalid_session' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        : new Response('{}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
    };
    const securityPlugin = definePlugin({
      name: '@datalayer/loop-example-pap-session-security',
      contributes: [
        contribution(
          SessionSigners,
          // A real delegated P-256 key per User ID, its private half kept here;
          // the delegation's signature is a stand-in for a key in `jwks_uri`.
          new DelegatedSessionSigner({
            custody: new InMemoryDelegatedKeys(),
            signer: {
              sign: async (_claims, options) =>
                new SecretValue(`host-only-${options.purpose}`),
            },
          }),
          { id: 'example-session-signer' },
        ),
      ],
    });
    const reactor = buildPapReactor({ fetch: localFetch }, [securityPlugin]);
    try {
      const session = await new SessionClient({
        reactor,
        fetch: localFetch,
      }).start({
        clientId: 'https://assistant.example/agent.json',
        pairwiseUserId: 'usr_host_only_example',
        issuer: 'https://company.example',
        tenantId: 'example-tenant',
      });
      const requestsToStartASession = calls;
      const sid = session.sid;
      const answer = await new SessionFetchClient({
        reactor,
        fetch: localFetch,
      }).request('GET', 'https://company.example/poppy/orders', { session });
      setSummary({
        startStatus: 'created',
        requestsToStartASession,
        sessionHeaderOnEveryRequest: jwts.every(jwt => jwt !== ''),
        freshJwtPerRequest: new Set(jwts).size === jwts.length,
        restartedOnce: calls === 2 && session.sid !== sid,
        resentRequestStatus: answer.status,
        sameUserAfterRestart: session.sub === 'usr_host_only_example',
        sidWithheld: true,
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
      eyebrow="PAP · Session"
      title="Start and restart a Session without giving credentials to the agent"
      description="This Reactor view drives the real PAP SessionClient and SessionFetchClient (draft 0.3) against a deterministic company transport. A Session is local: a random sid, and no request. Every request carries a fresh Poppy-Session JWT signed with a delegated key. Answered invalid_session, it starts again once, with a new sid and the same User ID. Only lifecycle evidence enters React state."
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
          Exercise start, the Session header and a restart entirely inside this
          host.
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
