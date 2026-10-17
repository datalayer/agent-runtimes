/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, Text, TextInput } from '@primer/react';
import {
  parseClientMetadata,
  parseJsonWebKeySet,
} from '@datalayer/personal-agent-protocol';
import {
  PapPersonalAgentCapability,
  type PapAgentIdentitySummary,
} from '../../pap';
import { PapExamplePage, PapResult } from './PapExamplePage';

const SAMPLE_CLIENT_ID = 'https://assistant.example/agent.json';

/** Verify client metadata and JWKS while withholding public-key coordinates. */
const PapAgentIdentityView: React.FC = () => {
  const [clientId, setClientId] = useState(SAMPLE_CLIENT_ID);
  const [summary, setSummary] = useState<PapAgentIdentitySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inspect = async () => {
    setError(null);
    try {
      const normalized = new URL(clientId.trim()).toString();
      const capability = new PapPersonalAgentCapability({
        identity: {
          fetchMetadata: async requested =>
            parseClientMetadata({
              client_id: requested,
              client_name: 'Example Research Assistant',
              jwks_uri: `${new URL(requested).origin}/jwks.json`,
              redirect_uris: [`${new URL(requested).origin}/callback`],
              token_endpoint_auth_method: 'private_key_jwt',
              extensions: { memory: { version: '2' } },
            }),
          fetchJwks: async () =>
            parseJsonWebKeySet({
              keys: [
                {
                  kty: 'EC',
                  crv: 'P-256',
                  x: 'withheld-x-coordinate',
                  y: 'withheld-y-coordinate',
                  use: 'sig',
                  alg: 'ES256',
                },
              ],
            }),
        },
      });
      setSummary(await capability.inspectAgent(normalized));
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <PapExamplePage
      eyebrow="PAP · Personal-agent identity"
      title="Verify who signs without exposing the key"
      description="PAP binds client metadata to its HTTPS client ID and verifies its JWKS. Agent Runtimes keeps only identity and signing policy; coordinates and operational endpoints stay outside the UI and model boundary."
    >
      <Box
        display="flex"
        flexDirection="column"
        gap={3}
        p={3}
        border="1px solid"
        borderColor="border.default"
        borderRadius={2}
        bg="canvas.default"
      >
        <Text as="label" sx={{ fontWeight: 600 }}>
          Personal-agent client ID
        </Text>
        <Box display="flex" gap={2}>
          <TextInput
            block
            value={clientId}
            aria-label="Personal-agent client ID"
            onChange={event => setClientId(event.target.value)}
          />
          <Button variant="primary" onClick={() => void inspect()}>
            Verify sample
          </Button>
        </Box>
        {error ? <Text sx={{ color: 'danger.fg' }}>{error}</Text> : null}
      </Box>
      {summary ? (
        <PapResult title="Safe identity summary" value={summary} />
      ) : null}
    </PapExamplePage>
  );
};

export default PapAgentIdentityView;
