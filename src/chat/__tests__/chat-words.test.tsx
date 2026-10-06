/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat's own words in the person's language (LOOP P-26): a French page
 * reads a French chat — its send button, its tool cards and lines, its
 * approvals, its balloon — a host's language wins over the browser's, and a
 * language the chat is not said in reads English.
 */

import { afterEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatLanguage } from '../ChatLanguage';
import { CHAT_WORDS, chatLanguage, chatWords } from '../words';
import { InPromptFooter } from '../prompt/footer/InPromptFooter';
import { ToolCallDisplay } from '../tools/ToolCallDisplay';
import { ToolApprovalBanner } from '../tools/ToolApprovalBanner';
import { BalloonNow, conversationHeaderText } from '../assistant/BalloonParts';
import { toolLineText } from '../assistant/toolLine';

/** The browser says the person prefers these, until the test ends. */
function prefers(languages: string[]): void {
  Object.defineProperty(window.navigator, 'languages', {
    value: languages,
    configurable: true,
  });
}

afterEach(() => {
  // The jsdom default again: the prototype's getter.
  delete (window.navigator as unknown as Record<string, unknown>).languages;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return container;
}

/**
 * The names its buttons are read by: their label, or — a Primer button with
 * a tooltip — the text it is labelled by.
 */
function buttonNames(container: HTMLElement): string[] {
  return [...container.querySelectorAll('button')].map(
    button =>
      button.getAttribute('aria-label') ??
      (button.getAttribute('aria-labelledby') ?? '')
        .split(' ')
        .map(id => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim(),
  );
}

describe('the words', () => {
  it('are said in six languages, each saying everything English says', () => {
    expect(Object.keys(CHAT_WORDS).sort()).toEqual(
      ['de', 'en', 'es', 'fr', 'it', 'pt'].sort(),
    );
    const english = Object.keys(CHAT_WORDS.en).sort();
    for (const [tag, words] of Object.entries(CHAT_WORDS)) {
      expect(Object.keys(words).sort(), tag).toEqual(english);
      for (const [key, said] of Object.entries(words)) {
        expect(
          typeof said === 'function' ? said(2) : said,
          `${tag}.${key}`,
        ).toBeTruthy();
      }
    }
  });

  it('are picked as an application’s are: a region reads its language, another English', () => {
    expect(chatLanguage(['fr-CA', 'en'])).toBe('fr');
    expect(chatLanguage(['ja', 'pt-BR'])).toBe('pt');
    expect(chatLanguage(['ja'])).toBe('en');
    expect(chatLanguage([])).toBe('en');
    expect(chatWords('de').send).toBe('Senden');
    expect(chatWords(undefined).send).toBe('Send');
  });

  it('say a tool line in the language, English unless said', () => {
    const line = {
      id: 'c1',
      tool: 'list_invoices',
      name: 'list_invoices',
      phase: 'running' as const,
    };
    expect(toolLineText(line)).toBe('Using list_invoices…');
    expect(toolLineText(line, CHAT_WORDS.fr)).toBe('Utilise list_invoices…');
    expect(toolLineText({ ...line, phase: 'failed' }, CHAT_WORDS.fr)).toBe(
      'list_invoices a échoué',
    );
    expect(conversationHeaderText(3, CHAT_WORDS.fr)).toBe('Conversation · 3');
    expect(conversationHeaderText(3, CHAT_WORDS.de)).toBe('Gespräch · 3');
  });
});

describe('a French page', () => {
  it('sends with Envoyer, and stops with Arrêter', async () => {
    prefers(['fr-FR', 'en']);
    const idle = await render(<InPromptFooter onSend={() => {}} />);
    expect(buttonNames(idle)).toContain('Envoyer');
    const busy = await render(
      <InPromptFooter onSend={() => {}} onStop={() => {}} isLoading />,
    );
    expect(buttonNames(busy)).toContain('Arrêter');
  });

  it('asks for approval in French on the tool card', async () => {
    prefers(['fr-FR']);
    const card = await render(
      <ToolCallDisplay
        toolCallId="call-1"
        toolName="send_invoice"
        args={{}}
        status="inProgress"
        approvalRequired
        approvalState="pending"
        onApprove={() => {}}
        onDeny={() => {}}
      />,
    );
    const text = card.textContent ?? '';
    expect(text).toContain('En attente d’approbation');
    expect(text).toContain(
      'Cet outil a besoin de votre approbation pour s’exécuter.',
    );
    expect(text).toContain('Approuver');
    expect(text).toContain('Refuser');
    expect(text).not.toContain('Approve');
  });

  it('counts the approvals waiting in French', async () => {
    prefers(['fr']);
    const banner = await render(
      <ToolApprovalBanner
        pendingApprovals={['send_invoice', 'refund'].map(toolName => ({
          id: toolName,
          toolName,
          args: {},
          agentId: 'billing',
          requestedAt: '2026-10-06T09:00:00Z',
        }))}
        onReview={() => {}}
        onApproveAll={() => {}}
      />,
    );
    const text = banner.textContent ?? '';
    expect(text).toContain('2 approbations d’outil en attente');
    expect(text).toContain('Tout approuver');
    expect(text).toContain('Examiner');
  });

  it('marks the balloon Maintenant', async () => {
    prefers(['fr-BE']);
    const now = await render(<BalloonNow />);
    expect(now.textContent).toBe('Maintenant');
  });
});

describe('the language its host says', () => {
  it('wins over the browser’s', async () => {
    prefers(['fr-FR']);
    const footer = await render(
      <ChatLanguage language="de">
        <InPromptFooter onSend={() => {}} />
      </ChatLanguage>,
    );
    expect(buttonNames(footer)).toContain('Senden');
  });

  it('reads English when the chat is not said in it, and so does no host', async () => {
    prefers(['fr-FR']);
    const japanese = await render(
      <ChatLanguage language="ja">
        <BalloonNow />
      </ChatLanguage>,
    );
    expect(japanese.textContent).toBe('Now');
    prefers(['en-US']);
    const english = await render(<BalloonNow />);
    expect(english.textContent).toBe('Now');
  });
});
