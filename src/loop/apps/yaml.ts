/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Appspec as a YAML file a person also edits.
 *
 * An application's file is reviewed like code: it has comments, an order
 * somebody chose, a way of quoting. When the Canvas changes one field and
 * writes the file back, all of that has to still be there — a comment that
 * disappears on a save is a reason never to open the Canvas again.
 *
 * {@link writeAppspecYaml} therefore does not write the application afresh
 * when there is a file already: it writes it **into** that file. What did not
 * change keeps its node — its comment, its style, its place — and only what
 * changed is replaced. Two things are the writer's own and are
 * settled by the first save: one space before a comment at the end of a
 * line, and long text folded at eighty columns. A file written once is
 * given back untouched when nothing changed. An item of a list is followed by what identifies it
 * (a connection's server, a rule's action, a component's id), so that a
 * comment stays with its item when the list is reordered or grows.
 *
 * With no file to write into, the document is the canonical one
 * (`dumpAppspec`): the spec's keys in the spec's order.
 *
 * Pure: nothing here reads or writes a disk.
 *
 * @module loop/apps/yaml
 */

import {
  Document,
  Pair,
  Scalar,
  YAMLMap,
  YAMLSeq,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
} from 'yaml';
import type { AppSpec } from '../../types/agentspecs';
import { dumpAppspec, parseAppspec, type ParsedAppspec } from './appspec';

type Data = Record<string, unknown>;

const isData = (value: unknown): value is Data =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * How the file is written. Long text is folded at eighty columns, and a
 * list written on one line stays `[a, b]`.
 */
const WRITING = {
  indent: 2,
  lineWidth: 80,
  flowCollectionPadding: false,
} as const;

/**
 * An application from its YAML file.
 *
 * What YAML itself refuses is reported with its line, before anything the
 * spec has to say; the application returned is whole either way.
 */
export function readAppspecYaml(text: string): ParsedAppspec {
  const document = parseDocument(text, { prettyErrors: true });
  if (document.errors.length > 0) {
    const parsed = parseAppspec({});
    return {
      app: parsed.app,
      problems: document.errors.map(error => {
        const at = error.linePos?.[0];
        const where = at ? `Line ${at.line}: ` : '';
        return `${where}${error.message.split('\n')[0]}`;
      }),
    };
  }
  return parseAppspec(document.toJS());
}

/** What identifies an item of a list, when its items are mappings. */
const IDENTITIES = ['id', 'server', 'action', 'space', 'name', 'label', 'ask'];

/** The key every item of both lists has, with a different value each — or none. */
function identityOf(items: unknown[], nodes: unknown[]): string | undefined {
  const ofNode = (node: unknown, key: string): unknown =>
    isMap(node) ? (node as YAMLMap).get(key) : undefined;
  return IDENTITIES.find(key => {
    const values = items.map(item => (isData(item) ? item[key] : undefined));
    const existing = nodes.map(node => ofNode(node, key));
    const distinct = (list: unknown[]) =>
      list.every(value => typeof value === 'string') &&
      new Set(list).size === list.length;
    return items.length > 0 && distinct(values) && distinct(existing);
  });
}

/** A value as a node of a document, as the document would write it new. */
const nodeOf = (document: Document, value: unknown): unknown =>
  document.createNode(value);

/**
 * A node saying a value: the node itself when it already does, changed in
 * place where it can be, and a new one only when it is not the same kind of
 * thing any more.
 *
 * `before` is what the file said at this place, in the canonical form: a key
 * the canonical form leaves out both before and now — a default written out
 * by its author, `enabled: true`, `access: read` — is kept as it was written.
 */
function merged(
  document: Document,
  node: unknown,
  value: unknown,
  before: unknown,
): unknown {
  if (isData(value) && isMap(node)) {
    mergeMap(document, node as YAMLMap, value, isData(before) ? before : {});
    return node;
  }
  if (Array.isArray(value) && isSeq(node)) {
    mergeSeq(
      document,
      node as YAMLSeq,
      value,
      Array.isArray(before) ? before : [],
    );
    return node;
  }
  if (!isData(value) && !Array.isArray(value) && isScalar(node)) {
    const scalar = node as Scalar;
    if (scalar.value !== value) {
      scalar.value = value;
    }
    return scalar;
  }
  return nodeOf(document, value);
}

const keyOf = (pair: Pair): string =>
  isScalar(pair.key) ? String(pair.key.value) : String(pair.key);

const has = (data: Data, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(data, key);

/**
 * A mapping made to say `value`: its own pairs kept, changed, removed or
 * joined.
 *
 * A pair is removed only when the application stopped saying it: when the
 * canonical form had it before and has it no more. One the canonical form
 * never had — a default spelled out, a key this reader does not know — stays
 * as it was written.
 *
 * A key that is new goes after the key the canonical form puts just before
 * it, among those that are there, wherever the person put that one; first
 * when nothing comes before it. The canonical form writes its keys in the
 * spec's order, at every depth.
 */
function mergeMap(
  document: Document,
  map: YAMLMap,
  value: Data,
  before: Data,
): void {
  map.items = (map.items as Pair[]).filter(pair => {
    const key = keyOf(pair);
    return has(value, key) || !has(before, key);
  });
  const order = Object.keys(value);
  for (const [key, item] of Object.entries(value)) {
    const pair = (map.items as Pair[]).find(
      existing => keyOf(existing) === key,
    );
    if (pair) {
      pair.value = merged(
        document,
        pair.value,
        item,
        before[key],
      ) as Pair['value'];
      continue;
    }
    const created = document.createPair(key, item);
    const rank = order.indexOf(key);
    let after = -1;
    let best = -1;
    (map.items as Pair[]).forEach((existing, index) => {
      const other = order.indexOf(keyOf(existing));
      if (other >= 0 && other < rank && other > best) {
        best = other;
        after = index;
      }
    });
    map.items.splice(after + 1, 0, created);
  }
}

/** A list made to say `value`: an item keeps its node when it can be told which it was. */
function mergeSeq(
  document: Document,
  seq: YAMLSeq,
  value: unknown[],
  before: unknown[],
): void {
  const nodes = seq.items as unknown[];
  const identity = identityOf(value, nodes);
  if (identity) {
    const byIdentity = new Map(
      nodes.map(node => [(node as YAMLMap).get(identity), node]),
    );
    const beforeByIdentity = new Map(
      before.filter(isData).map(item => [item[identity], item]),
    );
    seq.items = value.map(item => {
      const key = (item as Data)[identity];
      const existing = byIdentity.get(key);
      return existing
        ? merged(document, existing, item, beforeByIdentity.get(key))
        : nodeOf(document, item);
    });
    return;
  }
  // Nothing tells the items apart: they are followed by their place.
  seq.items = value.map((item, index) =>
    index < nodes.length
      ? merged(document, nodes[index], item, before[index])
      : nodeOf(document, item),
  );
}

/**
 * An application as its YAML file.
 *
 * Into `previous` when there is one and it reads: what did not change keeps
 * its comments, its order and its style. Afresh otherwise, as the canonical
 * document. Either way the file reads back as the application.
 */
export function writeAppspecYaml(app: AppSpec, previous?: string): string {
  const data = dumpAppspec(app);
  if (previous !== undefined && previous.trim() !== '') {
    const document = parseDocument(previous);
    if (document.errors.length === 0 && isMap(document.contents)) {
      mergeMap(
        document,
        document.contents as YAMLMap,
        data,
        dumpAppspec(parseAppspec(document.toJS()).app),
      );
      return document.toString(WRITING);
    }
  }
  return new Document(data).toString(WRITING);
}
