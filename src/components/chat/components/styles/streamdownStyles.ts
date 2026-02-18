/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Shared CSS-in-js styles for Streamdown markdown rendering.
 *
 * Streamdown outputs HTML with Tailwind CSS classes (flex, gap-1, p-1, etc.).
 * Since we don't load Tailwind CSS, we provide equivalent styles via
 * Primer's sx prop targeting the Tailwind class names.
 *
 * @module components/chat/components/styles/streamdownStyles
 */

/** Style object compatible with Primer's sx prop */
type SxStyles = Record<string, unknown>;

/**
 * Tailwind utility class equivalents for Streamdown output.
 * Maps Tailwind class names to CSS properties.
 */
const tailwindUtilities: SxStyles = {
  // ── Display / Flexbox ──
  '& .flex': { display: 'flex' },
  '& .inline-block': { display: 'inline-block' },
  '& .block': { display: 'block' },
  '& .hidden': { display: 'none' },
  '& .flex-col': { flexDirection: 'column' },
  '& .items-center': { alignItems: 'center' },
  '& .items-start': { alignItems: 'flex-start' },
  '& .justify-center': { justifyContent: 'center' },
  '& .justify-end': { justifyContent: 'flex-end' },
  '& .justify-between': { justifyContent: 'space-between' },
  '& .flex-shrink-0': { flexShrink: 0 },

  // ── Gap / Spacing ──
  '& .gap-1': { gap: '0.25rem' },
  '& .gap-2': { gap: '0.5rem' },
  '& .space-x-2 > * + *': { marginLeft: '0.5rem' },
  '& .space-y-2 > * + *': { marginTop: '0.5rem' },
  '& .space-y-4 > * + *': { marginTop: '1rem' },

  // ── Padding ──
  '& .p-1': { padding: '0.25rem' },
  '& .p-2': { padding: '0.5rem' },
  '& .p-4': { padding: '1rem' },
  '& .px-1': { paddingLeft: '0.25rem', paddingRight: '0.25rem' },
  '& .px-1\\.5': { paddingLeft: '0.375rem', paddingRight: '0.375rem' },
  '& .px-4': { paddingLeft: '1rem', paddingRight: '1rem' },
  '& .py-0\\.5': { paddingTop: '0.125rem', paddingBottom: '0.125rem' },
  '& .py-1': { paddingTop: '0.25rem', paddingBottom: '0.25rem' },
  '& .py-2': { paddingTop: '0.5rem', paddingBottom: '0.5rem' },
  '& .pl-4': { paddingLeft: '1rem' },
  '& .\\!p-0': { padding: '0 !important' },
  '& .p-1\\.5': { padding: '0.375rem' },

  // ── Margin ──
  '& .mt-1': { marginTop: '0.25rem' },
  '& .mt-2': { marginTop: '0.5rem' },
  '& .mt-6': { marginTop: '1.5rem' },
  '& .mb-2': { marginBottom: '0.5rem' },
  '& .my-4': { marginTop: '1rem', marginBottom: '1rem' },
  '& .my-6': { marginTop: '1.5rem', marginBottom: '1.5rem' },
  '& .mr-2': { marginRight: '0.5rem' },

  // ── Sizing ──
  '& .w-full': { width: '100%' },
  '& .h-full': { height: '100%' },
  '& .h-4': { height: '1rem' },
  '& .w-4': { width: '1rem' },
  '& .h-8': { height: '2rem' },
  '& .w-8': { width: '2rem' },
  '& .size-4': { width: '1rem', height: '1rem' },
  '& .max-w-full': { maxWidth: '100%' },
  '& .min-w-\\[120px\\]': { minWidth: '120px' },

  // ── Typography ──
  '& .text-sm': { fontSize: '0.875rem', lineHeight: '1.25rem' },
  '& .text-xs': { fontSize: '0.75rem', lineHeight: '1rem' },
  '& .text-base': { fontSize: '1rem', lineHeight: '1.5rem' },
  '& .text-lg': { fontSize: '1.125rem', lineHeight: '1.75rem' },
  '& .text-xl': { fontSize: '1.25rem', lineHeight: '1.75rem' },
  '& .text-2xl': { fontSize: '1.5rem', lineHeight: '2rem' },
  '& .text-3xl': { fontSize: '1.875rem', lineHeight: '2.25rem' },
  '& .font-semibold': { fontWeight: 600 },
  '& .font-mono': {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  '& .italic': { fontStyle: 'italic' },
  '& .whitespace-normal': { whiteSpace: 'normal' },
  '& .whitespace-pre-wrap': { whiteSpace: 'pre-wrap' },

  // ── Colors (mapped to Primer theme tokens) ──
  '& .text-muted-foreground': { color: 'fg.muted' },
  '& .text-foreground': { color: 'fg.default' },
  '& .text-red-600': { color: '#dc2626' },
  '& .text-red-700': { color: '#b91c1c' },
  '& .text-red-800': { color: '#991b1b' },
  '& .bg-muted': { backgroundColor: 'neutral.muted' },
  '& .bg-red-50': { backgroundColor: '#fef2f2' },
  '& .bg-red-100': { backgroundColor: '#fee2e2' },
  '& .bg-background': { backgroundColor: 'canvas.default' },

  // ── Background opacity variants ──
  '& .bg-muted\\/80': { backgroundColor: 'neutral.muted' },
  '& .bg-muted\\/40': { backgroundColor: 'neutral.muted' },
  '& .bg-background\\/90': { backgroundColor: 'canvas.default' },
  '& .bg-background\\/95': { backgroundColor: 'canvas.default' },
  '& .bg-black\\/10': { backgroundColor: 'rgba(0,0,0,0.1)' },

  // ── Borders ──
  '& .border': { border: '1px solid', borderColor: 'border.default' },
  '& .border-border': { borderColor: 'border.default' },
  '& .border-b': {
    borderBottom: '1px solid',
    borderBottomColor: 'border.default',
  },
  '& .border-t': { borderTop: '1px solid', borderTopColor: 'border.default' },
  '& .border-l-4': {
    borderLeft: '4px solid',
    borderLeftColor: 'border.default',
  },
  '& .border-red-200': { borderColor: '#fecaca' },
  '& .divide-y > * + *': {
    borderTop: '1px solid',
    borderTopColor: 'border.default',
  },
  '& .divide-border > * + *': { borderColor: 'border.default' },

  // ── Border radius ──
  '& .rounded': { borderRadius: '0.25rem' },
  '& .rounded-md': { borderRadius: '0.375rem' },
  '& .rounded-lg': { borderRadius: '0.5rem' },
  '& .rounded-xl': { borderRadius: '0.75rem' },
  '& .rounded-full': { borderRadius: '9999px' },

  // ── Overflow ──
  '& .overflow-hidden': { overflow: 'hidden' },
  '& .overflow-x-auto': { overflowX: 'auto' },
  '& .overflow-auto': { overflow: 'auto' },

  // ── List styles ──
  '& .list-disc': { listStyleType: 'disc' },
  '& .list-decimal': { listStyleType: 'decimal' },
  '& .list-inside': { listStylePosition: 'inside' },

  // ── Cursor ──
  '& .cursor-pointer': { cursor: 'pointer' },

  // ── Position ──
  '& .relative': { position: 'relative' },
  '& .absolute': { position: 'absolute' },
  '& .fixed': { position: 'fixed' },
  '& .inset-0': { top: 0, right: 0, bottom: 0, left: 0 },
  '& .top-4': { top: '1rem' },
  '& .right-0': { right: 0 },
  '& .right-2': { right: '0.5rem' },
  '& .right-4': { right: '1rem' },
  '& .bottom-2': { bottom: '0.5rem' },
  '& .z-10': { zIndex: 10 },
  '& .z-50': { zIndex: 50 },

  // ── Shadow ──
  '& .shadow-sm': { boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' },
  '& .shadow-lg': {
    boxShadow:
      '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)',
  },

  // ── Transitions ──
  '& .transition-all': { transition: 'all 150ms ease' },
  '& .transition-colors': {
    transition:
      'color 150ms ease, background-color 150ms ease, border-color 150ms ease',
  },
  '& .transition-transform': { transition: 'transform 150ms ease' },
  '& .duration-150': { transitionDuration: '150ms' },
  '& .duration-200': { transitionDuration: '200ms' },
  '& .ease-out': { transitionTimingFunction: 'ease-out' },

  // ── Opacity ──
  '& .opacity-50': { opacity: 0.5 },

  // ── Animation ──
  '& .animate-spin': {
    animation: 'spin 1s linear infinite',
  },

  // ── Hover states ──
  '& .hover\\:text-foreground:hover': { color: 'fg.default' },
  '& .hover\\:bg-muted:hover': { backgroundColor: 'neutral.muted' },
  '& .hover\\:bg-background:hover': { backgroundColor: 'canvas.default' },
  '& .hover\\:block:hover': { display: 'block' },
  '& .group:hover .group-hover\\:block': { display: 'block' },

  // ── Disabled ──
  '& .disabled\\:cursor-not-allowed:disabled': { cursor: 'not-allowed' },
  '& .disabled\\:opacity-50:disabled': { opacity: 0.5 },

  // ── Backdrop ──
  '& .backdrop-blur-sm': { backdropFilter: 'blur(4px)' },

  // ── Misc ──
  '& .pointer-events-none': { pointerEvents: 'none' },
  '& .origin-center': { transformOrigin: 'center' },
};

/**
 * Markdown element styles for Streamdown content.
 * Provides proper formatting for headings, lists, tables, code, etc.
 * Uses Primer theme tokens for colors and spacing.
 */
export const streamdownMarkdownStyles: SxStyles = {
  fontSize: 1,
  lineHeight: 1.5,
  '& > *:first-child': { marginTop: 0 },
  '& > *:last-child': { marginBottom: 0 },
  '& p': { marginTop: 0, marginBottom: '0.75em' },
  '& h1, & h2, & h3, & h4, & h5, & h6': {
    marginTop: '1em',
    marginBottom: '0.5em',
    fontWeight: 'bold',
  },
  '& h1': { fontSize: '1.5em' },
  '& h2': { fontSize: '1.3em' },
  '& h3': { fontSize: '1.15em' },
  '& ul, & ol': {
    marginTop: '0.5em',
    marginBottom: '0.5em',
    paddingInlineStart: '1.25em',
  },
  '& li': {
    paddingInlineStart: '0.25em',
    marginBottom: '0.25em',
  },
  '& code': {
    backgroundColor: 'neutral.muted',
    padding: '2px 4px',
    borderRadius: '4px',
    fontSize: '0.9em',
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  '& pre code': {
    backgroundColor: 'transparent',
    padding: 0,
  },
  '& blockquote': {
    borderLeft: '3px solid',
    borderColor: 'border.default',
    paddingLeft: '12px',
    marginLeft: 0,
    marginRight: 0,
    color: 'fg.muted',
  },
  '& a': {
    color: 'accent.fg',
    textDecoration: 'underline',
  },
  '& table': {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: '0.75em',
    marginBottom: '0.75em',
    fontSize: '0.9em',
  },
  '& th, & td': {
    border: '1px solid',
    borderColor: 'border.default',
    padding: '6px 12px',
    textAlign: 'left',
  },
  '& th': {
    backgroundColor: 'canvas.inset',
    fontWeight: 'bold',
  },
  '& tr:nth-of-type(even)': {
    backgroundColor: 'canvas.inset',
  },
  '& img': {
    maxWidth: '100%',
    borderRadius: '8px',
  },
  '& hr': {
    border: 'none',
    borderTop: '1px solid',
    borderColor: 'border.default',
    marginTop: '1em',
    marginBottom: '1em',
  },
  // Include Tailwind utilities for Streamdown output
  ...tailwindUtilities,
};

/**
 * Code block specific styles for Streamdown's data-streamdown attributes.
 * These target Streamdown's code block structure.
 */
export const streamdownCodeBlockStyles: SxStyles = {
  '& [data-streamdown="code-block"]': {
    borderRadius: '8px',
    border: '1px solid',
    borderColor: 'border.default',
    overflow: 'hidden',
    my: 2,
  },
  '& [data-streamdown="code-block-header"]': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'canvas.subtle',
    padding: '8px 12px',
    fontSize: '12px',
    color: 'fg.muted',
  },
  '& [data-streamdown="code-block-header"] button': {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    color: 'fg.muted',
    borderRadius: '4px',
    '&:hover': {
      backgroundColor: 'neutral.muted',
      color: 'fg.default',
    },
  },
  '& [data-streamdown="code-block-body"]': {
    backgroundColor: 'canvas.subtle',
    padding: '12px',
    margin: 0,
    overflow: 'auto',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  '& [data-streamdown="code-block-body"] code': {
    display: 'block',
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  '& [data-streamdown="code-block-body"] code > span.block': {
    display: 'block',
  },
  '& [data-streamdown="code-block-body"] code > span': {
    display: 'block',
  },
  '& pre': {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowX: 'auto',
    margin: 0,
  },
  '& pre code': {
    whiteSpace: 'pre-wrap',
  },
  '& code': {
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
};
