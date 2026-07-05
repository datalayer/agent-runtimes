/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIAMStore } from '@datalayer/core/state';
import { Box } from '@datalayer/primer-addons';
import { Spinner, Text } from '@primer/react';

export default function Home() {
  const router = useRouter();
  const { token } = useIAMStore();

  useEffect(() => {
    if (token) {
      // Redirect to notebooks page if authenticated
      router.push('/notebooks');
    } else {
      // Redirect to welcome page if not authenticated
      router.push('/welcome');
    }
  }, [token, router]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bg: 'canvas.default',
        gap: 2,
      }}
    >
      <Spinner size="large" />
      <Text sx={{ color: 'fg.muted' }}>Loading...</Text>
    </Box>
  );
}
