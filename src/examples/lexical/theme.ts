/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Lexical theme configuration
 * Maps Lexical node types to CSS class names defined in lexical-theme.css
 */
export const lexicalTheme = {
  // Text formatting
  text: {
    bold: 'lexical-theme-bold',
    italic: 'lexical-theme-italic',
    underline: 'lexical-theme-underline',
    strikethrough: 'lexical-theme-strikethrough',
    code: 'lexical-theme-code',
    subscript: 'lexical-theme-subscript',
    superscript: 'lexical-theme-superscript',
  },
  // Block elements
  paragraph: 'lexical-theme-paragraph',
  quote: 'lexical-theme-quote',
  heading: {
    h1: 'lexical-theme-heading-h1',
    h2: 'lexical-theme-heading-h2',
    h3: 'lexical-theme-heading-h3',
    h4: 'lexical-theme-heading-h4',
    h5: 'lexical-theme-heading-h5',
    h6: 'lexical-theme-heading-h6',
  },
  // Lists
  list: {
    ul: 'lexical-theme-list-ul',
    ol: 'lexical-theme-list-ol',
    listitem: 'lexical-theme-list-listitem',
    nested: {
      listitem: 'lexical-theme-list-nested-listitem',
    },
    checklist: 'lexical-theme-list-checklist',
    listitemChecked: 'lexical-theme-list-listitemChecked',
    listitemUnchecked: 'lexical-theme-list-listitemUnchecked',
  },
  // Code blocks
  code: 'lexical-theme-code-block',
  codeHighlight: {
    comment: 'lexical-theme-code-tokenComment',
    punctuation: 'lexical-theme-code-tokenPunctuation',
    property: 'lexical-theme-code-tokenProperty',
    selector: 'lexical-theme-code-tokenSelector',
    operator: 'lexical-theme-code-tokenOperator',
    attr: 'lexical-theme-code-tokenAttr',
    variable: 'lexical-theme-code-tokenVariable',
    function: 'lexical-theme-code-tokenFunction',
    keyword: 'lexical-theme-code-tokenKeyword',
    string: 'lexical-theme-code-tokenString',
    number: 'lexical-theme-code-tokenNumber',
    boolean: 'lexical-theme-code-tokenBoolean',
    regex: 'lexical-theme-code-tokenRegex',
  },
  // Links
  link: 'lexical-theme-link',
  autolink: 'lexical-theme-autolink',
  // Tables
  table: 'lexical-theme-table',
  tableCell: 'lexical-theme-tableCell',
  tableCellHeader: 'lexical-theme-tableCellHeader',
  // Special nodes
  hashtag: 'lexical-theme-hashtag',
  image: 'lexical-theme-image',
  hr: 'lexical-theme-hr',
  mark: 'lexical-theme-mark',
};
