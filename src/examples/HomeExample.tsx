/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Box } from '@datalayer/primer-addons';
import { Heading, Text, TextInput, Label } from '@primer/react';
import { SearchIcon } from '@primer/octicons-react';

export interface HomeExampleCardEntry {
  id: string;
  title: string;
  description: string;
  tags: string[];
}

export interface HomeExampleProps {
  examples?: HomeExampleCardEntry[];
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  onSelectExample?: (name: string) => void;
}

const HomeExample: React.FC<HomeExampleProps> = ({
  examples = [],
  searchQuery = '',
  onSearchChange,
  onSelectExample,
}) => {
  const sortedExamples = [...examples].sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        bg: 'canvas.default',
      }}
    >
      <Box
        sx={{
          maxWidth: '1600px',
          margin: '0 auto',
          p: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 3,
            flexWrap: 'wrap',
          }}
        >
          <Box>
            <Heading as="h2" sx={{ fontSize: 4, mb: 1 }}>
              Agent Runtimes Examples
            </Heading>
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
              Browse all examples as cards and open any flow in one click.
            </Text>
          </Box>
          <TextInput
            autoFocus={true}
            value={searchQuery}
            onChange={event => onSearchChange?.(event.target.value)}
            placeholder="Search examples"
            leadingVisual={SearchIcon}
            sx={{ minWidth: ['100%', '320px'] }}
          />
        </Box>

        {sortedExamples.length === 0 ? (
          <Box
            sx={{
              border: '1px dashed',
              borderColor: 'border.default',
              borderRadius: 3,
              p: 4,
              textAlign: 'center',
              color: 'fg.muted',
            }}
          >
            No examples match your search.
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: [
                '1fr',
                'repeat(2, minmax(0, 1fr))',
                'repeat(4, minmax(0, 1fr))',
              ],
              gap: 3,
            }}
          >
            {sortedExamples.map(example => (
              <Box
                key={example.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectExample?.(example.id)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectExample?.(example.id);
                  }
                }}
                sx={{
                  bg: 'canvas.default',
                  p: 4,
                  borderRadius: '12px',
                  border: '1px solid',
                  borderColor: 'border.default',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  cursor: 'pointer',
                  transition:
                    'box-shadow 0.2s, transform 0.2s, border-color 0.2s',
                  '&:hover': {
                    boxShadow: 'shadow.large',
                    transform: 'translateY(-2px)',
                    borderColor: 'accent.emphasis',
                  },
                  '&:focus-visible': {
                    outline: '2px solid',
                    outlineColor: 'accent.emphasis',
                    outlineOffset: '2px',
                  },
                }}
              >
                <Heading as="h3" sx={{ fontSize: 2, fontWeight: 'bold' }}>
                  {example.title}
                </Heading>
                <Text sx={{ color: 'fg.muted', fontSize: 1, lineHeight: 1.6 }}>
                  {example.description}
                </Text>
                <Text
                  sx={{
                    color: 'fg.muted',
                    fontSize: 0,
                    fontFamily: 'mono',
                  }}
                >
                  {example.id}
                </Text>
                {example.tags.length > 0 && (
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 1,
                      flexWrap: 'wrap',
                      mt: 'auto',
                      pt: 2,
                    }}
                  >
                    {example.tags.map(tag => (
                      <Label key={`${example.id}-${tag}`} variant="secondary">
                        {tag}
                      </Label>
                    ))}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default HomeExample;
