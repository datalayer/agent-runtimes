/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An icon reference, as the agentspecs catalogues write it.
 *
 * `<package>:<name>`: the package the icon is in and the icon's own name, in
 * kebab case, as that package names it — `@datalayer/icons-react:odoo` (the
 * Datalayer icons' `odoo.svg`, exported as `OdooIcon`),
 * `@primer/octicons-react:mark-github` (`MarkGithubIcon`). The rule is
 * `agentspecs.marks`; this is the same rule, read on the page.
 *
 * @module chat/marks/iconRef
 */

/** The packages an icon may come from. */
export const ICON_PACKAGES = [
  '@datalayer/icons-react',
  '@primer/octicons-react',
] as const;

export type IconPackage = (typeof ICON_PACKAGES)[number];

export interface IconRef {
  /** The package the icon is in. */
  pkg: IconPackage;
  /** The icon's name, in kebab case: `odoo`, `mark-github`. */
  name: string;
  /** What the package exports it as: `OdooIcon`, `MarkGithubIcon`. */
  exportName: string;
}

const ICON_REF =
  /^(@datalayer\/icons-react|@primer\/octicons-react):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * The component an icon's name is exported as, by the rule both packages
 * follow: each word capitalised, joined, and `Icon` after it.
 */
export function exportNameOf(name: string): string {
  return (
    name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('') + 'Icon'
  );
}

/** Read an icon reference; anything else is refused. */
export function parseIconRef(ref: string): IconRef {
  const match = ICON_REF.exec(ref);
  if (!match) {
    throw new Error(
      `The icon ${JSON.stringify(ref)} is not <package>:<name>, the package one of ${ICON_PACKAGES.join(', ')} and the name in kebab case`,
    );
  }
  const [, pkg, name] = match;
  return { pkg: pkg as IconPackage, name, exportName: exportNameOf(name) };
}
