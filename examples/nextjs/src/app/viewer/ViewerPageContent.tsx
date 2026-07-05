/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useIAMStore } from '@datalayer/core/state';
import { useActiveNotebook } from '@/contexts/ActiveNotebookContext';
import { deleteRuntime } from '@datalayer/core';
import { useCache } from '@datalayer/core/hooks';
import { getStoredRuntime, removeStoredRuntime } from '@/utils/runtimeStorage';
import { Box } from '@datalayer/primer-addons';
import { Spinner, Text, Flash, Button } from '@primer/react';

// Dynamically import NotebookViewer to avoid SSR issues
const NotebookViewer = dynamic(() => import('@/components/NotebookViewer'), {
  ssr: false,
  loading: () => (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        py: 12,
      }}
    >
      <Box sx={{ textAlign: 'center' }}>
        <Spinner size="large" />
        <Text as="p" sx={{ mt: 3, color: 'fg.muted' }}>
          Loading notebook viewer...
        </Text>
      </Box>
    </Box>
  ),
});

function ViewerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { token } = useIAMStore();
  const { activeNotebook, setActiveNotebook, clearActiveNotebook } =
    useActiveNotebook();

  // Call hooks at the top level
  const { data: userSpaces } = useCache().useUserSpaces();
  const defaultSpaceId =
    userSpaces && userSpaces.length > 0 ? userSpaces[0].id : '';
  const { data: spaceItems } = useCache().useSpaceItems(defaultSpaceId);
  const refreshUserSpaces = useCache().useRefreshUserSpaces();
  const refreshSpaceItems = useCache().useRefreshSpaceItems();

  const [notebookData, setNotebookData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);
  const runtimeIdRef = useRef<string | null>(null);
  const podNameRef = useRef<string | null>(null);

  const notebookId = searchParams.get('notebook');
  const environment = searchParams.get('environment');

  const getNotebook = async (notebookId: string, token: string) => {
    // First, get user spaces
    await refreshUserSpaces.mutateAsync();

    if (!userSpaces || userSpaces.length === 0) {
      throw new Error('No spaces found for user');
    }

    // Find the default space or "library" space, or use the first one
    let defaultSpace = userSpaces.find(
      (space: any) =>
        space.handle === 'library' || space.name?.toLowerCase() === 'library',
    );

    if (!defaultSpace) {
      defaultSpace = userSpaces[0]; // Fallback to first space
    }

    // Get items from the space
    await refreshSpaceItems.mutateAsync(defaultSpace.id);

    // Find the specific notebook
    const notebook = spaceItems?.find(
      (item: any) =>
        (item.id === notebookId || item.uid === notebookId) &&
        (item.type === 'notebook' || item.type_s === 'notebook'),
    );

    if (!notebook) {
      throw new Error(`Notebook ${notebookId} not found`);
    }

    // If the notebook has a CDN URL, fetch its content
    if ((notebook as any).cdn_url_s) {
      try {
        const contentResponse = await fetch((notebook as any).cdn_url_s);
        if (contentResponse.ok) {
          const content = await contentResponse.json();
          return {
            ...notebook,
            content,
          };
        }
      } catch (error) {
        console.error('Failed to fetch notebook content:', error);
      }
    }

    return notebook;
  };

  const terminateRuntime = (podName: string) => {
    // Use deleteRuntime from core, same functionality
    return deleteRuntime({ id: podName });
  };

  useEffect(() => {
    if (!token) {
      // Redirect to welcome page if not authenticated
      router.push('/welcome');
      return;
    }

    if (!notebookId || !environment) {
      setError('Missing notebook ID or environment');
      setLoading(false);
      return;
    }

    fetchNotebookData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebookId, environment, token, router]);

  const fetchNotebookData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!token) {
        throw new Error('No authentication token available');
      }

      // Fetch notebook details using core API
      const data = await getNotebook(notebookId!, token);
      setNotebookData(data);

      // Set active notebook in global state
      if (data && notebookId && environment) {
        const viewerUrl = `/viewer?notebook=${encodeURIComponent(notebookId)}&environment=${encodeURIComponent(environment)}`;
        setActiveNotebook({
          id: notebookId,
          name: (data as any).name_t || data.name || 'Untitled Notebook',
          environment: environment,
          viewerUrl: viewerUrl,
          runtimeId: runtimeIdRef.current || undefined,
        });
      }
    } catch (err) {
      console.error('Error fetching notebook:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notebook');
    } finally {
      setLoading(false);
    }
  };

  const handleTerminateRuntime = async () => {
    if (
      !confirm(
        'Are you sure you want to terminate the runtime? This will stop all running computations.',
      )
    ) {
      return;
    }

    setIsTerminating(true);

    try {
      // Get pod name from multiple sources
      let podName = activeNotebook?.podName || podNameRef.current;

      // If no pod name from state, try to get it from localStorage
      if (!podName && notebookId && environment) {
        const runtimeKey = `${notebookId}_${environment}`;
        const storedRuntime = getStoredRuntime(runtimeKey);
        if (storedRuntime) {
          podName = storedRuntime.podName;
          console.log('Retrieved pod name from localStorage:', podName);
        }
      }

      console.log('Attempting to terminate runtime with pod name:', podName);

      // If we have a pod name, terminate it
      if (podName) {
        try {
          await terminateRuntime(podName);
          console.log('Runtime terminated successfully');
        } catch (error: any) {
          // If error is not 404 (already terminated), show error
          if (!error?.message?.includes('404')) {
            console.error('Failed to terminate runtime:', error);
            alert('Failed to terminate runtime. Please try again.');
            setIsTerminating(false);
            return;
          }
        }
      } else {
        console.log(
          'No pod name found to terminate - runtime may already be terminated',
        );
      }

      // Clear the runtime from localStorage
      if (notebookId && environment) {
        const runtimeKey = `${notebookId}_${environment}`;
        removeStoredRuntime(runtimeKey);
        console.log('Cleared stored runtime:', runtimeKey);
      }

      // Clear the active notebook from global state
      clearActiveNotebook();

      // Navigate back to notebooks
      router.push('/notebooks');
    } catch (err) {
      console.error('Error terminating runtime:', err);
      alert('Error terminating runtime. Please try again.');
      setIsTerminating(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't clear active notebook on regular navigation
      // Only clear when component is truly unmounting
    };
  }, []);

  if (!notebookId || !environment) {
    return (
      <Box sx={{ minHeight: '100vh', bg: 'canvas.default', py: 8 }}>
        <Box sx={{ maxWidth: '1280px', mx: 'auto', px: [3, 4] }}>
          <Flash variant="warning">
            Invalid notebook URL. Please select a notebook from the{' '}
            <Link
              href="/notebooks"
              style={{ color: 'inherit', textDecoration: 'underline' }}
            >
              notebooks page
            </Link>
            .
          </Flash>
        </Box>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', bg: 'canvas.default', py: 8 }}>
        <Box sx={{ maxWidth: '1280px', mx: 'auto', px: [3, 4] }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              py: 12,
            }}
          >
            <Box sx={{ textAlign: 'center' }}>
              <Spinner size="large" />
              <Text as="p" sx={{ mt: 3, color: 'fg.muted' }}>
                Loading notebook...
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', bg: 'canvas.default', py: 8 }}>
        <Box sx={{ maxWidth: '1280px', mx: 'auto', px: [3, 4] }}>
          <Flash variant="danger" sx={{ mb: 3 }}>
            Error: {error}
          </Flash>
          <Button as={Link} href="/notebooks" variant="default">
            Back to Notebooks
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bg: 'canvas.default' }}>
      <Box sx={{ maxWidth: '1280px', mx: 'auto', px: [3, 4], py: 4 }}>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: 4,
            pb: 3,
            borderBottom: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Box>
            <Text as="h1" sx={{ fontSize: 5, fontWeight: 'bold', mb: 2 }}>
              {notebookData?.name_t ||
                notebookData?.name ||
                'Untitled Notebook'}
            </Text>
            {notebookData?.description_t && (
              <Text as="p" sx={{ fontSize: 2, color: 'fg.muted', mb: 2 }}>
                {notebookData.description_t}
              </Text>
            )}
            <Box
              sx={{ display: 'flex', gap: 2, fontSize: 1, color: 'fg.muted' }}
            >
              <Text>Environment: {environment}</Text>
              <Text>•</Text>
              <Text>ID: {notebookId}</Text>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              onClick={handleTerminateRuntime}
              disabled={isTerminating}
              variant="danger"
              title="Terminate the runtime and close the notebook"
            >
              {isTerminating ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Spinner size="small" />
                  <Text>Terminating...</Text>
                </Box>
              ) : (
                'Close & Terminate Runtime'
              )}
            </Button>
            <Button as={Link} href="/notebooks" variant="default">
              Back to Notebooks
            </Button>
          </Box>
        </Box>

        {/* Notebook Viewer */}
        <Box>
          <NotebookViewer
            notebookPath={notebookId}
            runtime={environment}
            notebookContent={notebookData?.content}
            onRuntimeCreated={(runtimeId, podName) => {
              runtimeIdRef.current = runtimeId;
              podNameRef.current = podName;
              // Update active notebook with runtime ID and pod name
              if (notebookId && environment) {
                const viewerUrl = `/viewer?notebook=${encodeURIComponent(notebookId)}&environment=${encodeURIComponent(environment)}`;
                setActiveNotebook({
                  id: notebookId,
                  name:
                    notebookData?.name_t ||
                    notebookData?.name ||
                    'Untitled Notebook',
                  environment: environment,
                  viewerUrl: viewerUrl,
                  runtimeId: runtimeId,
                  podName: podName,
                });
              }
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}

export default function ViewerPage() {
  return (
    <Suspense
      fallback={
        <Box
          sx={{
            minHeight: '100vh',
            bg: 'canvas.default',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Spinner size="large" />
        </Box>
      }
    >
      <ViewerContent />
    </Suspense>
  );
}
