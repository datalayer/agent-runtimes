/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { describe, it, expect } from 'vitest';

describe('@datalayer/agent-runtimes - Integration Tests', () => {
  it('should have proper TypeScript compilation', () => {
    // This test ensures TypeScript compilation is working
    const testNumber: number = 42;
    const testString: string = 'hello';
    const testBoolean: boolean = true;

    expect(typeof testNumber).toBe('number');
    expect(typeof testString).toBe('string');
    expect(typeof testBoolean).toBe('boolean');
  });

  it('should support modern JavaScript features', () => {
    // Test arrow functions
    const add = (a: number, b: number) => a + b;
    expect(add(2, 3)).toBe(5);

    // Test template literals
    const name = 'Datalayer';
    const greeting = `Hello, ${name}!`;
    expect(greeting).toBe('Hello, Datalayer!');

    // Test destructuring
    const obj = { x: 1, y: 2 };
    const { x, y } = obj;
    expect(x).toBe(1);
    expect(y).toBe(2);

    // Test spread operator
    const arr1 = [1, 2, 3];
    const arr2 = [...arr1, 4, 5];
    expect(arr2).toEqual([1, 2, 3, 4, 5]);
  });

  it('should support async/await', async () => {
    const asyncFunction = async (): Promise<string> => {
      return new Promise(resolve => {
        setTimeout(() => resolve('async result'), 10);
      });
    };

    const result = await asyncFunction();
    expect(result).toBe('async result');
  });

  it('should support generics', () => {
    function identity<T>(arg: T): T {
      return arg;
    }

    expect(identity<string>('test')).toBe('test');
    expect(identity<number>(123)).toBe(123);
    expect(identity<boolean>(true)).toBe(true);
  });

  it('should handle error cases', () => {
    const throwError = () => {
      throw new Error('Test error');
    };

    expect(throwError).toThrow('Test error');
  });
});
