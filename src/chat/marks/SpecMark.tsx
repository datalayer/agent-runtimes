/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The mark of a catalogue entry: its icon, else its emoji, else nothing.
 *
 * An MCP server, a skill, a tool and a frontend tool set each name an icon by
 * its package (`@datalayer/icons-react:odoo`). Each package is imported when
 * the first icon from it is drawn, once, and never before: the Datalayer icons
 * are five hundred components, and a chat that names three of them should not
 * have to carry the rest up front.
 *
 * @module chat/marks/SpecMark
 */

import React, { useEffect, useState } from 'react';

import { parseIconRef, type IconPackage, type IconRef } from './iconRef';

/** What either package exports an icon as. */
export type MarkIcon = React.ComponentType<{
  size?: number;
  'aria-hidden'?: boolean | 'true' | 'false';
}>;

type IconModule = Record<string, unknown>;

const LOADERS: Record<IconPackage, () => Promise<IconModule>> = {
  '@datalayer/icons-react': () =>
    import('@datalayer/icons-react') as Promise<IconModule>,
  '@primer/octicons-react': () =>
    import('@primer/octicons-react') as Promise<IconModule>,
};

const loaded = new Map<IconPackage, IconModule>();
const loading = new Map<IconPackage, Promise<IconModule>>();

/** Import a package of icons, once. */
export function loadIconPackage(pkg: IconPackage): Promise<IconModule> {
  const pending =
    loading.get(pkg) ??
    LOADERS[pkg]().then(module => {
      loaded.set(pkg, module);
      return module;
    });
  loading.set(pkg, pending);
  return pending;
}

/** The icon a reference names, from its loaded package; refused when it has none. */
export function iconOf(ref: IconRef, module: IconModule): MarkIcon {
  const icon = module[ref.exportName];
  if (!icon) {
    throw new Error(
      `${ref.pkg} has no icon ${ref.name} (${ref.exportName}): name one it has`,
    );
  }
  return icon as MarkIcon;
}

/** An icon reference resolved: the component, `undefined` while its package loads. */
export function useMarkIcon(icon: string | undefined): MarkIcon | undefined {
  const ref = icon ? parseIconRef(icon) : undefined;
  const pkg = ref?.pkg;
  const ready = pkg ? loaded.get(pkg) : undefined;
  const [, setLoaded] = useState(0);
  const [failure, setFailure] = useState<Error | null>(null);

  useEffect(() => {
    if (!pkg || ready) {
      return;
    }
    let live = true;
    loadIconPackage(pkg).then(
      () => live && setLoaded(n => n + 1),
      error => live && setFailure(error as Error),
    );
    return () => {
      live = false;
    };
  }, [pkg, ready]);

  if (failure) {
    throw failure;
  }
  return ref && ready ? iconOf(ref, ready) : undefined;
}

export interface SpecMarkProps {
  /** `<package>:<name>`, as the catalogue says it. */
  icon?: string;
  /** Drawn where there is no icon. */
  emoji?: string;
  /** In pixels. */
  size?: number;
}

/**
 * The icon, else the emoji, else nothing.
 *
 * While the icon's package loads, a blank of the icon's size holds its place,
 * so the line it sits in does not move when it arrives.
 */
export function SpecMark({ icon, emoji, size = 16 }: SpecMarkProps) {
  const Icon = useMarkIcon(icon);
  if (icon) {
    return Icon ? (
      <span
        data-mark={icon}
        style={{ display: 'inline-flex', flexShrink: 0, lineHeight: 0 }}
      >
        <Icon size={size} aria-hidden="true" />
      </span>
    ) : (
      <span
        data-mark={icon}
        aria-hidden="true"
        style={{ display: 'inline-block', width: size, height: size }}
      />
    );
  }
  if (emoji) {
    return (
      <span
        data-mark="emoji"
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          flexShrink: 0,
          fontSize: Math.round(size * 0.9),
          lineHeight: 1,
        }}
      >
        {emoji}
      </span>
    );
  }
  return null;
}

/** Whether an entry has a mark to draw. */
export function hasMark(
  marks: { icon?: string; emoji?: string } | null | undefined,
): boolean {
  return Boolean(marks?.icon || marks?.emoji);
}

export default SpecMark;
