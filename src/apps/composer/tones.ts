/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The colours of an instant check's verdict (`checkApp`) on the Composer's
 * editors, as Primer's tokens: a label's variant, a flash's, the text's and
 * the border's.
 *
 * @module apps/composer/tones
 */

export type ComposerVerdict = 'Ready' | 'Needs attention' | 'Not ready';

export type VerdictTone = {
  label: 'success' | 'attention' | 'danger';
  flash: 'success' | 'warning' | 'danger';
  fg: string;
  border: string;
};

export const VERDICT_TONES: Readonly<Record<ComposerVerdict, VerdictTone>> = {
  Ready: {
    label: 'success',
    flash: 'success',
    fg: 'success.fg',
    border: 'success.emphasis',
  },
  'Needs attention': {
    label: 'attention',
    flash: 'warning',
    fg: 'attention.fg',
    border: 'attention.emphasis',
  },
  'Not ready': {
    label: 'danger',
    flash: 'danger',
    fg: 'danger.fg',
    border: 'danger.emphasis',
  },
};
