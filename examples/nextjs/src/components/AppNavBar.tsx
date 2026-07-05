/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useIAMStore } from '@datalayer/core/state';
import { useActiveNotebook } from '@/contexts/ActiveNotebookContext';
import dynamic from 'next/dynamic';
import { ZapIcon, ThreeBarsIcon, XIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { Text, Button, Avatar, IconButton } from '@primer/react';

export default function AppNavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const iamStore = useIAMStore();
  const { user } = iamStore;
  const { activeNotebook } = useActiveNotebook();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  if (pathname === '/welcome') {
    return null;
  }

  return (
    <>
      <Box
        as="nav"
        sx={{
          bg: 'canvas.default',
          borderBottom: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <Box
          sx={{
            maxWidth: '1280px',
            mx: 'auto',
            px: [3, 4],
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              height: '64px',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <Box
                as="a"
                href="https://datalayer.io"
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  textDecoration: 'none',
                }}
              >
                <Image
                  src="https://assets.datalayer.tech/datalayer-25.svg"
                  alt="Datalayer"
                  width={32}
                  height={32}
                  style={{ height: '32px', width: 'auto' }}
                />
              </Box>

              <Box
                sx={{
                  display: ['none', 'none', 'flex'],
                  gap: 2,
                }}
              >
                <Box
                  as={Link}
                  href="/notebooks"
                  sx={{
                    px: 3,
                    py: 2,
                    borderRadius: 2,
                    fontSize: 1,
                    fontWeight: 'medium',
                    textDecoration: 'none',
                    color:
                      pathname === '/notebooks' || pathname === '/'
                        ? 'fg.default'
                        : 'fg.muted',
                    bg:
                      pathname === '/notebooks' || pathname === '/'
                        ? 'actionListItem.default.selectedBg'
                        : 'transparent',
                    '&:hover': {
                      bg:
                        pathname === '/notebooks' || pathname === '/'
                          ? 'actionListItem.default.selectedBg'
                          : 'actionListItem.default.hoverBg',
                      color: 'fg.default',
                    },
                  }}
                >
                  Notebooks
                </Box>
                <Box
                  as={Link}
                  href="/environments"
                  sx={{
                    px: 3,
                    py: 2,
                    borderRadius: 2,
                    fontSize: 1,
                    fontWeight: 'medium',
                    textDecoration: 'none',
                    color:
                      pathname === '/environments' ? 'fg.default' : 'fg.muted',
                    bg:
                      pathname === '/environments'
                        ? 'actionListItem.default.selectedBg'
                        : 'transparent',
                    '&:hover': {
                      bg:
                        pathname === '/environments'
                          ? 'actionListItem.default.selectedBg'
                          : 'actionListItem.default.hoverBg',
                      color: 'fg.default',
                    },
                  }}
                >
                  Environments
                </Box>
                {activeNotebook && (
                  <Box
                    as={Link}
                    href={activeNotebook.viewerUrl}
                    title={activeNotebook.name}
                    sx={{
                      px: 3,
                      py: 2,
                      borderRadius: 2,
                      fontSize: 1,
                      fontWeight: 'medium',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      color: pathname.startsWith('/viewer')
                        ? 'fg.default'
                        : 'fg.muted',
                      bg: pathname.startsWith('/viewer')
                        ? 'actionListItem.default.selectedBg'
                        : 'transparent',
                      '&:hover': {
                        bg: pathname.startsWith('/viewer')
                          ? 'actionListItem.default.selectedBg'
                          : 'actionListItem.default.hoverBg',
                        color: 'fg.default',
                      },
                    }}
                  >
                    <ZapIcon size={16} />
                    <Text
                      sx={{
                        maxWidth: '150px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {activeNotebook.name}
                    </Text>
                  </Box>
                )}
              </Box>
            </Box>

            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: [2, 2, 3],
              }}
            >
              {user && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <Text
                    sx={{
                      fontSize: 1,
                      fontWeight: 'medium',
                      display: ['none', 'none', 'block'],
                    }}
                  >
                    {user.displayName || user.handle || user.email || 'User'}
                  </Text>
                  {user.avatarUrl && (
                    <Avatar
                      src={user.avatarUrl}
                      alt={user.displayName || user.handle || 'User'}
                      size={32}
                      sx={{
                        flexShrink: 0,
                      }}
                    />
                  )}
                </Box>
              )}
              <Button
                onClick={() => {
                  iamStore.logout();
                  router.push('/welcome');
                }}
                variant="default"
                size="small"
                sx={{
                  display: ['none', 'none', 'block'],
                }}
              >
                Logout
              </Button>
              <IconButton
                icon={ThreeBarsIcon}
                aria-label="Open menu"
                variant="invisible"
                sx={{
                  display: ['block', 'block', 'none'],
                }}
                onClick={() => setIsMobileMenuOpen(true)}
              />
            </Box>
          </Box>
        </Box>
      </Box>

      {isMobileMenuOpen && (
        <>
          <Box
            onClick={() => setIsMobileMenuOpen(false)}
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bg: 'canvas.backdrop',
              zIndex: 99,
            }}
          />
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: ['100%', '320px'],
              bg: 'canvas.default',
              boxShadow: 'shadow.large',
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                p: 3,
                borderBottom: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Text sx={{ fontSize: 2, fontWeight: 'semibold' }}>Menu</Text>
              <IconButton
                icon={XIcon}
                aria-label="Close menu"
                variant="invisible"
                onClick={() => setIsMobileMenuOpen(false)}
              />
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box
                  as={Link}
                  href="/notebooks"
                  sx={{
                    px: 3,
                    py: 2,
                    borderRadius: 2,
                    textDecoration: 'none',
                    fontSize: 2,
                    fontWeight: 'medium',
                    color:
                      pathname === '/notebooks' || pathname === '/'
                        ? 'fg.default'
                        : 'fg.muted',
                    bg:
                      pathname === '/notebooks' || pathname === '/'
                        ? 'actionListItem.default.selectedBg'
                        : 'transparent',
                    '&:hover': {
                      bg:
                        pathname === '/notebooks' || pathname === '/'
                          ? 'actionListItem.default.selectedBg'
                          : 'actionListItem.default.hoverBg',
                      color: 'fg.default',
                    },
                  }}
                >
                  Notebooks
                </Box>

                <Box
                  as={Link}
                  href="/environments"
                  sx={{
                    px: 3,
                    py: 2,
                    borderRadius: 2,
                    textDecoration: 'none',
                    fontSize: 2,
                    fontWeight: 'medium',
                    color:
                      pathname === '/environments' ? 'fg.default' : 'fg.muted',
                    bg:
                      pathname === '/environments'
                        ? 'actionListItem.default.selectedBg'
                        : 'transparent',
                    '&:hover': {
                      bg:
                        pathname === '/environments'
                          ? 'actionListItem.default.selectedBg'
                          : 'actionListItem.default.hoverBg',
                      color: 'fg.default',
                    },
                  }}
                >
                  Environments
                </Box>

                {activeNotebook && (
                  <Box
                    as={Link}
                    href={activeNotebook.viewerUrl}
                    sx={{
                      px: 3,
                      py: 2,
                      borderRadius: 2,
                      textDecoration: 'none',
                      fontSize: 2,
                      fontWeight: 'medium',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      color: pathname.startsWith('/viewer')
                        ? 'fg.default'
                        : 'fg.muted',
                      bg: pathname.startsWith('/viewer')
                        ? 'actionListItem.default.selectedBg'
                        : 'transparent',
                      '&:hover': {
                        bg: pathname.startsWith('/viewer')
                          ? 'actionListItem.default.selectedBg'
                          : 'actionListItem.default.hoverBg',
                        color: 'fg.default',
                      },
                    }}
                  >
                    <ZapIcon size={16} />
                    <Text>{activeNotebook.name}</Text>
                  </Box>
                )}
              </Box>
            </Box>
            <Box
              sx={{
                p: 3,
                borderTop: '1px solid',
                borderColor: 'border.default',
              }}
            >
              <Button
                onClick={() => {
                  iamStore.logout();
                  router.push('/welcome');
                  setIsMobileMenuOpen(false);
                }}
                variant="danger"
                size="medium"
                block
              >
                Logout
              </Button>
            </Box>
          </Box>
        </>
      )}
    </>
  );
}
