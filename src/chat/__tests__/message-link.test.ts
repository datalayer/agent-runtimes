/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A link in a message (LOOP T-06): underlined in every theme, coloured as
 * the theme says through `--theme-message-link` — the accent, or plain in
 * `loop` — and the accent where no theme says anything.
 */

import { describe, expect, it } from 'vitest';
import { streamdownMarkdownStyles } from '../styles/streamdownStyles';

describe('a link in a message', () => {
  it('is underlined, in the colour the theme gives it', () => {
    const link = (
      streamdownMarkdownStyles as Record<string, Record<string, string>>
    )['& a'];
    expect(link).toEqual({
      color: 'var(--theme-message-link, var(--fgColor-accent, #0969da))',
      textDecoration: 'underline',
    });
  });
});
