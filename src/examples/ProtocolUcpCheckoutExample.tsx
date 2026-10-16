/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A UCP checkout approved as a card (EX-10, after EX-04):
 * the UCP client buys from *Example Store*, the local test merchant running
 * in the page. The exact purchase is proposed; completing it asks the
 * approver — the card below — once; approving buys once, and the same
 * proposal is refused after. The test payment's token is never shown.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { Button, Flash, Heading, Text } from '@primer/react';
import { ThemedProvider } from './utils/themedProvider';
import type { CheckoutProposal } from '../protocols/ucp';
import { buy, proposeTea, ucpCheckoutDemo } from './protocols/ucpCheckoutDemo';

setupPrimerPortals();

const ProtocolUcpCheckoutExample: React.FC = () => {
  const answer = useRef<((approved: boolean) => void) | null>(null);
  const [asking, setAsking] = useState(false);
  const demo = useMemo(
    () =>
      ucpCheckoutDemo(
        () =>
          new Promise<boolean>(resolve => {
            answer.current = resolve;
            setAsking(true);
          }),
      ),
    [],
  );
  const [proposal, setProposal] = useState<{
    proposal: CheckoutProposal;
    says: string;
  } | null>(null);
  const [said, setSaid] = useState<{ ok: boolean; says: string }[]>([]);
  const [working, setWorking] = useState(false);

  const propose = async () => {
    setWorking(true);
    try {
      setProposal(await proposeTea(demo));
    } catch (error) {
      setSaid(s => [
        ...s,
        { ok: false, says: String((error as Error).message) },
      ]);
    } finally {
      setWorking(false);
    }
  };

  const complete = async () => {
    if (!proposal) return;
    setWorking(true);
    const outcome = await buy(demo, proposal.proposal);
    setSaid(s => [...s, outcome]);
    setWorking(false);
  };

  const decide = (approved: boolean) => {
    setAsking(false);
    answer.current?.(approved);
    answer.current = null;
  };

  return (
    <ThemedProvider>
      <Box p={4} maxWidth={720} mx="auto">
        <Heading as="h2" sx={{ fontSize: 3, mb: 1 }}>
          UCP checkout
        </Heading>
        <Text as="p" sx={{ color: 'fg.muted', mt: 0 }}>
          Universal Commerce Protocol 2026-08-25, against Example Store, a test
          merchant running in this page. Nothing is bought without the card
          below, and a proposal buys once.
        </Text>
        <Box display="flex" gap={2} mb={3} flexWrap="wrap">
          <Button onClick={propose} disabled={working || asking}>
            Propose 2 × Sencha green tea
          </Button>
          <Button
            variant="primary"
            onClick={complete}
            disabled={!proposal || working}
          >
            Complete the purchase
          </Button>
        </Box>
        {proposal && asking ? (
          <Box
            p={3}
            mb={3}
            border="1px solid"
            borderColor="attention.emphasis"
            borderRadius={2}
            role="dialog"
            aria-label="Approve this purchase"
          >
            <Text as="p" sx={{ fontWeight: 'semibold', mt: 0 }}>
              Approve this purchase?
            </Text>
            <Text as="p">{proposal.says}</Text>
            <Text as="p" sx={{ color: 'fg.muted', fontSize: 0 }}>
              Revision {proposal.proposal.revision.slice(0, 12)}… — if the
              basket changes, it is proposed again.
            </Text>
            <Box display="flex" gap={2}>
              <Button variant="primary" onClick={() => decide(true)}>
                Approve
              </Button>
              <Button onClick={() => decide(false)}>Decline</Button>
            </Box>
          </Box>
        ) : proposal ? (
          <Text as="p" sx={{ fontSize: 1 }}>
            Proposed: {proposal.says}
          </Text>
        ) : null}
        {said.map((each, index) => (
          <Flash
            key={index}
            variant={each.ok ? 'success' : 'warning'}
            sx={{ mb: 2 }}
          >
            {each.says}
          </Flash>
        ))}
        <Text as="p" sx={{ color: 'fg.muted', fontSize: 0 }}>
          Orders at the store: {demo.orders.length}
        </Text>
      </Box>
    </ThemedProvider>
  );
};

export default ProtocolUcpCheckoutExample;
