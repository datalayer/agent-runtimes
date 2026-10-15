/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Shield's policy, from TypeScript (SHIELD §5.1, SH-53; SH-23).
 *
 * An organization's document typed by `@datalayer/agent-shield` (the types
 * generated from the schema the Python package publishes), what it decides
 * for each class, how ACP's tool kinds are classed, the limits soft then
 * hard, and decisions in the words `describeDecision` gives every card and
 * row. Needs nothing running: it reads the package only.
 *
 * `@datalayer/agent-shield` is imported as the monorepo's workspace link to
 * `ai/agent-shield` (its `lib/`, built by its own `tsc -b`), not from npm:
 * npm's latest is an old scaffold until the user unpublishes it, so
 * agent-runtimes' `package.json` does not declare it yet.
 *
 * @module examples/ShieldPolicyExample
 */

import React from 'react';
import { Heading, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import {
  ORGANIZATION_POLICY,
  classRows,
  decisionRows,
  kindRows,
  limitRows,
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

const ShieldPolicyExample: React.FC = () => (
  <ThemedProvider>
    <Box p={4} maxWidth="900px" mx="auto" data-testid="shield-policy-example">
      <Heading as="h1" sx={{ fontSize: 4, mb: 2 }}>
        The Shield's policy, typed
      </Heading>
      <Text as="p" sx={{ color: 'fg.muted', mb: 4 }}>
        An organization's document as `@datalayer/agent-shield` types it, and
        what it decides. Three levels decide every action — the organization's,
        the application's, the session's — strictest first; a lower level only
        tightens.
      </Text>

      <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
        By class
      </Heading>
      <Table
        head={['Class', `The ${ORGANIZATION_POLICY.scope}'s document says`]}
        rows={classRows().map(row => [row.actionClass, row.says])}
      />

      <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
        A coding agent's tool kinds
      </Heading>
      <Table
        head={['ACP kind', 'Decided as']}
        rows={kindRows().map(row => [row.kind, row.actionClass])}
      />

      <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
        Limits, soft then hard
      </Heading>
      <Table
        head={['Limit', 'Soft: asks once', 'Hard: refuses']}
        rows={limitRows().map(row => [row.limit, row.soft, row.hard])}
      />

      <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
        Decisions, in their words
      </Heading>
      <Table
        head={['The Shield said', 'describeDecision']}
        rows={decisionRows().map(row => [row.sentence, row.words])}
      />
    </Box>
  </ThemedProvider>
);

export default ShieldPolicyExample;
