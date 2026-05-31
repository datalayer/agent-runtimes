/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useState } from 'react';
import {
  Box,
  DatalayerThemeProvider,
  setupPrimerPortals,
} from '@datalayer/primer-addons';
import {
  ActionList,
  ActionMenu,
  Button,
  FormControl,
  Heading,
  Text,
  Textarea,
  TextInput,
} from '@primer/react';
import { Chat } from './chat';

import '../style/primer-primitives.css';

setupPrimerPortals();

const BASE_URL = window.location.origin;

type AgentNodeMode = 'private' | 'shared' | 'sleep';

type AgentNodeConfiguration = {
  mode: AgentNodeMode;
  billable_account_uid?: string;
  billable_account_type?: string;
  billable_account_handle?: string;
  sharing: Record<string, any>;
};

const DEFAULT_CONFIGURATION: AgentNodeConfiguration = {
  mode: 'sleep',
  sharing: {},
};

export function AgentNode() {
  const [step, setStep] = useState<'auth' | 'config' | 'chat'>('auth');
  const [token, setToken] = useState('');
  const [configuration, setConfiguration] = useState<AgentNodeConfiguration>(
    DEFAULT_CONFIGURATION,
  );
  const [sharingRaw, setSharingRaw] = useState('{}');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(
          `${BASE_URL}/api/v1/agent-node/configuration`,
        );
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        const loadedConfiguration = {
          ...DEFAULT_CONFIGURATION,
          ...(payload?.configuration || {}),
        };
        setConfiguration({
          ...loadedConfiguration,
        });
        setSharingRaw(
          JSON.stringify(loadedConfiguration.sharing || {}, null, 2),
        );
      } catch {
        // ignore
      }
    };
    load();
  }, []);

  const saveConfiguration = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const parsedSharing = sharingRaw.trim() ? JSON.parse(sharingRaw) : {};
      const nextConfiguration = {
        ...configuration,
        sharing: parsedSharing,
      };
      const response = await fetch(
        `${BASE_URL}/api/v1/agent-node/configuration`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nextConfiguration),
        },
      );
      if (!response.ok) {
        throw new Error(`Failed to save configuration (${response.status})`);
      }
      setConfiguration(nextConfiguration);
      setStep('chat');
    } catch (reason: any) {
      setError(reason?.message || 'Unable to save configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DatalayerThemeProvider>
      <Box
        sx={{ p: 4, height: '100vh', overflow: 'auto', bg: 'canvas.default' }}
      >
        <Box sx={{ maxWidth: 980, mx: 'auto' }}>
          <Heading sx={{ fontSize: 5, mb: 2 }}>Agent Node</Heading>
          <Text sx={{ color: 'fg.muted', mb: 4, display: 'block' }}>
            Authenticate, configure Private/Shared/Sleep mode, then chat from
            this node.
          </Text>

          <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
            <Button
              variant={step === 'auth' ? 'primary' : 'default'}
              onClick={() => setStep('auth')}
            >
              Authentication
            </Button>
            <Button
              variant={step === 'config' ? 'primary' : 'default'}
              onClick={() => setStep('config')}
            >
              Configuration
            </Button>
            <Button
              variant={step === 'chat' ? 'primary' : 'default'}
              onClick={() => setStep('chat')}
            >
              Chat
            </Button>
          </Box>

          {step === 'auth' && (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                p: 3,
              }}
            >
              <FormControl>
                <FormControl.Label>Datalayer API token</FormControl.Label>
                <TextInput
                  placeholder="Paste token for runtime auth"
                  value={token}
                  onChange={e => setToken(e.target.value)}
                />
              </FormControl>
              <Text
                sx={{ color: 'fg.muted', fontSize: 0, mt: 2, display: 'block' }}
              >
                The server uses DATALAYER_API_KEY env var for registration. This
                field is informational and can be copied into your runtime env.
              </Text>
              <Box sx={{ mt: 3 }}>
                <Button onClick={() => setStep('config')}>Continue</Button>
              </Box>
            </Box>
          )}

          {step === 'config' && (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              <FormControl>
                <FormControl.Label>Mode</FormControl.Label>
                <ActionMenu>
                  <ActionMenu.Button>{configuration.mode}</ActionMenu.Button>
                  <ActionMenu.Overlay>
                    <ActionList>
                      <ActionList.Item
                        onSelect={() =>
                          setConfiguration(prev => ({
                            ...prev,
                            mode: 'private',
                          }))
                        }
                      >
                        private
                      </ActionList.Item>
                      <ActionList.Item
                        onSelect={() =>
                          setConfiguration(prev => ({
                            ...prev,
                            mode: 'shared',
                          }))
                        }
                      >
                        shared
                      </ActionList.Item>
                      <ActionList.Item
                        onSelect={() =>
                          setConfiguration(prev => ({ ...prev, mode: 'sleep' }))
                        }
                      >
                        sleep
                      </ActionList.Item>
                    </ActionList>
                  </ActionMenu.Overlay>
                </ActionMenu>
              </FormControl>

              <Box
                sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}
              >
                <FormControl>
                  <FormControl.Label>Billable account UID</FormControl.Label>
                  <TextInput
                    value={configuration.billable_account_uid || ''}
                    onChange={e =>
                      setConfiguration(prev => ({
                        ...prev,
                        billable_account_uid: e.target.value,
                      }))
                    }
                  />
                </FormControl>
                <FormControl>
                  <FormControl.Label>Billable account type</FormControl.Label>
                  <TextInput
                    value={configuration.billable_account_type || ''}
                    onChange={e =>
                      setConfiguration(prev => ({
                        ...prev,
                        billable_account_type: e.target.value,
                      }))
                    }
                  />
                </FormControl>
              </Box>

              <FormControl>
                <FormControl.Label>Sharing JSON</FormControl.Label>
                <Textarea
                  rows={8}
                  value={sharingRaw}
                  onChange={e => {
                    setSharingRaw(e.target.value);
                    setError(null);
                  }}
                />
              </FormControl>

              {error && <Text sx={{ color: 'danger.fg' }}>{error}</Text>}

              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button onClick={() => setStep('auth')}>Back</Button>
                <Button
                  variant="primary"
                  onClick={saveConfiguration}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save and continue'}
                </Button>
              </Box>
            </Box>
          )}

          {step === 'chat' && (
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <Chat
                protocol="ag-ui"
                baseUrl={BASE_URL}
                agentId="default"
                title="Agent Node Chat"
                placeholder="Send a message..."
                description="Node-local chat"
                showHeader={true}
                height={'70vh'}
                showModelSelector={true}
                showToolsMenu={true}
                showSkillsMenu={true}
                showTokenUsage={true}
                showInformation={true}
                autoFocus
                runtimeId="default"
                historyEndpoint={`${BASE_URL}/api/v1/history`}
              />
            </Box>
          )}
        </Box>
      </Box>
    </DatalayerThemeProvider>
  );
}

export default AgentNode;
