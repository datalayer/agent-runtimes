/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Prompt components barrel export.
 *
 * @module chat/prompt
 */

export { InputPrompt, type InputPromptProps } from './InputPrompt';
export {
  InputPromptBase,
  type InputPromptBaseProps,
  type InputPromptVariant,
} from './InputPromptBase';
/*
 * The four regions around the input, and the band they are all made of.
 *
 * | | above the input | below the input |
 * | --- | --- | --- |
 * | inside the box | `InPromptHeader` | `InPromptFooter` |
 * | under the box | `BelowPromptHeader` | `BelowPromptFooter` |
 */
export * from './header';
export * from './footer';
export {
  PromptStacks,
  type PromptStack,
  type PromptStacksProps,
} from './stack';
export { InputPromptText, type InputPromptTextProps } from './InputPromptText';
export {
  InputPromptLexical,
  type InputPromptLexicalProps,
} from './InputPromptLexical';
export * from './menus';
export * from './plugins/AgentMentionPlugin';
