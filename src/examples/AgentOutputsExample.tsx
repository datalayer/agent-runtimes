/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentOutputsExample
 *
 * Demonstrates rich output rendering for agent responses. The agent (spec
 * `demo-outputs`) is prompted to return exactly one of four output types per
 * response:
 *   - TABLE  → GitHub-flavored Markdown table
 *   - JSON   → ```json fenced block
 *   - CHART  → ```json fenced block whose first line is `// chart` (ECharts)
 *   - FILE   → fenced block whose info string is a file extension and
 *              whose first line is `# filename: <name.ext>`
 *
 * We subscribe to the chat store, detect the output type of the latest
 * assistant message, auto-switch the sidebar tab, and render the payload
 * inline in the sidebar.
 */

/// <reference types="vite/client" />

import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text, Button, Spinner, Heading, Label } from '@primer/react';
import {
  TableIcon,
  FileIcon,
  CodeIcon,
  GraphIcon,
  DownloadIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { AuthRequiredView, ErrorView } from './components';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { Chat } from '../chat';
import { useChatStore } from '../stores/chatStore';
import type { ChatMessage } from '../types';

const queryClient = new QueryClient();

// ─── Constants ─────────────────────────────────────────────────────────────

const AGENT_NAME = 'outputs-demo-agent';
const AGENT_SPEC_ID = 'demo-outputs';
const DEFAULT_LOCAL_BASE_URL =
  import.meta.env.VITE_BASE_URL || 'http://localhost:8765';

// ─── Types ─────────────────────────────────────────────────────────────────

type OutputTab = 'table' | 'json' | 'chart' | 'files';

interface DetectedOutput {
  tab: OutputTab;
  payload: string;
  filename?: string;
  extension?: string;
  messageId: string;
}

// ─── Output detection ──────────────────────────────────────────────────────

const FENCE_RE = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
const MD_TABLE_RE =
  /(^|\n)\s*\|[^\n]+\|\s*\n\s*\|[\s:|-]+\|\s*\n(\s*\|[^\n]+\|\s*\n?)+/;

const EXT_LIKE_INFOS = new Set([
  'csv',
  'tsv',
  'txt',
  'md',
  'markdown',
  'yaml',
  'yml',
  'xml',
  'html',
  'log',
  'ini',
  'toml',
]);

const messageText = (m: ChatMessage): string => {
  if (typeof m.content === 'string') return m.content;
  return m.content
    .filter(p => p.type === 'text')
    .map(p => (p as { type: 'text'; text: string }).text)
    .join('\n');
};

const detectOutput = (m: ChatMessage): DetectedOutput | null => {
  const text = messageText(m);
  if (!text) return null;

  // 1) Fenced code blocks (first one wins).
  FENCE_RE.lastIndex = 0;
  const match = FENCE_RE.exec(text);
  if (match) {
    const info = (match[1] || '').toLowerCase();
    const body = match[2] ?? '';
    const firstLine = body.split('\n', 1)[0]?.trim() ?? '';

    // Chart: ```json with `// chart` marker on first line.
    if (info === 'json' && /^\/\/\s*chart\b/i.test(firstLine)) {
      return {
        tab: 'chart',
        payload: body.replace(/^\/\/\s*chart.*\n?/i, ''),
        messageId: m.id,
      };
    }

    // File: info string is a known extension OR first line declares a filename.
    const filenameMatch = firstLine.match(/^#\s*filename:\s*([\w.-]+)/i);
    if (filenameMatch || EXT_LIKE_INFOS.has(info)) {
      const filename =
        filenameMatch?.[1] ?? (info ? `output.${info}` : 'output.txt');
      return {
        tab: 'files',
        payload: filenameMatch
          ? body.replace(/^#\s*filename:.*\n?/i, '')
          : body,
        filename,
        extension: filename.split('.').pop(),
        messageId: m.id,
      };
    }

    // JSON (explicit language tag).
    if (info === 'json' || info === 'json5') {
      return { tab: 'json', payload: body, messageId: m.id };
    }

    // JSON fallback: bare ``` fence whose body parses as JSON.
    if (!info || info === 'text' || info === 'plain') {
      const trimmed = body.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          JSON.parse(trimmed);
          return { tab: 'json', payload: trimmed, messageId: m.id };
        } catch {
          /* not JSON — ignore */
        }
      }
    }
  }

  // 1b) No fences — try to detect a bare JSON object/array in the message.
  {
    const stripped = text.trim();
    if (stripped.startsWith('{') || stripped.startsWith('[')) {
      try {
        JSON.parse(stripped);
        return { tab: 'json', payload: stripped, messageId: m.id };
      } catch {
        /* not JSON — ignore */
      }
    }
    // Or: find the first {...} / [...] block and try parsing it.
    const blockMatch = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (blockMatch) {
      try {
        JSON.parse(blockMatch[1]);
        return { tab: 'json', payload: blockMatch[1], messageId: m.id };
      } catch {
        /* not JSON — ignore */
      }
    }
  }

  // 2) Markdown table (no fences).
  if (MD_TABLE_RE.test(text)) {
    const tableMatch = text.match(MD_TABLE_RE);
    return {
      tab: 'table',
      payload: tableMatch ? tableMatch[0].trim() : text,
      messageId: m.id,
    };
  }

  return null;
};

// ─── Table renderer (parses the Markdown pipe syntax) ──────────────────────

const MarkdownTable: React.FC<{ source: string }> = ({ source }) => {
  const { headers, rows } = useMemo(() => {
    const lines = source
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('|'));
    if (lines.length < 2) return { headers: [], rows: [] as string[][] };
    const split = (line: string) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(c => c.trim());
    const headers = split(lines[0]);
    const rows = lines.slice(2).map(split);
    return { headers, rows };
  }, [source]);

  if (headers.length === 0) {
    return (
      <Box
        as="pre"
        sx={{
          fontFamily: 'mono',
          fontSize: 0,
          whiteSpace: 'pre-wrap',
          m: 0,
        }}
      >
        {source}
      </Box>
    );
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        as="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 0,
          'th, td': {
            border: '1px solid',
            borderColor: 'border.muted',
            px: 2,
            py: 1,
            textAlign: 'left',
            verticalAlign: 'top',
          },
          th: { bg: 'canvas.subtle', fontWeight: 'bold' },
        }}
      >
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
};

