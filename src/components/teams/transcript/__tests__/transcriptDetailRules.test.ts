/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The drill-down's reading of a span (SCENES S3-01): a tool's name,
 * arguments and result; an A2A ask's words and answer, its failure; the
 * person's turn; and a line with no span, from a recording.
 */

import { describe, expect, it } from 'vitest';
import type { OtelSpan } from '@datalayer/core/lib/otel/types';
import { spanOfLine, transcriptDetailOf } from '../transcriptDetailRules';
import { OPEN_AND_FAILED, SCRIPTED, recorded } from './fixture';

describe('transcriptDetailOf', () => {
  it('reads a failed call: the tool, its arguments, the error, the ids', () => {
    const span: OtelSpan = {
      trace_id: 't9',
      span_id: 's9',
      parent_span_id: 's8',
      span_name: 'execute_tool odoo_accounting_list_invoices',
      service_name: 'Accounting',
      kind: 'INTERNAL',
      start_time: '2026-10-07T12:00:00.000Z',
      end_time: '2026-10-07T12:00:01.500Z',
      duration_ms: 1500,
      status_code: 'ERROR',
      status_message: 'Odoo refused: access denied',
      attributes: {
        'gen_ai.operation.name': 'execute_tool',
        'gen_ai.tool.name': 'odoo_accounting_list_invoices',
        'gen_ai.tool.call.arguments': '{"state":"open"}',
        'gen_ai.tool.call.result': '{"error":"access denied"}',
      },
    };
    const line = {
      key: 's9:called',
      at: Date.parse(span.start_time),
      from: 'Accounting',
      to: 'Odoo',
      kind: 'called' as const,
      text: 'odoo_accounting_list_invoices',
      failed: true,
    };
    expect(spanOfLine(line, [span])).toBe(span);
    const detail = transcriptDetailOf(line, span);
    expect(detail.tool).toEqual({
      name: 'odoo_accounting_list_invoices',
      arguments: '{\n  "state": "open"\n}',
      result: '{\n  "error": "access denied"\n}',
    });
    expect(detail.status).toBe('failed');
    expect(detail.error).toBe('Odoo refused: access denied');
    expect(detail.durationMs).toBe(1500);
    expect(detail.ids).toEqual({
      traceId: 't9',
      spanId: 's9',
      parentSpanId: 's8',
    });
  });

  it('reads an A2A ask and its answer, and the person’s turn', () => {
    const { spans, lines } = recorded(SCRIPTED);
    const ask = transcriptDetailOf(lines[1], spanOfLine(lines[1], spans));
    expect(ask.sent).toBe('Aged receivables as of today, by customer.');
    expect(ask.answered).toBe(
      'Three customers owe 12,400 EUR; the oldest is 91 days.',
    );
    expect(ask.status).toBe('ok');
    const turn = transcriptDetailOf(lines[0], spanOfLine(lines[0], spans));
    expect(turn.sent).toBe(
      'Give me the aged receivables as of today, by customer.',
    );
    expect(turn.answered).toContain('Accounting says three customers');
  });

  it('says a refusal, and a call still running', () => {
    const { spans, lines } = recorded(OPEN_AND_FAILED);
    const refused = transcriptDetailOf(lines[3], spanOfLine(lines[3], spans));
    expect(refused.status).toBe('failed');
    expect(refused.error).toBe('TASK_STATE_FAILED');
    const running = transcriptDetailOf(lines[2], spanOfLine(lines[2], spans));
    expect(running.status).toBe('running');
    expect(running.endedAt).toBeUndefined();
    expect(running.tool?.name).toBe('odoo_accounting_list_invoices');
  });

  it('has no span for a line from a recording', () => {
    const { lines } = recorded(OPEN_AND_FAILED);
    expect(spanOfLine(lines[3], undefined)).toBeUndefined();
    const detail = transcriptDetailOf(lines[3]);
    expect(detail.span).toBeUndefined();
    expect(detail.ids).toBeUndefined();
    expect(detail.status).toBe('failed');
  });
});
