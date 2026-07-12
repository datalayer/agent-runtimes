/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { BetterSystemStyleObject } from '@primer/react';

const A2UI_INPUT_SELECTOR = '& .a2ui-textfield-input';
const A2UI_INPUT_FOCUS_SELECTOR = '& .a2ui-textfield-input:focus';
const A2UI_INPUT_HOVER_SELECTOR = '& .a2ui-textfield-input:hover';

/**
 * Shared style scope for A2UI-rendered HTML.
 *
 * Uses A2UI CSS custom properties so consumers can drive visuals from their
 * own theme system (Primer tokens, app-level variables, etc.).
 *
 * NOTE: This must be a plain style object (not the result of
 * `@styled-system/css`), because it is consumed by spreading into a Primer
 * `sx` prop (`sx={{ ...A2UI_RENDER_SCOPE_SX }}`). `css()` returns a *function*,
 * which spreads to `{}` and silently drops every rule — leaving A2UI surfaces
 * unthemed (browser-default grey, ignoring color mode).
 */
export const A2UI_RENDER_SCOPE_SX: BetterSystemStyleObject = {
  // Icons render via `font-size: var(--a2ui-icon-size, …xl 24px)`. When the
  // Material Symbols font is not loaded the raw name (e.g. "phone") shows as
  // text; the 24px fallback makes those labels look larger than the adjacent
  // values. Pin the icon size to the surrounding text size so they align.
  '--a2ui-icon-size': '1em',

  '& .a2ui-card': {
    background:
      'var(--a2ui-card-background, var(--a2ui-color-surface, #f6f8fa))',
    border: '1px solid var(--a2ui-color-border, #d0d7de)',
    borderRadius: 'var(--a2ui-card-border-radius, 12px)',
    boxShadow: 'var(--a2ui-card-box-shadow, none)',
  },

  '& .a2ui-text': {
    color:
      'var(--a2ui-color-on-surface, var(--a2ui-color-on-background, #1f2328))',
    margin: 0,
  },

  '& .a2ui-caption': {
    color:
      'var(--a2ui-text-caption-color, var(--a2ui-color-on-surface, #656d76))',
  },

  '& .a2ui-button': {
    appearance: 'none',
    cursor: 'pointer',
    border: '1px solid var(--a2ui-color-primary, #1f883d)',
    background: 'var(--a2ui-color-primary, #1f883d)',
    color: 'var(--a2ui-color-on-primary, #ffffff)',
    borderRadius: 'var(--a2ui-button-border-radius, 6px)',
    padding: 'var(--a2ui-button-padding, 5px 16px)',
    fontWeight: 'var(--a2ui-button-font-weight, 500)',
    boxShadow: 'var(--a2ui-button-box-shadow, none)',
    transition: 'background-color 0.15s ease, border-color 0.15s ease',
  },

  '& .a2ui-button:hover': {
    background: 'var(--a2ui-color-primary-hover, #1a7f37)',
    borderColor: 'var(--a2ui-color-primary-hover, #1a7f37)',
  },

  '& .a2ui-button:disabled': {
    opacity: 0.6,
    cursor: 'not-allowed',
  },

  '& .a2ui-tab-button': {
    appearance: 'none',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    borderRadius: 0,
    marginBottom: '-1px',
    padding: 'var(--a2ui-tab-padding, 8px 16px)',
    color: 'var(--a2ui-tab-color, var(--a2ui-color-on-surface, #656d76))',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'var(--a2ui-font-size-sm, 14px)',
    fontWeight: 500,
    boxShadow: 'none',
    transition:
      'color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease',
  },

  '& .a2ui-tab-button:hover': {
    color: 'var(--a2ui-tab-color-hover, var(--a2ui-color-primary, #1f883d))',
    background:
      'var(--a2ui-tab-background-hover, var(--a2ui-color-surface, #f6f8fa))',
  },

  '& .a2ui-tab-button.active': {
    color: 'var(--a2ui-tab-color-active, var(--a2ui-color-primary, #1f883d))',
    borderBottomColor:
      'var(--a2ui-tab-border-active, var(--a2ui-color-primary, #1f883d))',
    fontWeight: 600,
  },

  '& .chip': {
    appearance: 'none',
    padding: 'var(--a2ui-choicepicker-chip-padding, 4px 12px)',
    borderRadius: 'var(--a2ui-choicepicker-chip-border-radius, 999px)',
    border: '1px solid var(--a2ui-color-border, #d0d7de)',
    background: 'var(--a2ui-color-surface, #f6f8fa)',
    color: 'var(--a2ui-color-on-surface, #1f2328)',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'var(--a2ui-font-size-sm, 14px)',
    fontWeight: 500,
    boxShadow: 'none',
    transition:
      'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
  },

  '& .chip:hover': {
    borderColor:
      'var(--a2ui-color-border-hover, var(--a2ui-color-primary, #1f883d))',
  },

  '& .chip.selected, & .chip[aria-pressed="true"]': {
    background: 'var(--a2ui-color-primary, #1f883d)',
    borderColor: 'var(--a2ui-color-primary, #1f883d)',
    color: 'var(--a2ui-color-on-primary, #ffffff)',
  },

  [A2UI_INPUT_SELECTOR]: {
    width: '100%',
    minHeight: 'var(--a2ui-control-height, 32px)',
    boxSizing: 'border-box',
    background:
      'var(--a2ui-textfield-background, var(--a2ui-color-input, var(--a2ui-color-background, #ffffff)))',
    color:
      'var(--a2ui-textfield-color, var(--a2ui-color-on-input, var(--a2ui-color-on-background, #1f2328)))',
    border:
      'var(--a2ui-textfield-border, 1px solid var(--a2ui-color-border, #d0d7de))',
    borderRadius: 'var(--a2ui-textfield-border-radius, 6px)',
    padding: 'var(--a2ui-textfield-padding, 5px 12px)',
    fontSize: 'var(--a2ui-font-size-sm, 14px)',
    lineHeight: '20px',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },

  [A2UI_INPUT_HOVER_SELECTOR]: {
    borderColor:
      'var(--a2ui-textfield-color-border-hover, var(--a2ui-color-border-hover, #8c959f))',
  },

  [A2UI_INPUT_FOCUS_SELECTOR]: {
    outline: 'none',
    borderColor:
      'var(--a2ui-textfield-color-border-focus, var(--a2ui-color-primary, #1f883d))',
    boxShadow:
      '0 0 0 3px color-mix(in srgb, var(--a2ui-color-primary, #1f883d) 25%, transparent)',
  },

  '& .a2ui-textfield-label': {
    color:
      'var(--a2ui-textfield-label-color, var(--a2ui-color-on-surface, var(--a2ui-color-on-background, #1f2328)))',
    fontWeight: 600,
    fontSize: 'var(--a2ui-font-size-xs, 12px)',
    marginBottom: 'var(--a2ui-spacing-xxs, 4px)',
    display: 'inline-block',
  },

  '& .a2ui-textfield-error': {
    color: 'var(--a2ui-textfield-color-error, #d1242f)',
    fontSize: 'var(--a2ui-font-size-xs, 12px)',
    marginTop: 'var(--a2ui-spacing-xs, 4px)',
  },

  '& input[type="checkbox"]': {
    accentColor: 'var(--a2ui-color-primary, #1f883d)',
  },
};
