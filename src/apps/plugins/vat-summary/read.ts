/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Accountant's VAT summary (`show_vat_summary`), read. Pure.
 *
 * @module apps/plugins/vat-summary/read
 */

import { amount, records, words, type Data } from '../../toolCards/kit';

export type VatBox = {
  box: string;
  label: string;
  base?: number;
  tax: number;
  /** `due` (output VAT) or `deductible` (input VAT). */
  direction: 'due' | 'deductible';
};

export type VatSummary = {
  period: string;
  currency: string;
  country: string;
  boxes: VatBox[];
  due: number;
  deductible: number;
  /** Due less deductible: to pay when positive, to be refunded when negative. */
  net: number;
};

const cents = (value: number): number => Math.round(value * 100) / 100;

export function readVatSummary(data: Data): VatSummary {
  const boxes = records(data.boxes)
    .map(box => ({
      box: words(box.box),
      label: words(box.label),
      base: amount(box.base),
      tax: amount(box.tax) ?? 0,
      direction:
        words(box.direction).toLowerCase() === 'deductible'
          ? ('deductible' as const)
          : ('due' as const),
    }))
    .filter(box => box.box || box.label);
  const due = cents(
    boxes
      .filter(box => box.direction === 'due')
      .reduce((sum, box) => sum + box.tax, 0),
  );
  const deductible = cents(
    boxes
      .filter(box => box.direction === 'deductible')
      .reduce((sum, box) => sum + box.tax, 0),
  );
  return {
    period: words(data.period),
    currency: words(data.currency),
    country: words(data.country),
    boxes,
    due,
    deductible,
    net: cents(due - deductible),
  };
}
