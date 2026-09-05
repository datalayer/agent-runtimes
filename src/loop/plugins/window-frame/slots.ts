/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The window frame's slots, by name.
 *
 * In their own module so the frame component, the plugin and a host that fills
 * them can each import the names without importing each other — the same
 * reason the graph plugin keeps its view type apart.
 *
 * @module loop/plugins/window-frame/slots
 */

/**
 * The leading edge of the title bar.
 *
 * The three dots are contributed here by the plugin itself, so a host that
 * wants a different set of window controls can switch the plugin off and
 * contribute its own rather than fight the ones it was given.
 */
export const WINDOW_CONTROLS_SLOT = 'loop.window.controls';

/**
 * The trailing edge of the title bar.
 *
 * Empty unless a host fills it. What belongs here is what the *page* offers
 * about the workspace — a link to the section that explains it, a sign-in
 * prompt — as opposed to what the workspace offers about the conversation,
 * which is the chat's own header.
 */
export const WINDOW_ACTIONS_SLOT = 'loop.window.actions';
