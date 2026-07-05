/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Button,
  FormControl,
  TextInput,
  Heading,
  Text,
  Link,
  IconButton,
  Flash,
  Spinner,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  EyeIcon,
  EyeClosedIcon,
  LinkExternalIcon,
} from '@primer/octicons-react';
import { useIAMStore } from '@datalayer/core/state';

export default function WelcomePage() {
  const [tokenInput, setTokenInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const iamStore = useIAMStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsValidating(true);

    try {
      await iamStore.login(tokenInput);
      router.push('/');
    } catch (err) {
      setError('Invalid token. Please check and try again.');
      setIsValidating(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        bg: 'canvas.default',
        position: 'relative',
      }}
    >
      <Box
        sx={{
          maxWidth: '448px',
          width: '100%',
          px: 3,
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
            {}
            <img
              src="/favicon.png"
              alt="Datalayer Logo"
              width={80}
              height={80}
            />
          </Box>
          <Heading sx={{ fontSize: 5, mb: 2 }}>
            Welcome to Datalayer Client
          </Heading>
          <Text as="p" sx={{ fontSize: 2, color: 'fg.muted' }}>
            Next.js Example Application
          </Text>
        </Box>

        <Box
          as="form"
          onSubmit={handleSubmit}
          sx={{
            bg: 'canvas.subtle',
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            p: 4,
          }}
        >
          <Box sx={{ mb: 4 }}>
            <Heading as="h2" sx={{ fontSize: 3, mb: 2 }}>
              Get Started
            </Heading>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted' }}>
              To use this example application, you&apos;ll need a Datalayer API
              token.
            </Text>
          </Box>

          <FormControl sx={{ mb: 3 }}>
            <FormControl.Label>API Token</FormControl.Label>
            <Box sx={{ position: 'relative', width: '100%' }}>
              <TextInput
                type={showToken ? 'text' : 'password'}
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Paste your Datalayer API token here..."
                required
                monospace
                block
                trailingVisual={
                  <IconButton
                    icon={showToken ? EyeClosedIcon : EyeIcon}
                    aria-label={showToken ? 'Hide token' : 'Show token'}
                    onClick={() => setShowToken(!showToken)}
                    variant="invisible"
                    size="small"
                  />
                }
              />
            </Box>
            <FormControl.Caption>
              Your token should start with &quot;eyJ...&quot;
            </FormControl.Caption>
          </FormControl>

          {error && (
            <Flash variant="danger" sx={{ mb: 3 }}>
              {error}
            </Flash>
          )}

          <Button
            type="submit"
            disabled={isValidating || !tokenInput}
            variant="primary"
            block
            sx={{ mb: 4, minWidth: '100%', width: '100%' }}
          >
            {isValidating ? (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                }}
              >
                <Spinner size="small" />
                <Text>Validating...</Text>
              </Box>
            ) : (
              'Continue'
            )}
          </Button>

          <Box
            sx={{
              pt: 4,
              borderTop: '1px solid',
              borderColor: 'border.muted',
            }}
          >
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', mb: 2 }}>
              Don&apos;t have an API key yet?
            </Text>
            <Link
              href="https://datalayer.app/settings/iam/api-keys"
              target="_blank"
              sx={{ fontSize: 1 }}
            >
              <LinkExternalIcon size={16} /> Create an API key on Datalayer
            </Link>
          </Box>
        </Box>

        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Text as="p" sx={{ fontSize: 0, color: 'fg.subtle' }}>
            Your API key is stored locally and used to authenticate with
            Datalayer&apos;s API
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
