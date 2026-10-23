/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An example's own tool renderers, as a Reactor plugin.
 *
 * The chat draws a tool call with whichever plugin bound the tool
 * (`ToolBindings`) and renders its display type (`Renderers`); there is no
 * render prop to hand it. An example that demonstrates how a tool result is
 * drawn therefore contributes a plugin: `createToolRenderersPlugin` builds
 * one for a list of tools and a render function the example can change while
 * the page runs; `useToolRenderers` mounts it on a platform of its own, for a
 * standalone chat with no workspace around it; `useSpecToolRenderers` reads
 * the tools from an agent spec's `frontendRenderTools`.
 */

import { createElement, Fragment, useEffect, useMemo } from 'react';
import type { JSX, ReactNode } from 'react';
import {
  buildReactorFromPlugins,
  contribution,
  definePlugin,
  signal,
  type ReactorPlugin,
} from '@datalayer/reactor';
import { useReactor, useSignalValue } from '@datalayer/reactor/react';
import { Renderers, ToolBindings } from '@datalayer/reactor/ui';
import {
  defineRenderer,
  type RendererProps,
} from '@datalayer/reactor/ui/react';
import { getAgentspecs } from '../../specs/agents';
import type { ToolCallRenderContext } from '../../types/chat';
import type { FrontendRenderToolSpec } from '../../types/tools';

/** Draws a tool call; `null` draws nothing. */
export type ToolRenderer = (context: ToolCallRenderContext) => ReactNode;

export type ToolRenderersPlugin = {
  plugin: ReactorPlugin<Record<string, never>, unknown, unknown>;
  /** Change what the tools are drawn with, live. */
  setRender: (render: ToolRenderer) => void;
};

/**
 * A plugin that binds these tools to a display type of its own and draws
 * them with the render function last set.
 */
export function createToolRenderersPlugin(
  name: string,
  tools: ReadonlyArray<string | RegExp>,
): ToolRenderersPlugin {
  const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const type = `application/vnd.datalayer.example.${slug}+json`;
  const render = signal<ToolRenderer>(() => null);

  function Rendered({
    context,
  }: RendererProps<ToolCallRenderContext>): JSX.Element | null {
    const draw = useSignalValue(render);
    return context ? createElement(Fragment, null, draw(context)) : null;
  }

  const plugin = definePlugin({
    name,
    contributes: [
      contribution(Renderers, defineRenderer({ type, component: Rendered }), {
        id: slug,
      }),
      ...tools.map((tool, index) =>
        contribution(ToolBindings, { tool, type }, { id: `${slug}:${index}` }),
      ),
    ],
  });
  return {
    plugin: plugin as unknown as ToolRenderersPlugin['plugin'],
    setRender: next => {
      render.value = next;
    },
  };
}

/**
 * Draw these tools with `render` in a standalone chat: the plugin, on a
 * platform registered for the page.
 */
export function useToolRenderers(
  name: string,
  tools: ReadonlyArray<string | RegExp>,
  render: ToolRenderer,
): void {
  const key = tools.map(String).join('\n');
  const { plugin, setRender } = useMemo(
    () => createToolRenderersPlugin(name, tools),
    // The tools by value: a fresh array of the same names is the same plugin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, key],
  );
  const reactor = useMemo(() => buildReactorFromPlugins([plugin]), [plugin]);
  useReactor(reactor, { autoStart: true });
  useEffect(() => {
    setRender(render);
  }, [setRender, render]);
}

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
 * Draw the tools an agent spec binds in its `frontendRenderTools`.
 *
 * The example provides only a local map of renderer id to component; the tool
 * names and the CSS file to load are read from the spec, so examples do not
 * hardcode tool names or CSS filenames.
 *
 * @param specId - Agent spec id to read render bindings from.
 * @param renderers - Local map of renderer id to renderer function.
 */
export function useSpecToolRenderers(
  specId: string | undefined,
  renderers: Record<string, SpecRenderer>,
): void {
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

  const tools = useMemo(
    () => bindings.map(binding => binding.tool),
    [bindings],
  );
  const render = useMemo<ToolRenderer>(
    () => (context: ToolCallRenderContext) => {
      const binding = bindings.find(b => b.tool === context.toolName);
      const renderer = binding ? renderers[binding.renderer] : undefined;
      return binding && renderer ? renderer(context, binding) : null;
    },
    [bindings, renderers],
  );
  useToolRenderers(`@examples/spec-tools-${specId ?? 'none'}`, tools, render);
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
