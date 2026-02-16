/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * ChatInlinePlugin - Lexical plugin for inline AI chat.
 *
 * This plugin displays a floating AI chat interface when the user triggers
 * an AI action (via the toolbar's AI dropdown or sparkle button). It provides
 * AI-powered text manipulation features like improve, summarize, translate, etc.
 *
 * IMPORTANT: This plugin no longer renders its own formatting toolbar.
 * Instead, AI actions are registered as `extraItems` in the
 * `FloatingTextFormatToolbarPlugin` via the `useChatInlineToolbarItems` hook.
 *
 * Usage:
 * ```tsx
 * const { toolbarItems, isAiOpen, pendingPrompt, clearPendingPrompt, closeAi } =
 *   useChatInlineToolbarItems();
 *
 * <FloatingTextFormatToolbarPlugin
 *   anchorElem={floatingAnchorElem}
 *   setIsLinkEditMode={setIsLinkEditMode}
 *   extraItems={toolbarItems}
 * />
 * <ChatInlinePlugin
 *   protocol={protocol}
 *   isOpen={isAiOpen}
 *   onClose={closeAi}
 *   pendingPrompt={pendingPrompt}
 *   onPendingPromptConsumed={clearPendingPrompt}
 * />
 * ```
 *
 * @module lexical/ChatInlinePlugin
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  TextNode,
  LexicalEditor,
  COMMAND_PRIORITY_LOW,
  createCommand,
  type LexicalCommand,
  type RangeSelection,
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  autoUpdate,
  hide,
  limitShift,
  offset,
  shift,
  size,
  useFloating,
} from '@floating-ui/react-dom';
import { Box } from '@primer/react';
import {
  ChatInline,
  type ChatInlineProtocolConfig,
} from '../components/chat/components/ChatInline';

// Margin from editor edges
const MARGIN_X = 32;

/**
 * Lexical commands for selection preservation
 */
export const SAVE_SELECTION_COMMAND: LexicalCommand<null> = createCommand(
  'SAVE_SELECTION_COMMAND',
);
export const RESTORE_SELECTION_COMMAND: LexicalCommand<null> = createCommand(
  'RESTORE_SELECTION_COMMAND',
);

/**
 * Hook to preserve selection when interacting with the floating toolbar
 */
function usePreserveSelection(editor: LexicalEditor) {
  const savedSelectionRef = useRef<RangeSelection | null>(null);

  useEffect(() => {
    const unregisterSave = editor.registerCommand(
      SAVE_SELECTION_COMMAND,
      () => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          savedSelectionRef.current = selection.clone();
        }
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    const unregisterRestore = editor.registerCommand(
      RESTORE_SELECTION_COMMAND,
      () => {
        if (savedSelectionRef.current) {
          editor.update(() => {
            const selection = savedSelectionRef.current;
            if (selection) {
              try {
                const anchor = selection.anchor;
                const focus = selection.focus;
                const newSelection = $getSelection();
                if ($isRangeSelection(newSelection)) {
                  newSelection.anchor.set(
                    anchor.key,
                    anchor.offset,
                    anchor.type,
                  );
                  newSelection.focus.set(focus.key, focus.offset, focus.type);
                }
              } catch {
                // Selection nodes may have been removed
              }
            }
          });
        }
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      unregisterSave();
      unregisterRestore();
    };
  }, [editor]);

  return {
    saveSelection: () => editor.dispatchCommand(SAVE_SELECTION_COMMAND, null),
    restoreSelection: () =>
      editor.dispatchCommand(RESTORE_SELECTION_COMMAND, null),
  };
}

/**
 * Hook to get current text selection range
 */
function useRange() {
  const [editor] = useLexicalComposerContext();
  const [range, setRange] = useState<Range | null>(null);

  useEffect(() => {
    const updateRange = () => {
      const domSelection = window.getSelection();

      if (
        !domSelection ||
        domSelection.rangeCount === 0 ||
        !editor._rootElement
      ) {
        setRange(null);
        return;
      }

      const domRange = domSelection.getRangeAt(0);

      if (!editor._rootElement.contains(domRange.commonAncestorContainer)) {
        setRange(null);
        return;
      }

      if (domRange.collapsed) {
        setRange(null);
        return;
      }

      setRange(domRange.cloneRange());
    };

    const unregister = editor.registerUpdateListener(({ tags }) => {
      if (tags.has('collaboration')) return;
      updateRange();
    });

    document.addEventListener('selectionchange', updateRange);

    return () => {
      unregister();
      document.removeEventListener('selectionchange', updateRange);
    };
  }, [editor]);

  return { range };
}

/**
 * Hook to get selection text content
 */
function useSelectionText() {
  const [editor] = useLexicalComposerContext();
  const [textContent, setTextContent] = useState<string>('');

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        setTextContent(selection?.getTextContent() || '');
      });
    });
  }, [editor]);

  return textContent;
}

