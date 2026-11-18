/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-page-sheet` — a spreadsheet the agent fills in
 * the conversation, with frontend tools run in the page (the user, 18
 * November 2026: "add to the accountant the frontend tools to create
 * spreadsheets").
 *
 * The plugin hands the chat's agent the sheet tools (`pageTools/sheet`:
 * a sheet with named columns, ranges written and read, formats, frozen
 * panes, tabs, a chart), bound to the conversation's workbook, and draws
 * their calls: the last one that changed the workbook draws it, live, as
 * Datalayer Cells draws one — editable, its formulas computed by Cells'
 * engine, exported as CSV — and each call before is a line. Nothing leaves
 * the page: these tools reach no books and no file.
 *
 * @module apps/plugins/page-sheet
 */

import { Suspense, lazy, type JSX } from 'react';
import { TableIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CallLine,
  cardRole,
  toolOf,
  useConversationBound,
} from '../../pageTools/cards';
import { SHEET_TOOL_NAMES } from '../../pageTools/sheetSchemas';
import { defineToolCardPlugin } from '../../toolCards/kit';
import { PAGE_SHEET, pageSheetTools } from './store';

export const PAGE_SHEET_PLUGIN_NAME = '@datalayer/loop-plugin-page-sheet';

const SheetStage = lazy(() => import('./SheetStage'));

export const PAGE_SHEET_LINES = {
  writing: 'Writing the sheet…',
} as const;

const said = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : '';

/** What one call did, in a line. */
export function sheetCallSays(
  tool: string,
  args: Record<string, unknown>,
): string {
  const tab = said(args.tab) ? ` on “${said(args.tab)}”` : '';
  switch (tool) {
    case 'sheet_create': {
      const columns = Array.isArray(args.columns) ? args.columns.length : 0;
      return `Started the sheet${said(args.name) ? ` “${said(args.name)}”` : ''}, ${columns} columns`;
    }
    case 'sheet_write_range': {
      const rows = Array.isArray(args.values) ? args.values.length : 0;
      return `Wrote ${rows === 1 ? '1 row' : `${rows} rows`} from ${said(args.range) || '?'}${tab}`;
    }
    case 'sheet_format_range':
      return `Formatted ${said(args.range) || '?'}${tab}: ${[
        said(args.format),
        said(args.currency).toUpperCase(),
        args.bold === true ? 'bold' : '',
        said(args.align),
      ]
        .filter(Boolean)
        .join(', ')}`;
    case 'sheet_freeze':
      return `Froze ${Number(args.rows ?? 0)} rows and ${Number(args.columns ?? 0)} columns${tab}`;
    case 'sheet_add_tab':
      return `Added the tab “${said(args.name)}”`;
    case 'sheet_show_tab':
      return `Showed the tab “${said(args.name)}”`;
    case 'sheet_insert_chart':
      return `Drew a ${said(args.type) || 'column'} chart of ${said(args.range) || '?'}`;
    default:
      return `Read ${said(args.range) || 'the sheet'}${tab}`;
  }
}

export function PageSheetCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const { state, latest } = useConversationBound(PAGE_SHEET, SHEET_TOOL_NAMES);
  const tool = toolOf(context, SHEET_TOOL_NAMES);
  const role = cardRole(context, latest);
  if (role === 'default') {
    return <>{context.defaultUI}</>;
  }
  const line = (
    <CallLine icon={TableIcon} busy={role === 'pending'} data={tool}>
      {role === 'pending'
        ? PAGE_SHEET_LINES.writing
        : sheetCallSays(tool, context.args ?? {})}
    </CallLine>
  );
  if (role !== 'live' || !state) {
    return line;
  }
  return (
    <>
      {line}
      <Suspense fallback={<Box minHeight={420} aria-busy="true" />}>
        <SheetStage model={state.model} />
      </Suspense>
    </>
  );
}

export const PageSheetPlugin = defineToolCardPlugin({
  id: 'page-sheet',
  displayName: 'Sheet in the page',
  description:
    'A spreadsheet the agent fills in the conversation, with tools run in the page.',
  octicon: 'table',
  emoji: '\u{1F4D1}',
  tools: SHEET_TOOL_NAMES,
  Card: PageSheetCard,
  frontendTools: pageSheetTools(),
});

export default PageSheetPlugin;
