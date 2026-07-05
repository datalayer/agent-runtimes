/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import { Link, Text, Heading } from '@primer/react';
import { Box } from '@datalayer/primer-addons';

export default function Footer() {
  return (
    <Box
      as="footer"
      sx={{
        bg: 'canvas.subtle',
        borderTop: '1px solid',
        borderColor: 'border.default',
        py: 6,
        mt: 'auto',
      }}
    >
      <Box
        sx={{
          maxWidth: '1280px',
          mx: 'auto',
          px: 4,
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: ['1fr', 'repeat(2, 1fr)', 'repeat(4, 1fr)'],
            gap: 6,
            mb: 6,
          }}
        >
          {/* Datalayer Info */}
          <Box>
            <Box sx={{ mb: 3 }}>
              {}
              <img
                src="https://assets.datalayer.tech/datalayer-25.svg"
                alt="Datalayer"
                style={{ height: '32px', width: 'auto' }}
              />
            </Box>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted' }}>
              AI Agents for Data Analysis
            </Text>
          </Box>

          {/* Documentation */}
          <Box>
            <Heading
              as="h3"
              sx={{ fontSize: 2, mb: 3, fontWeight: 'semibold' }}
            >
              Documentation
            </Heading>
            <Box as="ul" sx={{ listStyle: 'none', pl: 0 }}>
              <Box as="li" sx={{ mb: 2 }}>
                <Link
                  href="https://datalayer.ai/docs/"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: 1,
                    color: 'fg.muted',
                    textDecoration: 'none',
                    '&:hover': { color: 'accent.fg' },
                  }}
                >
                  Platform Docs
                </Link>
              </Box>
              <Box as="li" sx={{ mb: 2 }}>
                <Link
                  href="https://github.com/datalayer/core/tree/main/examples/nextjj"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: 1,
                    color: 'fg.muted',
                    textDecoration: 'none',
                    '&:hover': { color: 'accent.fg' },
                  }}
                >
                  Example Source Code
                </Link>
              </Box>
              <Box as="li" sx={{ mb: 2 }}>
                <Link
                  href="https://core.datalayer.tech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: 1,
                    color: 'fg.muted',
                    textDecoration: 'none',
                    '&:hover': { color: 'accent.fg' },
                  }}
                >
                  API Reference
                </Link>
              </Box>
            </Box>
          </Box>

          {/* Resources */}
          <Box>
            <Heading
              as="h3"
              sx={{ fontSize: 2, mb: 3, fontWeight: 'semibold' }}
            >
              Resources
            </Heading>
            <Box as="ul" sx={{ listStyle: 'none', pl: 0 }}>
              <Box as="li" sx={{ mb: 2 }}>
                <Link
                  href="https://github.com/datalayer/core"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: 1,
                    color: 'fg.muted',
                    textDecoration: 'none',
                    '&:hover': { color: 'accent.fg' },
                  }}
                >
                  GitHub Repository
                </Link>
              </Box>
              <Box as="li" sx={{ mb: 2 }}>
                <Link
                  href="https://www.npmjs.com/package/@datalayer/core"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: 1,
                    color: 'fg.muted',
                    textDecoration: 'none',
                    '&:hover': { color: 'accent.fg' },
                  }}
                >
                  NPM Package
                </Link>
              </Box>
              <Box as="li" sx={{ mb: 2 }}>
                <Link
                  href="https://pypi.org/project/datalayer-core/"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: 1,
                    color: 'fg.muted',
                    textDecoration: 'none',
                    '&:hover': { color: 'accent.fg' },
                  }}
                >
                  PyPI Package
                </Link>
              </Box>
            </Box>
          </Box>

          {/* Community */}
          <Box>
            <Heading
              as="h3"
              sx={{ fontSize: 2, mb: 3, fontWeight: 'semibold' }}
            >
              Community
            </Heading>
            <Box as="ul" sx={{ listStyle: 'none', pl: 0 }}>
              <Box as="li" sx={{ mb: 2 }}>
                <Link
                  href="https://datalayer.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: 1,
                    color: 'fg.muted',
                    textDecoration: 'none',
                    '&:hover': { color: 'accent.fg' },
                  }}
                >
                  Datalayer Platform
                </Link>
              </Box>
              <Box as="li" sx={{ mb: 2 }}>
                <Link
                  href="https://github.com/datalayer/core/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: 1,
                    color: 'fg.muted',
                    textDecoration: 'none',
                    '&:hover': { color: 'accent.fg' },
                  }}
                >
                  Report Issues
                </Link>
              </Box>
              <Box as="li" sx={{ mb: 2 }}>
                <Link
                  href="https://github.com/sponsors/datalayer"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: 1,
                    color: 'fg.muted',
                    textDecoration: 'none',
                    '&:hover': { color: 'accent.fg' },
                  }}
                >
                  Sponsor
                </Link>
              </Box>
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            pt: 4,
            borderTop: '1px solid',
            borderColor: 'border.muted',
            textAlign: 'center',
          }}
        >
          <Text as="p" sx={{ fontSize: 0, color: 'fg.subtle' }}>
            © {new Date().getFullYear()} Datalayer, Inc. All rights reserved.
            Distributed under the Modified BSD License.
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
