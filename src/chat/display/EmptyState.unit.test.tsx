/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The empty state's openers, in blocks: the ungrouped first, then each group
 * under its heading — a team's openers and, beneath them, the addressed
 * member's own.
 */

import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { ChatEmptyState, groupSuggestions } from './EmptyState';

const openers = [
  { title: 'Analyze the dataset', message: 'Analyze the dataset' },
  { title: 'Find what is wrong', message: 'Find what is wrong' },
  {
    title: 'Plot revenue',
    message: 'Plot revenue by region',
    group: 'Analyst',
  },
  {
    title: 'Summarise so far',
    message: 'Summarise the notebook',
    group: 'Analyst',
  },
];

describe('groupSuggestions', () => {
  it('puts the ungrouped first and keeps each group in the order it appears', () => {
    const blocks = groupSuggestions([
      { title: 'b', message: 'b', group: 'Later' },
      { title: 'a', message: 'a' },
      { title: 'c', message: 'c', group: 'Later' },
      { title: 'd', message: 'd', group: 'Last' },
    ]);
    expect(
      blocks.map(block => [block.group, block.items.map(i => i.title)]),
    ).toEqual([
      [undefined, ['a']],
      ['Later', ['b', 'c']],
      ['Last', ['d']],
    ]);
  });
});

describe('ChatEmptyState', () => {
  it('draws the team’s openers, then the member’s own under its name', () => {
    const submit = vi.fn();
    const { container, getByText } = render(
      <ChatEmptyState
        description="d"
        suggestions={openers}
        onSuggestionSubmit={submit}
      />,
    );
    const text = container.textContent ?? '';
    // The heading sits after the team's row and before the member's own.
    expect(text.indexOf('Find what is wrong')).toBeLessThan(
      text.indexOf('Analyst'),
    );
    expect(text.indexOf('Analyst')).toBeLessThan(text.indexOf('Plot revenue'));
    // The one heading, for the one group.
    expect(text.match(/Analyst/g)).toHaveLength(1);
    fireEvent.click(getByText('Plot revenue'));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Plot revenue by region' }),
    );
  });

  it('draws no heading when nothing is grouped', () => {
    const { container } = render(
      <ChatEmptyState description="d" suggestions={openers.slice(0, 2)} />,
    );
    expect(container.textContent).not.toContain('Analyst');
  });
});

describe('ChatEmptyState in levels', () => {
  const levelled = [
    {
      title: 'Analyze the dataset',
      message: 'Analyze the dataset',
      group: 'Jupyter Notebook',
    },
    {
      title: 'Plot revenue',
      message: 'Plot revenue by region',
      group: 'Jupyter Analyst',
    },
    { title: 'Elsewhere', message: 'Elsewhere', group: 'Nobody' },
  ];

  it('introduces the team, then the member, each with its own openers', () => {
    const { container } = render(
      <ChatEmptyState
        description="ignored"
        suggestions={levelled}
        emptyState={{
          title: 'ignored too',
          sections: [
            {
              group: 'Jupyter Notebook',
              title: 'Jupyter Notebook',
              subtitle: 'Six agents',
            },
            {
              group: 'Jupyter Analyst',
              title: 'Jupyter Analyst',
              subtitle: 'Explores the data',
            },
          ],
        }}
      />,
    );
    const text = container.textContent ?? '';
    const at = (needle: string) => text.indexOf(needle);
    // Level one, its opener, then level two and its opener, then what no
    // level claimed under its own heading.
    expect(at('Jupyter Notebook')).toBeLessThan(at('Analyze the dataset'));
    expect(at('Analyze the dataset')).toBeLessThan(at('Jupyter Analyst'));
    expect(at('Jupyter Analyst')).toBeLessThan(at('Plot revenue'));
    expect(at('Plot revenue')).toBeLessThan(at('Nobody'));
    expect(at('Nobody')).toBeLessThan(at('Elsewhere'));
    // The flat heading is not drawn when levels are.
    expect(text).not.toContain('ignored');
  });
});
