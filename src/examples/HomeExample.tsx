/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Box } from '@datalayer/primer-addons';
import { Heading, Text, TextInput } from '@primer/react';
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
                as="button"
                onClick={() => onSelectExample?.(example.id)}
                sx={{
                  textAlign: 'left',
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  p: 3,
                  bg: 'canvas.subtle',
                  cursor: 'pointer',
                  transition: 'all 120ms ease-in-out',
                  ':hover': {
                    transform: 'translateY(-2px)',
                    borderColor: 'accent.emphasis',
                    boxShadow: 'shadow.medium',
                    bg: 'canvas.default',
                  },
                }}
              >
                <Text sx={{ fontWeight: 600, fontSize: 2, display: 'block' }}>
                  {example.title}
                </Text>
                <Text
                  sx={{
                    color: 'fg.muted',
                    fontSize: 1,
                    display: 'block',
                    mt: 1,
                  }}
                >
                  {example.description}
                </Text>
                <Text
                  sx={{
                    color: 'fg.muted',
                    fontSize: 0,
                    display: 'block',
                    mt: 2,
                    fontFamily: 'mono',
                  }}
                >
                  {example.id}
                </Text>
                {example.tags.length > 0 && (
                  <Box
                    sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}
                  >
                    {example.tags.map(tag => (
                      <Box
                        key={`${example.id}-${tag}`}
                        sx={{
                          fontSize: 0,
                          px: 2,
                          py: '2px',
                          borderRadius: 999,
                          bg: 'canvas.inset',
                          color: 'fg.muted',
                          border: '1px solid',
                          borderColor: 'border.muted',
                        }}
                      >
                        {tag}
                      </Box>
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
