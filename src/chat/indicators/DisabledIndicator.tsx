/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The MCP or skills indicator for an anonymous visitor (the user, 15
 * November 2026): a dot in the warning colour that opens the list of what
 * the agent has and a visitor cannot use, each row labelled *Disabled* — a
 * visitor's runtime allows no connection and only reads.
 *
 * @module chat/indicators/DisabledIndicator
 */

import type { JSX } from 'react';
import { ActionList, ActionMenu, Label, Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ANONYMOUS_WORDS } from '../anonymous/anonymousMode';

export function DisabledIndicator({
  names,
  title,
  kind,
}: {
  /** What a visitor cannot use, by name. */
  names: string[];
  /** The list's heading and the dot's name. */
  title: string;
  /** What the rows are, for the page's tests. */
  kind: 'mcp' | 'skills';
}): JSX.Element | null {
  if (names.length === 0) {
    return null;
  }
  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <Tooltip text={title} direction="n">
          <button
            type="button"
            aria-label={title}
            data-disabled-indicator={kind}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              padding: 0,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              lineHeight: 0,
            }}
          >
            <Box
              as="span"
              display="inline-block"
              width={12}
              height={12}
              borderRadius="50%"
              bg="attention.emphasis"
              flexShrink={0}
            />
          </button>
        </Tooltip>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay side="outside-top" align="end" width="medium">
        <ActionList>
          <ActionList.Group title={title}>
            {names.map(name => (
              <ActionList.Item key={name} disabled>
                {name}
                <ActionList.TrailingVisual>
                  <Label variant="attention">{ANONYMOUS_WORDS.disabled}</Label>
                </ActionList.TrailingVisual>
              </ActionList.Item>
            ))}
          </ActionList.Group>
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

export default DisabledIndicator;
