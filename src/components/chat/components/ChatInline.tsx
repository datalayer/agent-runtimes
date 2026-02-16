/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * ChatInline - Inline chat component for text selection AI assistance.
 *
 * This component provides an inline AI chat interface that appears when
 * text is selected in a Lexical editor. It supports:
 * - Custom prompts via text input
 * - Pre-defined AI actions (improve, summarize, translate, etc.)
 * - Streaming responses from an agent via AG-UI protocol
 * - Actions to apply AI results (replace, insert inline, insert below)
 *
 * Uses Primer UI components instead of Tailwind CSS.
 *
 * @module components/chat/components/ChatInline
 */

import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type FormEvent,
  type ReactNode,
  Fragment,
} from 'react';
import {
  Text,
  TextInput,
  IconButton,
  ActionList,
  Spinner,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  CopyIcon,
  ArrowLeftIcon,
  SyncIcon,
  TrashIcon,
  CheckIcon,
  PlusIcon,
  PencilIcon,
  XIcon,
} from '@primer/octicons-react';
import { SparklesIcon } from '@datalayer/icons-react';
import type { TransportType, ProtocolEvent } from '../types/protocol';
import { AGUIAdapter, type BaseProtocolAdapter } from '../protocols';
import type { ChatMessage } from '../types/message';
import { generateMessageId } from '../types/message';

/**
 * AI action option type
 */
interface AIOption {
  /** Display text */
  text: string;
  /** Prompt to send to AI */
  prompt?: string;
  /** Icon component */
  icon?: ReactNode;
  /** Sub-options */
  children?: AIOption[];
}

/**
 * AI action group type
 */
interface AIOptionGroup {
  /** Group name */
  text: string;
  /** Options in this group */
  options: AIOption[];
}

/**
 * Pre-defined AI action groups
 */
const AI_OPTIONS_GROUPS: AIOptionGroup[] = [
  {
    text: 'Modify selection',
    options: [
      {
        text: 'Improve writing',
        prompt: 'Improve the quality of the text',
        icon: <PencilIcon size={14} />,
      },
      {
        text: 'Fix mistakes',
        prompt: 'Fix any typos or general errors in the text',
        icon: <CheckIcon size={14} />,
      },
      {
        text: 'Simplify',
        prompt: 'Shorten the text, simplifying it',
        icon: <XIcon size={14} />,
      },
      {
        text: 'Add more detail',
        prompt: 'Lengthen the text, going into more detail',
        icon: <PlusIcon size={14} />,
      },
    ],
  },
  {
    text: 'Generate',
    options: [
      {
        text: 'Summarise',
        prompt: 'Summarise the text',
        icon: <CopyIcon size={14} />,
      },
      {
        text: 'Translate into…',
        children: [
          'Arabic',
          'Chinese',
          'Dutch',
          'English',
          'French',
          'German',
          'Japanese',
          'Korean',
          'Portuguese',
          'Spanish',
        ].map(lang => ({
          text: lang,
          prompt: `Translate text into the ${lang} language`,
        })),
        icon: <SyncIcon size={14} />,
      },
      {
        text: 'Explain',
        prompt: 'Explain what the text is about',
        icon: <CheckIcon size={14} />,
      },
    ],
  },
];

/**
 * ChatInline component state
 */
type ChatInlineState = 'initial' | 'loading' | 'complete';

/**
 * Protocol configuration for ChatInline
 */
export interface ChatInlineProtocolConfig {
  /** Protocol type (ag-ui, vercel-ai, etc.) */
  type: TransportType;
  /** Endpoint URL */
  endpoint: string;
  /** Authentication token */
  authToken?: string;
  /** Agent ID */
  agentId?: string;
  /** Additional options */
  options?: Record<string, unknown>;
}

/**
 * ChatInline component props
 */
