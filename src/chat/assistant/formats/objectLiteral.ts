/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Reads a JavaScript object literal from text without running it: JSON, plus
 * what hand-written JavaScript adds — unquoted keys, single quotes, comments,
 * trailing commas. Anything that would need evaluating (a call, a variable,
 * an expression) is refused.
 *
 * @module chat/assistant/formats/objectLiteral
 */

import { AssistantCharacterFormatError } from './types';

export type LiteralValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | LiteralValue[]
  | { [key: string]: LiteralValue };

/** The result of reading one value: the value and where the text goes on. */
export interface LiteralRead {
  value: LiteralValue;
  end: number;
}

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;
const MAX_DEPTH = 64;

/**
 * Read the literal value starting at `start` (whitespace and comments
 * skipped). `what` names the file in error messages.
 */
export function readObjectLiteral(
  text: string,
  start: number,
  what: string,
): LiteralRead {
  let i = start;

  const fail = (message: string): never => {
    const line = text.slice(0, i).split('\n').length;
    throw new AssistantCharacterFormatError(
      `${what} cannot be read at line ${line}: ${message}.`,
    );
  };

  const skip = (): void => {
    for (;;) {
      const c = text[i];
      if (
        c === ' ' ||
        c === '\t' ||
        c === '\n' ||
        c === '\r' ||
        c === '\uFEFF'
      ) {
        i++;
      } else if (c === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') i++;
      } else if (c === '/' && text[i + 1] === '*') {
        const close = text.indexOf('*/', i + 2);
        if (close < 0) fail('a comment is never closed');
        i = close + 2;
      } else {
        return;
      }
    }
  };

  const readString = (): string => {
    const quote = text[i++];
    let out = '';
    for (;;) {
      if (i >= text.length) fail('a string is never closed');
      const c = text[i++];
      if (c === quote) return out;
      if (c === '\n') fail('a string runs past the end of its line');
      if (c !== '\\') {
        out += c;
        continue;
      }
      const e = text[i++];
      switch (e) {
        case 'n':
          out += '\n';
          break;
        case 't':
          out += '\t';
          break;
        case 'r':
          out += '\r';
          break;
        case 'b':
          out += '\b';
          break;
        case 'f':
          out += '\f';
          break;
        case 'v':
          out += '\v';
          break;
        case '0':
          out += '\0';
          break;
        case 'x': {
          const hex = text.slice(i, i + 2);
          if (!/^[0-9a-fA-F]{2}$/.test(hex)) fail('a \\x escape is malformed');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 2;
          break;
        }
        case 'u': {
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('a \\u escape is malformed');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
          break;
        }
        case '\r':
          if (text[i] === '\n') i++;
          break;
        case '\n':
          break;
        case undefined:
          fail('a string is never closed');
          break;
        default:
          out += e;
      }
    }
  };

  const readNumber = (): number => {
    const match =
      /^[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(
        text.slice(i, i + 64),
      );
    if (!match) return fail('a number is malformed');
    i += match[0].length;
    const n = Number(match[0]);
    if (!Number.isFinite(n)) fail('a number is malformed');
    return n;
  };

  const readIdentifier = (): string => {
    const begin = i;
    while (i < text.length && IDENTIFIER_PART.test(text[i])) i++;
    return text.slice(begin, i);
  };

  const readValue = (depth: number): LiteralValue => {
    if (depth > MAX_DEPTH) fail('it nests too deeply');
    skip();
    const c = text[i];
    if (c === undefined) fail('the text ends where a value was expected');
    if (c === '{') {
      i++;
      const obj: { [key: string]: LiteralValue } = Object.create(null);
      for (;;) {
        skip();
        if (text[i] === '}') {
          i++;
          return obj;
        }
        let key: string;
        const k = text[i];
        if (k === '"' || k === "'") key = readString();
        else if (k !== undefined && /[0-9]/.test(k)) key = String(readNumber());
        else if (k !== undefined && IDENTIFIER_START.test(k))
          key = readIdentifier();
        else return fail(`a key was expected, found "${k ?? 'the end'}"`);
        skip();
        if (text[i] !== ':') fail(`a ":" was expected after the key "${key}"`);
        i++;
        obj[key] = readValue(depth + 1);
        skip();
        if (text[i] === ',') i++;
        else if (text[i] !== '}')
          fail('a "," or "}" was expected in an object');
      }
    }
    if (c === '[') {
      i++;
      const arr: LiteralValue[] = [];
      for (;;) {
        skip();
        if (text[i] === ']') {
          i++;
          return arr;
        }
        arr.push(readValue(depth + 1));
        skip();
        if (text[i] === ',') i++;
        else if (text[i] !== ']') fail('a "," or "]" was expected in a list');
      }
    }
    if (c === '"' || c === "'") return readString();
    if (/[-+.0-9]/.test(c)) return readNumber();
    if (IDENTIFIER_START.test(c)) {
      const word = readIdentifier();
      if (word === 'true') return true;
      if (word === 'false') return false;
      if (word === 'null') return null;
      if (word === 'undefined') return undefined;
      return fail(`"${word}" is code, not data, and is not run`);
    }
    return fail(`"${c}" is not the start of a value`);
  };

  const value = readValue(0);
  return { value, end: i };
}

/**
 * The name and the data of a `ready('Name', {...})` call — the way clippy.js
 * agent and sound files register themselves (`clippy.ready`,
 * `clippy.agent.ready`, `clippy.soundsReady`) — or of a file that is only
 * the object literal (JSON).
 */
export function readRegistrationCall(
  text: string,
  callee: RegExp,
  what: string,
): { name?: string; data: LiteralValue } {
  const call = new RegExp(
    `(?:^|[^A-Za-z0-9_$])(?:${callee.source})\\s*\\(\\s*(["'])((?:\\\\.|(?!\\1).)*)\\1\\s*,`,
  ).exec(text);
  if (call) {
    const { value } = readObjectLiteral(
      text,
      call.index + call[0].length,
      what,
    );
    return { name: call[2], data: value };
  }
  const first = text.replace(/^\uFEFF/, '').trimStart();
  if (first.startsWith('{')) {
    const { value, end } = readObjectLiteral(text, text.indexOf('{'), what);
    if (text.slice(end).trim().replace(/;$/, '') !== '') {
      throw new AssistantCharacterFormatError(
        `${what} holds more than one object: only the character's data is read.`,
      );
    }
    return { data: value };
  }
  throw new AssistantCharacterFormatError(
    `${what} is not a clippy.js file: it has no ready('Name', {...}) call and is not a JSON object.`,
  );
}
