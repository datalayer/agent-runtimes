/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the `render_a2ui_surface` tool answers, read and checked.
 *
 * Pure: no React, no catalogue instance. What is here is what a test wants
 * to reach without a chat around it — the shape of a result, the rules a
 * surface ships for its own fields, and the verdict on a submission.
 *
 * @module loop/plugins/a2ui-surface/toolResult
 */

import type { A2uiMessage } from '@a2ui/web_core/v0_9';

export type A2uiRequiredField = {
  id: string;
  label: string;
};

/**
 * Per-field validation descriptor emitted by the backend tool. The rules
 * gate a submission: required, email format, pattern, length, slider range.
 */
export type A2uiFieldRule = {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  format?: 'email';
  pattern?: string;
  minLength?: number;
  min?: number;
  max?: number;
};

export type A2uiToolResult = {
  surfaceId?: string;
  title?: string;
  messages?: A2uiMessage[];
  requiredFields?: A2uiRequiredField[];
  fieldRules?: A2uiFieldRule[];
};

/**
 * Read a tool result — an object, or the JSON of one — as A2UI messages,
 * with the catalogue id rewritten to `catalogId` so the frontend catalogue
 * accepts what a backend named by its own id.
 */
export function readA2uiToolResult(
  result: unknown,
  catalogId: string,
): A2uiToolResult | null {
  if (!result) {
    return null;
  }
  let obj: unknown = result;
  if (typeof result === 'string') {
    try {
      obj = JSON.parse(result);
    } catch {
      return null;
    }
  }
  if (
    typeof obj !== 'object' ||
    obj === null ||
    !Array.isArray((obj as A2uiToolResult).messages)
  ) {
    return null;
  }
  const parsed = obj as A2uiToolResult;
  const messages = (parsed.messages ?? []).map(message => {
    const payload = message as A2uiMessage & {
      createSurface?: { catalogId?: string };
    };
    if (
      payload.createSurface &&
      payload.createSurface.catalogId !== catalogId
    ) {
      return {
        ...payload,
        createSurface: { ...payload.createSurface, catalogId },
      } as A2uiMessage;
    }
    return message;
  });
  return { ...parsed, messages };
}

/**
 * Whether a submitted value counts as "not provided". Handles the shapes the
 * basic catalogue emits: strings (text/email), arrays (choice), booleans
 * (checkbox).
 */
export function isEmptyA2uiValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'boolean') {
    return value === false;
  }
  return false;
}

/** Permissive on purpose: `local@domain.tld` with no spaces. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One rule's complaint about one value, or `null` when it is acceptable. */
export function validateA2uiField(
  rule: A2uiFieldRule,
  value: unknown,
): string | null {
  if (isEmptyA2uiValue(value)) {
    return rule.required ? `${rule.label} is required.` : null;
  }
  if (
    rule.format === 'email' &&
    typeof value === 'string' &&
    !EMAIL_PATTERN.test(value.trim())
  ) {
    return `${rule.label} must be a valid email address.`;
  }
  if (rule.pattern && typeof value === 'string') {
    let matches: boolean;
    try {
      matches = new RegExp(rule.pattern).test(value.trim());
    } catch {
      matches = true; // A malformed pattern blocks nothing.
    }
    if (!matches) {
      return `${rule.label} is not in the expected format.`;
    }
  }
  if (
    rule.minLength !== undefined &&
    typeof value === 'string' &&
    value.trim().length < rule.minLength
  ) {
    return `${rule.label} must be at least ${rule.minLength} characters.`;
  }
  if (rule.type === 'slider' && typeof value === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      return `${rule.label} must be at least ${rule.min}.`;
    }
    if (rule.max !== undefined && value > rule.max) {
      return `${rule.label} must be at most ${rule.max}.`;
    }
  }
  return null;
}

/** Every rule's complaint about a submission; empty when it passes. */
export function validateA2uiSubmission(
  rules: A2uiFieldRule[],
  values: Record<string, unknown>,
): string[] {
  return rules
    .map(rule => validateA2uiField(rule, values[rule.id]))
    .filter((message): message is string => message !== null);
}
