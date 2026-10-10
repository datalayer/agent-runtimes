/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's conversation draws no markup (STUDIO D-22): what a model
 * writes as HTML in its markdown is shown as the text it is, and the MCP
 * UI's markup — a resource of HTML, an element built from a tool's props —
 * is refused in a sentence, in place.
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatMarkdown } from '../../chat/messages/ChatMarkdown';
import { REHYPE_PLUGINS_WITHOUT_HTML } from '../../chat/messages/markdownWithoutHtml';
import { MCP_UI_NOT_DRAWN, createMCPUIRenderer } from '../../ui-plugins';
import type { ChatMessage } from '../../types/messages';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLDivElement | undefined;

async function draw(node: React.ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<>{node}</>);
  });
  // Streamdown draws a streaming answer in a transition.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

const SCRIPT = '<script>window.stolen = document.cookie</script>';
const IMAGE = '<img src="x" onerror="window.stolen = 1">';
const MCP_UI =
  '<iframe src="ui://weather/card" srcdoc="<script>parent.x=1</script>"></iframe>';

function noMarkupIn(drawn: HTMLElement): void {
  expect(drawn.querySelector('script')).toBeNull();
  expect(drawn.querySelector('img')).toBeNull();
  expect(drawn.querySelector('iframe')).toBeNull();
  expect(drawn.querySelector('[onerror]')).toBeNull();
  expect(drawn.querySelector('[srcdoc]')).toBeNull();
}

describe('markdown without markup', () => {
  it('leaves rehype-raw out and reads the HTML first', () => {
    expect(REHYPE_PLUGINS_WITHOUT_HTML[0]).toBeTypeOf('function');
    expect(
      REHYPE_PLUGINS_WITHOUT_HTML.some(
        plugin => (plugin as { name?: string }).name === 'rehypeRaw',
      ),
    ).toBe(false);
  });

  it('shows a script, an image with onerror and MCP UI markup as text', async () => {
    const drawn = await draw(
      <ChatMarkdown
        text={`Here is the **report**.\n\n${SCRIPT}\n\nInline ${IMAGE} too.\n\n${MCP_UI}`}
      />,
    );
    noMarkupIn(drawn);
    const text = drawn.textContent ?? '';
    expect(text).toContain(SCRIPT);
    expect(text).toContain(IMAGE);
    expect(text).toContain(MCP_UI);
    // The markdown itself is still drawn.
    expect(drawn.querySelector('[data-streamdown="strong"]')?.textContent).toBe(
      'report',
    );
    expect((window as { stolen?: unknown }).stolen).toBeUndefined();
  });

  it('opens a link in a new tab with no opener, and never a script', async () => {
    const drawn = await draw(
      <ChatMarkdown text="[site](https://example.com) and [x](javascript:alert(1))" />,
    );
    const links = Array.from(drawn.querySelectorAll('a'));
    const site = links.find(a => a.textContent === 'site');
    expect(site?.getAttribute('target')).toBe('_blank');
    expect(site?.getAttribute('rel')).toContain('noreferrer');
    for (const link of links) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
    }
  });
});

describe("the MCP UI's markup", () => {
  const renderer = createMCPUIRenderer();
  const render = (data: unknown) =>
    renderer.render({
      activityType: 'mcp-ui',
      data,
      message: {} as ChatMessage,
    });

  it('refuses a resource of HTML in a sentence', async () => {
    const drawn = await draw(
      render({
        resourceContent: {
          uri: 'ui://weather/card',
          content: {
            uri: 'ui://weather/card',
            mimeType: 'text/html; charset=utf-8',
            text: `${IMAGE}${SCRIPT}`,
          },
        },
      }),
    );
    noMarkupIn(drawn);
    expect(drawn.textContent).toBe(MCP_UI_NOT_DRAWN.html);
  });

  it('refuses an element built from a tool’s props', async () => {
    const drawn = await draw(
      render({
        uiElement: {
          type: 'container',
          props: { dangerouslySetInnerHTML: { __html: SCRIPT } },
          children: [
            { uiElement: { type: 'image', props: { src: 'x', onerror: '1' } } },
          ],
        },
      }),
    );
    noMarkupIn(drawn);
    expect(drawn.textContent).toBe(MCP_UI_NOT_DRAWN.element);
  });

  it('still shows a resource of text as text', async () => {
    const drawn = await draw(
      render({
        resourceContent: {
          uri: 'ui://notes',
          content: { uri: 'ui://notes', mimeType: 'text/plain', text: SCRIPT },
        },
      }),
    );
    noMarkupIn(drawn);
    expect(drawn.querySelector('pre')?.textContent).toBe(SCRIPT);
  });
});
