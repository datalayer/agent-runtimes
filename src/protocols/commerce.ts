/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What every commerce protocol shares (AGENT_PROTOCOLS §3, one approval
 * model) — the twin of `agent_runtimes.protocols.commerce`. A purchase over
 * UCP or the Agentic Commerce Protocol is an exact, revisioned
 * {@link CheckoutProposal}, approved by the person through the host's
 * {@link CheckoutApprover} (contributed to each plugin's `<protocol>.approver`),
 * and completed once ({@link ProposalStore}).
 *
 * @module protocols/commerce
 */

import { PROTOCOL_TOOL_CLASSES } from '../specs/actions';
import type { ActionClass } from '../types/agentspecs';

type Json = Record<string, any>;

/**
 * Each operation's action class (F-10) for Rules (R-05), as agentspecs
 * classes a protocol's tools (`protocol-tools/<protocol>.yaml`,
 * AGENT_PROTOCOLS PR-54), named as the TypeScript client names them
 * (`complete_checkout` → `completeCheckout`). A commerce operation does one
 * thing: one with several classes, or none, throws rather than guess.
 */
export function operationClasses(
  protocol: string,
): Record<string, ActionClass> {
  const table = PROTOCOL_TOOL_CLASSES[protocol];
  // The table names the gateway's tools (`ucp_search`): an operation is the
  // tool's name without its connection's prefix.
  const prefix = `${table.connection}_`;
  const out: Record<string, ActionClass> = {};
  for (const [name, classes] of Object.entries(table.tools)) {
    if (classes.length !== 1) {
      throw new Error(
        `${protocol} ${name} is classed ${classes}: one class each`,
      );
    }
    if (!name.startsWith(prefix)) {
      throw new Error(
        `${protocol} ${name} is not one of its \`${prefix}\` tools`,
      );
    }
    out[
      name
        .slice(prefix.length)
        .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    ] = classes[0];
  }
  return out;
}

/** One exact purchase, proposed to a person before it is made. */
export interface CheckoutProposal {
  id: string;
  merchant: string;
  checkoutId: string;
  /** SHA-256 of what is bought: lines, prices, quantities, totals, currency. */
  revision: string;
  currency: string;
  total: number;
  lines: Array<{ title: string; quantity: number; price: number }>;
  expiresAt?: string;
}

/** A proposal in words, for the person and the model: never a credential. */
export function proposalSummary(proposal: CheckoutProposal): string {
  const items = proposal.lines
    .map(line => `${line.quantity} × ${line.title}`)
    .join(', ');
  const amount = (proposal.total / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `Buy ${items} at ${proposal.merchant} for ${proposal.currency} ${amount}`;
}

export interface CheckoutApprover {
  approve(proposal: CheckoutProposal): Promise<boolean>;
}
export interface ProposalStore {
  take(proposalId: string): Promise<boolean>;
}
export class InMemoryProposalStore implements ProposalStore {
  private taken = new Set<string>();
  async take(proposalId: string) {
    if (this.taken.has(proposalId)) {
      return false;
    }
    this.taken.add(proposalId);
    return true;
  }
}

/** The SHA-256 of a canonical JSON (sorted keys, no spaces): a proposal's revision. */
export function digest(what: Json): Promise<string> {
  return sha256(canonical(what));
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical((value as Json)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
