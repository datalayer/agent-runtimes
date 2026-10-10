/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Box } from '@datalayer/primer-addons';
import { Heading, Label, Text } from '@primer/react';

export interface PapExamplePageProps {
  title: string;
  eyebrow: string;
  description: string;
  children: React.ReactNode;
}

/** Shared visual frame for the protocol examples. */
export const PapExamplePage: React.FC<PapExamplePageProps> = ({
  title,
  eyebrow,
  description,
  children,
}) => (
  <Box height="100%" overflow="auto" bg="canvas.subtle" p={4}>
    <Box maxWidth={960} mx="auto" display="flex" flexDirection="column" gap={3}>
      <Box display="flex" flexDirection="column" gap={2}>
        <Box>
          <Label variant="accent">{eyebrow}</Label>
        </Box>
        <Heading as="h1" sx={{ fontSize: 4 }}>
          {title}
        </Heading>
        <Text sx={{ color: 'fg.muted', maxWidth: 760 }}>{description}</Text>
      </Box>
      {children}
    </Box>
  </Box>
);

export const PapResult: React.FC<{
  title: string;
  value: unknown;
}> = ({ title, value }) => (
  <Box
    border="1px solid"
    borderColor="border.default"
    borderRadius={2}
    bg="canvas.default"
    p={3}
  >
    <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
      {title}
    </Heading>
    <Box
      as="pre"
      m={0}
      p={3}
      overflow="auto"
      borderRadius={2}
      bg="canvas.inset"
      sx={{ fontSize: 1, lineHeight: 1.5 }}
    >
      {JSON.stringify(value, null, 2)}
    </Box>
  </Box>
);
