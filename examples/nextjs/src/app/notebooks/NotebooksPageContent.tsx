/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useIAMStore } from '@datalayer/core/state';
import { useCache } from '@datalayer/core/hooks';
import { useActiveNotebook } from '@/contexts/ActiveNotebookContext';
import { getEnvironments } from '@datalayer/core';
import { FileIcon, PlusIcon, BookIcon } from '@primer/octicons-react';
import {
  Button,
  Heading,
  Text,
  Flash,
  TextInput,
  FormControl,
  RadioGroup,
  Radio,
  Dialog,
  Spinner,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';

interface NotebookItem {
  id: string;
  uid?: string;
  name: string;
  name_t?: string;
  path?: string;
  type: string;
  modified?: string;
  created?: string;
  description?: string;
  description_t?: string;
  creator_handle_s?: string;
}

interface Environment {
  name: string;
  title?: string;
  display_name?: string;
  description?: string;
  language?: string;
  dockerImage?: string;
}

export default function NotebooksPage() {
  const [notebooks, setNotebooks] = useState<NotebookItem[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showEnvironmentModal, setShowEnvironmentModal] = useState(false);
  const [selectedNotebook, setSelectedNotebook] = useState<NotebookItem | null>(
    null,
  );
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('');
  const [isLaunching, setIsLaunching] = useState(false);
  const router = useRouter();
  const { token } = useIAMStore();
  const { activeNotebook } = useActiveNotebook();

  // Call hooks at the top level
  const { data: userSpaces } = useCache().useUserSpaces();
  const defaultSpaceId =
    userSpaces && userSpaces.length > 0 ? userSpaces[0].id : '';
  const { data: spaceItems } = useCache().useSpaceItems(defaultSpaceId);
  const refreshUserSpaces = useCache().useRefreshUserSpaces();
  const refreshSpaceItems = useCache().useRefreshSpaceItems();
  const createNotebook = useCache().useCreateNotebook();

  useEffect(() => {
    if (token) {
      fetchNotebooks();
      fetchEnvironments();
    } else {
      router.push('/welcome');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, router]);

  const fetchNotebooks = async () => {
    try {
      setLoading(true);
      setError(null);

      await refreshUserSpaces.mutateAsync();
      console.log('User spaces:', userSpaces);

      if (userSpaces && userSpaces.length > 0) {
        const defaultSpace = userSpaces[0];
        console.log('Using default space:', defaultSpace);

        await refreshSpaceItems.mutateAsync(defaultSpace.id);
        console.log('All space items:', spaceItems);

        const notebookItems =
          spaceItems?.filter(
            (item: any) =>
              item.type === 'notebook' || item.type_s === 'notebook',
          ) || [];
        console.log('Filtered notebook items:', notebookItems);

        // Log detailed info for each notebook
        notebookItems.forEach((notebook: any, index: number) => {
          const notebookAny = notebook as any;
          console.log(`Notebook ${index + 1}:`, {
            id: notebook.id,
            uid: notebookAny.uid,
            name: notebook.name,
            name_t: notebookAny.name_t,
            description: notebook.description,
            description_t: notebookAny.description_t,
            type: notebook.type,
            type_s: notebookAny.type_s,
            path: notebookAny.path,
            created: notebookAny.created,
            modified: notebookAny.modified,
            creator_handle_s: notebookAny.creator_handle_s,
            fullObject: notebook,
          });
        });
        setNotebooks(notebookItems);
      }
    } catch (err) {
      setError('Failed to load notebooks');
    } finally {
      setLoading(false);
    }
  };

  const fetchEnvironments = async () => {
    try {
      if (!token) return;
      const data = await getEnvironments();
      setEnvironments(data);
    } catch (err) {
      console.error('Failed to fetch environments:', err);
    }
  };

  const handleOpenNotebook = (notebook: NotebookItem) => {
    if (activeNotebook) {
      const notebookId = notebook.uid || notebook.id;
      if (activeNotebook.id === notebookId) {
        router.push(activeNotebook.viewerUrl);
        return;
      }
      alert(
        'Please close the current notebook before opening a new one. You can close it from the Viewer page.',
      );
      return;
    }

    setSelectedNotebook(notebook);
    setShowEnvironmentModal(true);
    if (environments.length > 0) {
      const defaultEnv =
        environments.find(env => env.name === 'ai-agents-env') ||
        environments[0];
      setSelectedEnvironment(defaultEnv.name);
    }
  };

  const launchNotebook = () => {
    if (selectedNotebook && selectedEnvironment) {
      setIsLaunching(true);
      const notebookId = selectedNotebook.uid || selectedNotebook.id;
      router.push(
        `/viewer?notebook=${encodeURIComponent(notebookId)}&environment=${encodeURIComponent(selectedEnvironment)}`,
      );
    }
  };

  const handleCreateNotebook = async () => {
    if (!newNotebookName.trim()) return;

    try {
      setIsCreating(true);

      console.log('User spaces:', userSpaces);

      if (!userSpaces || userSpaces.length === 0) {
        throw new Error('No spaces found');
      }

      const defaultSpace = userSpaces[0];
      console.log('Default space:', defaultSpace);
      console.log('Creating notebook with params:', {
        spaceId: defaultSpace.id,
        name: newNotebookName.trim(),
        notebookType: 'notebook',
      });

      const result = await createNotebook.mutateAsync({
        spaceId: defaultSpace.id,
        name: newNotebookName.trim(),
        notebookType: 'notebook',
      });

      console.log('Create notebook result:', result);

      await fetchNotebooks();
      setShowCreateModal(false);
      setNewNotebookName('');
    } catch (err) {
      console.error('Error creating notebook:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to create notebook',
      );
    } finally {
      setIsCreating(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Box sx={{ minHeight: '100vh', bg: 'canvas.default', py: 8 }}>
      <Box sx={{ maxWidth: '1280px', mx: 'auto', px: [3, 4] }}>
        <Box sx={{ mb: 6 }}>
          <Heading as="h1" sx={{ fontSize: 6, mb: 2 }}>
            Notebooks
          </Heading>
          <Text as="p" sx={{ fontSize: 2, color: 'fg.muted' }}>
            Browse and select notebooks from your Datalayer workspace
          </Text>
        </Box>

        {loading && (
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
            <Text sx={{ color: 'fg.muted' }}>Loading notebooks...</Text>
          </Box>
        )}

        {error && (
          <Flash variant="danger" sx={{ mb: 4 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text>{error}</Text>
              <Button onClick={fetchNotebooks} variant="danger">
                Try again
              </Button>
            </Box>
          </Flash>
        )}

        {!loading && !error && notebooks.length === 0 && (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              py: 8,
              gap: 4,
            }}
          >
            <Box
              sx={{
                textAlign: 'center',
                py: 6,
                px: 8,
                border: '1px dashed',
                borderColor: 'border.default',
                borderRadius: 2,
                bg: 'canvas.subtle',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <FileIcon size={48} />
              <Heading as="h3" sx={{ fontSize: 3, mt: 3, mb: 2 }}>
                No notebooks found
              </Heading>
              <Text sx={{ color: 'fg.muted', mb: 6 }}>
                Create notebooks in your Datalayer workspace to see them here
              </Text>
              <Button
                onClick={() => setShowCreateModal(true)}
                variant="primary"
                size="large"
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PlusIcon size={16} />
                  Create New Notebook
                </Box>
              </Button>
            </Box>
          </Box>
        )}

        {!loading && !error && notebooks.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: ['1fr', 'repeat(2, 1fr)', 'repeat(3, 1fr)'],
              gap: 4,
            }}
          >
            {/* Create New Notebook Card */}
            <Box
              as="button"
              onClick={() => setShowCreateModal(true)}
              sx={{
                cursor: 'pointer',
                border: '2px dashed',
                borderColor: 'border.default',
                bg: 'canvas.subtle',
                p: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '200px',
                borderRadius: 2,
                '&:hover': {
                  borderColor: 'accent.emphasis',
                  bg: 'canvas.default',
                },
              }}
            >
              <PlusIcon size={32} />
              <Heading as="h3" sx={{ fontSize: 2, mt: 3, mb: 1 }}>
                Create New Notebook
              </Heading>
              <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                Click to create
              </Text>
            </Box>

            {/* Existing Notebooks */}
            {notebooks.map(notebook => (
              <Box
                key={notebook.uid || notebook.id}
                sx={{
                  p: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '200px',
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  bg: 'canvas.default',
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <BookIcon size={20} />
                    <Heading as="h3" sx={{ fontSize: 2, ml: 2 }}>
                      {notebook.name_t || notebook.name}
                    </Heading>
                  </Box>
                  {(notebook.description_t || notebook.description) && (
                    <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', mb: 2 }}>
                      {notebook.description_t || notebook.description}
                    </Text>
                  )}
                  {(notebook.path || notebook.modified) && (
                    <Box sx={{ mt: 'auto' }}>
                      {notebook.path && (
                        <Text sx={{ fontSize: 0, color: 'fg.subtle' }}>
                          Path: {notebook.path}
                        </Text>
                      )}
                      {notebook.modified && (
                        <Text sx={{ fontSize: 0, color: 'fg.subtle' }}>
                          Modified: {formatDate(notebook.modified)}
                        </Text>
                      )}
                    </Box>
                  )}
                </Box>
                <Button
                  onClick={() => handleOpenNotebook(notebook)}
                  variant="primary"
                  sx={{ mt: 3 }}
                  block
                >
                  Open with Runtime
                </Button>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Environment Selection Modal */}
      {showEnvironmentModal && selectedNotebook && (
        <Dialog
          onClose={() => {
            setShowEnvironmentModal(false);
            setSelectedNotebook(null);
            setSelectedEnvironment('');
          }}
        >
          <Dialog.Header>Select Environment</Dialog.Header>
          <Box sx={{ p: 3 }}>
            <Text as="p" sx={{ mb: 3 }}>
              Choose an environment to run &quot;
              {selectedNotebook.name_t || selectedNotebook.name}&quot;
            </Text>
            <RadioGroup name="environment">
              <RadioGroup.Label>Available Environments</RadioGroup.Label>
              {environments.map(env => (
                <Box key={env.name} sx={{ display: 'flex', gap: 2, mb: 3 }}>
                  <Radio
                    value={env.name}
                    checked={selectedEnvironment === env.name}
                    onChange={e =>
                      setSelectedEnvironment(
                        (e.target as HTMLInputElement).value,
                      )
                    }
                  />
                  <Box sx={{ flex: 1 }}>
                    <Text sx={{ fontWeight: 'semibold', display: 'block' }}>
                      {env.title || env.display_name || env.name}
                    </Text>
                    {env.description && (
                      <Text
                        sx={{
                          fontSize: 0,
                          color: 'fg.muted',
                          display: 'block',
                        }}
                      >
                        {env.description
                          .replace(/<[^>]*>/g, '')
                          .substring(0, 100)}
                        ...
                      </Text>
                    )}
                    {env.language && (
                      <Text
                        sx={{
                          fontSize: 0,
                          color: 'fg.subtle',
                          display: 'block',
                        }}
                      >
                        Language: {env.language}
                      </Text>
                    )}
                  </Box>
                </Box>
              ))}
            </RadioGroup>
          </Box>
          <Box
            sx={{
              p: 3,
              pt: 0,
              display: 'flex',
              gap: 2,
              justifyContent: 'flex-end',
            }}
          >
            <Button
              variant="primary"
              onClick={launchNotebook}
              disabled={!selectedEnvironment || isLaunching}
            >
              {isLaunching ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Spinner size="small" />
                  <Text>Launching...</Text>
                </Box>
              ) : (
                'Launch Notebook'
              )}
            </Button>
            <Button
              onClick={() => {
                setShowEnvironmentModal(false);
                setSelectedNotebook(null);
                setSelectedEnvironment('');
                setIsLaunching(false);
              }}
            >
              Cancel
            </Button>
          </Box>
        </Dialog>
      )}

      {/* Create Notebook Modal */}
      {showCreateModal && (
        <Dialog
          onClose={() => {
            setShowCreateModal(false);
            setNewNotebookName('');
            setError(null);
          }}
        >
          <Dialog.Header>Create New Notebook</Dialog.Header>
          <Box sx={{ p: 3 }}>
            <FormControl>
              <FormControl.Label>Notebook Name</FormControl.Label>
              <TextInput
                value={newNotebookName}
                onChange={e => setNewNotebookName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateNotebook()}
                placeholder="my-notebook.ipynb"
                autoFocus
                block
              />
            </FormControl>
          </Box>
          <Box
            sx={{
              p: 3,
              pt: 0,
              display: 'flex',
              gap: 2,
              justifyContent: 'flex-end',
            }}
          >
            <Button
              variant="primary"
              onClick={handleCreateNotebook}
              disabled={isCreating || !newNotebookName.trim()}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
            <Button
              onClick={() => {
                setShowCreateModal(false);
                setNewNotebookName('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </Box>
        </Dialog>
      )}
    </Box>
  );
}
