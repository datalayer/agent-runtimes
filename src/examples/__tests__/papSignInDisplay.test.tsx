/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * PAP Sign-In Display (REACTOR_UI RU-1): each result a page receives for a
 * sign-in is drawn as the *Sign in at a company* card — from the display the
 * result embeds, or through the plugin's tool binding — while what the model
 * read holds neither the page to open nor the code.
 */

// @vitest-environment jsdom
import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildReactorFromPlugins } from '@datalayer/reactor';
import { registerReactor } from '@datalayer/reactor/react';
import { createPapSignInPlugin } from '../../apps/plugins/pap-sign-in';
import PapSignInDisplayView from '../pap/PapSignInDisplayView';
import { PAP_SIGN_IN_CASES, modelRead } from '../pap/papSignInCases';

beforeEach(() => {
  const reactor = buildReactorFromPlugins([createPapSignInPlugin() as never]);
  reactor.start();
  registerReactor(reactor);
});

afterEach(() => {
  cleanup();
  registerReactor(null);
});

describe('PAP Sign-In Display', () => {
  it('keeps the link and the code out of what the model read', () => {
    for (const item of PAP_SIGN_IN_CASES.filter(c => c.id !== 'plain')) {
      const read = JSON.stringify(modelRead(item.result));
      expect(read).not.toContain('https://');
      expect(read).not.toContain('WDJB-MJHT');
      expect(read).toContain('Sign in at manzanita.example');
    }
  });

  it.each(PAP_SIGN_IN_CASES.map((item, index) => [item.label, item, index]))(
    'draws the card for a %s',
    (label, item, index) => {
      const view = render(<PapSignInDisplayView />);
      act(() => {
        fireEvent.click(view.getByRole('button', { name: label as string }));
      });
      const chosen = item as (typeof PAP_SIGN_IN_CASES)[number];
      const page = view.container.querySelector<HTMLElement>(
        `[data-pap-sign-in-page="${chosen.id}"]`,
      );
      expect(page, `case ${index}`).not.toBeNull();
      expect(page?.textContent).toContain('Sign in at manzanita.example');
      expect(
        page?.querySelector('a[href^="https://manzanita.example/"]'),
      ).not.toBeNull();
      if (chosen.id === 'direct') {
        expect(page?.textContent).not.toContain('WDJB-MJHT');
        expect(page?.textContent).toContain('embedded display');
      } else {
        expect(page?.textContent).toContain('WDJB-MJHT');
        expect(page?.textContent).toContain(
          chosen.id === 'plain' ? 'tool binding' : 'embedded display',
        );
      }
    },
  );
});
