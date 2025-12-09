/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect } from 'vitest';
import { formatString, addNumbers, isDefined, delay } from '../utils';

describe('utils', () => {
  describe('formatString', () => {
    it('should trim and lowercase strings', () => {
      expect(formatString('  HELLO WORLD  ')).toBe('hello world');
    });

    it('should handle empty strings', () => {
      expect(formatString('')).toBe('');
    });

    it('should handle already formatted strings', () => {
      expect(formatString('hello')).toBe('hello');
    });
  });

  describe('addNumbers', () => {
    it('should add positive numbers', () => {
      expect(addNumbers(2, 3)).toBe(5);
    });

    it('should add negative numbers', () => {
      expect(addNumbers(-2, -3)).toBe(-5);
    });

    it('should add zero', () => {
      expect(addNumbers(5, 0)).toBe(5);
    });

    it('should handle decimals', () => {
      expect(addNumbers(1.5, 2.5)).toBe(4);
    });
  });

  describe('isDefined', () => {
    it('should return true for defined values', () => {
      expect(isDefined('hello')).toBe(true);
      expect(isDefined(0)).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined([])).toBe(true);
    });

    it('should return false for undefined', () => {
      expect(isDefined(undefined)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isDefined(null)).toBe(false);
    });
  });

  describe('delay', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await delay(100);
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });

    it('should return a Promise', () => {
      const result = delay(1);
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
