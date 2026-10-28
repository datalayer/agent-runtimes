/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A fenced block drawn by the plugin that contributed a renderer for its
 * language (`ChatCodeBlock`), in the agent's words themselves: a ```csv block
 * reaches the renderer with its text, and with no renderer — or no platform
 * — the block is code, as before.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
} from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import { ChatMarkdown } from '../ChatMarkdown';
import {
  ChatCodeBlock,
  codeBlockOf,
  type ChatCodeBlockProps,
} from '../codeBlocks';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ANSWER = [
  'Here it is.',
  '',
  '```csv',
  '# filename: sales.csv',
  'Month,North',
  'Jan,10',
  '```',
  '',
  '```python',
  'print(1)',
  '```',
].join('\n');

function Sheet({ language, code }: ChatCodeBlockProps) {
  return (
    <p data-testid="sheet" data-language={language}>
      {code}
    </p>
  );
}

const SheetPlugin = definePlugin({
  name: '@tests/sheet',
  contributes: [
    contribution(
      ChatCodeBlock,
      {
        id: 'sheet',
        languages: ['csv'],
        match: block => block.code.includes(','),
        Component: Sheet,
      },
      { id: 'sheet' },
    ),
  ],
});

let root: Root | undefined;

async function render(text: string): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ChatMarkdown text={text} />);
  });
  // Streamdown parses in a transition: let it settle.
  for (let i = 0; i < 20 && !container.querySelector('pre, code'); i += 1) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
  return container;
}

afterEach(() => {
  const mounted = root;
  if (mounted) {
    act(() => mounted.unmount());
  }
  root = undefined;
  registerReactor(null);
  document.body.innerHTML = '';
});

describe('fenced blocks drawn by a contributed renderer', () => {
  it('hands a ```csv block to the renderer, in the message, and leaves the others as code', async () => {
    const reactor = buildReactorFromPlugins([SheetPlugin]);
    reactor.start();
    registerReactor(reactor);
    const container = await render(ANSWER);
    const sheet = container.querySelector<HTMLElement>(
      '[data-chat-code-block="sheet"] [data-testid="sheet"]',
    );
    expect(sheet).not.toBeNull();
    expect(sheet!.dataset.language).toBe('csv');
    expect(sheet!.textContent).toContain('# filename: sales.csv');
    expect(sheet!.textContent).toContain('Jan,10');
    expect(container.textContent).toContain('print(1)');
    expect(container.querySelectorAll('[data-chat-code-block]').length).toBe(1);
  });

  it('draws the block as code without a platform', async () => {
    const container = await render(ANSWER);
    expect(container.querySelector('[data-testid="sheet"]')).toBeNull();
    expect(container.textContent).toContain('Jan,10');
  });
});

describe('codeBlockOf', () => {
  it('reads the language and the text of a markdown code element', () => {
    expect(
      codeBlockOf(<code className="language-CSV">{['a,b\n', '1,2\n']}</code>),
    ).toEqual({ language: 'csv', code: 'a,b\n1,2\n' });
    expect(codeBlockOf(<code>plain</code>)).toBeNull();
    expect(codeBlockOf('text')).toBeNull();
  });
});
