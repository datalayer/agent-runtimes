/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The four regions around the input, and the bands they are made of.
 *
 * The footers were always two bands with different rules; the headers had one
 * slot. Making all four regions lists is the change these cover — along with
 * the two behaviours the old footers had that a naive list would lose: a band
 * that reserves height while empty, and a band that disappears entirely.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { BelowPromptFooter, BelowPromptHeader, InPromptHeader } from '..';

async function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return { container, root };
}

/** The bands actually in the document, in order. */
function bands(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-prompt-stack]')].map(
    element => element.getAttribute('data-prompt-stack') ?? '',
  );
}

describe('prompt regions', () => {
  it('renders several bands in a header, in order', async () => {
    const { container, root } = await render(
      <InPromptHeader
        stacks={[
          { id: 'first', content: <span>one</span> },
          { id: 'second', content: <span>two</span> },
        ]}
      />,
    );

    expect(bands(container)).toEqual(['first', 'second']);
    await act(async () => root.unmount());
  });

  it('puts the children shorthand before declared bands', async () => {
    const { container, root } = await render(
      <BelowPromptHeader stacks={[{ id: 'declared', content: <span>b</span> }]}>
        <span>a</span>
      </BelowPromptHeader>,
    );

    // The two compose rather than compete: a caller that already passed
    // children keeps them when it starts declaring bands as well.
    expect(bands(container)).toEqual(['default', 'declared']);
    await act(async () => root.unmount());
  });

  it('leaves out a band with nothing in it', async () => {
    const { container, root } = await render(
      <BelowPromptFooter
        stacks={[
          { id: 'empty', content: null },
          { id: 'full', content: <span>here</span> },
        ]}
      />,
    );

    // A band reserved for something that never arrives is a permanent stripe
    // across the prompt, which reads as a rendering fault.
    expect(bands(container)).toEqual(['full']);
    await act(async () => root.unmount());
  });

  it('keeps an empty band that reserves height', async () => {
    const { container, root } = await render(
      <BelowPromptHeader
        stacks={[{ id: 'usage', content: null, minHeight: 28 }]}
      />,
    );

    // This is how the token-usage band stops the layout jumping when the
    // counts arrive late.
    expect(bands(container)).toEqual(['usage']);
    await act(async () => root.unmount());
  });

  it('renders nothing at all when every band is empty', async () => {
    const { container, root } = await render(
      <InPromptHeader stacks={[{ id: 'nothing' }]} />,
    );

    expect(container.innerHTML).toBe('');
    await act(async () => root.unmount());
  });

  it('disables a whole region, and one band on its own', async () => {
    const { container, root } = await render(
      <BelowPromptFooter
        disabled
        stacks={[{ id: 'controls', content: <span>menus</span> }]}
      />,
    );

    const controls = container.querySelector('[data-prompt-stack="controls"]');
    expect(controls?.getAttribute('aria-disabled')).toBe('true');

    await act(async () => root.unmount());

    const single = await render(
      <BelowPromptFooter
        stacks={[
          { id: 'on', content: <span>a</span> },
          { id: 'off', content: <span>b</span>, disabled: true },
        ]}
      />,
    );
    expect(
      single.container
        .querySelector('[data-prompt-stack="on"]')
        ?.getAttribute('aria-disabled'),
    ).toBeNull();
    expect(
      single.container
        .querySelector('[data-prompt-stack="off"]')
        ?.getAttribute('aria-disabled'),
    ).toBe('true');
    await act(async () => single.root.unmount());
  });
});
