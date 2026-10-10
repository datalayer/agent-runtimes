/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, Text, TextInput } from '@primer/react';
import {
  parseDiscoveryDocument,
  type DiscoveredCompany,
} from '@datalayer/personal-agent-protocol';
import { PapPersonalAgentCapability, type PapCompanySummary } from '../../pap';
import { PapExamplePage, PapResult } from './PapExamplePage';

const SAMPLE_DOMAIN = 'shop.example';

const sampleCompany = (domain: string): DiscoveredCompany => ({
  discoveryUrl: `https://${domain}/.well-known/poppy.json`,
  document: parseDiscoveryDocument({
    protocol_version: '0.1',
    organization: { name: 'Example Shop', domain },
    auth: {
      issuer: `https://auth.${domain}`,
      direct: { scopes: ['poppy:read'] },
      custom_scopes: {},
    },
    agent: {
      protocols: [{ type: 'a2a', endpoint: `https://${domain}/agent` }],
    },
    apis: [
      {
        type: 'openapi',
        url: `https://${domain}/openapi.json`,
        description: 'Read the catalogue',
      },
    ],
    extensions: { operations: { version: '1' } },
  }),
});

/** Verify a company fixture through the same safe capability used by agents. */
const PapCompanyDiscoveryView: React.FC = () => {
  const [domain, setDomain] = useState(SAMPLE_DOMAIN);
  const [summary, setSummary] = useState<PapCompanySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inspect = async () => {
    setError(null);
    try {
      const normalized = domain.trim().toLowerCase();
      const capability = new PapPersonalAgentCapability({
        discover: async requested => {
          if (requested !== normalized) {
            throw new Error('The requested domain changed during discovery.');
          }
          return sampleCompany(normalized);
        },
      });
      setSummary(await capability.discoverCompany(normalized));
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <PapExamplePage
      eyebrow="PAP · Company discovery"
      title="Discover capabilities, not credentials"
      description="The PAP parser validates the discovery document; Agent Runtimes then projects it into a model-safe summary. Change the sample domain to see issuer and discovery binding move together."
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
          Company DNS domain
        </Text>
        <Box display="flex" gap={2}>
          <TextInput
            block
            value={domain}
            aria-label="Company DNS domain"
            onChange={event => setDomain(event.target.value)}
          />
          <Button variant="primary" onClick={() => void inspect()}>
            Validate sample
          </Button>
        </Box>
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
          The sample uses an injected Reactor-compatible transport. Production
          replaces it with DNS-pinned HTTPS discovery.
        </Text>
        {error ? <Text sx={{ color: 'danger.fg' }}>{error}</Text> : null}
      </Box>
      {summary ? (
        <PapResult title="Safe company summary" value={summary} />
      ) : null}
    </PapExamplePage>
  );
};

export default PapCompanyDiscoveryView;
