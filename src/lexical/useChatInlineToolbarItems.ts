/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * useChatInlineToolbarItems - Hook that creates ToolbarItem[] for the
 * FloatingTextFormatToolbarPlugin's extraItems prop.
 *
 * Registers an AI sparkle button + dropdown with AI actions
 * (Improve, Fix, Simplify, Add detail, Summarise, Explain, Translate)
 * into the floating inline toolbar.
 *
 * Usage:
 * ```tsx
 * const { toolbarItems, isAiOpen, submitPrompt, closeAi } = useChatInlineToolbarItems();
 *
 * <FloatingTextFormatToolbarPlugin
 *   anchorElem={floatingAnchorElem}
 *   setIsLinkEditMode={setIsLinkEditMode}
 *   extraItems={toolbarItems}
 * />
 *
 * {isAiOpen && <ChatInlinePlugin ... />}
 * ```
 *
 * @module lexical/useChatInlineToolbarItems
 */

import { useState, useMemo, useCallback } from 'react';
import {
  SparkleFillIcon,
  PencilIcon,
  CheckIcon,
  XIcon,
  PlusIcon,
  CopyIcon,
  SyncIcon,
  InfoIcon,
} from '@primer/octicons-react';
import type { ToolbarItem } from '@datalayer/primer-addons';

/**
 * AI action groups for the toolbar dropdown.
 */
const AI_ACTIONS = {
  modify: [
    {
      key: 'ai-improve',
      label: 'Improve writing',
      prompt: 'Improve the quality of the text',
      icon: PencilIcon,
    },
    {
      key: 'ai-fix',
      label: 'Fix mistakes',
      prompt: 'Fix any typos or general errors in the text',
      icon: CheckIcon,
    },
    {
      key: 'ai-simplify',
      label: 'Simplify',
      prompt: 'Shorten the text, simplifying it',
      icon: XIcon,
    },
    {
      key: 'ai-detail',
      label: 'Add more detail',
      prompt: 'Lengthen the text, going into more detail',
      icon: PlusIcon,
    },
  ],
  generate: [
    {
      key: 'ai-summarise',
      label: 'Summarise',
      prompt: 'Summarise the text',
      icon: CopyIcon,
    },
    {
      key: 'ai-explain',
      label: 'Explain',
      prompt: 'Explain what the text is about',
      icon: InfoIcon,
    },
  ],
  translate: [
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
    key: `ai-translate-${lang.toLowerCase()}`,
    label: lang,
    prompt: `Translate text into the ${lang} language`,
    icon: SyncIcon,
  })),
};

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
 * Returns toolbar items (divider + AI dropdown + sparkle button) and
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
    const allOptions = [
      ...AI_ACTIONS.modify.map(action => ({
        key: action.key,
        label: action.label,
        icon: action.icon,
        onClick: () => submitPrompt(action.prompt),
      })),
      ...AI_ACTIONS.generate.map(action => ({
        key: action.key,
        label: action.label,
        icon: action.icon,
        onClick: () => submitPrompt(action.prompt),
      })),
      ...AI_ACTIONS.translate.map(action => ({
        key: action.key,
        label: action.label,
        icon: action.icon,
        onClick: () => submitPrompt(action.prompt),
      })),
    ];

    return [
      {
        key: 'ai-divider',
        type: 'divider' as const,
        order: 900,
      },
      {
        key: 'ai-actions',
        type: 'dropdown' as const,
        order: 901,
        ariaLabel: 'AI Actions',
        title: 'AI Actions',
        icon: SparkleFillIcon,
        options: allOptions,
      },
    ];
  }, [submitPrompt]);

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
