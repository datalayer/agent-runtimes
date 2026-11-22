/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The element's anonymous preview (the user, 15 November 2026): a public
 * application talked to without an account shows it unless its host writes
 * `anonymous="false"`; `max-turns` says the turns it counts, `sign-in` where
 * Sign in goes. Each refused in a sentence when it is not one.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMBED_ATTRIBUTES,
  EmbedAttributeError,
  anonymousOf,
  maxTurnsAttributeOf,
  signInOf,
} from '../embed/embedConfig';

const page = (href: string) => {
  const url = new URL(href);
  return {
    href: url.href,
    origin: url.origin,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  };
};

describe('<datalayer-app anonymous max-turns sign-in>', () => {
  it('names its three attributes', () => {
    expect(Object.keys(EMBED_ATTRIBUTES)).toEqual(
      expect.arrayContaining(['anonymous', 'max-turns', 'sign-in']),
    );
  });

  it('shows the preview unless the host says false', () => {
    expect(anonymousOf(null)).toBe(true);
    expect(anonymousOf('true')).toBe(true);
    expect(anonymousOf('false')).toBe(false);
    expect(() => anonymousOf('maybe')).toThrow(EmbedAttributeError);
  });

  it('counts the turns the host says, or none', () => {
    expect(maxTurnsAttributeOf('10')).toBe(10);
    expect(maxTurnsAttributeOf(null)).toBeUndefined();
    expect(maxTurnsAttributeOf(' ')).toBeUndefined();
    expect(() => maxTurnsAttributeOf('0')).toThrow(/whole number/);
    expect(() => maxTurnsAttributeOf('ten')).toThrow(/whole number/);
    expect(() => maxTurnsAttributeOf('2.5')).toThrow(/whole number/);
  });

  it('signs in where the host says, else at Datalayer and back to the page', () => {
    expect(
      signInOf(
        'https://host.example/login',
        'https://datalayer.ai',
        page('https://host.example/a'),
      ),
    ).toBe('https://host.example/login');
    expect(() =>
      signInOf(
        'javascript:alert(1)',
        'https://datalayer.ai',
        page('https://x.io/'),
      ),
    ).toThrow(/http or https/);
    // On Datalayer's own page, back by its path.
    expect(
      signInOf(
        null,
        'https://datalayer.ai/',
        page('https://datalayer.ai/marketer?x=1#t'),
      ),
    ).toBe(
      'https://datalayer.ai/signin?post_auth_redirect=%2Fmarketer%3Fx%3D1%23t',
    );
    // On a host's page, back by its address.
    expect(
      signInOf(null, 'https://datalayer.ai', page('https://host.example/p')),
    ).toBe(
      'https://datalayer.ai/signin?post_auth_redirect=https%3A%2F%2Fhost.example%2Fp',
    );
  });

  it('hands the preview to the chat only for a visitor on the visitors’ runtime', () => {
    const element = readFileSync(
      join(__dirname, '..', 'embed', 'element.tsx'),
      'utf8',
    );
    expect(element).toContain(
      "if (source.visitors && anonymousOf(this.getAttribute('anonymous')))",
    );
    // Through the `AIApplication` component since it draws the element (16 November 2026).
    expect(element).toContain('anonymous: Boolean(preview),');
    // No member named after the new attributes (React 19 sets props as properties).
    expect(element).not.toMatch(
      /^\s+(private |public )?(anonymous|maxTurns|signIn)\(/m,
    );
  });
});
