/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A2UiAgentExample
 *
 * A comprehensive, real-world A2UI generative-UI example. The agent
 * (agentspec: `example-a2ui-agent`) exposes a single backend tool,
 * `render_a2ui_surface`, that turns a natural-language request into a
 * validated A2UI v0.9 surface (createSurface + updateComponents +
 * updateDataModel). The frontend renders the returned messages live:
 *
 * - INLINE in the chat as a compact confirmation card.
 * - In the main canvas as a fully interactive A2UI surface (forms, cards,
 *   choice pickers, sliders, date pickers, ...).
 *
 * Submitting the rendered surface emits an A2UI client action which we display
 * in a "Submitted values" panel, closing the generate → interact loop.
 *
 * This mirrors the working tool-based generative UI pattern (see
 * AgUiHaikuGenUiExample) but renders A2UI surfaces instead of bespoke cards.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { Button, Spinner, Text } from '@primer/react';
import { basicCatalog } from '@a2ui/react/v0_9';
import type { A2uiClientAction, A2uiMessage } from '@a2ui/web_core/v0_9';
import { A2UI_RENDER_SCOPE_SX, A2uiSurfaceComposed } from '../components/a2ui';
import { ThemedProvider } from './utils/themedProvider';
import { A2uiMarkdownProvider } from './utils/a2uiMarkdownProvider';
import { useA2uiProcessor } from './utils/a2ui';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';
import { uniqueAgentId } from './utils/agentId';
import {
  useSpecRenderToolResult,
  specRendererClassName,
  type SpecRenderer,
} from './hooks/useSpecRenderToolResult';
import { Chat } from '../chat';

setupPrimerPortals();

const AGENT_NAME = 'a2ui-agent';
const AGENTSPEC_ID = 'example-a2ui-agent';

const SUGGESTIONS = [
  {
    title: 'Support ticket intake',
    message:
      'Build a support ticket intake form with category, priority and a description.',
  },
  {
    title: 'Trip booking',
    message:
      'Create a trip booking form with destination, dates, travelers and budget.',
  },
  {
    title: 'Feedback survey',
    message:
      'Generate a customer feedback survey with a rating slider and comments.',
  },
  {
    title: 'Product configurator',
    message:
      'Make a product configurator for a laptop with CPU, RAM and add-ons.',
  },
];

type A2uiRequiredField = {
  id: string;
  label: string;
};

/**
 * Per-field validation descriptor emitted by the backend `render_a2ui_surface`
 * tool. The action handler uses these rules to gate form submission.
 */
type A2uiFieldRule = {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  format?: 'email';
  pattern?: string;
  minLength?: number;
  min?: number;
  max?: number;
};

type A2uiToolResult = {
  surfaceId?: string;
  title?: string;
  messages?: A2uiMessage[];
  requiredFields?: A2uiRequiredField[];
  fieldRules?: A2uiFieldRule[];
};

/**
 * Whether a submitted form value should count as "not provided" for the
 * purpose of required-field validation. Handles the value shapes the A2UI
 * basic catalog emits: strings (text/email), arrays (choice), booleans
 * (checkbox).
 */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'boolean') {
    return value === false;
  }
  return false;
}

/**
 * Basic email format check (matches the intent of the backend `email` field
 * type). Intentionally permissive: requires `local@domain.tld` with no spaces.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate a single submitted value against its backend-provided rule. Returns
 * a human-readable error message, or `null` when the value is acceptable.
 */
function validateFieldValue(
  rule: A2uiFieldRule,
  value: unknown,
): string | null {
  const empty = isEmptyValue(value);
  if (empty) {
    // Optional fields left blank are fine; only required ones fail here.
    return rule.required ? `${rule.label} is required.` : null;
  }
  if (
    rule.format === 'email' &&
    typeof value === 'string' &&
    !EMAIL_PATTERN.test(value.trim())
  ) {
    return `${rule.label} must be a valid email address.`;
  }
  if (rule.pattern && typeof value === 'string') {
    let matches = true;
    try {
      matches = new RegExp(rule.pattern).test(value.trim());
    } catch {
      matches = true; // Ignore malformed patterns rather than blocking.
    }
    if (!matches) {
      return `${rule.label} is not in the expected format.`;
    }
  }
  if (
    rule.minLength !== undefined &&
    typeof value === 'string' &&
    value.trim().length < rule.minLength
  ) {
    return `${rule.label} must be at least ${rule.minLength} characters.`;
  }
  if (rule.type === 'slider' && typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      return `${rule.label} must be at least ${rule.min}.`;
    }
    if (rule.max !== undefined && value > rule.max) {
      return `${rule.label} must be at most ${rule.max}.`;
    }
  }
  return null;
}

