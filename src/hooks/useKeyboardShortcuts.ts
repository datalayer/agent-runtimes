/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Keyboard shortcuts hook for Chat.
 * Provides keyboard shortcut handling for the chat interface.
 *
 * @module components/chat/hooks/useKeyboardShortcuts
 */

import { useEffect, useCallback } from 'react';

/**
 * Platform detection - check if running on macOS
 */
function isMacOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

/**
 * Keyboard shortcut configuration
 */
export interface KeyboardShortcut {
  /** Key to press (e.g., 'k', 'Escape') */
  key: string;

  /** Whether Ctrl (or Cmd on Mac) is required */
  ctrlOrCmd?: boolean;

  /** Whether Shift is required */
  shift?: boolean;

  /** Whether Alt is required */
  alt?: boolean;

  /** Callback when shortcut is triggered */
  handler: () => void;

  /** Description for accessibility */
  description?: string;

  /** Whether shortcut works in input fields */
  allowInInput?: boolean;
}

/**
 * Hook options
 */
export interface UseKeyboardShortcutsOptions {
  /** Whether shortcuts are enabled */
  enabled?: boolean;

  /** Shortcuts to register */
  shortcuts: KeyboardShortcut[];
}

/**
 * Hook to handle keyboard shortcuts
 */
export function useKeyboardShortcuts({
  enabled = true,
  shortcuts,
}: UseKeyboardShortcutsOptions): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      const target = event.target as HTMLElement;
      const isInInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        // Skip if in input and not allowed
        if (isInInput && !shortcut.allowInInput) {
          // Exception: always allow Escape
          if (shortcut.key !== 'Escape') {
            continue;
          }
        }

        // Check key match
        if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
          continue;
        }

        // Check modifiers
        const ctrlOrCmdPressed = isMacOS() ? event.metaKey : event.ctrlKey;
        if (shortcut.ctrlOrCmd && !ctrlOrCmdPressed) {
          continue;
        }
        if (
          !shortcut.ctrlOrCmd &&
          ctrlOrCmdPressed &&
          shortcut.key !== 'Escape'
        ) {
          continue;
        }
        if (shortcut.shift && !event.shiftKey) {
          continue;
        }
        if (shortcut.alt && !event.altKey) {
          continue;
        }

        // Prevent default and execute handler
        event.preventDefault();
        event.stopPropagation();
        shortcut.handler();
        break;
      }
    },
    [enabled, shortcuts],
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}

/**
 * Default chat shortcuts
 */
export function useChatKeyboardShortcuts({
  onToggle,
  onNewChat,
  onClear,
  onFocusInput,
  enabled = true,
}: {
  onToggle?: () => void;
  onNewChat?: () => void;
  onClear?: () => void;
  onFocusInput?: () => void;
  enabled?: boolean;
}): void {
  const shortcuts: KeyboardShortcut[] = [];

  // Toggle chat: Ctrl/Cmd + K
  if (onToggle) {
    shortcuts.push({
      key: 'k',
      ctrlOrCmd: true,
      handler: onToggle,
      description: 'Toggle chat sidebar',
    });
  }

  // New chat: Ctrl/Cmd + Shift + N
  if (onNewChat) {
    shortcuts.push({
      key: 'n',
      ctrlOrCmd: true,
      shift: true,
      handler: onNewChat,
      description: 'Start new chat',
    });
  }

  // Clear: Ctrl/Cmd + Shift + Delete
  if (onClear) {
    shortcuts.push({
      key: 'Backspace',
      ctrlOrCmd: true,
      shift: true,
      handler: onClear,
      description: 'Clear chat messages',
    });
  }

  // Focus input: /
  if (onFocusInput) {
    shortcuts.push({
      key: '/',
      handler: onFocusInput,
      description: 'Focus chat input',
    });
  }

  // Close on Escape
  if (onToggle) {
    shortcuts.push({
      key: 'Escape',
      handler: onToggle,
      description: 'Close chat sidebar',
      allowInInput: true,
    });
  }

  useKeyboardShortcuts({ enabled, shortcuts });
}

/**
 * Get shortcut display string
 */
export function getShortcutDisplay(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  const isMac = isMacOS();

  if (shortcut.ctrlOrCmd) {
    parts.push(isMac ? '⌘' : 'Ctrl');
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }

  // Format key name
  let keyDisplay = shortcut.key.toUpperCase();
  if (shortcut.key === 'Escape') keyDisplay = 'Esc';
  if (shortcut.key === 'Backspace') keyDisplay = isMac ? '⌫' : 'Del';

  parts.push(keyDisplay);

  return parts.join(isMac ? '' : '+');
}

export default useKeyboardShortcuts;
