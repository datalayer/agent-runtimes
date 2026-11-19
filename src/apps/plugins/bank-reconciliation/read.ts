/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Accountant's reconciliation (`show_reconciliation`), read. Pure.
 *
 * @module apps/plugins/bank-reconciliation/read
 */

import { amount, records, words, type Data } from '../../toolCards/kit';

export type ReconciliationLine = {
  id: string;
  date: string;
  label: string;
  amount?: number;
  invoice: string;
  partner: string;
  invoiceAmount?: number;
  /** The bank line less the invoice, computed here when both are known. */
  difference?: number;
  confidence: string;
};

export type Reconciliation = {
  currency: string;
  lines: ReconciliationLine[];
  /** The lines proposed with an invoice, the ones the person may approve. */
  matched: number;
};

const CONFIDENCES = new Set(['high', 'medium', 'low']);

export function readReconciliation(data: Data): Reconciliation {
  const lines = records(data.lines)
    .map((line, index) => {
      const bank = amount(line.amount);
      const invoiced = amount(line.invoice_amount);
      const confidence = words(line.confidence).toLowerCase();
      return {
        id: words(line.id) || `line-${index + 1}`,
        date: words(line.date),
        label: words(line.label),
        amount: bank,
        invoice: words(line.invoice),
        partner: words(line.partner),
        invoiceAmount: invoiced,
        difference:
          bank !== undefined && invoiced !== undefined
            ? Math.round((bank - invoiced) * 100) / 100
            : undefined,
        confidence: CONFIDENCES.has(confidence) ? confidence : '',
      };
    })
    .filter(line => line.label || line.amount !== undefined);
  return {
    currency: words(data.currency),
    lines,
    matched: lines.filter(line => line.invoice).length,
  };
}

/** The decision a person sends back: the matches approved, the others left. */
export function reconciliationDecision(
  lines: readonly ReconciliationLine[],
  approved: ReadonlySet<string>,
): { approved: string[]; left: string[] } {
  const matched = lines.filter(line => line.invoice);
  return {
    approved: matched
      .filter(line => approved.has(line.id))
      .map(line => line.id),
    left: matched.filter(line => !approved.has(line.id)).map(line => line.id),
  };
}
