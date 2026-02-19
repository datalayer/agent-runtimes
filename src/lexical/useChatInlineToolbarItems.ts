/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * useChatInlineToolbarItems - Hook that creates ToolbarItem[] for the
 * FloatingTextFormatToolbarPlugin's extraItems prop.
 *
 * Registers an AI sparkle button in the floating inline toolbar.
 * Clicking the sparkle button directly opens the ChatInlinePlugin
 * floating panel, where users can type free-form AI prompts.
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
 *
 * <ChatInlinePlugin
 *   isOpen={isAiOpen}
 *   onClose={closeAi}
 *   pendingPrompt={pendingPrompt}
 *   onPendingPromptConsumed={clearPendingPrompt}
 * />
 * ```
 *
 * @module lexical/useChatInlineToolbarItems
 */

import { useState, useMemo, useCallback } from 'react';
import { SparkleFillIcon } from '@primer/octicons-react';
import type { ToolbarItem } from '@datalayer/primer-addons';

/**
 * Return type for useChatInlineToolbarItems.
 */
export interface ChatInlineToolbarState {
  /** ToolbarItem[] to pass as extraItems to FloatingTextFormatToolbarPlugin */
  toolbarItems: ToolbarItem[];
  /** Whether the AI inline chat panel is open */
  isAiOpen: boolean;
  /** Submit a prompt directly (used by the dropdown actions) */
  submitPrompt: (prompt: string) => void;
  /** The pending prompt (set by dropdown, consumed by ChatInlinePlugin) */
  pendingPrompt: string | null;
  /** Clear the pending prompt after it has been consumed */
  clearPendingPrompt: () => void;
  /** Open the AI panel (with custom prompt input) */
  openAi: () => void;
  /** Close the AI panel */
  closeAi: () => void;
}

/**
 * Hook that creates ToolbarItem[] for AI actions in the floating toolbar.
 *
 * Returns toolbar items (divider + AI sparkle button) and
 * state for controlling the ChatInline panel.
 */
export function useChatInlineToolbarItems(): ChatInlineToolbarState {
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const openAi = useCallback(() => {
    setIsAiOpen(true);
  }, []);

  const closeAi = useCallback(() => {
    setIsAiOpen(false);
    setPendingPrompt(null);
  }, []);

  const submitPrompt = useCallback((prompt: string) => {
    setPendingPrompt(prompt);
    setIsAiOpen(true);
  }, []);

  const clearPendingPrompt = useCallback(() => {
    setPendingPrompt(null);
  }, []);

  const toolbarItems: ToolbarItem[] = useMemo(() => {
    return [
      {
        key: 'ai-divider',
        type: 'divider' as const,
        order: 900,
      },
      {
        key: 'ai-actions',
        type: 'button' as const,
        order: 901,
        ariaLabel: 'AI Actions',
        title: 'AI Actions',
        icon: SparkleFillIcon,
        onClick: openAi,
      },
    ];
  }, [openAi]);

  return {
    toolbarItems,
    isAiOpen,
    submitPrompt,
    pendingPrompt,
    clearPendingPrompt,
    openAi,
    closeAi,
  };
}

export default useChatInlineToolbarItems;
