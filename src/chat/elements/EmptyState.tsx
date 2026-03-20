/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * EmptyState — Placeholder content shown when the chat has no messages.
 *
 * Supports a custom render function, icon overrides, description text, and
 * clickable suggestion pills.
 *
 * @module components/chat/elements/EmptyState
 */

import { type ReactNode } from 'react';
import { Text, LabelGroup, Label, Truncate } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { AiAgentIcon } from '@datalayer/icons-react';

import type { EmptyStateConfig, Suggestion } from '../../types/chat';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatEmptyStateProps {
  /** Empty-state configuration (icon, title, subtitle, render) */
  emptyState?: EmptyStateConfig;
  /** Brand icon override (falls back to AiAgentIcon) */
  brandIcon?: ReactNode;
  /** Description text for the subtitle */
  description: string;
  /** Suggestion pills */
  suggestions?: Suggestion[];
  /** Called when a suggestion is clicked and should be auto-submitted */
  onSuggestionSubmit?: (suggestion: Suggestion) => void;
  /** Called when a suggestion is clicked but should only fill the input */
  onSuggestionFill?: (message: string) => void;
  /** Whether clicking a suggestion auto-submits it */
  submitOnSuggestionClick?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatEmptyState({
  emptyState,
  brandIcon,
  description,
  suggestions,
  onSuggestionSubmit,
  onSuggestionFill,
  submitOnSuggestionClick = true,
}: ChatEmptyStateProps) {
  // Custom render takes precedence
  if (emptyState?.render) {
    return <>{emptyState.render()}</>;
  }

  const handleSuggestionClick = (suggestion: Suggestion) => {
    if (submitOnSuggestionClick) {
      onSuggestionSubmit?.(suggestion);
    } else {
      onSuggestionFill?.(suggestion.message);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        p: 4,
        color: 'fg.muted',
        textAlign: 'center',
        gap: 2,
      }}
    >
      {emptyState?.icon || brandIcon || <AiAgentIcon colored size={48} />}
      <Text sx={{ fontSize: 2 }}>
        {emptyState?.title || 'Start a conversation'}
      </Text>
      {(emptyState?.subtitle || description) && (
        <Text sx={{ fontSize: 1 }}>{emptyState?.subtitle || description}</Text>
      )}
      {suggestions && suggestions.length > 0 && (
        <LabelGroup sx={{ mt: 2, justifyContent: 'center' }}>
          {suggestions.map((suggestion, index) => (
            <Label
              key={index}
              variant="accent"
              title={suggestion.title}
              sx={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                '&:hover': {
                  bg: 'accent.emphasis',
                  color: 'var(--button-primary-fgColor-rest)',
                  borderColor: 'accent.emphasis',
                },
              }}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              <Box sx={{ width: 140, maxWidth: 140, minWidth: 140 }}>
                <Truncate title={suggestion.title} maxWidth="100%">
                  {suggestion.title}
                </Truncate>
              </Box>
            </Label>
          ))}
        </LabelGroup>
      )}
    </Box>
  );
}
