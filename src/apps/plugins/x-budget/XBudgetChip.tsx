/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The X budget left today, as a chip in the chat's title bar: read from the
 * runtimes service with the person's own token when the chat opens and
 * every minute while it stays open; a skeleton while read; nothing for a
 * person not signed in, nor when it could not be read (the guardrail's own
 * refusal says it in the conversation when it applies).
 *
 * @module apps/plugins/x-budget/XBudgetChip
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Label } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useCoreStore } from '@datalayer/core';
import { useIAMStore } from '@datalayer/core/lib/state';
import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  xBudgetLeft,
  xBudgetOfCatalogue,
  xBudgetUrl,
  type XBudgetAnswer,
  type XBudgetLeft,
} from './xBudget';

/** How often the chip reads the budget again while the chat stays open. */
export const X_BUDGET_REFRESH_MS = 60_000;

export function XBudgetChip({
  specId,
}: {
  specId?: string;
}): JSX.Element | null {
  const { configuration } = useCoreStore();
  const { token } = useIAMStore();
  const runtimesUrl = String(
    configuration?.runtimesUrl || configuration?.managerUrl || '',
  );
  const budget = useMemo(() => xBudgetOfCatalogue(specId), [specId]);
  // undefined while read; null when it could not be.
  const [left, setLeft] = useState<XBudgetLeft | null | undefined>(undefined);
  useEffect(() => {
    if (!token || !runtimesUrl || !budget) {
      return undefined;
    }
    let controller = new AbortController();
    const read = () => {
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;
      requestDatalayerAPI<XBudgetAnswer>({
        url: xBudgetUrl(runtimesUrl),
        method: 'GET',
        token,
        signal,
      })
        .then(answer => setLeft(xBudgetLeft(budget, answer) ?? null))
        .catch(() => {
          if (!signal.aborted) {
            setLeft(null);
          }
        });
    };
    read();
    const timer = setInterval(read, X_BUDGET_REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [token, runtimesUrl, budget]);
  if (!token || !runtimesUrl || !budget || left === null) {
    return null;
  }
  if (left === undefined) {
    return (
      <Box
        aria-busy="true"
        aria-label="Reading your X budget"
        width={120}
        height={20}
        borderRadius={2}
        bg="neutral.muted"
      />
    );
  }
  return (
    <Label
      variant={left.state === 'left' ? 'secondary' : 'danger'}
      title={left.sentence}
      aria-label={left.sentence}
      data-x-budget={left.state}
    >
      {left.short}
    </Label>
  );
}

/** The chip in the chat's title-bar slot. */
export function XBudgetSlot(): JSX.Element | null {
  return <XBudgetChip />;
}