export interface ChatInlineProps {
  /** The selected text from the editor */
  selectedText: string;
  /** Protocol configuration for connecting to the agent */
  protocol: ChatInlineProtocolConfig;
  /** Callback when user wants to replace selection with AI result */
  onReplaceSelection?: (text: string) => void;
  /** Callback when user wants to insert AI result inline after selection */
  onInsertInline?: (text: string) => void;
  /** Callback when user wants to insert AI result as new paragraph */
  onInsertBelow?: (text: string) => void;
  /** Callback to close the inline chat */
  onClose?: () => void;
  /** Callback to save selection before input focus */
  onSaveSelection?: () => void;
  /** Callback to restore selection after input blur */
  onRestoreSelection?: () => void;
  /** A pending prompt to submit automatically (from toolbar dropdown action) */
  pendingPrompt?: string | null;
  /** Callback after the pending prompt has been consumed */
  onPendingPromptConsumed?: () => void;
}

/**
 * ChatInline - Inline AI chat component for text selection assistance.
 */
export function ChatInline({
  selectedText,
  protocol,
  onReplaceSelection,
  onInsertInline,
  onInsertBelow,
  onClose,
  onSaveSelection,
  onRestoreSelection,
  pendingPrompt,
  onPendingPromptConsumed,
}: ChatInlineProps): JSX.Element {
  // Input state
  const [input, setInput] = useState('');
  // AI state
  const [aiState, setAiState] = useState<ChatInlineState>('initial');
  // AI response content
  const [aiResponse, setAiResponse] = useState<string>('');
  // Previous prompt for regeneration
  const [previousPrompt, setPreviousPrompt] = useState('');
  // Current page in options menu (for sub-menus like translate)
  const [pages, setPages] = useState<string[]>([]);
  // Error state
  const [error, setError] = useState<string | null>(null);

  // Protocol adapter ref
  const adapterRef = useRef<BaseProtocolAdapter | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Current page
  const page = pages[pages.length - 1];

  // Get selected option for sub-pages
  const selectedOption = useMemo(() => {
    return AI_OPTIONS_GROUPS.flatMap(group => group.options)
      .flatMap(option =>
        option.children ? [option, ...option.children] : [option],
      )
      .find(option => option.text === page);
  }, [page]);

  // Initialize protocol adapter
  useEffect(() => {
    if (!protocol) return;

    const adapter = new AGUIAdapter({
      type: protocol.type,
      baseUrl: protocol.endpoint,
      authToken: protocol.authToken,
      agentId: protocol.agentId,
      ...protocol.options,
    });

    adapterRef.current = adapter;

    // Subscribe to events
    unsubscribeRef.current = adapter.subscribe((event: ProtocolEvent) => {
      switch (event.type) {
        case 'message':
          if (event.message?.content) {
            setAiResponse(
              typeof event.message.content === 'string'
                ? event.message.content
                : '',
            );
          }
          break;
        case 'error':
          console.error('[ChatInline] Protocol error:', event.error);
          setError(event.error?.message || 'Unknown error');
          setAiState('initial');
          break;
      }
    });

    // Connect
    adapter.connect().catch(console.error);

    return () => {
      unsubscribeRef.current?.();
      adapterRef.current?.disconnect();
    };
  }, [protocol]);

  // Submit prompt to AI
  const submitPrompt = useCallback(
    async (prompt: string) => {
      if (!adapterRef.current) {
        setError('No adapter available');
        return;
      }

      setAiState('loading');
      setInput('');
      setPreviousPrompt(prompt);
      setError(null);
      setAiResponse('');

      // Build system message with selected text context
      const systemContext = `Do not surround your answer in quote marks. Only return the answer, nothing else. The user is selecting this text:

"""
${selectedText || ''}
"""
`;

      // Create system message with context
      const systemMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'system',
        content: systemContext,
        createdAt: new Date(),
      };

      // Create user message
      const userMessage: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: prompt,
        createdAt: new Date(),
      };

      try {
        await adapterRef.current.sendMessage(userMessage, {
          messages: [systemMessage, userMessage],
        });
        setAiState('complete');
      } catch (err) {
        console.error('[ChatInline] Send error:', err);
        setError((err as Error).message);
        setAiState('initial');
      }
    },
    [selectedText],
  );

  // Handle pending prompt from toolbar dropdown
  useEffect(() => {
    if (pendingPrompt && aiState === 'initial') {
      submitPrompt(pendingPrompt);
      onPendingPromptConsumed?.();
    }
  }, [pendingPrompt, aiState, submitPrompt, onPendingPromptConsumed]);

  // Handle form submission
  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (input.trim()) {
        submitPrompt(input);
        onRestoreSelection?.();
      }
    },
    [input, submitPrompt, onRestoreSelection],
  );

  // Handle copy to clipboard
  const handleCopy = useCallback(async () => {
    if (aiResponse) {
      try {
        await navigator.clipboard.writeText(aiResponse);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  }, [aiResponse]);

  // Handle replace selection
  const handleReplace = useCallback(() => {
    if (aiResponse) {
      onReplaceSelection?.(aiResponse);
      onClose?.();
    }
  }, [aiResponse, onReplaceSelection, onClose]);

  // Handle insert inline
  const handleInsertInline = useCallback(() => {
    if (aiResponse) {
      onInsertInline?.(aiResponse);
      onClose?.();
    }
  }, [aiResponse, onInsertInline, onClose]);

  // Handle insert below
  const handleInsertBelow = useCallback(() => {
    if (aiResponse) {
      onInsertBelow?.(aiResponse);
      onClose?.();
    }
  }, [aiResponse, onInsertBelow, onClose]);

  // Handle regenerate
  const handleRegenerate = useCallback(() => {
    if (previousPrompt) {
      submitPrompt(previousPrompt);
    }
  }, [previousPrompt, submitPrompt]);

  // Handle back to options
  const handleBackToOptions = useCallback(() => {
    setAiState('initial');
    setAiResponse('');
  }, []);

  // Handle discard
  const handleDiscard = useCallback(() => {
    onClose?.();
  }, [onClose]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        width: '100%',
      }}
    >
      {/* Main Input Panel */}
      <Box
        sx={{
          borderRadius: '12px',
          border: '1px solid',
          borderColor: 'border.default',
          boxShadow: 'shadow.large',
          bg: 'canvas.default',
          overflow: 'hidden',
        }}
        onMouseDown={e => {
          e.preventDefault();
          onSaveSelection?.();
        }}
        onMouseUp={() => {
          onRestoreSelection?.();
        }}
      >
        {/* AI Response Display */}
        {aiResponse && (
          <Box
            sx={{
              p: 2,
              borderBottom: '1px solid',
              borderColor: 'border.default',
              maxHeight: '130px',
              overflow: 'auto',
              position: 'relative',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: 1,
                right: 1,
              }}
            >
              <IconButton
                icon={CopyIcon}
                aria-label="Copy"
                variant="invisible"
                size="small"
                onClick={handleCopy}
                sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
              />
            </Box>
            <Text
              sx={{
                whiteSpace: 'pre-wrap',
                fontSize: 1,
                pr: 4,
              }}
            >
              {aiResponse}
            </Text>
          </Box>
        )}

        {/* Input Form */}
        <Box
          as="form"
          onSubmit={handleSubmit}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: 1,
          }}
        >
          <TextInput
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={aiState === 'loading' ? 'Writing…' : 'Custom prompt…'}
            disabled={aiState === 'loading'}
            sx={{ flex: 1 }}
            onMouseDown={e => {
              e.stopPropagation();
              onSaveSelection?.();
            }}
            onMouseUp={e => e.stopPropagation()}
          />
          <IconButton
            type="submit"
            icon={() => (
              <SparklesIcon
                style={aiState === 'loading' ? { opacity: 0.6 } : {}}
              />
            )}
            aria-label="Send"
            disabled={aiState === 'loading' || !input.trim()}
            variant="invisible"
          />
        </Box>

        {/* Error Display */}
        {error && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Text sx={{ color: 'danger.fg', fontSize: 0 }}>{error}</Text>
          </Box>
        )}
      </Box>

      {/* Options Panel - Show when not loading */}
      {aiState !== 'loading' && (
        <Box
          sx={{
            borderRadius: '12px',
            border: '1px solid',
            borderColor: 'border.default',
            boxShadow: 'shadow.large',
            bg: 'canvas.default',
            maxWidth: '220px',
            maxHeight: '360px',
            overflow: 'auto',
          }}
          onMouseDown={e => e.preventDefault()}
        >
          <ActionList>
            {/* Post-completion actions */}
            {aiResponse && !page && aiState === 'complete' && (
              <>
                <ActionList.Item onSelect={handleReplace}>
                  <ActionList.LeadingVisual>
                    <SyncIcon size={14} />
                  </ActionList.LeadingVisual>
                  Replace selection
                </ActionList.Item>
                <ActionList.Item onSelect={handleInsertInline}>
                  <ActionList.LeadingVisual>
                    <PlusIcon size={14} />
                  </ActionList.LeadingVisual>
                  Add text inline
                </ActionList.Item>
                <ActionList.Item onSelect={handleInsertBelow}>
                  <ActionList.LeadingVisual>
                    <PlusIcon size={14} />
                  </ActionList.LeadingVisual>
                  Add below paragraph
                </ActionList.Item>

                <ActionList.Divider />

                <ActionList.Group title="Modify further">
                  <ActionList.Item onSelect={handleRegenerate}>
                    <ActionList.LeadingVisual>
                      <SyncIcon size={14} />
                    </ActionList.LeadingVisual>
                    Regenerate
                  </ActionList.Item>
                  <ActionList.Item onSelect={handleBackToOptions}>
                    <ActionList.LeadingVisual>
                      <ArrowLeftIcon size={14} />
                    </ActionList.LeadingVisual>
                    Other options
                  </ActionList.Item>
                </ActionList.Group>

                <ActionList.Divider />

                <ActionList.Item onSelect={handleDiscard} variant="danger">
                  <ActionList.LeadingVisual>
                    <TrashIcon size={14} />
                  </ActionList.LeadingVisual>
                  Discard
                </ActionList.Item>
              </>
            )}

            {/* Initial state - show options */}
            {aiState === 'initial' && (
              <>
                {page ? (
                  // Back button when on sub-page
                  <ActionList.Item onSelect={() => setPages([])}>
                    <ActionList.LeadingVisual>
                      <ArrowLeftIcon size={14} />
                    </ActionList.LeadingVisual>
                    Back
                  </ActionList.Item>
                ) : (
                  // Main options
                  AI_OPTIONS_GROUPS.map((group, index) => (
                    <Fragment key={group.text}>
                      {index !== 0 && <ActionList.Divider />}
                      <ActionList.Group title={group.text}>
                        {group.options.map(option =>
                          option.prompt ? (
                            // Option with direct prompt
                            <ActionList.Item
                              key={option.text}
                              onSelect={() => {
                                if (option.prompt) {
                                  submitPrompt(option.prompt);
                                }
                                setPages([]);
                              }}
                            >
                              {option.icon && (
                                <ActionList.LeadingVisual>
                                  {option.icon}
                                </ActionList.LeadingVisual>
                              )}
                              {option.text}
                            </ActionList.Item>
                          ) : (
                            // Option that opens sub-menu
                            <ActionList.Item
                              key={option.text}
                              onSelect={() => setPages([...pages, option.text])}
                            >
                              {option.icon && (
                                <ActionList.LeadingVisual>
                                  {option.icon}
                                </ActionList.LeadingVisual>
                              )}
                              {option.text}
                            </ActionList.Item>
                          ),
                        )}
                      </ActionList.Group>
                    </Fragment>
                  ))
                )}

                {/* Sub-menu items */}
                {selectedOption?.children?.map(option => (
                  <ActionList.Item
                    key={option.text}
                    onSelect={() => {
                      if (option.prompt) {
                        submitPrompt(option.prompt);
                      }
                      setPages([]);
                    }}
                  >
                    {option.icon && (
                      <ActionList.LeadingVisual>
                        {option.icon}
                      </ActionList.LeadingVisual>
                    )}
                    {option.text}
                  </ActionList.Item>
                ))}
              </>
            )}
          </ActionList>
        </Box>
      )}

      {/* Loading indicator */}
      {aiState === 'loading' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            py: 2,
          }}
        >
          <Spinner size="small" />
          <Text sx={{ ml: 2, color: 'fg.muted', fontSize: 1 }}>
            Generating...
          </Text>
        </Box>
      )}
    </Box>
  );
}

export default ChatInline;
