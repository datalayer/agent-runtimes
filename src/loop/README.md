<!--
  Copyright (c) 2025-2026 Datalayer, Inc.
  Distributed under the terms of the Modified BSD License.
-->

# Writing a LOOP plugin

The workspace is a prompt at the bottom and one view above it. Everything else
— the views, the commands, the header controls — is contributed by plugins.
This is how to write one.

A plugin depends on `@datalayer/loop-core` and on the reactor, never on the
shell. That is what lets the same plugin run in the standalone page, inside the
Datalayer application, and (later) inside a JupyterLab panel.

## The smallest plugin

```tsx
import { contribution, defineExtension } from '@datalayer/reactor';
import { LoopViewType } from '@datalayer/loop-core';

export const HelloExtension = defineExtension({
  name: '@acme/loop-plugin-hello',
  contributes: [
    contribution(
      LoopViewType,
      {
        viewType: 'hello',
        title: 'Hello',
        order: 50,
        load: () => import('./HelloView'),
      },
      { id: 'hello', order: 50 },
    ),
  ],
});
```

```tsx
// HelloView.tsx — the default export is what the host renders.
import type { LoopViewProps } from '@datalayer/loop-core';

export default function HelloView({ workspace }: LoopViewProps) {
  return <p>Talking to {workspace.serverUrl}</p>;
}
```

Mount it and it is a tab.

**`load` is a thunk, not a component**, and that is not stylistic: a view is
downloaded when someone opens it. The document view pulls
`@datalayer/jupyter-lexical`, which initialises Lumino nodes at import time; a
plugin that imported its view eagerly would put all of that in the shell's
bundle for everyone, including people who never open it.

## Extension points

| Point | For | Rendered by |
| --- | --- | --- |
| `LoopViewType` | a view the workspace may open | the view host, one at a time |
| `LoopCommand` | a slash command | the prompt, on `/name` |
| `LoopMention` | an `@` namespace | the prompt's typeahead |

And three slots, which render *everything* contributed rather than choosing:
`LoopSlots.header`, `LoopSlots.promptAction`, `LoopSlots.status`.

Reach for a **slot** when everything contributed should appear (a status chip, a
header control). Reach for a **point** when something has to pick.

## Saying when a view can open

```ts
canOpen: workspace => workspace.sandbox.state === 'running',
unavailableReason: () => 'Needs a running sandbox',
```

Give the reason. A greyed-out tab with no explanation is worse than no tab.

## Commands

```ts
contribution(
  LoopCommand,
  {
    name: 'hello',
    aliases: ['hi'],
    description: 'Say hello',
    group: 'Session',
    args: [{ name: 'who', description: 'Who to greet' }],
    run: async ({ workspace, argv }) => ({ content: `Hello ${argv || 'there'}` }),
  },
  { id: 'hello' },
);
```

`CommandContribution` is mirrored by `SlashCommandSpec` in Python, so the same
command is described the same way in the terminal and in the browser — even when
the two implementations differ, a Rich panel there and a React panel here.

## Depending on another plugin

Declare it, and read its build output:

```ts
import { CodeSandboxExtension, useSandboxService } from '@datalayer/loop-plugin-code-sandbox';

export const MyExtension = defineExtension({
  name: '@acme/loop-plugin-mine',
  dependencies: [CodeSandboxExtension],   // pulled in whether or not the host mounted it
  // …
});
```

```tsx
const sandbox = useSandboxService();      // throws if the dependency is missing
const snapshot = useSignalValue(sandbox.snapshot);
```

The dependency lives in the extension graph rather than in a comment, which is
what makes it true.

## If your plugin owns something

A plugin that holds a connection, a kernel or a cache must say so:

```ts
defineExtension({
  name: '@acme/loop-plugin-mine',
  preserveOutput: true,     // enable() keeps what I built
  build: () => ({ connection: connect() }),
});
```

Without it, disabling and re-enabling hands every consumer a fresh instance
while the old one keeps the connection — a detached object nobody notices.

## State that belongs to the plugin, not to a component

Use reactor signals rather than React state for anything the plugin owns. The
owner of a sandbox is an extension, not a component, so it keeps working when
someone switches tabs:

```ts
const state = signal<'idle' | 'running'>('idle');
const ready = computed(() => state.value === 'running');
// in a component:
const isReady = useSignalValue(ready);
```

## Rules the shell holds you to

- **No providers.** The entry point owns the theme, the router and the query
  client; a plugin that mounts its own fights the host. See §3.5 of the plan.
- **Theme through the tokens.** Colours come from the Primer tokens the host set;
  no plugin reads `prefers-color-scheme` itself.
- **Keep the entry light.** Anything a plugin's `index` imports lands in the
  shell's bundle. Heavy things go behind `load()` or a dynamic `import()` inside
  a method — that is how the browser sandbox keeps JupyterLite out of the page
  until someone chooses it.
- **One navigation element.** The workspace has the view switcher and no
  settings tree; management belongs to the application around it.

## Testing one

A plugin is testable without a DOM, because contributions are data:

```ts
const reactor = buildReactorFromExtensions([MyExtension]);
reactor.start();

expect(reactor.getContributions(LoopViewType).map(v => v.id)).toEqual(['hello']);

reactor.disable('@acme/loop-plugin-mine');
expect(reactor.getContributions(LoopViewType)).toHaveLength(0);
```

If disabling your plugin leaves anything behind, something is holding a
reference it should have asked for.
