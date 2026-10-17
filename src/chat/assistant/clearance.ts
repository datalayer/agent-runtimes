/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the floating assistant covers from the right edge of the window while
 * it stands in a bottom corner, as a CSS length on the document: a line
 * written under a prompt there (what an application keeps, R-31) leaves it
 * free, so that the character never stands over its words at a phone's width
 * (REVIEWS Q-08). Unset when it stands anywhere else, steps aside or is gone.
 *
 * @module chat/assistant/clearance
 */

export const ASSISTANT_CLEARANCE_VAR = '--assistant-clearance';