/**
 * Props for ChatInlinePlugin
 */
export interface ChatInlinePluginProps {
  /** Protocol configuration for the AI agent */
  protocol: ChatInlineProtocolConfig;
  /** Whether the AI chat panel is open (controlled by useChatInlineToolbarItems) */
  isOpen: boolean;
  /** Callback to close the AI chat panel */
  onClose: () => void;
  /** A pending prompt to submit automatically (from toolbar dropdown action) */
  pendingPrompt?: string | null;
  /** Callback after the pending prompt has been consumed */
  onPendingPromptConsumed?: () => void;
  /** Optional: Container element for the portal (defaults to document.body) */
  portalContainer?: HTMLElement;
}

/**
 * ChatInlinePlugin - Floating AI chat panel for Lexical text selection.
 *
 * This plugin is controlled externally via `isOpen` prop. It positions a
 * ChatInline component near the text selection when open.
 */
export function ChatInlinePlugin({
  protocol,
  isOpen,
  onClose,
  pendingPrompt,
  onPendingPromptConsumed,
  portalContainer,
}: ChatInlinePluginProps): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const padding = 20;

  // Selection preservation
  const { saveSelection, restoreSelection } = usePreserveSelection(editor);

  // Floating UI setup
  const {
    refs: { setReference, setFloating },
    strategy,
    y,
  } = useFloating({
    strategy: 'fixed',
    placement: 'bottom',
    middleware: [
      offset(10),
      hide({ padding }),
      shift({ padding, limiter: limitShift() }),
      size({ padding }),
    ],
    whileElementsMounted: (...args) => {
      return autoUpdate(...args, {
        animationFrame: true,
      });
    },
  });

  // Selection tracking
  const { range } = useRange();
  const selectedText = useSelectionText();

  // Update floating reference position based on selection
  useLayoutEffect(() => {
    setReference({
      getBoundingClientRect: () =>
        range?.getBoundingClientRect() || new DOMRect(),
    });
  }, [setReference, range]);

  // Handle replace selection
  const handleReplaceSelection = useCallback(
    (text: string) => {
      editor.update(() => {
        const selection = $getSelection();
        selection?.insertRawText(text);
      });
    },
    [editor],
  );

  // Handle insert inline
  const handleInsertInline = useCallback(
    (text: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const node = selection.focus.getNode();
          const nodeOffset = selection.focus.offset;
          if (node instanceof TextNode) {
            const textContent = node.getTextContent();
            const newText = `${textContent.slice(0, nodeOffset)} ${text} ${textContent.slice(nodeOffset)}`;
            node.replace($createTextNode(newText));
          }
        }
      });
    },
    [editor],
  );

  // Handle insert below
  const handleInsertBelow = useCallback(
    (text: string) => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const anchorNode = selection.anchor.getNode();
          const paragraphNode = $createParagraphNode();
          paragraphNode.append($createTextNode(text));
          anchorNode.getTopLevelElementOrThrow().insertAfter(paragraphNode);
        }
      });
    },
    [editor],
  );

  // Don't render if not open or no selection
  if (!isOpen || range === null) {
    return null;
  }

  const portalTarget = portalContainer || document.body;

  return createPortal(
    <Box
      ref={setFloating}
      sx={{
        pointerEvents: 'auto',
        zIndex: 50,
        position: strategy,
        top: 0,
        left: editor._rootElement
          ? editor._rootElement.getBoundingClientRect().left + MARGIN_X
          : 0,
        transform: `translate3d(0, ${Math.round(y)}px, 0)`,
        width: editor._rootElement
          ? editor._rootElement.getBoundingClientRect().width - MARGIN_X * 2
          : 'auto',
      }}
    >
      <ChatInline
        selectedText={selectedText}
        protocol={protocol}
        onReplaceSelection={handleReplaceSelection}
        onInsertInline={handleInsertInline}
        onInsertBelow={handleInsertBelow}
        onClose={onClose}
        onSaveSelection={saveSelection}
        onRestoreSelection={restoreSelection}
        pendingPrompt={pendingPrompt}
        onPendingPromptConsumed={onPendingPromptConsumed}
      />
    </Box>,
    portalTarget,
  );
}

export default ChatInlinePlugin;
