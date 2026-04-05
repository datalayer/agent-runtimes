/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import JSON5 from 'json5/dist/index.mjs';

export const parse = JSON5.parse.bind(JSON5);
export const stringify = JSON5.stringify.bind(JSON5);

export default JSON5;
