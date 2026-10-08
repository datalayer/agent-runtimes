/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The opening document: a heading, a paragraph and a Jupyter cell that has
 * already run, on the same small analysis the opening notebook shows.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OPENING_DOCUMENT_TITLE,
  openingDocument,
} from '../plugins/document/openingDocument';
import { OPENING_SOURCE } from '../plugins/notebook/openingNotebook';

const VIEW = readFileSync(
  join(__dirname, '..', 'plugins', 'document', 'DocumentView.tsx'),
  'utf8',
);

type Node = { type: string; children?: Node[]; text?: string } & Record<
  string,
  unknown
>;

const blocks = () => openingDocument().root.children as unknown as Node[];
const textOf = (node: Node): string =>
  (node.children ?? [])
    .map(child => (child.type === 'linebreak' ? '\n' : (child.text ?? '')))
    .join('');

describe('the opening document', () => {
  it('opens on a heading, a paragraph and a cell, in that order', () => {
    expect(blocks().map(block => block.type)).toEqual([
      'heading',
      'paragraph',
      'jupyter-input',
      'jupyter-output',
    ]);
    const [heading, paragraph] = blocks();
    expect(heading.tag).toBe('h1');
    expect(textOf(heading)).toBe(OPENING_DOCUMENT_TITLE);
    expect(textOf(paragraph).length).toBeGreaterThan(40);
  });

  it('holds the same code the opening notebook runs, tied to its output', () => {
    const [, , input, output] = blocks();
    expect(textOf(input)).toBe(OPENING_SOURCE.join(''));
    // Stored tokenised, as the editor stores code it highlighted itself.
    const types = (input.children ?? []).map(child => child.type);
    expect(types).toContain('jupyter-input-highlight');
    expect(types).not.toContain('text');
    expect(
      (input.children ?? []).some(child => child.highlightType === 'keyword'),
    ).toBe(true);
    expect(output.source).toBe(OPENING_SOURCE.join(''));
    // One uuid ties the pair, as the editor keeps them.
    expect(output.jupyterInputNodeUuid).toBe(input.jupyterInputNodeUuid);
  });

  it('shows a result, not an empty output', () => {
    const [, , , output] = blocks();
    const [result] = output.outputs as {
      output_type: string;
      data: { 'text/plain': string };
    }[];
    expect(result.output_type).toBe('execute_result');
    // The frame pandas actually prints, from a real run.
    expect(result.data['text/plain']).toContain('region quarter');
    expect(result.data['text/plain']).toContain('182400');
  });

  it('is a fresh state every time', () => {
    expect(openingDocument()).not.toBe(openingDocument());
    expect(openingDocument().root.children).not.toBe(
      openingDocument().root.children,
    );
  });

  it('is what the document view opens on, unless a host contributes its own', () => {
    expect(VIEW).toContain('useContributions(LoopOpeningDocument)');
    expect(VIEW).toContain('contributedOpening?.document ?? openingDocument');
    expect(VIEW).toContain('content={opening}');
  });
});
