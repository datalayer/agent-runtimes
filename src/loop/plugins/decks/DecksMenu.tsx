/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The decks menu in the composer's action row.
 *
 * One icon beside the prompt: the decks the catalog knows, to open one, and
 * the plugin's commands — the same ones the palette lists and the agent
 * calls — with their keystrokes. Read from the reactor rather than written
 * out here, so a command the plugin adds is in the menu without this file
 * changing.
 */

import type { JSX } from 'react';
import { ActionList, ActionMenu, IconButton } from '@primer/react';
// A stack of slides — not the project icon, which the Deck view button
// beside this menu already wears.
import { StackIcon } from '@primer/octicons-react';
import { useReactorPlatform } from '@datalayer/reactor/react';
import { deckId } from '@datalayer/decks';
import {
  openDeck,
  useDeckEntries,
  useDecksState,
} from '@datalayer/decks/plugin';
import { chooseEditor } from '../shell/editorChoice';
import { DECK_SURFACE_ID } from './deckTools';

/** Commands that take an argument; a menu row cannot supply one. */
const NEEDS_ARGUMENT = new Set(['decks.open', 'decks.goToSlide']);

export default function DecksMenu(): JSX.Element | null {
  const reactor = useReactorPlatform();
  const decks = useDeckEntries();
  const { selected } = useDecksState();
  const commands = reactor
    .listCommands()
    .filter(
      command =>
        command.category === 'Decks' && !NEEDS_ARGUMENT.has(command.id),
    );
  if (commands.length === 0 && decks.length === 0) {
    return null;
  }
  const show = () => {
    if (!chooseEditor(DECK_SURFACE_ID)) {
      console.warn('[loop] No chat is on screen to show the deck beside.');
    }
  };
  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <IconButton
          icon={StackIcon}
          aria-label="Decks"
          size="small"
          variant="invisible"
        />
      </ActionMenu.Anchor>
      <ActionMenu.Overlay width="medium">
        <ActionList>
          {decks.length > 0 ? (
            <ActionList.Group>
              <ActionList.GroupHeading>Open a deck</ActionList.GroupHeading>
              {decks.map(entry => {
                const id = deckId(entry);
                return (
                  <ActionList.Item
                    key={id}
                    selected={id === selected}
                    onSelect={() => {
                      openDeck(id);
                      show();
                    }}
                  >
                    {entry.spec.deck.title}
                    <ActionList.Description variant="block">
                      {id} · {entry.spec.slides.length} slides
                    </ActionList.Description>
                  </ActionList.Item>
                );
              })}
            </ActionList.Group>
          ) : null}
          {decks.length > 0 && commands.length > 0 ? (
            <ActionList.Divider />
          ) : null}
          {commands.length > 0 ? (
            <ActionList.Group>
              <ActionList.GroupHeading>Commands</ActionList.GroupHeading>
              {commands.map(command => (
                <ActionList.Item
                  key={command.id}
                  onSelect={() => {
                    void reactor.executeCommand(command.id).then(() => {
                      // A command that changes what is on the deck wants the
                      // deck on screen; the list command shows the empty
                      // state there too, beside the sidebar's list.
                      show();
                    });
                  }}
                >
                  {command.name}
                  {command.description ? (
                    <ActionList.Description variant="block">
                      {command.description}
                    </ActionList.Description>
                  ) : null}
                  {command.keybinding ? (
                    <ActionList.TrailingVisual>
                      {command.keybinding}
                    </ActionList.TrailingVisual>
                  ) : null}
                </ActionList.Item>
              ))}
            </ActionList.Group>
          ) : null}
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}
