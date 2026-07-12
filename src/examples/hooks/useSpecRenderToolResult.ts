/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { getAgentspecs } from '../../specs/agents';
import type { ToolCallRenderContext, RenderToolResult } from '../../types/chat';
import type { FrontendRenderToolSpec } from '../../types/tools';

/**
 * Renderer function keyed by a spec's renderer id.
 *
 * Receives the tool call context plus the matching spec binding so the example
 * can build presentation details (such as a CSS class) from the spec instead of
 * hardcoding them.
 */
export type SpecRenderer = (
  context: ToolCallRenderContext,
  binding: FrontendRenderToolSpec,
) => ReactNode;

// Lazy importers for example CSS files, resolved by filename from the spec.
const cssImporters = import.meta.glob('../components/**/*.css');

/**
 * Builds a `renderToolResult` from an agent spec's `frontendRenderTools`.
 *
 * The example provides only a local map of renderer id to component; the tool
 * name to match and the CSS file to load are read from the spec, so examples do
 * not hardcode tool names or CSS filenames.
 *
 * @param specId - Agent spec id to read render bindings from.
 * @param renderers - Local map of renderer id to renderer function.
 * @returns A render function suitable for the chat components' renderToolResult.
 */
export function useSpecRenderToolResult(
  specId: string | undefined,
  renderers: Record<string, SpecRenderer>,
): RenderToolResult {
  const bindings = useMemo<FrontendRenderToolSpec[]>(() => {
    if (!specId) {
      return [];
    }
    return getAgentspecs(specId)?.frontendRenderTools ?? [];
  }, [specId]);

  // Load any CSS files named by the spec bindings.
  useEffect(() => {
    for (const binding of bindings) {
      if (!binding.css) {
        continue;
      }
      const match = Object.keys(cssImporters).find(path =>
        path.endsWith(`/${binding.css}`),
      );
      if (match) {
        void cssImporters[match]();
      }
    }
  }, [bindings]);

  return useMemo<RenderToolResult>(() => {
    return (context: ToolCallRenderContext) => {
      const binding = bindings.find(b => b.tool === context.toolName);
      if (!binding) {
        return null;
      }
      const renderer = renderers[binding.renderer];
      if (!renderer) {
        return null;
      }
      return renderer(context, binding);
    };
  }, [bindings, renderers]);
}

/**
 * Derives the CSS class a spec renderer loads for its binding.
 *
 * @param binding - The frontend render binding from the spec.
 * @returns A stable CSS class name based on the renderer id.
 */
export function specRendererClassName(binding: FrontendRenderToolSpec): string {
  return `dla-agui-render-${binding.renderer}`;
}