/**
 * Normalize a backend tool result (object or JSON string) into A2UI messages,
 * rewriting the catalog id to the frontend catalog so the renderer accepts it.
 */
function extractToolResult(result: unknown): A2uiToolResult | null {
  if (!result) {
    return null;
  }
  let obj: unknown = result;
  if (typeof result === 'string') {
    try {
      obj = JSON.parse(result);
    } catch {
      return null;
    }
  }
  if (
    typeof obj !== 'object' ||
    obj === null ||
    !Array.isArray((obj as A2uiToolResult).messages)
  ) {
    return null;
  }
  const parsed = obj as A2uiToolResult;
  const messages = (parsed.messages ?? []).map(message => {
    const payload = message as A2uiMessage & {
      createSurface?: { catalogId?: string };
    };
    if (
      payload.createSurface &&
      payload.createSurface.catalogId !== basicCatalog.id
    ) {
      return {
        ...payload,
        createSurface: {
          ...payload.createSurface,
          catalogId: basicCatalog.id,
        },
      } as A2uiMessage;
    }
    return message;
  });
  return { ...parsed, messages };
}

/** A single submitted-form record shown in the "Submitted values" panel. */
interface SubmissionRecord {
  id: number;
  values: Record<string, unknown>;
}

/**
 * Renders a fully interactive A2UI surface *inline* in the chat transcript.
 *
 * Uses its own `useA2uiProcessor` instance (independent from the canvas
 * processor) so the same generated surface can be filled in and submitted from
 * both places. Messages are processed once on mount.
 */
