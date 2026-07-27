/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

// Runtime shim: force the primer-addons Box export to use Primer's Box.
// This prevents `sx` from being forwarded to raw DOM nodes as an attribute.
export { Box as default, Box } from '@primer/react';
