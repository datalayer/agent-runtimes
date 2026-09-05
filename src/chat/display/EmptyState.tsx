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
 * @module chat/display/EmptyState
 */

import { type ReactNode } from 'react';
import {
  Text,
  LabelGroup,
  Label,
  Truncate,
  ThemeProvider,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { AiAgentIcon } from '@datalayer/icons-react';

import type { EmptyStateConfig, Suggestion } from '../../types/chat';
import { groupSuggestions } from './groupSuggestions';

export { groupSuggestions } from './groupSuggestions';

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

  /*
   * The openers in blocks: the ungrouped ones first, as the one row they
   * always were, then each group under its own heading in the order the
   * groups first appear. A team's openers and, beneath them, the addressed
   * member's own is the case this draws — and when the host gave the empty
   * state *levels*, each level takes its own group's openers and the blocks
   * below are only what no level claimed.
   */
  const sections = emptyState?.sections ?? [];
  const claimed = new Set(sections.map(section => section.group));
  const blocks = groupSuggestions(
    (suggestions ?? []).filter(
      suggestion =>
        suggestion.group === undefined || !claimed.has(suggestion.group),
    ),
  );

  const chips = (items: Suggestion[]) => (
    <LabelGroup sx={{ justifyContent: 'center' }}>
      {items.map((suggestion, index) => (
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
  );

  return (
    <ThemeProvider>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          // Centred across the column, anchored to its top: the introduction
          // is where a conversation starts, and the first message should
          // appear under it rather than push it around the canvas.
          alignItems: 'center',
          justifyContent: 'flex-start',
          p: 4,
          color: 'fg.muted',
          textAlign: 'center',
          gap: 2,
        }}
      >
        {sections.length > 0 ? (
          /*
           * Levels: the first at full size, the ones under it a step
           * smaller and set off by a rule — a team, then the member of it
           * being addressed, each introducing itself and offering its own
           * openers.
           */
          sections.map((section, level) => (
            <Box
              key={section.group}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                width: '100%',
                ...(level > 0
                  ? {
                      mt: 3,
                      pt: 3,
                      borderTop: '1px solid',
                      borderColor: 'border.muted',
                    }
                  : null),
              }}
            >
              {section.icon}
              <Text
                sx={{
                  fontSize: level === 0 ? 2 : 1,
                  fontWeight: level === 0 ? 'normal' : 'semibold',
                }}
              >
                {section.title}
              </Text>
              {section.subtitle ? (
                <Text sx={{ fontSize: level === 0 ? 1 : 0 }}>
                  {section.subtitle}
                </Text>
              ) : null}
              {(() => {
                const own = (suggestions ?? []).filter(
                  suggestion => suggestion.group === section.group,
                );
                return own.length > 0 ? chips(own) : null;
              })()}
            </Box>
          ))
        ) : (
          <>
            {emptyState?.icon || brandIcon || <AiAgentIcon colored size={48} />}
            <Text sx={{ fontSize: 2 }}>
              {emptyState?.title || 'Start a conversation'}
            </Text>
            {(emptyState?.subtitle || description) && (
              <Text sx={{ fontSize: 1 }}>
                {emptyState?.subtitle || description}
              </Text>
            )}
          </>
        )}
        {blocks.map(block => (
          <Box
            key={block.group ?? ''}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              mt: 2,
            }}
          >
            {block.group ? (
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{block.group}</Text>
            ) : null}
            {chips(block.items)}
          </Box>
        ))}
      </Box>
    </ThemeProvider>
  );
}
