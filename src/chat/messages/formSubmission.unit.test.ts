/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A submission written as a turn and read back by the transcript.
 *
 * The case behind it: the reader who submitted a booking form saw their own
 * turn as a JSON blob under "here are the values" — the agent's reading of
 * it, shown to the person who had just filled in the form.
 */

import { describe, expect, it } from 'vitest';
import {
  displayValue,
  encodeFormSubmission,
  labelOfFieldId,
  parseFormSubmission,
} from './formSubmission';

const submission = {
  title: 'Table Reservation',
  surfaceId: 'form-1',
  values: {
    'full-name': 'Eric Charles',
    'party-size': 2,
    time: ['12:00'],
    dietary: [],
    'special-requests': '',
  },
};

describe('a submission as a turn', () => {
  it('reads back exactly what was written', () => {
    expect(parseFormSubmission(encodeFormSubmission(submission))).toEqual(
      submission,
    );
  });

  it('still says the values in words the agent can read', () => {
    const text = encodeFormSubmission(submission);
    expect(text).toContain('I just submitted "Table Reservation"');
    expect(text).toContain('"full-name": "Eric Charles"');
    expect(text).toContain('what happens next');
  });

  it('is not mistaken for any other turn', () => {
    expect(parseFormSubmission('Show me a recipe card')).toBeNull();
    expect(parseFormSubmission('```json\n{"title":"x"}\n```')).toBeNull();
    expect(parseFormSubmission('```a2ui-submission\nnot json\n```')).toBeNull();
    expect(
      parseFormSubmission('```a2ui-submission\n{"values":{}}\n```'),
    ).toBeNull();
  });
});

describe('how the card reads a field', () => {
  it('turns an id into a label', () => {
    expect(labelOfFieldId('party-size')).toBe('Party size');
    expect(labelOfFieldId('special_requests')).toBe('Special requests');
    expect(labelOfFieldId('email')).toBe('Email');
  });

  it('writes a value as a reader would, and a dash for nothing', () => {
    expect(displayValue('Eric Charles')).toBe('Eric Charles');
    expect(displayValue(2)).toBe('2');
    expect(displayValue(['12:00', '12:30'])).toBe('12:00, 12:30');
    expect(displayValue(true)).toBe('Yes');
    expect(displayValue('')).toBe('—');
    expect(displayValue([])).toBe('—');
    expect(displayValue(null)).toBe('—');
  });
});
