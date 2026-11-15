/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The tools menu's frontend tools, each with its mark on its name's line
 * (the user, 15 November 2026): the mark is the row's leading visual, never
 * drawn inside the label above the name.
 */

// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BaseStyles, ThemeProvider } from '@primer/react';
import { ToolsMenu } from '../menus/ToolsMenu';
import { FRONTEND_TOOL_CATALOG } from '../../../specs/frontendTools';
import { hasMark, marksOfFrontendTool } from '../../marks';

afterEach(cleanup);

/** A frontend tool the catalogue marks. */
const marked = Object.values(FRONTEND_TOOL_CATALOG)
  .flatMap(spec => spec.toolset ?? [])
  .find(name => hasMark(marksOfFrontendTool(name)));

describe('the tools menu’s frontend tools', () => {
  it('draws each mark as the row’s leading visual, beside the name', () => {
    expect(marked).toBeTruthy();
    const name = marked as string;
    render(
      <ThemeProvider>
        <BaseStyles>
          <ToolsMenu
            codemodeEnabled={false}
            mcpServers={[]}
            enabledMcpTools={new Map()}
            enabledMcpToolCount={0}
            onToggleMcpTool={() => undefined}
            onToggleAllMcpServerTools={() => undefined}
            approvedMcpTools={new Map()}
            onToggleMcpToolApproval={() => undefined}
            availableTools={[]}
            availableFrontendTools={[{ id: name, name } as never]}
          />
        </BaseStyles>
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
    const label = screen.getByText(name);
    const row = label.closest('li') as HTMLElement;
    const leading = row.querySelector(
      '[data-component="ActionList.LeadingVisual"], [class*="LeadingVisual"]',
    );
    expect(leading).toBeTruthy();
    // Placed as the row's leading visual: not inside the name's label.
    expect(label.contains(leading)).toBe(false);
    expect(leading?.contains(label)).toBe(false);
  });
});