// ─── Chart renderer (lazy ECharts) ─────────────────────────────────────────

const ChartView: React.FC<{ source: string }> = ({ source }) => {
  const [ReactECharts, setReactECharts] = useState<React.ComponentType<{
    option: unknown;
    style?: React.CSSProperties;
  }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('echarts-for-react')
      .then(m => {
        if (!cancelled) {
          setReactECharts(
            () =>
              m.default as unknown as React.ComponentType<{
                option: unknown;
                style?: React.CSSProperties;
              }>,
          );
        }
      })
      .catch(() => {
        /* echarts-for-react not installed — fall back to raw JSON */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const option = useMemo(() => {
    try {
      return JSON.parse(source);
    } catch {
      return null;
    }
  }, [source]);

  if (!option) {
    return (
      <Text sx={{ color: 'danger.fg', fontSize: 0 }}>
        Could not parse chart spec as JSON.
      </Text>
    );
  }

  if (!ReactECharts) {
    return (
      <Box
        as="pre"
        sx={{
          fontFamily: 'mono',
          fontSize: 0,
          whiteSpace: 'pre-wrap',
          bg: 'canvas.subtle',
          p: 2,
          borderRadius: 2,
          m: 0,
        }}
      >
        {source}
      </Box>
    );
  }

  return (
    <ReactECharts option={option} style={{ height: 280, width: '100%' }} />
  );
};

// ─── Inner component (rendered after auth) ─────────────────────────────────

const AgentOutputsInner: React.FC<{ onLogout: () => void }> = ({
  onLogout,
}) => {
  const { token } = useSimpleAuthStore();
  const agentName = useRef(uniqueAgentId(AGENT_NAME)).current;

  const [runtimeStatus, setRuntimeStatus] = useState<
    'launching' | 'ready' | 'error'
  >('launching');
  const [isReady, setIsReady] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string>(agentName);
  const [isReconnectedAgent, setIsReconnectedAgent] = useState(false);

  const agentBaseUrl = DEFAULT_LOCAL_BASE_URL;
  const chatAuthToken: string | undefined = token === null ? undefined : token;

  const authFetch = useCallback(
    (url: string, opts: RequestInit = {}) =>
      fetch(url, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(opts.headers ?? {}),
        },
      }),
    [token],
  );

  useEffect(() => {
    let isCancelled = false;

    const createAgent = async () => {
      setRuntimeStatus('launching');
      setIsReady(false);
      setHookError(null);
      setIsReconnectedAgent(false);

      try {
        const response = await authFetch(`${agentBaseUrl}/api/v1/agents`, {
          method: 'POST',
          body: JSON.stringify({
            name: agentName,
            description:
              'Agent with rich output rendering (table/JSON/chart/file)',
            agent_library: 'pydantic-ai',
            transport: 'vercel-ai',
            agent_spec_id: AGENT_SPEC_ID,
            enable_skills: true,
            tools: [],
          }),
        });

        let resolvedAgentId = agentName;
        let isAlreadyRunning = false;

        if (response.ok) {
          const data = await response.json();
          resolvedAgentId = data?.id || agentName;
        } else {
          const contentType = response.headers.get('content-type') || '';
          let detail = '';

          if (contentType.includes('application/json')) {
            const data = await response.json().catch(() => null);
            detail =
              (typeof data?.detail === 'string' && data.detail) ||
              (typeof data?.message === 'string' && data.message) ||
              '';
          } else {
            detail = await response.text();
          }

          if (response.status === 409 || /already exists/i.test(detail || '')) {
            isAlreadyRunning = true;
          } else {
            throw new Error(
              detail || `Failed to create agent: ${response.status}`,
            );
          }
        }

        if (!isCancelled) {
          setAgentId(resolvedAgentId);
          setIsReconnectedAgent(isAlreadyRunning);
          setIsReady(true);
          setRuntimeStatus('ready');
        }
      } catch (error) {
        if (!isCancelled) {
          setHookError(
            error instanceof Error ? error.message : 'Agent failed to start',
          );
          setRuntimeStatus('error');
        }
      }
    };

    void createAgent();

    return () => {
      isCancelled = true;
    };
  }, [agentBaseUrl, agentName, authFetch]);

  const [activeTab, setActiveTab] = useState<OutputTab>('table');
  const [detected, setDetected] = useState<DetectedOutput[]>([]);
  const lastProcessedIdRef = useRef<string | null>(null);

  // Subscribe to chat store messages and detect outputs in assistant replies.
  useEffect(() => {
    const process = (messages: ChatMessage[]) => {
      const assistants = messages.filter(m => m.role === 'assistant');
      if (assistants.length === 0) return;
      const last = assistants[assistants.length - 1];
      if (last.id === lastProcessedIdRef.current) return;
      const out = detectOutput(last);
      if (!out) return;
      lastProcessedIdRef.current = last.id;
      setDetected(prev => {
        if (prev.some(d => d.messageId === out.messageId)) return prev;
        return [out, ...prev].slice(0, 20);
      });
      setActiveTab(out.tab);
    };

    process(useChatStore.getState().messages);
    const unsub = useChatStore.subscribe(state => state.messages, process);
    return unsub;
  }, []);

  // ── Loading / Error ───────────────────────────────────────────────────

  if (!isReady && runtimeStatus !== 'error') {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 3,
        }}
      >
        <Spinner size="large" />
        <Text sx={{ color: 'fg.muted' }}>
          {runtimeStatus === 'launching'
            ? 'Launching outputs demo agent...'
            : 'Creating outputs demo agent...'}
        </Text>
      </Box>
    );
  }

  if (runtimeStatus === 'error' || hookError) {
    return <ErrorView error={hookError} onLogout={onLogout} />;
  }

  const filtered = detected.filter(d => d.tab === activeTab);
  const countByTab = (tab: OutputTab) =>
    detected.filter(d => d.tab === tab).length;

  const download = (d: DetectedOutput) => {
    const blob = new Blob([d.payload], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = d.filename ?? `output.${d.extension ?? 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Box
      sx={{
        height: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isReconnectedAgent && (
        <Box
          sx={{
            px: 3,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
            Agent already running - reconnected.
          </Text>
        </Box>
      )}

      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          flexShrink: 0,
        }}
      >
        <TableIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Agent Outputs — Local Runtime
        </Heading>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* Left: Chat */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Chat
            protocol="vercel-ai"
            baseUrl={agentBaseUrl}
            agentId={agentId}
            authToken={chatAuthToken}
            title="Outputs Demo Agent"
            placeholder="Ask for a Table, JSON, Chart, or File…"
            description={`${detected.length} detected output${detected.length !== 1 ? 's' : ''}`}
            showHeader={true}
            showToolsMenu={true}
            showSkillsMenu={true}
            autoFocus
            height="100%"
            runtimeId={agentId}
            historyEndpoint={`${agentBaseUrl}/api/v1/history`}
            suggestions={[
              {
                title: 'Table',
                message:
                  'Generate a Markdown table of the top 5 US cities by population, with columns City, State, Population.',
              },
              {
                title: 'JSON',
                message:
                  'Return a JSON object describing a fictitious product catalog with 3 items (id, name, price, tags).',
              },
              {
                title: 'Chart',
                message:
                  'Produce a bar chart ECharts spec (valid JSON, with `// chart` on the first line of the fenced block) showing monthly sales for Jan–Jun.',
              },
              {
                title: 'File',
                message:
                  'Create a downloadable CSV file with sample sales data for the last 7 days. Output it inside a ```csv fenced block whose first line is `# filename: sales.csv`.',
              },
            ]}
            submitOnSuggestionClick
          />
        </Box>

        {/* Right: Output panel */}
        <Box
          sx={{
            width: 420,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Output type tabs */}
          <Box
            sx={{
              display: 'flex',
              borderBottom: '1px solid',
              borderColor: 'border.default',
              flexShrink: 0,
            }}
          >
            {(
              [
                { key: 'table' as OutputTab, icon: TableIcon, label: 'Table' },
                { key: 'json' as OutputTab, icon: CodeIcon, label: 'JSON' },
                { key: 'chart' as OutputTab, icon: GraphIcon, label: 'Chart' },
                { key: 'files' as OutputTab, icon: FileIcon, label: 'Files' },
              ] as const
            ).map(t => {
              const n = countByTab(t.key);
              return (
                <Button
                  key={t.key}
                  size="small"
                  variant="invisible"
                  leadingVisual={t.icon}
                  onClick={() => setActiveTab(t.key)}
                  sx={{
                    flex: 1,
                    borderRadius: 0,
                    borderBottom:
                      activeTab === t.key
                        ? '2px solid'
                        : '2px solid transparent',
                    borderColor:
                      activeTab === t.key ? 'accent.fg' : 'transparent',
                    fontWeight: activeTab === t.key ? 'bold' : 'normal',
                  }}
                >
                  {t.label}
                  {n > 0 ? ` (${n})` : ''}
                </Button>
              );
            })}
          </Box>

          {/* Artifact list */}
          <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
            <Heading as="h4" sx={{ fontSize: 1, mb: 2 }}>
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} outputs
            </Heading>

            {filtered.length === 0 ? (
              <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
                No {activeTab} outputs yet. Use one of the suggestion buttons in
                the chat to produce one — the side panel will switch to the
                matching tab automatically.
              </Text>
            ) : (
              filtered.map((d, idx) => (
                <Box
                  key={d.messageId + ':' + idx}
                  sx={{
                    p: 2,
                    mb: 2,
                    border: '1px solid',
                    borderColor: 'border.default',
                    borderRadius: 2,
                  }}
                >
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 2,
                      gap: 2,
                    }}
                  >
                    <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
                      {d.filename ?? `${d.tab} output`}
                    </Text>
                    <Label size="small" variant="secondary">
                      {d.tab}
                    </Label>
                  </Box>

                  {d.tab === 'table' && <MarkdownTable source={d.payload} />}
                  {d.tab === 'json' && (
                    <Box
                      as="pre"
                      sx={{
                        bg: 'canvas.subtle',
                        p: 2,
                        borderRadius: 2,
                        fontFamily: 'mono',
                        fontSize: 0,
                        maxHeight: 320,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                        m: 0,
                      }}
                    >
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(d.payload), null, 2);
                        } catch {
                          return d.payload;
                        }
                      })()}
                    </Box>
                  )}
                  {d.tab === 'chart' && <ChartView source={d.payload} />}
                  {d.tab === 'files' && (
                    <>
                      <Box
                        as="pre"
                        sx={{
                          bg: 'canvas.subtle',
                          p: 2,
                          borderRadius: 2,
                          fontFamily: 'mono',
                          fontSize: 0,
                          maxHeight: 200,
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          m: 0,
                          mb: 2,
                        }}
                      >
                        {d.payload}
                      </Box>
                      <Button
                        size="small"
                        leadingVisual={DownloadIcon}
                        onClick={() => download(d)}
                      >
                        Download {d.filename ?? 'file'}
                      </Button>
                    </>
                  )}
                </Box>
              ))
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

// ─── Sync token to core IAM store ──────────────────────────────────────────

const syncTokenToIamStore = (token: string) => {
  import('@datalayer/core/lib/state').then(({ iamStore }) => {
    iamStore.setState({ token });
  });
};

// ─── Main component with auth gate ─────────────────────────────────────────

const AgentOutputsExample: React.FC = () => {
  const { token, clearAuth } = useSimpleAuthStore();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (token && !hasSynced.current) {
      hasSynced.current = true;
      syncTokenToIamStore(token);
    }
  }, [token]);

  const handleLogout = useCallback(() => {
    clearAuth();
    hasSynced.current = false;
    import('@datalayer/core/lib/state').then(({ iamStore }) => {
      iamStore.setState({ token: undefined });
    });
  }, [clearAuth]);

  if (!token) {
    return (
      <ThemedProvider>
        <AuthRequiredView />
      </ThemedProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemedProvider>
        <AgentOutputsInner onLogout={handleLogout} />
      </ThemedProvider>
    </QueryClientProvider>
  );
};

export default AgentOutputsExample;
