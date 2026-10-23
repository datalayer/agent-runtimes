/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Shield's policy, from TypeScript (SH-53, SH-23).
 *
 * An organization's document typed by `@datalayer/agent-shield` (the types
 * generated from the schema the Python package publishes), what it decides
 * for each class, how ACP's tool kinds are classed, the limits soft then
 * hard, and decisions in the words `describeDecision` gives every card and
 * row. Needs nothing running: it reads the package only.
 *
 * `@datalayer/agent-shield` is not on npm yet: the page reads it from the
 * sibling checkout `ai/agent-shield` beside agent-runtimes (see
 * `shield/shieldPolicyDemo`), and says so where it is not there.
 *
 * @module examples/ShieldPolicyExample
 */

import React, { useEffect, useState } from 'react';
import { Heading, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import {
  AGENT_SHIELD_MISSING,
  ORGANIZATION_POLICY,
  classRows,
  decisionRows,
  kindRows,
  limitRows,
  loadAgentShield,
  type AgentShieldPolicyModule,
} from './shield/shieldPolicyDemo';

const cell = {
  borderBottom: '1px solid',
  borderColor: 'border.muted',
  py: 1,
  pr: 3,
};

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: string[][];
}): React.JSX.Element {
  return (
    <Box as="table" sx={{ borderCollapse: 'collapse', fontSize: 1, mb: 4 }}>
      <thead>
        <tr>
          {head.map(title => (
            <Box as="th" key={title} sx={{ ...cell, textAlign: 'left' }}>
              {title}
            </Box>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.join('|')}>
            {row.map((value, index) => (
              <Box as="td" key={index} sx={cell}>
                {value}
              </Box>
            ))}
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

function Tables({
  shield,
}: {
  shield: AgentShieldPolicyModule;
}): React.JSX.Element {
  return (
    <>
      <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
        By class
      </Heading>
      <Table
        head={['Class', `The ${ORGANIZATION_POLICY.scope}'s document says`]}
        rows={classRows(shield).map(row => [row.actionClass, row.says])}
      />

      <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
        A coding agent's tool kinds
      </Heading>
      <Table
        head={['ACP kind', 'Decided as']}
        rows={kindRows(shield).map(row => [row.kind, row.actionClass])}
      />

      <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
        Limits, soft then hard
      </Heading>
      <Table
        head={['Limit', 'Soft: asks once', 'Hard: refuses']}
        rows={limitRows(shield).map(row => [row.limit, row.soft, row.hard])}
      />

      <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
        Decisions, in their words
      </Heading>
      <Table
        head={['The Shield said', 'describeDecision']}
        rows={decisionRows(shield).map(row => [row.sentence, row.words])}
      />
    </>
  );
}

const ShieldPolicyExample: React.FC = () => {
  // `undefined` while reading, `null` without the sibling checkout.
  const [shield, setShield] = useState<
    AgentShieldPolicyModule | null | undefined
  >(undefined);
  useEffect(() => {
    let live = true;
    void loadAgentShield().then(loaded => live && setShield(loaded));
    return () => {
      live = false;
    };
  }, []);
  return (
    <ThemedProvider>
      <Box p={4} maxWidth="900px" mx="auto" data-testid="shield-policy-example">
        <Heading as="h1" sx={{ fontSize: 4, mb: 2 }}>
          The Shield's policy, typed
        </Heading>
        <Text as="p" sx={{ color: 'fg.muted', mb: 4 }}>
          An organization's document in `@datalayer/agent-shield`'s shape, and
          what it decides. Three levels decide every action — the
          organization's, the application's, the session's — strictest first; a
          lower level only tightens.
        </Text>
        {shield === undefined ? (
          <Text as="p">Reading @datalayer/agent-shield…</Text>
        ) : shield === null ? (
          <Text as="p" sx={{ color: 'attention.fg' }}>
            {AGENT_SHIELD_MISSING}
          </Text>
        ) : (
          <Tables shield={shield} />
        )}
      </Box>
    </ThemedProvider>
  );
};

export default ShieldPolicyExample;
