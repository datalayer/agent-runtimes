/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIAMStore } from '@datalayer/core/state';
import { getEnvironments } from '@datalayer/core';
import { BeakerIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { Button, Flash, Heading, Label, Text, Spinner } from '@primer/react';

interface Environment {
  name: string;
  title?: string;
  display_name?: string;
  description?: string;
  language?: string;
  dockerImage?: string;
}

export default function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { token } = useIAMStore();

  useEffect(() => {
    if (token) {
      fetchEnvironments();
    } else {
      // Redirect to welcome page if no token
      router.push('/welcome');
    }
  }, [token, router]);

  const fetchEnvironments = async () => {
    try {
      setLoading(true);
      const data = await getEnvironments();
      setEnvironments(data);
    } catch (err) {
      setError('Failed to load environments');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bg: 'canvas.default', py: 8 }}>
      <Box sx={{ maxWidth: '1280px', mx: 'auto', px: [3, 4] }}>
        <Box sx={{ mb: 6 }}>
          <Heading sx={{ fontSize: 6, mb: 2 }}>Environments</Heading>
          <Text as="p" sx={{ fontSize: 2, color: 'fg.muted' }}>
            Available compute environments for running notebooks
          </Text>
        </Box>

        {loading ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              py: 6,
            }}
          >
            <Spinner size="large" />
            <Text sx={{ color: 'fg.muted' }}>Loading environments...</Text>
          </Box>
        ) : error ? (
          <Box>
            <Flash variant="danger" sx={{ mb: 3 }}>
              {error}
            </Flash>
            <Button onClick={fetchEnvironments} variant="default">
              Try again
            </Button>
          </Box>
        ) : environments.length === 0 ? (
          <Box
            sx={{
              textAlign: 'center',
              py: 12,
              border: '1px dashed',
              borderColor: 'border.muted',
              borderRadius: 2,
            }}
          >
            <BeakerIcon size={48} />
            <Text as="p" sx={{ fontSize: 3, fontWeight: 'bold', mt: 3, mb: 2 }}>
              No environments found
            </Text>
            <Text as="p" sx={{ color: 'fg.muted' }}>
              No compute environments are currently available
            </Text>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: ['1fr', 'repeat(2, 1fr)', 'repeat(3, 1fr)'],
              gap: 4,
            }}
          >
            {environments.map(env => {
              const displayName = env.title || env.display_name || env.name;
              const imgMatch = env.description?.match(
                /<img[^>]+src="([^"]+)"[^>]*>/,
              );
              const imageUrl = imgMatch ? imgMatch[1] : null;
              const cleanDescription = env.description
                ? env.description.replace(/<[^>]*>/g, '').substring(0, 150)
                : '';
              return (
                <Box
                  key={env.name}
                  sx={{
                    border: '1px solid',
                    borderColor: 'border.default',
                    borderRadius: 2,
                    p: 4,
                    bg: 'canvas.default',
                    transition: 'box-shadow 0.2s',
                    '&:hover': {
                      boxShadow: 'shadow.medium',
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      mb: 2,
                    }}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={displayName}
                        style={{ width: 24, height: 24 }}
                      />
                    ) : (
                      <BeakerIcon size={20} />
                    )}
                    <Heading as="h3" sx={{ fontSize: 2 }}>
                      {displayName}
                    </Heading>
                  </Box>
                  {cleanDescription && (
                    <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', mb: 2 }}>
                      {cleanDescription}...
                    </Text>
                  )}
                  {env.language && (
                    <Label variant="accent">{env.language}</Label>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}
