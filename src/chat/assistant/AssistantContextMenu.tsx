/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The assistant's own menu (LOOP T-27): right-click the character — or
 * Shift+F10 or the ContextMenu key while it has the focus, or a long press on
 * a touch screen — and a menu opens where the pointer is, with what applies
 * to this agent on this page: inspect it, open the conversation, the
 * balloon's display, the suggestions, stop the turn, a new conversation,
 * another character, its voice, send it away, put it back, about it. Esc or
 * a click outside closes it.
 *
 * Its entries are composed from what the host passes ({@link
 * AssistantMenuItem}s): a host or a plugin adds its own (`contextMenu`; in
 * the LOOP workspace, the `loop.assistant.menu` contribution point).
 *
 * @module chat/assistant/AssistantContextMenu
 */

import type { JSX, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ActionList, ActionMenu } from '@primer/react';
import type { Icon } from '@primer/octicons-react';

/** The longest a description is drawn in the menu, in characters. */
export const MENU_DESCRIPTION_MAX = 60;

/**
 * A description short enough for one line of the menu: whole words up to
 * {@link MENU_DESCRIPTION_MAX} characters, then an ellipsis. The full text
 * stays in its tooltip.
 */
export function shortDescription(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= MENU_DESCRIPTION_MAX) {
    return flat;
  }
  const cut = flat.slice(0, MENU_DESCRIPTION_MAX);
  const space = cut.lastIndexOf(' ');
  return `${(space > MENU_DESCRIPTION_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?—-]+$/, '')}…`;
}

/** One entry of the assistant's menu. */
export type AssistantMenuItem = {
  /** Stable id: `inspect`, `stop`, a plugin's own. */
  id: string;
  label: string;
  /** Said under the label, smaller. */
  description?: string;
  /** An octicon, before the label. */
  icon?: Icon;
  onSelect: () => void;
  /**
   * Checkable: `true` or `false` makes it one of a choice — the entries of
   * its group are a radio group, one checked.
   */
  checked?: boolean;
  disabled?: boolean;
  /** The group it is listed in, by its heading; ungrouped entries come first. */
  group?: string;
  /** Drawn as a danger: send away. */
  danger?: boolean;
};

/** The entries by group, in the order their first entry came. */
export function menuGroups(
  items: readonly AssistantMenuItem[],
): { group: string | undefined; items: AssistantMenuItem[] }[] {
  const groups: { group: string | undefined; items: AssistantMenuItem[] }[] =
    [];
  for (const item of items) {
    const found = groups.find(group => group.group === item.group);
    if (found) {
      found.items.push(item);
    } else {
      groups.push({ group: item.group, items: [item] });
    }
  }
  // The ungrouped come first.
  return [
    ...groups.filter(group => group.group === undefined),
    ...groups.filter(group => group.group !== undefined),
  ];
}

/** Whether a key opens the menu: Shift+F10, or the ContextMenu key. */
export function opensContextMenu(event: {
  key: string;
  shiftKey: boolean;
}): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}

/** How long a touch is held before the menu opens, in ms. */
export const LONG_PRESS_MS = 550;

export type AssistantContextMenuProps = {
  /** Where it opens, in the window's coordinates; closed when `null`. */
  at: { x: number; y: number } | null;
  items: readonly AssistantMenuItem[];
  /** It closed: Esc, a click outside, or an entry chosen. */
  onClose: () => void;
  /** Where the focus goes back to once it closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Its name, for a screen reader: `Paper clip's menu`. */
  label: string;
};

/** The menu, anchored at a point of the window. */
export function AssistantContextMenu({
  at,
  items,
  onClose,
  returnFocusRef,
  label,
}: AssistantContextMenuProps): JSX.Element | null {
  const anchor = useRef<HTMLDivElement>(null);
  const open = at !== null;
  useEffect(() => {
    if (!open) {
      return;
    }
    // A scroll moves what it was opened on: it closes.
    const close = () => onClose();
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open, onClose]);
  if (!at || typeof document === 'undefined') {
    return null;
  }
  const groups = menuGroups(items);
  return (
    <>
      {createPortal(
        <div
          ref={anchor}
          aria-hidden="true"
          data-assistant-menu-anchor=""
          style={{
            position: 'fixed',
            left: at.x,
            top: at.y,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          }}
        />,
        document.body,
      )}
      <ActionMenu
        open
        anchorRef={anchor as RefObject<HTMLElement>}
        onOpenChange={next => {
          if (!next) {
            onClose();
            requestAnimationFrame(() => returnFocusRef?.current?.focus());
          }
        }}
      >
        <ActionMenu.Overlay width="auto" data-assistant-menu="">
          <ActionList aria-label={label}>
            {groups.map(({ group, items: entries }, index) => {
              const choice = entries.some(item => item.checked !== undefined);
              const list = entries.map(item => (
                <ActionList.Item
                  key={item.id}
                  data-assistant-menu-item={item.id}
                  disabled={item.disabled}
                  variant={item.danger ? 'danger' : 'default'}
                  {...(choice ? { selected: !!item.checked } : {})}
                  onSelect={() => {
                    item.onSelect();
                    onClose();
                    requestAnimationFrame(() =>
                      returnFocusRef?.current?.focus(),
                    );
                  }}
                >
                  {item.icon && (
                    <ActionList.LeadingVisual>
                      <item.icon />
                    </ActionList.LeadingVisual>
                  )}
                  {item.label}
                  {item.description && (
                    <ActionList.Description variant="block">
                      <span title={item.description}>
                        {shortDescription(item.description)}
                      </span>
                    </ActionList.Description>
                  )}
                </ActionList.Item>
              ));
              return (
                <ActionList.Group
                  key={group ?? `ungrouped-${index}`}
                  {...(choice ? { selectionVariant: 'single' as const } : {})}
                >
                  {group && (
                    <ActionList.GroupHeading>{group}</ActionList.GroupHeading>
                  )}
                  {list}
                </ActionList.Group>
              );
            })}
          </ActionList>
        </ActionMenu.Overlay>
      </ActionMenu>
    </>
  );
}

export default AssistantContextMenu;
