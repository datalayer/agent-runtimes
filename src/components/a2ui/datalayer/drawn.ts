/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The components of Datalayer's own a renderer draws (LOOP C-18), without
 * the renderers: what a host that does not draw — the Studio's tests, a
 * checker — reads to know that a component of the catalog is drawn. The
 * renderers' module refuses to load when it and the catalog disagree.
 *
 * @module components/a2ui/datalayer/drawn
 */

export const DRAWN_OWN_COMPONENTS = [
  'Table',
  'Chart',
  'FileUpload',
  'Chat',
  'Evidence',
  'Form',
] as const;

export type DrawnOwnComponent = (typeof DRAWN_OWN_COMPONENTS)[number];
