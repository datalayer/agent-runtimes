/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A JSON value as a tree: objects and arrays fold and unfold, each value
 * coloured by its type (theme colours, light and dark), long strings cut
 * until asked for whole, and the whole value copied as JSON.
 *
 * @module components/inspector/JsonTree
 */

import type { JSX } from 'react';
import { useState } from 'react';
import { Button, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { CopyIcon, CheckIcon } from '@primer/octicons-react';

export type JsonTreeProps = {
  value: unknown;
  /** The root's name, shown as its key. */
  name?: string;
  /** How many levels open at first. */
  expandDepth?: number;
  /** Offer *Copy JSON* above the tree. */
  copyable?: boolean;
  /** Longer strings are cut until clicked. */
  stringLimit?: number;
};

const MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

/** A value's type, as the tree colours it. */
export function jsonType(
  value: unknown,
): 'string' | 'number' | 'boolean' | 'null' | 'array' | 'object' | 'undefined' {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return type;
  }
  if (type === 'bigint') {
    return 'number';
  }
  return type === 'undefined' ? 'undefined' : 'object';
}

const COLOURS: Record<string, string> = {
  string: 'success.fg',
  number: 'accent.fg',
  boolean: 'done.fg',
  null: 'fg.muted',
  undefined: 'fg.muted',
};

function Leaf({
  value,
  stringLimit,
}: {
  value: unknown;
  stringLimit: number;
}): JSX.Element {
  const type = jsonType(value);
  const [whole, setWhole] = useState(false);
  if (type === 'string') {
    const text = value as string;
    const cut = !whole && text.length > stringLimit;
    return (
      <Text
        data-json-type="string"
        sx={{
          color: COLOURS.string,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {JSON.stringify(cut ? text.slice(0, stringLimit) : text)}
        {cut && (
          <Box
            as="button"
            type="button"
            onClick={() => setWhole(true)}
            sx={{
              ml: 1,
              p: 0,
              border: 0,
              bg: 'transparent',
              color: 'accent.fg',
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            … {text.length - stringLimit} more
          </Box>
        )}
      </Text>
    );
  }
  return (
    <Text data-json-type={type} sx={{ color: COLOURS[type] ?? 'fg.default' }}>
      {type === 'undefined' ? 'undefined' : String(value)}
    </Text>
  );
}

function Node({
  name,
  value,
  depth,
  expandDepth,
  stringLimit,
}: {
  name?: string;
  value: unknown;
  depth: number;
  expandDepth: number;
  stringLimit: number;
}): JSX.Element {
  const type = jsonType(value);
  const branch = type === 'array' || type === 'object';
  const [open, setOpen] = useState(depth < expandDepth);
  const key =
    name !== undefined ? (
      <Text sx={{ color: 'fg.default', fontWeight: 600 }}>{name}: </Text>
    ) : null;
  if (!branch) {
    return (
      <Box role="treeitem" data-json-node="" sx={{ pl: 3 }}>
        {key}
        <Leaf value={value} stringLimit={stringLimit} />
      </Box>
    );
  }
  const items: [string, unknown][] =
    type === 'array'
      ? (value as unknown[]).map((item, index) => [String(index), item])
      : Object.entries(value as Record<string, unknown>);
  const [openMark, closeMark] = type === 'array' ? ['[', ']'] : ['{', '}'];
  return (
    <Box
      role="treeitem"
      aria-expanded={open}
      data-json-node=""
      sx={{ pl: depth ? 3 : 0 }}
    >
      <Box
        as="button"
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={`${open ? 'Fold' : 'Unfold'} ${name ?? 'the value'}`}
        data-json-toggle=""
        sx={{
          p: 0,
          border: 0,
          bg: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Text sx={{ color: 'fg.muted', display: 'inline-block', width: '1em' }}>
          {open ? '▾' : '▸'}
        </Text>
        {key}
        <Text sx={{ color: 'fg.muted' }}>
          {open
            ? openMark
            : `${openMark} ${items.length} ${type === 'array' ? (items.length === 1 ? 'item' : 'items') : items.length === 1 ? 'key' : 'keys'} ${closeMark}`}
        </Text>
      </Box>
      {open && (
        <Box role="group">
          {items.map(([itemName, item]) => (
            <Node
              key={itemName}
              name={itemName}
              value={item}
              depth={depth + 1}
              expandDepth={expandDepth}
              stringLimit={stringLimit}
            />
          ))}
          <Text sx={{ color: 'fg.muted', pl: 3 }}>{closeMark}</Text>
        </Box>
      )}
    </Box>
  );
}

/** A JSON value, as a tree. */
export function JsonTree({
  value,
  name,
  expandDepth = 1,
  copyable = true,
  stringLimit = 240,
}: JsonTreeProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = JSON.stringify(value, null, 2) ?? 'undefined';
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  };
  return (
    <Box
      data-json-tree=""
      sx={{ fontFamily: MONO, fontSize: 0, lineHeight: 1.6, minWidth: 0 }}
    >
      {copyable && (
        <Button
          size="small"
          variant="invisible"
          leadingVisual={copied ? CheckIcon : CopyIcon}
          onClick={copy}
          data-json-copy=""
          sx={{ float: 'right' }}
        >
          {copied ? 'Copied' : 'Copy JSON'}
        </Button>
      )}
      <Box role="tree" aria-label={name ?? 'JSON'}>
        <Node
          name={name}
          value={value}
          depth={0}
          expandDepth={expandDepth}
          stringLimit={stringLimit}
        />
      </Box>
    </Box>
  );
}

export default JsonTree;
