/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-vat-summary` — the Accountant's VAT for a period:
 * each box of the return with its base and its tax, what is due, what is
 * deductible, and the net to pay or to be refunded, summed here. Draws
 * `show_vat_summary`. Nothing is filed from it.
 *
 * @module apps/plugins/vat-summary
 */

import type { JSX } from 'react';
import { Label, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ToolCallRenderContext } from '../../../types/chat';
import {
  CardFrame,
  CardSkeleton,
  CardTable,
  cardData,
  defineToolCardPlugin,
  money,
} from '../../toolCards/kit';
import { readVatSummary, type VatBox } from './read';

export const VAT_SUMMARY_PLUGIN_NAME = '@datalayer/loop-plugin-vat-summary';

export const VAT_SUMMARY_WORDS = {
  title: (period: string, country: string) =>
    ['VAT', country, period].filter(Boolean).join(', '),
  writing: 'Summing the VAT…',
  due: 'Due',
  deductible: 'Deductible',
  toPay: (net: string) => `To pay: ${net}`,
  refund: (net: string) => `To be refunded: ${net}`,
  notFiled: 'Nothing is filed from here.',
} as const;

export function VatSummaryCard({
  context,
}: {
  context: ToolCallRenderContext;
}): JSX.Element {
  const read = cardData(context);
  if (!read) {
    return <>{context.defaultUI}</>;
  }
  const vat = readVatSummary(read.data);
  if (vat.boxes.length === 0) {
    return read.done ? (
      <>{context.defaultUI}</>
    ) : (
      <CardSkeleton label={VAT_SUMMARY_WORDS.writing} />
    );
  }
  const { currency } = vat;
  return (
    <CardFrame
      title={VAT_SUMMARY_WORDS.title(vat.period, vat.country)}
      subtitle={VAT_SUMMARY_WORDS.notFiled}
    >
      <CardTable<VatBox>
        caption={`${vat.boxes.length} boxes`}
        rows={vat.boxes}
        rowKey={(row, index) => `${row.box}-${index}`}
        columns={[
          { key: 'box', title: 'Box', cell: row => row.box },
          {
            key: 'label',
            title: 'What',
            cell: row => (
              <>
                {row.label}{' '}
                <Label
                  variant={row.direction === 'due' ? 'attention' : 'accent'}
                >
                  {row.direction === 'due'
                    ? VAT_SUMMARY_WORDS.due
                    : VAT_SUMMARY_WORDS.deductible}
                </Label>
              </>
            ),
          },
          {
            key: 'base',
            title: 'Base',
            align: 'right',
            cell: row => money(row.base, ''),
          },
          {
            key: 'tax',
            title: 'VAT',
            align: 'right',
            cell: row => money(row.tax, ''),
          },
        ]}
      />
      <Box mt={2} display="flex" flexDirection="column" alignItems="flex-end">
        <Text sx={{ fontSize: 1 }}>
          {VAT_SUMMARY_WORDS.due}: {money(vat.due, currency)}
        </Text>
        <Text sx={{ fontSize: 1 }}>
          {VAT_SUMMARY_WORDS.deductible}: {money(vat.deductible, currency)}
        </Text>
        <Text sx={{ fontSize: 2, fontWeight: 'bold' }} data-vat-net>
          {vat.net >= 0
            ? VAT_SUMMARY_WORDS.toPay(money(vat.net, currency))
            : VAT_SUMMARY_WORDS.refund(money(-vat.net, currency))}
        </Text>
      </Box>
    </CardFrame>
  );
}

export const VatSummaryPlugin = defineToolCardPlugin({
  id: 'vat-summary',
  displayName: 'VAT summary',
  description:
    'The VAT return’s boxes for a period, what is due and deductible, and the net to pay or to be refunded.',
  octicon: 'checklist',
  emoji: '\u{1F4B6}',
  tools: ['show_vat_summary'],
  Card: VatSummaryCard,
});

export { readVatSummary, type VatBox, type VatSummary } from './read';
export default VatSummaryPlugin;
