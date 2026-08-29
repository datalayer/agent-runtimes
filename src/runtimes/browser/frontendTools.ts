/*
 * Copyright (c) 2023-2026 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * Frontend tools, as the Vercel AI SDK wants them.
 *
 * This is the piece that makes an in-browser agent worth having. A
 * {@link FrontendToolDefinition} is a tool that runs in the page — it reaches
 * into the notebook the reader is looking at, or the document they are
 * editing — and the AG-UI path has always been able to call them: the client
 * advertises `{name, description, parameters}` to the runtime, the model asks
 * for one, and the client runs its `handler`.
 *
 * The browser harness needs exactly the same tools to work, and they do,
 * because nothing about a frontend tool was ever server-shaped. What changes
 * is only the round trip: AG-UI advertises the tool over the wire and posts
 * the result back, while here the model call and the handler are in the same
 * page, so the SDK calls the handler itself.
 *
 * So this module is a translation and not a second implementation:
 *
 * - the same array of definitions a host already passes to `<Chat>`
 * - the same {@link ToolExecutor} underneath, so location routing,
 *   human-in-the-loop and status reporting behave identically
 * - the same JSON Schema the AG-UI path sends over the wire
 *
 * A host that has tools working in one harness gets them working in the other
 * by passing the same array.
 *
 * @module runtimes/browser/frontendTools
 */

// From `ai` rather than `@ai-sdk/provider-utils` directly. `ai` re-exports
// these from the copy of provider-utils it resolves itself, and a schema built
// against a different copy is not the same type to TypeScript — the identity
// is carried by a private symbol.
import { jsonSchema, tool, type ToolSet } from 'ai';
import { createToolExecutor } from '../../tools/ToolExecutor';
import type {
  FrontendToolDefinition,
  ToolCallRequest,
  ToolDefinition,
  ToolParameter,
  ToolRenderStatus,
} from '../../types/tools';

/** JSON Schema for a tool that takes nothing. */
const NO_PARAMETERS = { type: 'object', properties: {} } as const;

/** The JSON Schema type for one of the shorthand parameter types. */
function schemaForParameter(parameter: ToolParameter): Record<string, unknown> {
  const described = parameter.description
    ? { description: parameter.description }
    : {};
  const enumerated = parameter.enum ? { enum: parameter.enum } : {};
  const base = { ...described, ...enumerated };

  switch (parameter.type) {
    case 'string[]':
      return { ...base, type: 'array', items: { type: 'string' } };
    case 'number[]':
      return { ...base, type: 'array', items: { type: 'number' } };
    case 'object[]':
      return {
        ...base,
        type: 'array',
        items: objectSchema(parameter.attributes),
      };
    case 'object':
      return { ...base, ...objectSchema(parameter.attributes) };
    default:
      return { ...base, type: parameter.type ?? 'string' };
  }
}

/** An object schema built from a nested attribute list. */
function objectSchema(
  attributes: ToolParameter[] | undefined,
): Record<string, unknown> {
  if (!attributes?.length) {
    return { type: 'object', properties: {} };
  }
  return { type: 'object', ...parametersToSchema(attributes) };
}

/** The `properties`/`required` pair for a list of parameters. */
function parametersToSchema(parameters: ToolParameter[]): {
  properties: Record<string, unknown>;
  required?: string[];
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const parameter of parameters) {
    properties[parameter.name] = schemaForParameter(parameter);
    if (parameter.required) {
      required.push(parameter.name);
    }
  }
  return required.length ? { properties, required } : { properties };
}

/**
 * The JSON Schema for a tool's input.
 *
 * `parameters` comes in two shapes, because two ecosystems put it there: the
 * notebook and document tools carry JSON Schema already, and CopilotKit-style
 * definitions carry a `ToolParameter[]`. The AG-UI path sends whichever it
 * finds straight over the wire; this does the same conversion so a tool
 * describes itself identically to a model in either harness.
 */
export function toolInputSchema(
  definition: Pick<FrontendToolDefinition, 'parameters'>,
): Record<string, unknown> {
  const parameters = definition.parameters;
  if (!parameters) {
    return { ...NO_PARAMETERS };
  }
  if (Array.isArray(parameters)) {
    return { type: 'object', ...parametersToSchema(parameters) };
  }
  // Already JSON Schema. Passed through rather than rebuilt: it is the tool
  // author's own description of the tool, and rewriting it could only lose
  // something the model was meant to see.
  return parameters as Record<string, unknown>;
}

export type FrontendToolsToVercelAIOptions = {
  /**
   * Asks a person to approve a call before it runs.
   *
   * Only consulted for tools that declare `renderAndWaitForResponse`, and it
   * is the same callback the AG-UI path uses. Returning `null` rejects the
   * call — the model is told so and can carry on.
   */
  onHitlRequired?: (
    toolCall: ToolCallRequest,
    definition: FrontendToolDefinition,
  ) => Promise<unknown | null>;
  /** Reports a call moving through executing → complete/failed. */
  onStatusChange?: (
    toolCallId: string,
    status: ToolRenderStatus,
    result?: unknown,
    error?: string,
  ) => void;
};

/**
 * Turn frontend tools into a Vercel AI SDK tool set.
 *
 * Errors come back as tool output rather than thrown. A throw would abort the
 * whole generation over one bad call; an error the model can read is a step it
 * can recover from — it can try a different cell, or tell the person what went
 * wrong. This is what the AG-UI path does with a failed tool result too.
 */
export function frontendToolsToVercelAI(
  frontendTools: FrontendToolDefinition[],
  options: FrontendToolsToVercelAIOptions = {},
): ToolSet {
  const byName = new Map(frontendTools.map(entry => [entry.name, entry]));

  // The same executor the rest of the package uses. It owns the parts that
  // must not drift between harnesses: frontend/backend routing, the HITL
  // pause, and the status callbacks a host renders progress from.
  const executor = createToolExecutor({
    getToolDefinition: (name: string) =>
      byName.get(name) as ToolDefinition | undefined,
    onHitlRequired: options.onHitlRequired,
    onStatusChange: options.onStatusChange,
  });

  const toolSet: ToolSet = {};
  for (const definition of frontendTools) {
    toolSet[definition.name] = tool({
      description: definition.description,
      inputSchema: jsonSchema(toolInputSchema(definition) as never),
      execute: async (input: unknown, executionOptions) => {
        const result = await executor.execute({
          toolCallId: executionOptions?.toolCallId ?? definition.name,
          toolName: definition.name,
          args: (input ?? {}) as Record<string, unknown>,
          // The SDK hands over a complete argument set: unlike AG-UI, which
          // streams arguments and emits a first call with none, a tool call
          // here arrives once and whole.
          argsComplete: true,
        });
        if (!result.success) {
          return { error: result.error ?? 'The tool call failed.' };
        }
        return result.result ?? null;
      },
    });
  }
  return toolSet;
}
