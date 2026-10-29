/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent's openers, one click from the box.
 *
 * Beside the agents, tools, skills and model menus, because it belongs to
 * the same question — what should the next message be — and because the
 * chips and the empty state that also offer these are not always on screen:
 * on a page layout the transcript is a side panel, and after the first
 * message the empty state is gone. Picking one *prompts* the box with the
 * text; it does not send. The person reads it, edits it if they like, and
 * sends it themselves.
 *
 * @module chat/prompt/menus/SuggestionsMenu
 */

import { Text, Button, ActionMenu, ActionList, Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { LightBulbIcon } from '@primer/octicons-react';
import { groupSuggestions } from '../../display/groupSuggestions';

/** One opener: what the menu shows, and what lands in the box. */
export type PromptSuggestion = {
  title: string;
  message: string;
  /** A section this opener sits under — the addressed member's own, say. */
  group?: string;
};

export function SuggestionsMenu({
  suggestions,
  onPick,
}: {
  suggestions: PromptSuggestion[];
  /** Put this text in the box. Not a send. */
  onPick: (message: string) => void;
}) {
  const summary =
    suggestions.length === 0 ? 'none' : `${suggestions.length} to choose from`;

  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <Tooltip text={`Suggestions — ${summary}`} direction="n">
          <Button
            type="button"
            variant="invisible"
            size="small"
            aria-label={`Suggestions — ${summary}`}
            leadingVisual={LightBulbIcon}
          >
            <Text sx={{ fontSize: 0 }}>{suggestions.length}</Text>
          </Button>
        </Tooltip>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay side="outside-top" align="start" width="large">
        <Box maxHeight="60vh" overflowY="auto">
          <ActionList>
            {suggestions.length === 0 ? (
              <ActionList.Item disabled>
                <Text sx={{ color: 'fg.muted' }}>
                  This agent offers no suggestions.
                </Text>
              </ActionList.Item>
            ) : (
              // In blocks: the team's openers, then the addressed member's
              // own under its name — the same shape the empty state draws.
              // No `as` on the heading: inside a menu Primer refuses one.
              groupSuggestions(suggestions).map(block => (
                <ActionList.Group key={block.group ?? ''}>
                  {block.group ? (
                    <ActionList.GroupHeading>
                      {block.group}
                    </ActionList.GroupHeading>
                  ) : null}
                  {block.items.map(suggestion => (
                    <ActionList.Item
                      key={`${suggestion.title} ${suggestion.message}`}
                      onSelect={() => onPick(suggestion.message)}
                    >
                      {suggestion.title}
                      {/* The message, when the chip's words are not the whole of
                          it — so a person sees what will land in the box. */}
                      {suggestion.message !== suggestion.title ? (
                        <ActionList.Description variant="block">
                          {suggestion.message}
                        </ActionList.Description>
                      ) : null}
                    </ActionList.Item>
                  ))}
                </ActionList.Group>
              ))
            )}
          </ActionList>
        </Box>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

export default SuggestionsMenu;
