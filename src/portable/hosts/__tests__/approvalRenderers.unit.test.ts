/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 *
 * @vitest-environment node
 */

/**
 * Typed approval renderers (S-302, DC-004):
 * a complete action or *Review in Datalayer*. Ported from the Slack service;
 * each host tests its own card on top.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isPapConfirm,
  MAIL_WORDS,
  PAP_CONFIRM_KEYS,
  renderApproval,
} from '../approvalRenderers';
import { presentationSchema, type ApprovalPresentation } from '../contracts';

const contracts = JSON.parse(
  readFileSync(join(__dirname, '..', 'contracts.json'), 'utf8'),
) as {
  presentation: {
    example: unknown;
    mail_words: string[];
    pap_confirm_keys: string[];
  };
};
const example = presentationSchema.parse(contracts.presentation.example);
const of = (
  overrides: Partial<ApprovalPresentation>,
): ApprovalPresentation => ({
  ...example,
  ...overrides,
});

describe('typed approval renderers', () => {
  it('shows a mail whole: every recipient, the subject, the whole body', () => {
    const shown = renderApproval(
      of({
        arguments: {
          bcc: ['audit@example.com'],
          body: 'We go with option B.\n\nRegards',
          cc: ['ops@example.com', 'pm@example.com'],
          subject: 'Launch decision',
          to: 'release@example.com',
        },
      }),
    );
    expect(shown.renderer).toBe('mail');
    expect(shown.fields).toEqual([
      { label: 'To', value: 'release@example.com' },
      { label: 'Cc', value: 'ops@example.com, pm@example.com' },
      { label: 'Bcc', value: 'audit@example.com' },
      { label: 'Subject', value: 'Launch decision' },
      { label: 'Body', value: 'We go with option B.\n\nRegards' },
    ]);
    expect(shown.complete).toBe(true);
  });

  it('sends a mail with attachments, formatted mail, or one missing its parts, to Datalayer', () => {
    for (const args of [
      { ...example.arguments, attachments: ['q3.pdf'] },
      { ...example.arguments, html: '<p>B</p>' },
      { body: 'x', to: 'a@example.com' },
      { subject: 's', to: 'a@example.com' },
    ]) {
      expect([args, renderApproval(of({ arguments: args })).complete]).toEqual([
        args,
        false,
      ]);
    }
  });

  it('fails closed on an argument the renderer does not know', () => {
    const shown = renderApproval(
      of({ arguments: { ...example.arguments, forward_to: 'x@example.com' } }),
    );
    expect(shown.complete).toBe(false);
    expect(shown.reasons.join(' ')).toContain('forward_to');
  });

  it.each([
    'read',
    'write',
    'delete',
    'publish',
    'financial',
    'execute',
    'unknown',
  ] as const)(
    'keeps a %s action to Datalayer, even when the server would let a host decide',
    actionClass => {
      expect(
        renderApproval(
          of({ action_class: actionClass, tool_name: `${actionClass}_thing` }),
        ),
      ).toMatchObject({ complete: false, renderer: 'datalayer-only' });
    },
  );

  it('decides mail only: a send that is not mail fails closed', () => {
    expect(
      renderApproval(
        of({
          action_class: 'send',
          arguments: { channel: '#x', text: 'hi' },
          tool_name: 'post_to_teams',
        }),
      ),
    ).toMatchObject({ complete: false, renderer: 'none' });
    expect(renderApproval(of({ tool_name: 'send_message' })).renderer).toBe(
      'none',
    );
    expect(renderApproval(of({ tool_name: 'gmailSend' })).renderer).toBe(
      'mail',
    );
  });

  it('holds the mail words to contracts.json', () => {
    expect([...MAIL_WORDS].sort()).toEqual(contracts.presentation.mail_words);
  });

  describe("a company's pap_confirm (WHATSAPP WA-43, decided 28 October 2026)", () => {
    const pap = (args: Record<string, unknown>): ApprovalPresentation =>
      of({
        action_class: 'unknown',
        tool_name: 'pap_confirm',
        arguments: {
          key: 'k-1',
          company: 'manzanita.example',
          summary: 'Book a table for two at 20:00.',
          terms: { price: '0 EUR', party: 2 },
          operation_ref: 'op-7',
          revision: 3,
          digest: 'd'.repeat(64),
          class: 'write',
          session: { ref: 's-ref', signed_in: true },
          only_the_person: false,
          ...args,
        },
      });

    it('shows the company, its words, every term and the exact revision', () => {
      const shown = renderApproval(pap({}));
      expect(shown.renderer).toBe('pap-confirm');
      expect(shown.complete).toBe(true);
      expect(shown.fields).toEqual([
        { label: 'Company', value: 'manzanita.example' },
        { label: 'Summary', value: 'Book a table for two at 20:00.' },
        { label: 'price', value: '0 EUR' },
        { label: 'party', value: '2' },
        { label: 'Operation', value: 'op-7' },
        { label: 'Revision', value: '3' },
        { label: 'What it does', value: 'write' },
      ]);
      expect(
        renderApproval(pap({ was: { revision: 2, terms: {} } })).fields,
      ).toContainEqual({ label: 'Replaces revision', value: '2' });
    });

    it('fails closed without a revision, a company, its summary or digest, and on an argument it does not know', () => {
      for (const missing of [
        'revision',
        'company',
        'summary',
        'operation_ref',
        'digest',
      ]) {
        const shown = renderApproval(pap({ [missing]: undefined }));
        expect(shown.complete).toBe(false);
      }
      expect(renderApproval(pap({ revision: '3' })).complete).toBe(false);
      expect(renderApproval(pap({ terms: ['a'] })).complete).toBe(false);
      expect(renderApproval(pap({ secret_door: 1 })).complete).toBe(false);
    });

    it("knows the gateway names, with or without a prefix, and the contract's keys", () => {
      expect(isPapConfirm('pap_confirm')).toBe(true);
      expect(isPapConfirm('datalayer_pap_confirm')).toBe(true);
      expect(isPapConfirm('pap_confirmed')).toBe(false);
      expect(isPapConfirm('not_pap_confirm_x')).toBe(false);
      expect([...PAP_CONFIRM_KEYS]).toEqual(
        contracts.presentation.pap_confirm_keys,
      );
    });
  });
});
