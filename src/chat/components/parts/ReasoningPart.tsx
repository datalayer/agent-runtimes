/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Reasoning message part display component.
 * Renders AI reasoning/thinking content with collapsible section.
 *
 * @module components/chat/components/display/ReasoningPart
 */

import React from 'react';
import { Text, Button } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ChevronDownIcon } from '@primer/octicons-react';
import { Streamdown } from 'streamdown';
import { streamdownMarkdownStyles } from '../styles/streamdownStyles';

export interface ReasoningPartProps {
  /** Reasoning text content */
  text: string;
  /** Whether the response is currently streaming */
  isStreaming: boolean;
}

/**
 * ReasoningPart component for displaying AI reasoning/thinking.
 *
 * Features:
 * - Collapsible section to reduce visual clutter
 * - Auto-collapse after streaming ends
 * - Visual indicator for streaming state
 * - Markdown support for reasoning content
 */
export function ReasoningPart({ text, isStreaming }: ReasoningPartProps) {
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
            color: 'fg.muted',
            ...streamdownMarkdownStyles,
          }}
        >
          <Streamdown>{text}</Streamdown>
        </Box>
      )}
    </Box>
  );
}

export default ReasoningPart;
