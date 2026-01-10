/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * ChatInlinePlugin - Lexical plugin for inline AI chat.
 *
 * This plugin displays a floating AI chat interface when text is selected
 * in the Lexical editor. It provides AI-powered text manipulation features
 * like improve, summarize, translate, etc.
 *
 * Features:
 * - Detects text selection in the editor
 * - Shows floating ChatInline component near the selection
 * - Supports custom prompts and pre-defined AI actions
 * - Can replace selection, insert inline, or insert below
 * - Uses floating-ui for positioning
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
  FORMAT_TEXT_COMMAND,
  type LexicalCommand,
  type RangeSelection,
  type TextFormatType,
} from 'lexical';
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
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
import { Box, IconButton } from '@primer/react';
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  CodeIcon,
  LinkIcon,
  SparkleFillIcon,
} from '@primer/octicons-react';
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
              // Note: We create a new reference to avoid stale selection issues
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
 * Uses native DOM selection for immediate response during drag operations
 */
function useRange() {
  const [editor] = useLexicalComposerContext();
  const [range, setRange] = useState<Range | null>(null);

  useEffect(() => {
    // Function to update range from DOM selection
    const updateRange = () => {
      const domSelection = window.getSelection();

      // Check if selection exists and is within the editor
      if (
        !domSelection ||
        domSelection.rangeCount === 0 ||
        !editor._rootElement
      ) {
        setRange(null);
        return;
      }

      const domRange = domSelection.getRangeAt(0);

      // Check if selection is within the editor
      if (!editor._rootElement.contains(domRange.commonAncestorContainer)) {
        setRange(null);
        return;
      }

      // Check if selection is collapsed (just a cursor, no text selected)
      if (domRange.collapsed) {
        setRange(null);
        return;
      }

      setRange(domRange.cloneRange());
    };

    // Listen for Lexical editor updates
    const unregister = editor.registerUpdateListener(({ tags }) => {
      // Ignore collaboration updates
      if (tags.has('collaboration')) return;
      updateRange();
    });

    // Listen for DOM selection changes to catch drag selections
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
 * Hook to detect if mouse is pressed outside a specific element (for drag selection detection)
 * Returns true only when mouse is down AND the click started outside the provided element
 */
function useIsMouseDownOutside(
  getElement: () => HTMLElement | null,
): boolean {
  const [isMouseDownOutside, setIsMouseDownOutside] = useState(false);
  // Force update counter to trigger re-render on mouseup
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const element = getElement();
      // Check if the click is outside the toolbar element
      if (element && element.contains(e.target as Node)) {
        // Click is inside toolbar, don't set mouse down state
        setIsMouseDownOutside(false);
      } else {
        // Click is outside toolbar (in editor), set mouse down state
        setIsMouseDownOutside(true);
      }
    };
    const handleMouseUp = () => {
      setIsMouseDownOutside(false);
      // Force a re-render to show toolbar after selection completes
      forceUpdate(n => n + 1);
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getElement]);

  return isMouseDownOutside;
}

/**
 * Props for ChatInlinePlugin
 */
export interface ChatInlinePluginProps {
  /** Protocol configuration for the AI agent */
  protocol: ChatInlineProtocolConfig;
  /** Optional: Container element for the portal (defaults to document.body) */
  portalContainer?: HTMLElement;
}

/**
 * Floating toolbar state
 */
type ToolbarState = 'closed' | 'button' | 'ai';

/**
 * ChatInlinePlugin - Floating AI toolbar for Lexical text selection.
 */
export function ChatInlinePlugin({
  protocol,
  portalContainer,
}: ChatInlinePluginProps): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const [toolbarState, setToolbarState] = useState<ToolbarState>('closed');
  const [fullWidth, setFullWidth] = useState(false);
  const padding = 20;

  // Text format state
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [isCode, setIsCode] = useState(false);
  const [isLink, setIsLink] = useState(false);

  // Update text format state based on selection
  const updateFormatState = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        setIsBold(selection.hasFormat('bold'));
        setIsItalic(selection.hasFormat('italic'));
        setIsStrikethrough(selection.hasFormat('strikethrough'));
        setIsCode(selection.hasFormat('code'));
        // Check if selection contains a link
        const nodes = selection.getNodes();
        const isLinkNode = nodes.some(node => {
          const parent = node.getParent();
          return $isLinkNode(parent) || $isLinkNode(node);
        });
        setIsLink(isLinkNode);
      }
    });
  }, [editor]);

  // Listen for selection changes to update format state
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateFormatState();
      });
    });
  }, [editor, updateFormatState]);

  // Selection preservation
  const { saveSelection, restoreSelection } = usePreserveSelection(editor);

  // Ref for the toolbar container to detect clicks inside vs outside
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Stable getter function for the toolbar element
  const getToolbarElement = useCallback(() => toolbarRef.current, []);

  // Track mouse state for detecting ongoing drag selections (only outside toolbar)
  const isMouseDownOutside = useIsMouseDownOutside(getToolbarElement);

  // Floating UI setup
  const {
    refs: { setReference, setFloating },
    strategy,
    x,
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

  // Reset width when selection is removed, show button when selection appears
  useEffect(() => {
    if (range === null) {
      setFullWidth(false);
      setToolbarState('closed');
    } else {
      // Only transition from closed to button, not from ai to button
      setToolbarState(prev => (prev === 'closed' ? 'button' : prev));
    }
  }, [range]);

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

  // Handle close
  const handleClose = useCallback(() => {
    setToolbarState('button');
    setFullWidth(false);
  }, []);

  // Handle open AI
  const handleOpenAI = useCallback(() => {
    setToolbarState('ai');
    setFullWidth(true);
  }, []);

  // Text formatting handlers
  const handleFormat = useCallback(
    (format: TextFormatType) => {
      editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
    },
    [editor],
  );

  const handleToggleLink = useCallback(() => {
    if (isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, 'https://');
    }
  }, [editor, isLink]);

  // Don't render if no selection, mouse is still down outside toolbar (dragging), or toolbar closed
  if (range === null || isMouseDownOutside || toolbarState === 'closed') {
    return null;
  }

  const portalTarget = portalContainer || document.body;

  return createPortal(
    <Box
      ref={(el: HTMLDivElement | null) => {
        setFloating(el);
        (toolbarRef as React.MutableRefObject<HTMLDivElement | null>).current =
          el;
      }}
      sx={{
        pointerEvents: 'auto',
        zIndex: 50,
        position: strategy,
        top: 0,
        left:
          fullWidth && editor._rootElement
            ? editor._rootElement.getBoundingClientRect().left + MARGIN_X
            : 0,
        transform: fullWidth
          ? `translate3d(0, ${Math.round(y)}px, 0)`
          : `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`,
        width:
          fullWidth && editor._rootElement
            ? editor._rootElement.getBoundingClientRect().width - MARGIN_X * 2
            : 'auto',
        minWidth: fullWidth ? undefined : 'max-content',
      }}
    >
      {toolbarState === 'button' && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            p: 1,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: 'border.default',
            boxShadow: 'shadow.large',
            bg: 'canvas.default',
          }}
        >
          {/* Text formatting buttons */}
          <IconButton
            icon={BoldIcon}
            aria-label="Bold"
            variant="invisible"
            onClick={() => handleFormat('bold')}
            sx={{
              color: isBold ? 'accent.fg' : 'fg.muted',
              bg: isBold ? 'accent.subtle' : 'transparent',
            }}
          />
          <IconButton
            icon={ItalicIcon}
            aria-label="Italic"
            variant="invisible"
            onClick={() => handleFormat('italic')}
            sx={{
              color: isItalic ? 'accent.fg' : 'fg.muted',
              bg: isItalic ? 'accent.subtle' : 'transparent',
            }}
          />
          <IconButton
            icon={StrikethroughIcon}
            aria-label="Strikethrough"
            variant="invisible"
            onClick={() => handleFormat('strikethrough')}
            sx={{
              color: isStrikethrough ? 'accent.fg' : 'fg.muted',
              bg: isStrikethrough ? 'accent.subtle' : 'transparent',
            }}
          />
          <IconButton
            icon={CodeIcon}
            aria-label="Code"
            variant="invisible"
            onClick={() => handleFormat('code')}
            sx={{
              color: isCode ? 'accent.fg' : 'fg.muted',
              bg: isCode ? 'accent.subtle' : 'transparent',
            }}
          />
          <IconButton
            icon={LinkIcon}
            aria-label="Link"
            variant="invisible"
            onClick={handleToggleLink}
            sx={{
              color: isLink ? 'accent.fg' : 'fg.muted',
              bg: isLink ? 'accent.subtle' : 'transparent',
            }}
          />
          {/* Divider */}
          <Box
            sx={{
              width: '1px',
              height: '16px',
              bg: 'border.default',
              mx: 1,
            }}
          />
          {/* AI Assistant button */}
          <IconButton
            icon={SparkleFillIcon}
            aria-label="AI Assistant"
            variant="invisible"
            onClick={handleOpenAI}
            sx={{ color: 'fg.muted' }}
          />
        </Box>
      )}

      {toolbarState === 'ai' && (
        <ChatInline
          selectedText={selectedText}
          protocol={protocol}
          onReplaceSelection={handleReplaceSelection}
          onInsertInline={handleInsertInline}
          onInsertBelow={handleInsertBelow}
          onClose={handleClose}
          onSaveSelection={saveSelection}
          onRestoreSelection={restoreSelection}
        />
      )}
    </Box>,
    portalTarget,
  );
}

export default ChatInlinePlugin;
