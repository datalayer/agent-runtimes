/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Text, Button } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ChevronDownIcon } from '@primer/octicons-react';
import { Streamdown } from 'streamdown';

interface IReasoningPartProps {
  text: string;
  isStreaming: boolean;
}

export function ReasoningPart({ text, isStreaming }: IReasoningPartProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Auto-close after streaming ends (with delay)
  React.useEffect(() => {
    if (!isStreaming && isExpanded) {
      const timer = setTimeout(() => {
        setIsExpanded(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isExpanded]);

  return (
    <Box sx={{ marginBottom: 3 }}>
      <Button
        variant="invisible"
        size="small"
        onClick={() => setIsExpanded(!isExpanded)}
        sx={{
          width: '100%',
          display: 'flex',
          gap: 2,
          justifyContent: 'flex-start',
          alignItems: 'center',
          paddingX: 0,
          paddingY: 1,
          color: 'fg.muted',
          border: 'none',
          '&:hover': {
            color: 'fg.default',
          },
        }}
      >
        <Text sx={{ fontSize: 1 }}>🧠</Text>
        <Text sx={{ fontSize: 1, fontWeight: 'normal' }}>
          {isStreaming ? 'Thinking...' : 'Reasoning'}
        </Text>
        <Box
          as="span"
          sx={{
            display: 'inline-flex',
            marginLeft: 'auto',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <ChevronDownIcon />
        </Box>
      </Button>
      {isExpanded && (
        <Box
          sx={{
            marginTop: 2,
            padding: 3,
            backgroundColor: 'canvas.inset',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'border.default',
            fontSize: 1,
            lineHeight: 1.6,
            color: 'fg.muted',
            '& > *:first-child': { marginTop: 0 },
            '& > *:last-child': { marginBottom: 0 },
          }}
        >
          <Streamdown>{text}</Streamdown>
        </Box>
      )}
    </Box>
  );
}
