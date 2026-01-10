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
  $isTextNode,
  $createParagraphNode,
  $createTextNode,
  TextNode,
  LexicalEditor,
  LexicalNode,
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
 */
function useRange() {
  const [editor] = useLexicalComposerContext();
  const [range, setRange] = useState<Range | null>(null);
  const rangeRef = useRef<Range | null>(null);

  useEffect(() => {
    return editor.registerUpdateListener(({ tags }) => {
      editor.getEditorState().read(() => {
        // Ignore collaboration updates
        if (tags.has('collaboration')) return;

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          setRange(null);
          rangeRef.current = null;
          return;
        }

        const { anchor, focus } = selection;
        const domRange = createDOMRange(
          editor,
          anchor.getNode(),
          anchor.offset,
          focus.getNode(),
          focus.offset,
        );
        setRange(domRange);
        rangeRef.current = domRange;
      });
    });
  }, [editor]);

  return { range, rangeRef };
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
    const handleMouseUp = () => setIsMouseDownOutside(false);

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
 * Get DOM text node from element
 */
function getDOMTextNode(element: Node | null): Text | null {
  let node = element;
  while (node !== null) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node as Text;
    }
    node = node.firstChild;
  }
  return null;
}

/**
 * Get index of node within parent
 */
function getDOMIndexWithinParent(node: ChildNode): [ParentNode, number] {
  const parent = node.parentNode;
  if (parent === null) {
    throw new Error('Node has no parent');
  }
  return [parent, Array.from(parent.childNodes).indexOf(node)];
}

/**
 * Create DOM range from Lexical selection
 */
function createDOMRange(
  editor: LexicalEditor,
  anchorNode: LexicalNode,
  _anchorOffset: number,
  focusNode: LexicalNode,
  _focusOffset: number,
): Range | null {
  const anchorKey = anchorNode.getKey();
  const focusKey = focusNode.getKey();
  const range = document.createRange();
  let anchorDOM: Node | Text | null = editor.getElementByKey(anchorKey);
  let focusDOM: Node | Text | null = editor.getElementByKey(focusKey);
  let anchorOffset = _anchorOffset;
  let focusOffset = _focusOffset;

  if ($isTextNode(anchorNode)) {
    anchorDOM = getDOMTextNode(anchorDOM);
  }
  if ($isTextNode(focusNode)) {
    focusDOM = getDOMTextNode(focusDOM);
  }

  if (
    anchorNode === undefined ||
    focusNode === undefined ||
    anchorDOM === null ||
    focusDOM === null
  ) {
    return null;
  }

  if (anchorDOM.nodeName === 'BR') {
    [anchorDOM, anchorOffset] = getDOMIndexWithinParent(anchorDOM as ChildNode);
  }
  if (focusDOM.nodeName === 'BR') {
    [focusDOM, focusOffset] = getDOMIndexWithinParent(focusDOM as ChildNode);
  }

  const firstChild = anchorDOM.firstChild;
  if (
    anchorDOM === focusDOM &&
    firstChild !== null &&
    firstChild.nodeName === 'BR' &&
    anchorOffset === 0 &&
    focusOffset === 0
  ) {
    focusOffset = 1;
  }

  try {
    range.setStart(anchorDOM, anchorOffset);
    range.setEnd(focusDOM, focusOffset);
  } catch {
    return null;
  }

  if (
    range.startContainer === range.endContainer &&
    range.startOffset === range.endOffset
  ) {
    return null;
  }

  return range;
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

  // Reset width when selection is removed
  useEffect(() => {
    if (range === null) {
      setFullWidth(false);
      setToolbarState('closed');
    } else if (toolbarState === 'closed') {
      setToolbarState('button');
    }
  }, [range, toolbarState]);

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