const InlineA2uiSurface: React.FC<{
  messages: A2uiMessage[];
  onAction: (action: A2uiClientAction) => void;
  validationError?: string | null;
}> = ({ messages, onAction, validationError }) => {
  const { surfaces, processMessages, resetSurfaces, themeStyle } =
    useA2uiProcessor(onAction);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) {
      return;
    }
    processedRef.current = true;
    resetSurfaces();
    processMessages(messages);
  }, [messages, processMessages, resetSurfaces]);

  if (surfaces.length === 0) {
    return null;
  }

  return (
    <Box
      style={themeStyle}
      sx={{
        ...A2UI_RENDER_SCOPE_SX,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {validationError && (
        <Box
          role="alert"
          sx={{
            px: 3,
            py: 2,
            borderRadius: 2,
            bg: 'danger.subtle',
            border: '1px solid',
            borderColor: 'danger.muted',
            color: 'danger.fg',
            fontSize: 1,
          }}
        >
          {validationError}
        </Box>
      )}
      {surfaces.map(surface => (
        <Box
          key={surface.id}
          sx={{
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            p: 3,
            bg: 'canvas.default',
          }}
        >
          <A2uiSurfaceComposed surface={surface} />
        </Box>
      ))}
    </Box>
  );
};

const A2UiAgentExample: React.FC = () => {
  const baseUrl = useExampleAgentRuntimesUrl();
  const agentName = useMemo(() => uniqueAgentId(AGENT_NAME), []);

  const {
    agentId,
    error: chatError,
    status,
    isReady,
  } = useExampleAgentRuntime({
    exampleId: 'A2UiAgentExample',
    agentName,
    specId: AGENTSPEC_ID,
    agentConfig: {
      protocol: 'ag-ui',
      agentSpecId: AGENTSPEC_ID,
    },
  });

  const isCreatingChat = !isReady && status !== 'error';

  const [surfaceTitle, setSurfaceTitle] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>(
    undefined,
  );
  const [validationError, setValidationError] = useState<{
    surfaceId: string;
    message: string;
  } | null>(null);
  const submissionSeq = useRef(0);

  // Validation rules per surface id, populated from each tool result so the
  // (stable) action handler can block submission of an invalid form.
  const fieldRulesBySurfaceRef = useRef<Record<string, A2uiFieldRule[]>>({});

  // Keep the latest surface title in a ref so the (stable) action handler can
  // reference it without being re-created on every render.
  const surfaceTitleRef = useRef<string | null>(null);
  useEffect(() => {
    surfaceTitleRef.current = surfaceTitle;
  }, [surfaceTitle]);

  // Handle A2UI actions emitted by the rendered surface (e.g. form submit).
  const handleAction = useCallback((action: A2uiClientAction) => {
    if (action.name === 'submit_a2ui_form') {
      const values = (action.context ?? {}) as Record<string, unknown>;

      // Block submission when any field fails validation (required, email
      // format, pattern, length, slider range).
      const rules = fieldRulesBySurfaceRef.current[action.surfaceId] ?? [];
      const errors = rules
        .map(rule => validateFieldValue(rule, values[rule.id]))
        .filter((message): message is string => message !== null);
      if (errors.length > 0) {
        setValidationError({
          surfaceId: action.surfaceId,
          message: errors.join(' '),
        });
        return;
      }
      setValidationError(null);

      submissionSeq.current += 1;
      const seq = submissionSeq.current;
      setSubmissions(prev => [
        {
          id: seq,
          values,
        },
        ...prev,
      ]);
      // Feed the submission back to the agent so it replies with a confirmation.
      const title = surfaceTitleRef.current ?? 'the form';
      const json = JSON.stringify(values, null, 2);
      setPendingPrompt(
        `I just submitted "${title}" (submission #${seq}). Here are the values:\n\n\`\`\`json\n${json}\n\`\`\`\n\nPlease confirm you received them and briefly summarize what happens next.`,
      );
    }
  }, []);

  const { surfaces, processMessages, resetSurfaces, themeStyle } =
    useA2uiProcessor(handleAction);

  // Stable ref so the memoized renderer can push surfaces without re-creating.
  const showSurfaceRef = useRef<(messages: A2uiMessage[]) => void>(() => {});
  useEffect(() => {
    showSurfaceRef.current = (messages: A2uiMessage[]) => {
      resetSurfaces();
      processMessages(messages);
    };
  }, [resetSurfaces, processMessages]);

  const processedToolCallIds = useRef<Set<string>>(new Set());

  const renderers = useMemo<Record<string, SpecRenderer>>(
    () => ({
      'a2ui-surface': (context, binding) => {
        const parsed =
          context.status === 'complete'
            ? extractToolResult(context.result)
            : null;

        if (
          context.status === 'complete' &&
          parsed?.messages &&
          parsed.messages.length > 0 &&
          context.toolCallId &&
          !processedToolCallIds.current.has(context.toolCallId)
        ) {
          processedToolCallIds.current.add(context.toolCallId);
          showSurfaceRef.current(parsed.messages);
          setSurfaceTitle(parsed.title ?? 'A2UI surface');
          if (parsed.surfaceId) {
            fieldRulesBySurfaceRef.current[parsed.surfaceId] =
              parsed.fieldRules ?? [];
          }
          setValidationError(null);
        }

        return (
          <div className={specRendererClassName(binding)}>
            {context.status === 'complete' &&
            parsed?.messages &&
            parsed.messages.length > 0 ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    color: 'fg.muted',
                  }}
                >
                  <Text sx={{ fontSize: 2 }}>🎛️</Text>
                  <Text sx={{ fontWeight: 'bold', color: 'fg.default' }}>
                    {parsed.title ?? 'A2UI surface'}
                  </Text>
                  <Text sx={{ fontSize: 0 }}>
                    · also in the canvas → fill it in and submit
                  </Text>
                </Box>
                <InlineA2uiSurface
                  messages={parsed.messages}
                  onAction={handleAction}
                  validationError={
                    validationError &&
                    parsed.surfaceId &&
                    validationError.surfaceId === parsed.surfaceId
                      ? validationError.message
                      : null
                  }
                />
              </Box>
            ) : (
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  px: 3,
                  py: 2,
                  bg: 'canvas.subtle',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Spinner size="small" />
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                  Rendering A2UI surface...
                </Text>
              </Box>
            )}
          </div>
        );
      },
    }),
    [handleAction, validationError],
  );

  const renderToolResult = useSpecRenderToolResult(AGENTSPEC_ID, renderers);

  const clearCanvas = useCallback(() => {
    resetSurfaces();
    setSurfaceTitle(null);
    setValidationError(null);
  }, [resetSurfaces]);

  return (
    <ThemedProvider>
      <A2uiMarkdownProvider>
        <Box
          sx={{
            minHeight: '100vh',
            display: 'grid',
            gridTemplateColumns: [
              '1fr',
              '1fr',
              'minmax(360px, 1fr) minmax(360px, 460px)',
            ],
            gap: 3,
            p: 3,
            bg: 'canvas.default',
          }}
        >
          {/* Main canvas: interactive A2UI surface + submissions */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              minHeight: 0,
            }}
          >
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  px: 3,
                  py: 2,
                  borderBottom: '1px solid',
                  borderColor: 'border.default',
                  bg: 'canvas.subtle',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Text as="h1" sx={{ fontSize: 2, fontWeight: 'bold' }}>
                    A2UI Agent
                  </Text>
                  <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                    Ask the agent to build a UI — it renders a live A2UI
                    surface.
                  </Text>
                </Box>
                {surfaces.length > 0 && (
                  <Button
                    size="small"
                    variant="invisible"
                    onClick={clearCanvas}
                  >
                    Clear
                  </Button>
                )}
              </Box>

              <Box
                style={themeStyle}
                sx={{
                  ...A2UI_RENDER_SCOPE_SX,
                  p: 3,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                {surfaces.length === 0 ? (
                  <Box
                    sx={{
                      textAlign: 'center',
                      py: 6,
                      px: 3,
                      color: 'fg.muted',
                      border: '2px dashed',
                      borderColor: 'border.muted',
                      borderRadius: 2,
                    }}
                  >
                    <Text sx={{ fontSize: 4, display: 'block', mb: 2 }}>
                      🎛️
                    </Text>
                    <Text sx={{ fontSize: 1, display: 'block' }}>
                      No surface yet. Try a suggestion in the chat, e.g.{' '}
                      <Text as="span" sx={{ fontStyle: 'italic' }}>
                        &quot;{SUGGESTIONS[0].message}&quot;
                      </Text>
                    </Text>
                  </Box>
                ) : (
                  <>
                    {surfaceTitle && (
                      <Text sx={{ fontWeight: 'bold', color: 'fg.default' }}>
                        {surfaceTitle}
                      </Text>
                    )}
                    {validationError && (
                      <Box
                        role="alert"
                        sx={{
                          px: 3,
                          py: 2,
                          borderRadius: 2,
                          bg: 'danger.subtle',
                          border: '1px solid',
                          borderColor: 'danger.muted',
                          color: 'danger.fg',
                          fontSize: 1,
                        }}
                      >
                        {validationError.message}
                      </Box>
                    )}
                    {surfaces.map(surface => (
                      <Box
                        key={surface.id}
                        sx={{
                          border: '1px solid',
                          borderColor: 'border.default',
                          borderRadius: 2,
                          p: 3,
                          bg: 'canvas.default',
                        }}
                      >
                        <A2uiSurfaceComposed surface={surface} />
                      </Box>
                    ))}
                  </>
                )}
              </Box>
            </Box>

            {submissions.length > 0 && (
              <Box
                sx={{
                  border: '1px solid',
                  borderColor: 'border.default',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    px: 3,
                    py: 2,
                    borderBottom: '1px solid',
                    borderColor: 'border.default',
                    bg: 'success.subtle',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text sx={{ fontWeight: 'bold' }}>Submitted values</Text>
                  <Button
                    size="small"
                    variant="invisible"
                    onClick={() => setSubmissions([])}
                  >
                    Clear
                  </Button>
                </Box>
                <Box
                  sx={{
                    p: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  {submissions.map(record => (
                    <Box
                      as="pre"
                      key={record.id}
                      sx={{
                        m: 0,
                        p: 2,
                        borderRadius: 2,
                        bg: 'canvas.subtle',
                        border: '1px solid',
                        borderColor: 'border.default',
                        fontSize: 0,
                        overflow: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {JSON.stringify(record.values, null, 2)}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>

          {/* Chat: drives the A2UI generation */}
          <Box
            sx={{
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              minHeight: 0,
              overflow: 'hidden',
              bg: 'canvas.default',
            }}
          >
            {isCreatingChat ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 3,
                }}
              >
                <Spinner size="large" />
                <Text sx={{ color: 'fg.muted' }}>Creating A2UI agent...</Text>
              </Box>
            ) : chatError || !agentId ? (
              <Box sx={{ p: 3 }}>
                <Text sx={{ color: 'danger.fg' }}>
                  Failed to initialize chat:{' '}
                  {chatError || 'No agent id returned'}
                </Text>
              </Box>
            ) : (
              <Chat
                protocol="ag-ui"
                baseUrl={baseUrl}
                agentId={agentId}
                title="A2UI Agent"
                description="Generate interactive A2UI surfaces"
                placeholder="Describe the UI you want..."
                showHeader={true}
                showModelSelector={true}
                showToolsMenu={true}
                showSkillsMenu={true}
                showTokenUsage={true}
                showInformation={true}
                autoFocus
                height="100%"
                runtimeId={agentId}
                historyEndpoint={`${baseUrl}/api/v1/history`}
                suggestions={SUGGESTIONS}
                submitOnSuggestionClick
                pendingPrompt={pendingPrompt}
                renderToolResult={renderToolResult}
              />
            )}
          </Box>
        </Box>
      </A2uiMarkdownProvider>
    </ThemedProvider>
  );
};

export default A2UiAgentExample;
